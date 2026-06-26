'use strict'
const { execFile } = require('node:child_process')
const { easePath } = require('../shared/ease')

let nut = null
try {
  nut = require('@nut-tree-fork/nut-js')
} catch {
  nut = null
}

function buildWindowNudgeScript(dx, dy) {
  return `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set win to first window of frontApp
  set {x, y} to position of win
  set position of win to {x + ${dx}, y + ${dy}}
end tell`
}

// Move the real cursor from `from` to `to` with easing. No-op if nut.js is unavailable.
async function cursorGrab(from, to, steps = 24) {
  if (!nut) return false
  try {
    for (const p of easePath(from, to, steps)) {
      await nut.mouse.setPosition(new nut.Point(p.x, p.y))
    }
    return true
  } catch {
    return false
  }
}

// Nudge the frontmost foreign window by (dx,dy) via AppleScript. macOS only.
function nudgeWindow(dx, dy) {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(false)
    execFile('osascript', ['-e', buildWindowNudgeScript(dx, dy)], (err) => resolve(!err))
  })
}

module.exports = { buildWindowNudgeScript, cursorGrab, nudgeWindow }
