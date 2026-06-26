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
      // Claude needs you: waiting for permission, or you've gone idle mid-session.
      return payload.notification_type === 'permission_prompt' ||
        payload.notification_type === 'idle_prompt'
        ? STATES.NEEDS_INPUT
        : null
    case 'Stop':
      return STATES.DONE
    default:
      return null
  }
}

class StateMachine {
  constructor({
    onChange,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    rng = Math.random,
    wanderMinMs = 20000,
    wanderMaxMs = 40000,
    doneDecayMs = 2500,
    mischiefMs = 4000,
  } = {}) {
    this.state = STATES.IDLE_ROAM
    this._onChange = onChange || (() => {})
    this._setTimer = setTimer
    this._clearTimer = clearTimer
    this._rng = rng
    this._wanderMinMs = wanderMinMs
    this._wanderMaxMs = wanderMaxMs
    this._doneDecayMs = doneDecayMs
    this._mischiefMs = mischiefMs
    this._timer = null
  }

  applySettings({ wanderMinMs, wanderMaxMs } = {}) {
    if (typeof wanderMinMs === 'number') this._wanderMinMs = wanderMinMs
    if (typeof wanderMaxMs === 'number') this._wanderMaxMs = wanderMaxMs
  }

  handle(hookEventName, payload = {}) {
    const next = mapEvent(hookEventName, payload)
    if (next) this._set(next)
  }

  _boredomDelay() {
    return Math.round(this._wanderMinMs + this._rng() * (this._wanderMaxMs - this._wanderMinMs))
  }

  _set(state) {
    this.state = state
    this._onChange(state)
    this._scheduleTimers()
  }

  _scheduleTimers() {
    if (this._timer) {
      this._clearTimer(this._timer)
      this._timer = null
    }
    if (this.state === STATES.DONE) {
      this._timer = this._setTimer(() => this._set(STATES.IDLE_ROAM), this._doneDecayMs)
    } else if (this.state === STATES.IDLE_ROAM) {
      this._timer = this._setTimer(() => this._set(STATES.MISCHIEF), this._boredomDelay())
    } else if (this.state === STATES.MISCHIEF) {
      this._timer = this._setTimer(() => this._set(STATES.IDLE_ROAM), this._mischiefMs)
    }
    // WORKING and NEEDS_INPUT have no auto-transition timer.
  }
}

module.exports = { STATES, mapEvent, StateMachine }
