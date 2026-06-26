'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { mapEvent, StateMachine } = require('../src/main/state-machine')

// --- mapEvent ---

test('UserPromptSubmit and PreToolUse map to WORKING', () => {
  assert.strictEqual(mapEvent('UserPromptSubmit', {}), 'WORKING')
  assert.strictEqual(mapEvent('PreToolUse', {}), 'WORKING')
})

test('PermissionRequest maps to NEEDS_INPUT', () => {
  assert.strictEqual(mapEvent('PermissionRequest', {}), 'NEEDS_INPUT')
})

test('Notification maps to NEEDS_INPUT for permission_prompt and idle_prompt, not others', () => {
  assert.strictEqual(mapEvent('Notification', { notification_type: 'permission_prompt' }), 'NEEDS_INPUT')
  assert.strictEqual(mapEvent('Notification', { notification_type: 'idle_prompt' }), 'NEEDS_INPUT')
  assert.strictEqual(mapEvent('Notification', { notification_type: 'auth_success' }), null)
})

test('Stop maps to DONE', () => {
  assert.strictEqual(mapEvent('Stop', {}), 'DONE')
})

test('unknown events do not transition', () => {
  assert.strictEqual(mapEvent('SessionStart', {}), null)
  assert.strictEqual(mapEvent('PostToolUse', {}), null)
})

// --- StateMachine ---

// A controllable fake timer: records the latest scheduled callback and lets the
// test fire it on demand. The machine only ever has one outstanding timer.
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

test('IDLE_ROAM schedules a timer that fires into MISCHIEF', () => {
  const seen = []
  const t = fakeTimers()
  const sm = new StateMachine({ onChange: (s) => seen.push(s), setTimer: t.set, clearTimer: t.clear })
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

// --- wander range (v2) ---

test('wander delay uses rng across [wanderMinMs, wanderMaxMs]', () => {
  const delays = []
  const t = { set: (fn, ms) => { delays.push(ms); return fn }, clear: () => {} }
  const sm = new StateMachine({
    onChange: () => {}, setTimer: t.set, clearTimer: t.clear,
    wanderMinMs: 20000, wanderMaxMs: 40000, rng: () => 0.5,
  })
  sm._set('IDLE_ROAM')             // schedules a wander timer
  assert.strictEqual(delays.at(-1), 30000) // 20000 + 0.5*(20000)
})

test('applySettings updates the wander range live', () => {
  const delays = []
  const t = { set: (fn, ms) => { delays.push(ms); return fn }, clear: () => {} }
  const sm = new StateMachine({ onChange: () => {}, setTimer: t.set, clearTimer: t.clear, rng: () => 0 })
  sm.applySettings({ wanderMinMs: 5000, wanderMaxMs: 9000 })
  sm._set('IDLE_ROAM')
  assert.strictEqual(delays.at(-1), 5000)  // min, since rng()=0
})
