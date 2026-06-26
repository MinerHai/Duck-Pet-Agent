'use strict'
// Spike 0.2 — move a foreign app's frontmost window under Accessibility (osascript).
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
  if (err) return console.log('FAIL:', (stderr || '').trim() || err.message)
  console.log('OK: nudged frontmost window of', stdout.trim())
})
