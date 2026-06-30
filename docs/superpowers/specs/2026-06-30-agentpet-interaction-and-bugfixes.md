# Clearer Claude interaction (from agentpet) + overlay bug fixes

Deep analysis of `ntd4996/agentpet` for "interaction with Claude is too vague", plus root
causes for three reported bugs. Sources cited under the cloned `agentpet/`.

## A. What makes agentpet's Claude interaction CLEAR (copyable principles)

agentpet encodes every state **redundantly across 5 channels** — menu-bar icon, pet
sprite/mood, **chat-bubble text**, sound, notification. Most copyable:

1. **Live WORKING activity from the hook payload.** The hook posts `tool_name` + `tool_input`;
   an `ActivityFormatter` maps tool → verb ("Editing overlay.js…", "Running tests…",
   "Reading the docs…", "Searching…"). The bubble shows this real activity while WORKING;
   done/waiting/idle use canned localized pools. (`ActivityFormatter.swift`,
   `BubbleMessages.swift`.) — **our duck only shows ⌨️, no text.**
2. **State color + flash.** working = blue, waiting = **orange + flashing**, done = green,
   idle = gray (`AgentRow.stateDotColor`). Waiting also tints the menu-bar icon orange.
3. **Notifications + sound on the states that need you.** waiting → "<project> needs input"
   (Submarine), done → "<project> finished" (Glass). working/idle = silent.
   (`NotificationManager.swift`, `SoundSettings.swift`.)
4. **Claude `Stop` is ambiguous** (= finished OR asking a question). agentpet reads the
   transcript tail and, if the last sentence is a question (`?` or starts with
   which/what/how/should i/do you/want me to/shall i/can you…), corrects `done → waiting`
   so "needs input" is reliable. (`QuestionDetector.swift`, `AppDaemon.refineDoneIfQuestion`.)
5. **Message selection is varied but stable** — working = round-robin per tool; bubble rows =
   stable hash of session id (no flicker); idle = time-based; done/waiting = random pool.
6. **Throttling** so feedback isn't spammy (`PerKeyThrottle`); notifications only on real
   `state != before` transitions.

Pipeline for reference: `agent → hook → "agentpet hook --agent claude" → unix socket → daemon
→ SessionStore(state machine, timeouts) → 5 feedback channels`. States:
`registered/working/waiting/done/idle`; mood priority working>waiting>done>idle.

## B. Three reported bugs — root causes (our code)

1. **Only on one fixed screen.** `main.js createOverlay` uses `getPrimaryDisplay().bounds`
   and `startCursorStream` sends **global** `getCursorScreenPoint()` to the renderer (treated
   as window-local). A secondary monitor (cursor x was −48) is outside the overlay.
2. **Grab mouse doesn't work / cursor-chase feels off.** `nab()` fires the moment NEEDS_INPUT
   begins (`onState:133`), independent of whether the duck has reached the cursor, so the
   pointer is yanked "out of nowhere"; and `cursorGrab` eases with **no delay between steps**
   → it teleports rather than visibly dragging. Target uses the primary display only.
3. **Near the cursor it turns around.** The renderer physics applies a constant accel pull +
   speed cap with **no braking**, so it overshoots the cursor; the target is then behind it →
   180° flip → oscillation.

## C. Fix + improvement plan

### Bug fixes (overlay/physics/main)
1. **Multi-monitor:** overlay window spans the **union of all displays**
   (`screen.getAllDisplays()` → minX/minY/totalW/totalH); store that origin; convert cursor to
   window-local (`p.x−originX, p.y−originY`) before `send('cursor')`. nut.js `cursorGrab` stays
   in global coords.
2. **Arrival braking:** in `overlay.js physics`, when `dist(toTarget) < arriveRadius` (≈24px),
   stop adding acceleration and damp velocity (`v *= 0.75`) so the duck settles on the target
   and follows the moving cursor without overshoot/turn-around.
3. **Grab-on-reach, visible drag:** renderer emits `reachedCursor` once when the duck's beak is
   within ~40px of the cursor during NEEDS_INPUT; `main` then runs the cursor drag toward the
   terminal with a small delay between nut.js steps (~12ms × 24 ≈ 0.3s visible). Remove the
   on-entry `nab()`.

### Clearer Claude interaction (the agentpet ideas)
4. **Speech bubble** above the duck (canvas-drawn capsule + tail) showing text:
   - **WORKING:** live activity from `tool_name`/`tool_input` via a small `ActivityFormatter`
     (TDD): read/search/run/edit/write/task → "Reading X…", "Searching…", "Running X…",
     "Editing X…", round-robin verbs. The listener already receives the full event JSON
     (curl `--data-binary @-`), so we extract `tool_name`/`tool_input`/`message` and pass an
     `activity` string with the state.
   - **NEEDS_INPUT:** canned orange pool ("I need you! 👀", "Your turn 👀", "Psst, need input!").
   - **DONE:** green pool ("All done! ✅", "Ta-da!").
   - **IDLE:** occasional idle chatter.
5. **State color:** tint the bubble border / a small aura by state (working `#3B82F6`,
   waiting `#F59E0B` flashing, done `#21C45E`, idle gray).
6. **OS notifications** (Electron `Notification`): waiting → "<project> needs input", done →
   "<project> finished". Throttled to real transitions. `<project>` = `cwd` basename from the
   hook payload.
7. **Done/waiting split (lite):** on `Stop`, if `transcript_path` is present, read its tail and
   if the last assistant sentence looks like a question → treat as NEEDS_INPUT instead of DONE.
   Pure `looksLikeQuestion(text)` is TDD'd; the file read is best-effort. (Notification
   `permission_prompt`/`idle_prompt` already covers the explicit-permission case.)

### Build order
Pure logic first (TDD): `ActivityFormatter.format(toolName, toolInput)`, `looksLikeQuestion`.
Then main: multi-monitor overlay + cursor-local + payload→activity + notifications + grab-on-
reach. Then renderer: arrival braking + speech bubble + state color + reachedCursor signal.
State machine / hooks / settings / antics unchanged except listener now forwards an activity
message and main fires notifications.
