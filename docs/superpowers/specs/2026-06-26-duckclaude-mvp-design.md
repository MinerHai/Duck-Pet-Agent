# DuckClaude — MVP Design Spec

- **Date:** 2026-06-26
- **Status:** Approved (design), pending implementation plan
- **Author:** hailt + Claude

## 1. Concept

A desktop duck that lives on your screen, roams freely and causes DesktopGoose-style
physical mischief — but whose behavior is **driven by the live status of Claude Code**
(the AgentPet idea).

The fusion of the two source projects:

| | DesktopGoose | AgentPet | DuckClaude (this MVP) |
|---|---|---|---|
| Presence | Free-roaming, full screen | Fixed, menu bar | Free-roaming, full screen |
| Behavior | Active, physical | Passive, status-driven | **Active & physical, status-driven** |
| Reason for acting | Random / meaningless | Contextual (agent status) | **Contextual** — mischief tied to Claude Code state |

The new value: a companion that is both *fun and alive* (Goose) and *genuinely useful
and context-aware* (AgentPet). When Claude Code works, the duck works alongside you;
when Claude needs input, the duck physically drags your attention back; when idle, it
gets bored and misbehaves.

> Note: the original DesktopGoose (samperson) is closed-source; the `DesktopGooseUnofficial`
> org hosts launchers/mods, not the core engine. We re-implement its *interaction design
> patterns*, not its code. AgentPet's integration mechanism (Claude Code hooks) is reused.

## 2. Goals & Non-Goals

### Goals (MVP)
- A transparent, always-on-top, click-through overlay with an animated, roaming duck.
- Receive Claude Code live status via hooks and reflect it through duck behavior.
- A behavior state machine: `IDLE_ROAM → WORKING → NEEDS_INPUT → DONE`, plus a boredom
  timer that drops to `MISCHIEF`.
- DesktopGoose-style chaos in two tiers (free + permission-gated).
- A tray menu for control (start/stop, toggle chaos, quit).

### Non-Goals (Post-MVP)
Full Tamagotchi level/XP system, token-burn charts, web profile/leaderboard, multi-agent
monitoring, custom pet-pack format, Windows chaos parity, AI-chat duck (duck as an LLM
itself), sound pack beyond a single honk.

## 3. The 60-Second Demo Narrative (the spine)

Everything in scope serves this script; anything off it is post-MVP.

> Type a prompt → duck **paces (WORKING)** → Claude asks permission to run a command →
> duck **runs to the cursor + honks + fires a notification (NEEDS_INPUT)** → you approve →
> duck **celebrates (DONE)** → you leave it alone → duck gets bored → **leaves footprints +
> nudges a window (MISCHIEF)**.

## 4. Architecture

```
Claude Code  ──hook(http)──►  POST localhost:PORT/hook  ──►  Electron main
   (event)                    (UserPromptSubmit/Stop/...)      │
                                                               ▼
                                                        State Machine
                                                  (IDLE→WORKING→NEEDS_INPUT→DONE→MISCHIEF)
                                            ┌──────────────────┴──────────────────┐
                                            ▼                                      ▼
                                   Overlay Renderer                        Effects / Chaos
                                   (duck sprite, footprints,               (cursor grab,
                                    meme popup, animation)                  window nudge)
```

Flow: Claude Code emits a hook event → the hook (native `http` type) POSTs the event JSON
to a small HTTP listener inside the Electron main process → the State Machine updates →
the Overlay renderer animates the duck and the Effects module triggers physical mischief.

We use the native Claude Code `http` hook type (POST JSON directly) rather than a
`curl`/`jq` command hook — fewer shell failure modes, more real-time, cross-platform.

## 5. Components

Each component has one purpose, a defined interface, and is independently testable.

1. **Overlay Window** — `BrowserWindow`: `transparent: true`, `frame: false`,
   `alwaysOnTop: true`, full-screen bounds, `setIgnoreMouseEvents(true, { forward: true })`
   so clicks pass through. Renders duck sprite (canvas), footprints, and meme popups.
   - *Interface:* receives behavior/animation commands from the State Machine over IPC.
   - *Depends on:* Electron renderer, sprite assets.

2. **State Machine** — owns current state and transitions. States:
   `IDLE_ROAM`, `WORKING`, `NEEDS_INPUT`, `DONE`, `MISCHIEF`. Holds a boredom timer that
   moves `IDLE_ROAM → MISCHIEF` after N seconds of no agent activity. `DONE` auto-decays
   to `IDLE_ROAM` after a short celebrate.
   - *Interface:* `dispatch(event)` from Status Listener; emits `onState(state)` to
     Overlay + Effects.
   - *Depends on:* nothing (pure logic — easiest unit to test).

3. **Status Listener (HTTP)** — `http.Server` on `localhost:PORT` in main, `POST /hook`.
   Parses `hook_event_name` from the JSON body, maps event → state event, dispatches to
   the State Machine.
   - *Interface:* HTTP in; `dispatch()` out.
   - *Depends on:* State Machine.

4. **Hook Installer** — one-time setup that writes a DuckClaude hook block into Claude
   Code `settings.json` (additive — does not touch the existing AgentPet hooks). Idempotent.
   - *Interface:* `install()` / `uninstall()`.
   - *Depends on:* user's `~/.claude/settings.json`.

5. **Effects / Chaos module** — `dropFootprint()`, `bringMeme()` (free tier);
   `cursorGrab()`, `nudgeWindow()` (gated tier). Gated calls no-op gracefully when
   permission is absent.
   - *Interface:* called by State Machine on state entry.
   - *Depends on:* `@nut-tree-fork/nut-js` (cursor), `osascript` via `child_process`
     (window), Overlay (footprints/memes).

6. **Tray menu** — start/stop, toggle chaos, quit. AgentPet-style menu-bar presence.
   - *Interface:* Electron `Tray` + `Menu`.

## 6. Claude Code Integration (verified)

Hook event names and semantics confirmed against
`https://code.claude.com/docs/en/hooks.md`.

### Event → State mapping

| Pet State | Hook events | Notes |
|---|---|---|
| `WORKING` | `UserPromptSubmit`, `PreToolUse` | `PreToolUse` is blocking → flips to WORKING *before* the tool runs (smoother). |
| `NEEDS_INPUT` | `Notification` (matcher `permission_prompt`), `PermissionRequest` | Claude paused awaiting permission/input. |
| `DONE` | `Stop` | Claude's turn ended → celebrate, then decay to `IDLE_ROAM`. |

### Hook config (additive, alongside existing AgentPet hooks)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "*", "hooks": [
        { "type": "http", "url": "http://localhost:PORT/hook", "async": true } ] }
    ],
    "PreToolUse": [ /* same http hook */ ],
    "Notification": [ /* same http hook */ ],
    "PermissionRequest": [ /* same http hook */ ],
    "Stop": [ /* same http hook */ ]
  }
}
```

Hooks use `async: true` so they never block Claude's turn. The hook POSTs the full event
JSON (including `hook_event_name`, `session_id`, `cwd`, and for `Notification` a
`notification_type`) which the Status Listener parses.

> De-risk note: AgentPet is already installed on this machine and its hooks fire over the
> same events, so the "read Claude Code status" path is already proven here. DuckClaude
> adds a parallel hook and does not modify AgentPet's.

## 7. Behavior State Machine (detail)

- `IDLE_ROAM` (default): duck waddles to random points, idle animation between moves.
- `WORKING`: duck paces near the active terminal region / faster walk loop.
- `NEEDS_INPUT`: duck runs to the current cursor position, plays honk + attention
  animation, fires an OS notification. Holds until a non-NEEDS_INPUT event arrives.
- `DONE`: celebrate animation (confetti) for ~2–3s, then auto-decay to `IDLE_ROAM`.
- `MISCHIEF`: entered from `IDLE_ROAM` after a **wander timer** of a random duration in
  `[wanderMinSeconds, wanderMaxSeconds]` (default **20–40s**, matching Desktop Goose's
  `MinWanderingTimeSeconds`/`MaxWanderingTimeSeconds`). Performs one mischief action
  (footprint trail / bring a meme / window nudge), then returns to `IDLE_ROAM`. Any
  incoming agent event preempts mischief immediately. The range is user-configurable
  (see §14–15); the duration is randomized via an injectable `rng` so it stays
  unit-testable.

Transitions are driven by (a) agent events from the Status Listener and (b) timers.
The machine is pure logic with no Electron/OS dependency, so it is unit-testable in
isolation (TDD target #1).

## 8. Chaos Tiers (build free-tier first)

### Free tier — no OS permission, cross-platform, a complete demo by itself
- Roam, idle/walk animations.
- Footprint trail drawn on the overlay.
- Meme/gift popup drawn on the overlay.
- Dragging the duck's **own decoy windows** (extra `BrowserWindow`s we own and move).

### Gated tier — requires macOS Accessibility, mac-only in v1
- **Cursor grab:** `@nut-tree-fork/nut-js` `mouse.setPosition()` with easing toward the
  terminal on `NEEDS_INPUT`.
- **Foreign-window nudge:** `osascript` System Events moving `window 1 of process "<App>"`.
  Per-process; the demo target app is chosen deliberately (some apps don't expose AX
  position).
- Both no-op gracefully when permission is denied; the demo never blocks on them.

Every chaos behavior (footprints, memes, cursor grab, window nudge, random attacks) is an
**individually toggleable setting** under a master `chaos.enabled` switch, mirroring Desktop
Goose's `CanAttackAtRandom` granularity. Users dial the annoyance up or down from the
Settings window (§15). This is the core of "easy to use + customizable".

## 9. Tech Stack & Dependencies

- **Electron** + **Node** (reuses the existing repo).
- **`@nut-tree-fork/nut-js`** for cursor control — the maintained fork; the original
  `@nut-tree/*` packages moved to a paid/private registry, and `robotjs` is unmaintained
  for current Electron. Requires `electron-rebuild` against the Electron ABI.
- **`osascript`** via `child_process` for foreign-window control (macOS).
- **Sprite assets:** a simple duck spritesheet — 4–8 frames covering `idle`, `walk`,
  `honk`, `celebrate`. Placeholder art acceptable for the MVP.

## 10. Platform & Permission Notes (macOS)

- macOS **Accessibility** permission gates **both** cursor control and foreign-window
  control. In dev the permission attaches to the Electron/terminal binary and often needs
  re-granting after native rebuilds.
- The **permission-denied path must be tested explicitly** — these APIs fail silently.
  First-run UX: detect missing permission and show a one-line prompt to enable it in
  System Settings; until then, gated chaos is disabled and the free tier runs.
- Click-through overlay uses `setIgnoreMouseEvents(true, { forward: true })`. (A hit-test
  toggle is only needed later if the duck becomes clickable — post-MVP.)

## 11. Build Order

- **Step 0 — De-risk spike (30–60 min, throwaway code).** Touch all four integration
  seams in risk order, on *this* machine:
  1. `@nut-tree-fork/nut-js` cursor move under Accessibility (does the native module
     rebuild against this Electron ABI and actually move the cursor?).
  2. `osascript` System Events moving a *foreign* app's frontmost window under Accessibility.
  3. Transparent click-through overlay window that does not steal focus.
  4. A dummy hook POSTing an event that the app reads.
  If (1) or (2) fail here, the "giật chuột / kéo cửa sổ" promise is dead and we learn it
  on day 1 — gated tier degrades to free tier, design unchanged.
- **Step 1 — Free tier:** overlay + roaming duck + state machine + HTTP listener + hook
  installer + footprints + meme. This is a self-contained, shippable demo.
- **Step 2 — Gated tier:** cursor grab + window nudge + permission UX, layered on top.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| nut.js native build fails on Apple Silicon + this Electron | Spike step 0.1; fall back to free tier. |
| Accessibility denied / silent failure | Test denied path; detect + prompt; gated no-ops. |
| `osascript` can't move the target window (no AX position) | Pick demo target app deliberately; document it. |
| Overlay steals focus / blocks clicks | `setIgnoreMouseEvents(forward:true)`; verified in spike 0.3. |
| Hook double-fires / races AgentPet | DuckClaude hook is additive + `async`; State Machine is idempotent per event. |

## 13. Out of Scope (Post-MVP)

Tamagotchi level/XP, token-burn chart, web leaderboard, multi-agent, custom pet-pack
format, Windows chaos, AI-chat duck (LLM personality).

> **Scope update (v2):** A **Settings window**, **per-behavior customization**, and
> **Memes/Notes folders** are now **in scope** — the Desktop Goose for Mac README shows
> these are exactly what makes the goose feel finished and tunable. See §14–16.

## 14. Settings & Persistence

A single source of truth for all tunable behavior, persisted as JSON under
`app.getPath('userData')/settings.json` (e.g. `~/Library/Application Support/DuckClaude/`).

**Defaults schema** (`settings-store.js`, pure + testable):

```js
const DEFAULTS = {
  wanderMinSeconds: 20,        // goose MinWanderingTimeSeconds
  wanderMaxSeconds: 40,        // goose MaxWanderingTimeSeconds
  duckSize: 54,                // px (font size of the 🦆 glyph)
  opacity: 1.0,               // 0.2..1
  soundEnabled: true,
  honkVolume: 1.0,            // 0..1  (goose SoundVolume)
  chaos: {
    enabled: false,           // master switch (goose: off by default)
    footprints: true,
    bringMemes: true,
    grabCursor: true,         // gated, mac-only
    nudgeWindows: true,       // gated, mac-only
    randomAttacks: false,     // goose CanAttackAtRandom — random chaos even while idle
  },
  hooksInstalled: true,        // whether DuckClaude hooks are written to settings.json
}
```

- `load(path)` deep-merges file JSON over `DEFAULTS` (so new keys get defaults).
- `save(path, settings)` writes pretty JSON.
- **Live-apply:** changing a setting takes effect immediately (no restart), matching the
  goose "effective immediately" behavior. The main process re-applies wander range to the
  StateMachine and broadcasts the new settings to the overlay renderer.

## 15. Settings Window (UI/UX)

A **normal focusable window** (separate from the click-through overlay), opened from the
tray "Settings…" item. ~480×680, system font, respects light/dark via
`prefers-color-scheme`. **No Save button** — every control applies instantly.

Sections (top to bottom):

1. **Behavior** — Wander time min/max (dual slider, 5–120s); shows live "wanders every
   20–40s" text.
2. **Chaos** — master toggle, then a disabled-until-enabled group of switches: Footprints,
   Bring memes, Grab cursor *(mac)*, Nudge windows *(mac)*, Random attacks. Gated rows show
   a small "needs Accessibility" hint when permission is absent.
3. **Appearance** — Duck size slider (24–96px), Opacity slider.
4. **Sound** — Honk on/off + volume slider.
5. **Content** — "Open Memes Folder" and "Open Notes Folder" buttons (`shell.openPath`);
   helper text explaining drop-in customization.
6. **Claude Code** — Hooks installed toggle (calls install/uninstall), read-only port.

UX principles: one screen, no nesting; labels + live values on every control; instant
feedback (the duck on screen changes as you drag); gated features clearly marked rather
than hidden. IPC: `settings:get` (handle), `settings:set` (handle, persists + applies),
`content:openMemes` / `content:openNotes`, `hooks:set`.

## 16. Content — Memes & Notes folders

Mirrors Desktop Goose's drop-in folder model (`content.js`):

- On first run, ensure `userData/Memes/` and `userData/Notes/` exist; seed `Notes/` with a
  couple of starter `.txt` notes so the feature is non-empty.
- `listFiles(dir, exts)` returns matching files; `pickRandom(list, rng)` is pure/testable.
- When the duck "brings a meme" (chaos.bringMemes), the overlay shows a random image from
  `Memes/` (falls back to a built-in placeholder if the folder is empty). When it "leaves a
  note", it shows a random line from `Notes/`.
- Users customize purely by dropping files into these folders — no rebuild, no settings.
