'use strict'
// Spike 0.1 — move the real cursor under macOS Accessibility (nut.js).
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
