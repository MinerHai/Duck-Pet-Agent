# DuckClaude MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop duck (Electron) that roams the screen and causes DesktopGoose-style mischief, with its behavior driven by live Claude Code status via hooks.

**Architecture:** Claude Code hooks POST event JSON to a small HTTP listener in the Electron main process. A pure state machine maps events → behavior states and drives a transparent click-through overlay window (the duck) plus an effects module (cursor grab / window nudge). Pure logic (state machine, listener, hook installer, effect helpers) is built test-first with Node's built-in `node:test`; Electron/OS integration is built spike-first and verified manually against an explicit 60-second demo script.

**Tech Stack:** Electron, Node.js (CommonJS), `node:test` (built-in test runner, zero deps), `@nut-tree-fork/nut-js` (cursor control) + `electron-rebuild`, `osascript` via `child_process` (macOS window control).

---

## File Structure

```
src/
  config.js              # PORT/HOST constants (shared by listener + installer)
  shared/
    ease.js              # easePath(from, to, steps) — pure easing, used by effects
  main/
    main.js              # Electron entry: overlay window, tray, wires everything
    preload.js           # contextBridge: expose onState/onCursor to renderer
    state-machine.js     # mapEvent() + StateMachine class (pure, no Electron)
    status-listener.js   # http.Server on localhost; POST /hook -> onEvent
    hook-installer.js    # add/remove DuckClaude http hooks in settings.json
    effects.js           # cursorGrab (nut.js), nudgeWindow (osascript) + helpers
    tray.js              # tray menu builder
  renderer/
    overlay.html         # full-screen transparent canvas host
    overlay.js           # duck animation loop, footprints, meme, reacts to state
spike/                   # Step 0 throwaway de-risk probes (kept as de-risk record)
  probe-overlay.js
  probe-hook.js
  probe-cursor.js
  probe-window.js
test/
  state-machine.test.js
  status-listener.test.js
  hook-installer.test.js
  ease.test.js
  effects-helpers.test.js
```

**Responsibility split:** pure logic modules (`state-machine`, `status-listener`, `hook-installer`, `ease`, effect string/path helpers) never `require('electron')`, so they run under `node --test` without an Electron runtime. Electron-only code (`main.js`, `preload.js`, `tray.js`, renderer) is thin wiring verified manually.

**Config constant:** `PORT = 4242`, `HOST = '127.0.0.1'` used everywhere a URL is built.

---

## Task 1: Project setup

**Files:**
- Modify: `package.json`
- Create: `src/config.js`
- Create: `.gitignore`

- [ ] **Step 1: Add dependencies and scripts to package.json**

Replace `package.json` contents with:

```json
{
  "name": "DuckClaude",
  "version": "1.0.0",
  "description": "A desktop duck whose mischief is driven by live Claude Code status.",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test test/",
    "rebuild": "electron-rebuild -f -w @nut-tree-fork/nut-js",
    "spike:overlay": "electron spike/probe-overlay.js",
    "spike:hook": "node spike/probe-hook.js",
    "spike:cursor": "electron spike/probe-cursor.js",
    "spike:window": "node spike/probe-window.js"
  },
  "private": true,
  "dependencies": {
    "@nut-tree-fork/nut-js": "^4.2.0"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "@electron/rebuild": "^3.6.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without error; `node_modules/electron` and `node_modules/@nut-tree-fork/nut-js` exist.

- [ ] **Step 3: Rebuild the native module against Electron's ABI**

Run: `npm run rebuild`
Expected: "Rebuild Complete" (or similar). If it fails, note the error — Task 2.3 (cursor probe) will confirm whether cursor control is viable on this machine.

- [ ] **Step 4: Create the config module**

Create `src/config.js`:

```js
'use strict'

module.exports = {
  HOST: '127.0.0.1',
  PORT: 4242,
  hookUrl() {
    return `http://${this.HOST}:${this.PORT}/hook`
  },
}
```

- [ ] **Step 5: Create .gitignore**

Create `.gitignore`:

```
node_modules/
.DS_Store
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config.js .gitignore
git commit -m "chore: project setup (electron, nut-js, config, test script)"
```

---

## Task 2: Step 0 de-risk spike (throwaway probes, manual verification)

These probes touch the four integration seams in risk order. They are intentionally crude. **Goal: learn on day 1 whether the gated-tier chaos survives on this machine.** If 2.4 (cursor) or 2.5 (window) fail, the gated tier degrades to the free tier and the rest of the plan is unaffected.

**Files:**
- Create: `spike/probe-overlay.js`, `spike/probe-hook.js`, `spike/probe-cursor.js`, `spike/probe-window.js`

- [ ] **Step 1: Overlay probe — transparent, click-through, no focus steal**

Create `spike/probe-overlay.js`:

```js
'use strict'
const { app, BrowserWindow, screen } = require('electron')

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().bounds
  const win = new BrowserWindow({
    width, height, x: 0, y: 0,
    transparent: true, frame: false, resizable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true, focusable: false,
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL('data:text/html,' + encodeURIComponent(
    '<body style="margin:0;background:transparent">' +
    '<div style="position:absolute;left:200px;top:200px;font-size:80px">DUCK</div></body>'))
})
```

- [ ] **Step 2: Run the overlay probe**

Run: `npm run spike:overlay`
Expected: the word "DUCK" floats over your other windows; you can click *through* it to whatever is behind; the window behind the cursor keeps focus. Close with Ctrl+C.
**Record result:** click-through works? focus not stolen? (yes/no)

- [ ] **Step 3: Hook probe — Claude Code event reaches a local server**

Create `spike/probe-hook.js`:

```js
'use strict'
const http = require('node:http')
const { PORT, HOST } = require('../src/config')

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/hook') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      console.log('HOOK RECEIVED:', body || '(empty)')
      res.writeHead(204).end()
    })
  } else {
    res.writeHead(404).end()
  }
}).listen(PORT, HOST, () => console.log(`probe listening on ${HOST}:${PORT}`))
```

- [ ] **Step 4: Run the hook probe and fire a test event**

Terminal A — Run: `npm run spike:hook`
Terminal B — Run: `curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"Stop"}'`
Expected (Terminal A): `HOOK RECEIVED: {"hook_event_name":"Stop"}`
**Record result:** server receives the POST? (yes/no)

- [ ] **Step 5: Cursor probe — move the real cursor under Accessibility**

Create `spike/probe-cursor.js`:

```js
'use strict'
const { app, screen } = require('electron')
const { mouse, Point } = require('@nut-tree-fork/nut-js')

app.whenReady().then(async () => {
  const p = screen.getCursorScreenPoint()
  console.log('cursor now at', p)
  try {
    await mouse.setPosition(new Point(p.x + 200, p.y + 100))
    console.log('OK: moved cursor +200,+100')
  } catch (e) {
    console.log('FAIL: cursor move threw', e.message)
  }
  app.quit()
})
```

- [ ] **Step 6: Run the cursor probe**

Run: `npm run spike:cursor`
Expected on success: the cursor jumps +200,+100 and logs "OK". First run on macOS will likely require granting **Accessibility** to the Electron/terminal binary (System Settings → Privacy & Security → Accessibility), then re-run.
**Record result:** cursor actually moved? permission required? (this is the discriminating check for gated tier.)

- [ ] **Step 7: Window probe — move a foreign app's frontmost window**

Create `spike/probe-window.js`:

```js
'use strict'
const { execFile } = require('node:child_process')

const script = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set win to first window of frontApp
  set {x, y} to position of win
  set position of win to {x + 120, y + 80}
  return name of frontApp
end tell`

execFile('osascript', ['-e', script], (err, stdout, stderr) => {
  if (err) return console.log('FAIL:', stderr.trim() || err.message)
  console.log('OK: nudged frontmost window of', stdout.trim())
})
```

- [ ] **Step 8: Run the window probe**

Click a normal app window (e.g. Finder or your terminal) so it is frontmost, then within ~3s Run: `npm run spike:window`
Expected on success: that window jumps +120,+80 and logs "OK: nudged frontmost window of <App>". May require Accessibility permission for the terminal binary.
**Record result:** foreign window moved? which apps work/don't? (some apps don't expose AX position.)

- [ ] **Step 9: Commit the spike record**

```bash
git add spike/
git commit -m "chore: step-0 de-risk spike probes (overlay/hook/cursor/window)"
```

> **Decision gate:** if 2.6 and 2.8 succeeded, build both tiers. If either failed, mark the gated tier (Task 11) as "skipped on this machine" and ship the free tier — the design is unchanged.

---

## Task 3: State machine — `mapEvent()` (TDD)

**Files:**
- Create: `src/main/state-machine.js`
- Test: `test/state-machine.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/state-machine.test.js`:

```js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { mapEvent } = require('../src/main/state-machine')

test('UserPromptSubmit and PreToolUse map to WORKING', () => {
  assert.strictEqual(mapEvent('UserPromptSubmit', {}), 'WORKING')
  assert.strictEqual(mapEvent('PreToolUse', {}), 'WORKING')
})

test('PermissionRequest maps to NEEDS_INPUT', () => {
  assert.strictEqual(mapEvent('PermissionRequest', {}), 'NEEDS_INPUT')
})

test('Notification maps to NEEDS_INPUT only for permission_prompt', () => {
  assert.strictEqual(mapEvent('Notification', { notification_type: 'permission_prompt' }), 'NEEDS_INPUT')
  assert.strictEqual(mapEvent('Notification', { notification_type: 'idle_prompt' }), null)
})

test('Stop maps to DONE', () => {
  assert.strictEqual(mapEvent('Stop', {}), 'DONE')
})

test('unknown events do not transition', () => {
  assert.strictEqual(mapEvent('SessionStart', {}), null)
  assert.strictEqual(mapEvent('PostToolUse', {}), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/state-machine.test.js`
Expected: FAIL — `Cannot find module '../src/main/state-machine'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/state-machine.js`:

```js
'use strict'

const STATES = Object.freeze({
  IDLE_ROAM: 'IDLE_ROAM',
  WORKING: 'WORKING',
  NEEDS_INPUT: 'NEEDS_INPUT',
  DONE: 'DONE',
  MISCHIEF: 'MISCHIEF',
})

function mapEvent(hookEventName, payload = {}) {
  switch (hookEventName) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
      return STATES.WORKING
    case 'PermissionRequest':
      return STATES.NEEDS_INPUT
    case 'Notification':
      return payload.notification_type === 'permission_prompt' ? STATES.NEEDS_INPUT : null
    case 'Stop':
      return STATES.DONE
    default:
      return null
  }
}

module.exports = { STATES, mapEvent }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/state-machine.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/state-machine.js test/state-machine.test.js
git commit -m "feat: state-machine event mapping (mapEvent)"
```

---

## Task 4: State machine — `StateMachine` class transitions (TDD)

**Files:**
- Modify: `src/main/state-machine.js`
- Test: `test/state-machine.test.js`

- [ ] **Step 1: Add failing tests for the class**

Append to `test/state-machine.test.js`:

```js
const { StateMachine } = require('../src/main/state-machine')

// A controllable fake timer: records the latest scheduled callback and lets the
// test fire it on demand. Enough for one pending timer at a time (the machine only
// ever has one outstanding timer).
function fakeTimers() {
  let pending = null
  return {
    set: (fn) => { pending = fn; return pending },
    clear: () => { pending = null },
    fire: () => { const fn = pending; pending = null; if (fn) fn() },
    hasPending: () => pending !== null,
  }
}

test('handle() updates state and notifies onChange', () => {
  const seen = []
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: (s) => seen.push(s), setTimer: t.set, clearTimer: t.clear })
  assert.strictEqual(sm.state, 'IDLE_ROAM')
  sm.handle('UserPromptSubmit', {})
  assert.strictEqual(sm.state, 'WORKING')
  assert.deepStrictEqual(seen, ['WORKING'])
})

test('non-mapping events leave state unchanged and do not notify', () => {
  const seen = []
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: (s) => seen.push(s), setTimer: t.set, clearTimer: t.clear })
  sm.handle('SessionStart', {})
  assert.strictEqual(sm.state, 'IDLE_ROAM')
  assert.deepStrictEqual(seen, [])
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test test/state-machine.test.js`
Expected: FAIL — `StateMachine is not a constructor`.

- [ ] **Step 3: Implement the class (timers not yet used)**

In `src/main/state-machine.js`, add before `module.exports`:

```js
class StateMachine {
  constructor({ onChange, setTimer = setTimeout, clearTimer = clearTimeout,
                boredomMs = 45000, doneDecayMs = 2500, mischiefMs = 4000 } = {}) {
    this.state = STATES.IDLE_ROAM
    this._onChange = onChange || (() => {})
    this._setTimer = setTimer
    this._clearTimer = clearTimer
    this._boredomMs = boredomMs
    this._doneDecayMs = doneDecayMs
    this._mischiefMs = mischiefMs
    this._timer = null
  }

  handle(hookEventName, payload = {}) {
    const next = mapEvent(hookEventName, payload)
    if (next) this._set(next)
  }

  _set(state) {
    this.state = state
    this._onChange(state)
    this._scheduleTimers()
  }

  _scheduleTimers() {
    if (this._timer) { this._clearTimer(this._timer); this._timer = null }
    // (timer wiring is added and tested in Task 5)
  }
}
```

And update the export line:

```js
module.exports = { STATES, mapEvent, StateMachine }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/state-machine.test.js`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/state-machine.js test/state-machine.test.js
git commit -m "feat: StateMachine class with event-driven transitions"
```

---

## Task 5: State machine — boredom & done-decay timers (TDD)

**Files:**
- Modify: `src/main/state-machine.js`
- Test: `test/state-machine.test.js`

- [ ] **Step 1: Add failing timer tests**

Append to `test/state-machine.test.js`:

```js
test('IDLE_ROAM schedules a timer that fires into MISCHIEF', () => {
  const seen = []
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: (s) => seen.push(s), setTimer: t.set, clearTimer: t.clear })
  // Constructor leaves us in IDLE_ROAM but with no timer scheduled until a transition.
  sm.handle('Stop', {})            // -> DONE (schedules done-decay)
  assert.strictEqual(sm.state, 'DONE')
  t.fire()                          // done-decay fires -> IDLE_ROAM (schedules boredom)
  assert.strictEqual(sm.state, 'IDLE_ROAM')
  t.fire()                          // boredom fires -> MISCHIEF
  assert.strictEqual(sm.state, 'MISCHIEF')
  t.fire()                          // mischief done -> IDLE_ROAM
  assert.strictEqual(sm.state, 'IDLE_ROAM')
  assert.deepStrictEqual(seen, ['DONE', 'IDLE_ROAM', 'MISCHIEF', 'IDLE_ROAM'])
})

test('a new event cancels the pending timer', () => {
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: () => {}, setTimer: t.set, clearTimer: t.clear })
  sm.handle('Stop', {})            // DONE + pending done-decay timer
  assert.ok(t.hasPending())
  sm.handle('UserPromptSubmit', {})// WORKING — must cancel the decay timer
  assert.strictEqual(sm.state, 'WORKING')
  assert.strictEqual(t.hasPending(), false) // WORKING schedules no timer
})

test('NEEDS_INPUT holds (no auto timer)', () => {
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: () => {}, setTimer: t.set, clearTimer: t.clear })
  sm.handle('PermissionRequest', {})
  assert.strictEqual(sm.state, 'NEEDS_INPUT')
  assert.strictEqual(t.hasPending(), false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/state-machine.test.js`
Expected: FAIL — state stays after `t.fire()` (no timer wired yet).

- [ ] **Step 3: Implement timer scheduling**

Replace the `_scheduleTimers()` method in `src/main/state-machine.js` with:

```js
  _scheduleTimers() {
    if (this._timer) { this._clearTimer(this._timer); this._timer = null }
    if (this.state === STATES.DONE) {
      this._timer = this._setTimer(() => this._set(STATES.IDLE_ROAM), this._doneDecayMs)
    } else if (this.state === STATES.IDLE_ROAM) {
      this._timer = this._setTimer(() => this._set(STATES.MISCHIEF), this._boredomMs)
    } else if (this.state === STATES.MISCHIEF) {
      this._timer = this._setTimer(() => this._set(STATES.IDLE_ROAM), this._mischiefMs)
    }
    // WORKING and NEEDS_INPUT have no auto-transition timer.
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/state-machine.test.js`
Expected: PASS — all state-machine tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/state-machine.js test/state-machine.test.js
git commit -m "feat: boredom/done-decay/mischief timers in StateMachine"
```

---

## Task 6: Status listener — HTTP `POST /hook` (TDD)

**Files:**
- Create: `src/main/status-listener.js`
- Test: `test/status-listener.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/status-listener.test.js`:

```js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { createListener } = require('../src/main/status-listener')

async function withListener(onEvent, fn) {
  const listener = createListener({ port: 0, host: '127.0.0.1', onEvent })
  const port = await listener.listen()
  try { await fn(port) } finally { await listener.close() }
}

test('POST /hook parses event name + payload and calls onEvent, returns 204', async () => {
  const calls = []
  await withListener((name, payload) => calls.push([name, payload]), async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'Stop', session_id: 'abc' }),
    })
    assert.strictEqual(res.status, 204)
  })
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0][0], 'Stop')
  assert.strictEqual(calls[0][1].session_id, 'abc')
})

test('malformed JSON does not throw; onEvent not called; returns 204', async () => {
  const calls = []
  await withListener((n) => calls.push(n), async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: '{not json' })
    assert.strictEqual(res.status, 204)
  })
  assert.strictEqual(calls.length, 0)
})

test('non-hook routes return 404', async () => {
  await withListener(() => {}, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/other`)
    assert.strictEqual(res.status, 404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/status-listener.test.js`
Expected: FAIL — `Cannot find module '../src/main/status-listener'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/status-listener.js`:

```js
'use strict'
const http = require('node:http')

function createListener({ port, host = '127.0.0.1', onEvent }) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        let json = null
        try { json = JSON.parse(body || '{}') } catch { json = null }
        if (json && json.hook_event_name) onEvent(json.hook_event_name, json)
        res.writeHead(204).end()
      })
    } else {
      res.writeHead(404).end()
    }
  })

  return {
    server,
    listen() {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)))
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

module.exports = { createListener }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/status-listener.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/status-listener.js test/status-listener.test.js
git commit -m "feat: localhost HTTP status listener (POST /hook)"
```

---

## Task 7: Hook installer — additive settings.json edits (TDD)

**Files:**
- Create: `src/main/hook-installer.js`
- Test: `test/hook-installer.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/hook-installer.test.js`:

```js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { installHooks, uninstallHooks, HOOK_EVENTS } = require('../src/main/hook-installer')

function tmpSettings(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-'))
  const p = path.join(dir, 'settings.json')
  if (initial !== undefined) fs.writeFileSync(p, JSON.stringify(initial))
  return p
}

test('installHooks adds an http hook for every DuckClaude event', () => {
  const p = tmpSettings({})
  installHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  for (const ev of HOOK_EVENTS) {
    const groups = cfg.hooks[ev]
    assert.ok(Array.isArray(groups), `missing ${ev}`)
    const ours = groups.some((g) => g.hooks.some((h) => h.url === 'http://127.0.0.1:4242/hook'))
    assert.ok(ours, `no DuckClaude hook in ${ev}`)
  }
})

test('installHooks is idempotent (no duplicates on second run)', () => {
  const p = tmpSettings({})
  installHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  installHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const count = cfg.hooks.Stop.filter((g) => g.hooks.some((h) => h.url === 'http://127.0.0.1:4242/hook')).length
  assert.strictEqual(count, 1)
})

test('installHooks preserves existing unrelated hooks (e.g. AgentPet)', () => {
  const p = tmpSettings({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'agentpet-hook' }] }] } })
  installHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const hasAgentPet = cfg.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'agentpet-hook'))
  assert.ok(hasAgentPet, 'AgentPet hook was clobbered')
})

test('uninstallHooks removes only DuckClaude hooks, keeps others', () => {
  const p = tmpSettings({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'agentpet-hook' }] }] } })
  installHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  uninstallHooks({ settingsPath: p, url: 'http://127.0.0.1:4242/hook' })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const ours = cfg.hooks.Stop.some((g) => g.hooks.some((h) => h.url === 'http://127.0.0.1:4242/hook'))
  const hasAgentPet = cfg.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'agentpet-hook'))
  assert.strictEqual(ours, false)
  assert.ok(hasAgentPet)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/hook-installer.test.js`
Expected: FAIL — `Cannot find module '../src/main/hook-installer'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/hook-installer.js`:

```js
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Notification', 'PermissionRequest', 'Stop']

function defaultSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function readSettings(settingsPath) {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} }
}

function writeSettings(settingsPath, cfg) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2))
}

function group(url) {
  return { matcher: '*', hooks: [{ type: 'http', url, async: true }] }
}

function installHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  cfg.hooks = cfg.hooks || {}
  for (const ev of HOOK_EVENTS) {
    cfg.hooks[ev] = cfg.hooks[ev] || []
    const exists = cfg.hooks[ev].some((g) => (g.hooks || []).some((h) => h.url === url))
    if (!exists) cfg.hooks[ev].push(group(url))
  }
  writeSettings(settingsPath, cfg)
}

function uninstallHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  if (!cfg.hooks) return
  for (const ev of HOOK_EVENTS) {
    if (!Array.isArray(cfg.hooks[ev])) continue
    cfg.hooks[ev] = cfg.hooks[ev].filter((g) => !(g.hooks || []).some((h) => h.url === url))
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev]
  }
  writeSettings(settingsPath, cfg)
}

module.exports = { installHooks, uninstallHooks, HOOK_EVENTS, defaultSettingsPath }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/hook-installer.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/hook-installer.js test/hook-installer.test.js
git commit -m "feat: additive Claude Code hook installer/uninstaller"
```

---

## Task 8: Effect helpers — `easePath` and `buildWindowNudgeScript` (TDD)

These are the pure, testable parts of the OS-touching effects module. The actual `nut.js` / `osascript` calls (Task 11) are thin wrappers around them and are verified manually.

**Files:**
- Create: `src/shared/ease.js`
- Test: `test/ease.test.js`
- Create: `src/main/effects.js` (helper only for now)
- Test: `test/effects-helpers.test.js`

- [ ] **Step 1: Write the failing easePath test**

Create `test/ease.test.js`:

```js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { easePath } = require('../src/shared/ease')

test('easePath returns `steps` points starting at `from` ending at `to`', () => {
  const pts = easePath({ x: 0, y: 0 }, { x: 100, y: 50 }, 5)
  assert.strictEqual(pts.length, 5)
  assert.deepStrictEqual(pts[0], { x: 0, y: 0 })
  assert.deepStrictEqual(pts[pts.length - 1], { x: 100, y: 50 })
})

test('easePath points are monotonic along x toward the target', () => {
  const pts = easePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x >= pts[i - 1].x)
})

test('easePath with steps<=1 returns just the target', () => {
  assert.deepStrictEqual(easePath({ x: 1, y: 2 }, { x: 9, y: 9 }, 1), [{ x: 9, y: 9 }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ease.test.js`
Expected: FAIL — `Cannot find module '../src/shared/ease'`.

- [ ] **Step 3: Implement easePath**

Create `src/shared/ease.js`:

```js
'use strict'

// easeInOutQuad over t in [0,1]
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function easePath(from, to, steps) {
  if (steps <= 1) return [{ x: to.x, y: to.y }]
  const pts = []
  for (let i = 0; i < steps; i++) {
    const e = easeInOutQuad(i / (steps - 1))
    pts.push({
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
    })
  }
  return pts
}

module.exports = { easePath, easeInOutQuad }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ease.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing window-script test**

Create `test/effects-helpers.test.js`:

```js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { buildWindowNudgeScript } = require('../src/main/effects')

test('buildWindowNudgeScript embeds the delta and targets the frontmost process', () => {
  const s = buildWindowNudgeScript(120, 80)
  assert.match(s, /System Events/)
  assert.match(s, /frontmost is true/)
  assert.match(s, /\{x \+ 120, y \+ 80\}/)
})

test('buildWindowNudgeScript supports negative deltas', () => {
  const s = buildWindowNudgeScript(-30, -10)
  assert.match(s, /\{x \+ -30, y \+ -10\}/)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test test/effects-helpers.test.js`
Expected: FAIL — `Cannot find module '../src/main/effects'`.

- [ ] **Step 7: Implement effects.js with the helper (OS wrappers added in Task 11)**

Create `src/main/effects.js`:

```js
'use strict'

function buildWindowNudgeScript(dx, dy) {
  return `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set win to first window of frontApp
  set {x, y} to position of win
  set position of win to {x + ${dx}, y + ${dy}}
end tell`
}

module.exports = { buildWindowNudgeScript }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test test/effects-helpers.test.js`
Expected: PASS.

- [ ] **Step 9: Run the whole suite and commit**

Run: `npm test`
Expected: all test files pass.

```bash
git add src/shared/ease.js test/ease.test.js src/main/effects.js test/effects-helpers.test.js
git commit -m "feat: effect helpers (easePath, window nudge script)"
```

---

## Task 9: Overlay window + roaming duck (manual verification)

Builds the free-tier visual: a transparent click-through window with an emoji duck (🦆) that waddles to random points. No real sprite assets needed for the MVP — the duck is drawn on a canvas. State reactions are added in Task 10.

**Files:**
- Create: `src/renderer/overlay.html`
- Create: `src/renderer/overlay.js`
- Create: `src/main/preload.js`
- Create: `src/main/main.js`

- [ ] **Step 1: Create the renderer HTML**

Create `src/renderer/overlay.html`:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" />
    <style>
      html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
      #stage { position: fixed; inset: 0; }
    </style>
  </head>
  <body>
    <canvas id="stage"></canvas>
    <script src="./overlay.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the renderer animation loop**

Create `src/renderer/overlay.js`:

```js
'use strict'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
resize(); window.addEventListener('resize', resize)

const duck = {
  x: window.innerWidth / 2, y: window.innerHeight / 2,
  tx: window.innerWidth / 2, ty: window.innerHeight / 2,
  speed: 2.2, state: 'IDLE_ROAM', bob: 0,
}

function pickRoamTarget() {
  duck.tx = 60 + Math.random() * (window.innerWidth - 120)
  duck.ty = 60 + Math.random() * (window.innerHeight - 120)
}
let roamTimer = setInterval(() => { if (duck.state === 'IDLE_ROAM') pickRoamTarget() }, 2500)

function step() {
  const dx = duck.tx - duck.x, dy = duck.ty - duck.y
  const dist = Math.hypot(dx, dy)
  const moving = dist > 2
  if (moving) { duck.x += (dx / dist) * duck.speed; duck.y += (dy / dist) * duck.speed }
  duck.bob += moving ? 0.25 : 0.06

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const bobY = Math.sin(duck.bob) * (moving ? 5 : 2)
  ctx.save()
  ctx.translate(duck.x, duck.y + bobY)
  if (dx < 0) ctx.scale(-1, 1) // face travel direction
  ctx.font = '54px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🦆', 0, 0)
  ctx.restore()

  requestAnimationFrame(step)
}
step()

// Exposed by preload in Task 10; guarded so this file runs standalone too.
if (window.duckBridge) {
  window.duckBridge.onState((s) => { duck.state = s })
  window.duckBridge.onCursor((p) => { duck.tx = p.x; duck.ty = p.y })
}
```

- [ ] **Step 3: Create the preload bridge**

Create `src/main/preload.js`:

```js
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('duckBridge', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
})
```

- [ ] **Step 4: Create the Electron main entry (overlay only for now)**

Create `src/main/main.js`:

```js
'use strict'
const path = require('node:path')
const { app, BrowserWindow, screen } = require('electron')

let overlay = null

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds
  overlay = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true, frame: false, resizable: false, movable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  overlay.setIgnoreMouseEvents(true, { forward: true })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'))
}

app.whenReady().then(createOverlay)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 5: Run and verify manually**

Run: `npm start`
Expected: a 🦆 emoji waddles around the screen over your other windows, bobbing as it moves and re-picking a random target every few seconds; clicks pass through to windows behind it. Quit with Ctrl+C in the terminal.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/overlay.html src/renderer/overlay.js src/main/preload.js src/main/main.js
git commit -m "feat: transparent click-through overlay with roaming duck"
```

---

## Task 10: Wire status → state machine → renderer + tray (manual verification)

Connects the HTTP listener and state machine into `main.js`, pushes state to the renderer, sends the cursor point during NEEDS_INPUT, installs hooks on launch, and adds a tray menu. After this task the duck reacts to **real Claude Code activity**.

**Files:**
- Modify: `src/main/main.js`
- Create: `src/main/tray.js`
- Modify: `src/renderer/overlay.js` (state-driven visuals)

- [ ] **Step 1: Create the tray menu**

Create `src/main/tray.js`:

```js
'use strict'
const path = require('node:path')
const { Tray, Menu, nativeImage } = require('electron')

function createTray({ onToggleChaos, onQuit, getChaos }) {
  // A 1x1 transparent image keeps the tray icon valid without shipping an asset.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🦆')
  function rebuild() {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: getChaos() ? 'Chaos: ON' : 'Chaos: OFF', click: () => { onToggleChaos(); rebuild() } },
      { type: 'separator' },
      { label: 'Quit DuckClaude', click: onQuit },
    ]))
  }
  rebuild()
  return tray
}

module.exports = { createTray }
```

- [ ] **Step 2: Rewrite main.js to wire everything**

Replace `src/main/main.js` with:

```js
'use strict'
const path = require('node:path')
const { app, BrowserWindow, screen } = require('electron')
const { StateMachine } = require('./state-machine')
const { createListener } = require('./status-listener')
const { installHooks, uninstallHooks } = require('./hook-installer')
const { createTray } = require('./tray')
const config = require('../config')

let overlay = null
let tray = null
let listener = null
let cursorTimer = null
const state = { chaos: false }

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds
  overlay = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true, frame: false, resizable: false, movable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  overlay.setIgnoreMouseEvents(true, { forward: true })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'))
}

function send(channel, payload) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
}

// While NEEDS_INPUT, stream the real cursor point so the duck runs to it.
function startCursorStream() {
  stopCursorStream()
  cursorTimer = setInterval(() => send('cursor', screen.getCursorScreenPoint()), 200)
}
function stopCursorStream() { if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null } }

function onState(s) {
  send('state', s)
  if (s === 'NEEDS_INPUT') startCursorStream(); else stopCursorStream()
}

app.whenReady().then(() => {
  createOverlay()
  const sm = new StateMachine({ onChange: onState })
  listener = createListener({ port: config.PORT, host: config.HOST, onEvent: (name, payload) => sm.handle(name, payload) })
  listener.listen()
  installHooks({ url: config.hookUrl() })
  tray = createTray({
    getChaos: () => state.chaos,
    onToggleChaos: () => { state.chaos = !state.chaos },
    onQuit: () => app.quit(),
  })
})

app.on('before-quit', () => {
  uninstallHooks({ url: config.hookUrl() })
  if (listener) listener.close()
  stopCursorStream()
})

app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 3: Add state-driven visuals to the renderer**

Replace the draw block in `src/renderer/overlay.js` (the `ctx.save()` … `ctx.restore()` section inside `step()`) with:

```js
  ctx.save()
  ctx.translate(duck.x, duck.y + bobY)

  // State tint/effects
  if (duck.state === 'NEEDS_INPUT') {
    const pulse = 1 + Math.sin(duck.bob * 2) * 0.12
    ctx.scale(pulse, pulse)
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('HONK!', 0, -42)
  }
  if (duck.state === 'WORKING') {
    ctx.font = '18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⌨️', 22, -28)
  }
  if (dx < 0) ctx.scale(-1, 1)
  ctx.font = '54px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🦆', 0, 0)
  ctx.restore()

  if (duck.state === 'DONE') drawConfetti()
```

And add at the end of `src/renderer/overlay.js`:

```js
// --- DONE celebration: short-lived confetti ---
let confetti = []
function spawnConfetti() {
  confetti = Array.from({ length: 40 }, () => ({
    x: duck.x, y: duck.y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6 - 2,
    c: `hsl(${Math.random() * 360},90%,60%)`, life: 60,
  }))
}
function drawConfetti() {
  for (const p of confetti) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--
    ctx.fillStyle = p.c
    ctx.fillRect(p.x, p.y, 5, 5)
  }
  confetti = confetti.filter((p) => p.life > 0)
}

// Footprints while roaming/mischief: drop a print, age existing ones, cull dead.
let prints = []
setInterval(() => {
  if (duck.state === 'IDLE_ROAM' || duck.state === 'MISCHIEF') {
    prints.push({ x: duck.x, y: duck.y + 24, life: 120 })
  }
  prints.forEach((p) => (p.life--))
  prints = prints.filter((p) => p.life > 0)
}, 350)

if (window.duckBridge) {
  let prev = duck.state
  window.duckBridge.onState((s) => {
    if (s === 'DONE' && prev !== 'DONE') spawnConfetti()
    duck.state = s; prev = s
  })
  window.duckBridge.onCursor((p) => {
    if (duck.state === 'NEEDS_INPUT') { duck.tx = p.x; duck.ty = p.y }
  })
}
```

Then add footprint drawing at the **start** of the `ctx.clearRect(...)` region in `step()` — immediately after `ctx.clearRect(0, 0, canvas.width, canvas.height)` add:

```js
  for (const p of prints) {
    ctx.globalAlpha = Math.min(0.4, p.life / 300)
    ctx.fillStyle = '#5b3a1a'
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 4, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
```

(Remove the duplicate `onState`/`onCursor` guard block added in Task 9 Step 2 so only the richer one at the end of the file remains.)

- [ ] **Step 4: Verify end-to-end with simulated events**

Start the app — Run: `npm start`
In another terminal, simulate Claude Code events with curl:

```bash
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"UserPromptSubmit"}'   # -> WORKING (⌨️)
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"PermissionRequest"}'  # -> NEEDS_INPUT (runs to cursor + HONK!)
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"Stop"}'                # -> DONE (confetti)
```

Expected: the duck shows ⌨️ while WORKING; runs to your mouse cursor and shows "HONK!" on NEEDS_INPUT; bursts confetti on DONE then returns to roaming and leaving footprints. Leave it idle ~45s to see it drop into MISCHIEF (footprints).

- [ ] **Step 5: Verify against real Claude Code**

With the app running, open a Claude Code session in this repo and submit a prompt that triggers a permission request (e.g. ask it to run a shell command). Watch the duck transition WORKING → NEEDS_INPUT → DONE in response to the real hooks installed in `~/.claude/settings.json`.
Expected: duck reacts to the live session. Confirm AgentPet (if running) still works — our hooks are additive.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.js src/main/tray.js src/renderer/overlay.js
git commit -m "feat: wire hooks->state machine->overlay (working/needs-input/done) + tray + footprints"
```

---

## Task 11: Gated-tier chaos — cursor grab + window nudge (manual verification)

Adds the permission-gated physical mischief. **Only do the live-verification steps if Task 2.6 and 2.8 succeeded on this machine.** All calls no-op gracefully when chaos is off or permission is denied, so the app never breaks.

**Files:**
- Modify: `src/main/effects.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Add the OS wrappers to effects.js**

Add to `src/main/effects.js` (keep the existing `buildWindowNudgeScript`):

```js
const { execFile } = require('node:child_process')
const { easePath } = require('../shared/ease')

let nut = null
try { nut = require('@nut-tree-fork/nut-js') } catch { nut = null }

// Move the real cursor from `from` to `to` with easing. No-op if nut.js is unavailable.
async function cursorGrab(from, to, steps = 24) {
  if (!nut) return false
  try {
    for (const p of easePath(from, to, steps)) {
      await nut.mouse.setPosition(new nut.Point(p.x, p.y))
    }
    return true
  } catch { return false }
}

// Nudge the frontmost foreign window by (dx,dy) via AppleScript. macOS only.
function nudgeWindow(dx, dy) {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(false)
    execFile('osascript', ['-e', buildWindowNudgeScript(dx, dy)], (err) => resolve(!err))
  })
}

module.exports = { buildWindowNudgeScript, cursorGrab, nudgeWindow }
```

- [ ] **Step 2: Update the export to keep the helper test green**

Confirm the `module.exports` line in `src/main/effects.js` is exactly:

```js
module.exports = { buildWindowNudgeScript, cursorGrab, nudgeWindow }
```

Run: `node --test test/effects-helpers.test.js`
Expected: PASS (the helper test still imports `buildWindowNudgeScript`).

- [ ] **Step 3: Trigger chaos from main.js on state changes**

In `src/main/main.js`, add near the top imports:

```js
const { cursorGrab, nudgeWindow } = require('./effects')
```

Then replace the `onState` function with:

```js
function onState(s) {
  send('state', s)
  if (s === 'NEEDS_INPUT') {
    startCursorStream()
    if (state.chaos) {
      const from = screen.getCursorScreenPoint()
      // Yank the real cursor toward the duck's current honk spot (screen centre-ish).
      const { width, height } = screen.getPrimaryDisplay().bounds
      cursorGrab(from, { x: Math.round(width / 2), y: Math.round(height / 2) })
    }
  } else {
    stopCursorStream()
  }
  if (s === 'MISCHIEF' && state.chaos) {
    nudgeWindow(120, 80)
  }
}
```

- [ ] **Step 4: Verify gated chaos (only if spike passed)**

Run: `npm start`, enable **Chaos: ON** from the tray menu, then:

```bash
curl -s -X POST http://127.0.0.1:4242/hook -d '{"hook_event_name":"PermissionRequest"}'
```

Expected (with Accessibility granted): the real cursor is dragged toward screen centre. Leave idle ~45s with a normal window frontmost: the frontmost window jumps +120,+80 when MISCHIEF triggers. Toggle **Chaos: OFF** and confirm neither happens (free tier still runs).

- [ ] **Step 5: Verify the permission-denied path**

Revoke Accessibility for the Electron/terminal binary (System Settings → Privacy & Security → Accessibility), restart the app with Chaos ON, and fire the same curl.
Expected: no crash; cursor does not move; duck still honks and runs to the cursor (free tier). `cursorGrab`/`nudgeWindow` return false silently.

- [ ] **Step 6: Commit**

```bash
git add src/main/effects.js src/main/main.js
git commit -m "feat: gated-tier chaos (cursor grab + window nudge) with graceful no-op"
```

---

## Task 12: Full-suite green + demo dry-run

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all test files (`state-machine`, `status-listener`, `hook-installer`, `ease`, `effects-helpers`) pass.

- [ ] **Step 2: Run the 60-second demo script end-to-end**

Start the app (`npm start`), Chaos ON, then in a real Claude Code session:
1. Submit a prompt → duck paces with ⌨️ (WORKING).
2. Let Claude request permission → duck runs to cursor + HONK! + cursor yanked (NEEDS_INPUT).
3. Approve → confetti (DONE).
4. Leave idle ~45s → footprints + a window nudge (MISCHIEF).

Expected: the full narrative from the spec plays out. Note any rough edges as post-MVP follow-ups.

- [ ] **Step 3: Final commit / tag the MVP**

```bash
git add -A
git commit -m "chore: DuckClaude MVP demo verified end-to-end" --allow-empty
git tag duckclaude-mvp-demo
```

---

## Self-Review

**Spec coverage check (spec §→ task):**
- §4 Architecture (hook→listener→state machine→overlay/effects): Tasks 6, 3–5, 9–11. ✓
- §5 Components: Overlay (9), State Machine (3–5), Status Listener (6), Hook Installer (7), Effects (8, 11), Tray (10). ✓
- §6 Claude Code integration + event mapping: mapEvent (3), installer events (7), wiring (10). ✓
- §7 State machine detail (5 states + timers + decay + preempt): Tasks 4–5. ✓
- §8 Chaos tiers (free first, gated mac-only, graceful no-op): free (9–10), gated (11). ✓
- §10 Permission notes (denied path tested, click-through): Task 11.5, Task 9.5. ✓
- §11 Build order (spike → free → gated): Tasks 2 → 9–10 → 11. ✓
- §3 Demo narrative: validated in Task 12.2. ✓

**Placeholder scan:** every code step contains complete runnable code; commands have expected output; no TBD/TODO. ✓

**Type/name consistency:** `mapEvent`, `StateMachine({onChange,setTimer,clearTimer})`, `createListener({port,host,onEvent}).listen()/close()`, `installHooks/uninstallHooks({settingsPath,url})`, `HOOK_EVENTS`, `easePath(from,to,steps)`, `buildWindowNudgeScript(dx,dy)`, `cursorGrab(from,to,steps)`, `nudgeWindow(dx,dy)`, `config.PORT/HOST/hookUrl()`, renderer `window.duckBridge.onState/onCursor`, IPC channels `state`/`cursor` — used consistently across tasks. ✓

**Known simplifications (intentional, within spec scope):** duck is an emoji on canvas rather than a spritesheet (spec §9 allows placeholder art); window nudge targets the frontmost process generically rather than a configured app name (spec §8 notes target chosen at demo time).
