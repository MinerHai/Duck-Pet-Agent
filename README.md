# 🦆 Duck-Pet-Agent (DuckClaude)

A desktop duck that roams your screen and causes **DesktopGoose-style mischief** — but
whose behavior is **driven by the live status of your Claude Code agent** (the AgentPet idea).

It fuses two projects:

| | DesktopGoose | AgentPet | **Duck-Pet-Agent** |
|---|---|---|---|
| Presence | Free-roaming | Fixed menu bar | **Free-roaming** |
| Behavior | Active, physical | Passive, status-driven | **Active & physical, status-driven** |
| Reason to act | Random | Agent status | **Agent status → contextual mischief** |

When Claude works, the duck paces alongside you. When Claude needs input, the duck runs to
your cursor and honks. When it finishes, confetti. When you leave it idle, it gets bored and
misbehaves — footprints, brings you a meme, nudges a window, or (with permission) yanks your
cursor.

## Demo (the 60-second loop)

> Submit a prompt → duck **paces** (WORKING) → Claude asks permission → duck **runs to your
> cursor + honks + notifies** (NEEDS_INPUT) → you approve → **confetti** (DONE) → leave it
> idle → it gets bored → **footprints + window nudge** (MISCHIEF).

## Quick start

```bash
npm install        # electron + nut.js
npm run rebuild    # rebuild nut.js against Electron's ABI (for cursor control)
npm start          # launch the duck
```

A 🦆 appears in your menu bar. Click it for **Settings…**, to toggle **Chaos**, or to Quit.

On first run the app installs a small hook into `~/.claude/settings.json` so it can read
Claude Code status. The hook is **additive** (it won't touch AgentPet or your other hooks)
and is removed when you quit.

### Try it without Claude Code

```bash
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"UserPromptSubmit"}'  # WORKING
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"PermissionRequest"}' # NEEDS_INPUT
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"Stop"}'              # DONE
```

## How it works

```
Claude Code ──hook(http POST)──► localhost:4242/hook ──► StateMachine ──► overlay + effects
```

- **Status listener** — a tiny HTTP server in the Electron main process receives Claude Code
  hook events.
- **State machine** (pure, unit-tested) — maps events to states
  (`WORKING / NEEDS_INPUT / DONE`) and a boredom timer (`IDLE_ROAM → MISCHIEF`, randomized
  20–40s like the goose).
- **Overlay** — a transparent, click-through, always-on-top window draws the duck on a canvas.
- **Effects** — footprints/memes (free) and cursor grab / window nudge (macOS, permission-gated).

### Event → behavior

| Hook event | State | Duck |
|---|---|---|
| `UserPromptSubmit`, `PreToolUse` | WORKING | paces with ⌨️ |
| `Notification` (permission), `PermissionRequest` | NEEDS_INPUT | runs to cursor + HONK! |
| `Stop` | DONE | confetti |
| _(idle 20–40s)_ | MISCHIEF | footprints / meme / window nudge |

## Settings & customization

Open **Settings…** from the menu bar (changes apply instantly):

- **Behavior** — wander time min/max.
- **Chaos** — master switch + per-behavior toggles: footprints, bring memes, grab cursor
  *(mac)*, nudge windows *(mac)*, random attacks.
- **Appearance** — duck size, opacity.
- **Sound** — honk on/off + volume.
- **Content** — open the **Memes/** and **Notes/** folders. Drop in your own images (`.png`,
  `.jpg`, `.gif`…) and `.txt` notes; the duck brings them to you. No rebuild needed.

Folders live under `~/Library/Application Support/Duck-Pet-Agent/`.

## macOS permissions

Cursor grab and foreign-window nudge need **Accessibility** permission
(System Settings → Privacy & Security → Accessibility). Without it those two behaviors no-op
silently — everything else still works. All other features are permission-free and
cross-platform.

## Develop

```bash
npm test           # node:test — pure logic (state machine, listener, hooks, settings, content)
npm run spike:*    # de-risk probes: overlay / hook / cursor / window
```

Project layout and the full design are in `docs/superpowers/`.

## Status

MVP. Out of scope for now: Tamagotchi XP, token charts, web leaderboard, multi-agent,
Windows chaos, an AI-chat duck.

---

Inspired by [Desktop Goose](https://samperson.itch.io/desktop-goose) (samperson) and
[AgentPet](https://github.com/ntd4996/agentpet) (ntd4996).
