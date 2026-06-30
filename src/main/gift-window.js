'use strict'
const { BrowserWindow } = require('electron')

// Track delivered windows so we can close them all on quit.
const openWindows = new Set()

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function htmlFor(gift) {
  if (gift.type === 'meme') {
    return (
      '<body style="margin:0;background:#111;overflow:hidden">' +
      `<img src="${gift.src}" style="width:100vw;height:100vh;object-fit:contain" />` +
      '</body>'
    )
  }
  return (
    '<body style="margin:0;font:16px -apple-system,system-ui,sans-serif;padding:18px;' +
    'white-space:pre-wrap;background:#fffef0;color:#222">🦆\n\n' +
    escapeHtml(gift.text) +
    '</body>'
  )
}

// Deliver a gift as a real window the user must close, like the goose's meme/notepad.
// If closed within `earlyMs`, fire onEarlyClose (the duck retaliates).
function spawnGift(gift, { onEarlyClose = () => {}, earlyMs = 6000 } = {}) {
  const isMeme = gift.type === 'meme'
  const win = new BrowserWindow({
    width: isMeme ? 360 : 280,
    height: isMeme ? 360 : 180,
    frame: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: isMeme ? 'A gift from your duck' : 'Duck "Not-epad"',
    webPreferences: { sandbox: true },
  })
  win.setAlwaysOnTop(true, 'floating')
  win.removeMenu()
  win.loadURL('data:text/html,' + encodeURIComponent(htmlFor(gift)))

  const openedAt = Date.now()
  openWindows.add(win)
  win.on('closed', () => {
    openWindows.delete(win)
    if (Date.now() - openedAt < earlyMs) onEarlyClose()
  })
  return win
}

function closeAll() {
  for (const w of openWindows) {
    if (!w.isDestroyed()) w.destroy()
  }
  openWindows.clear()
}

module.exports = { spawnGift, closeAll, htmlFor, escapeHtml }
