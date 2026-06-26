'use strict'
const path = require('node:path')
const { BrowserWindow } = require('electron')

let win = null

function openSettingsWindow() {
  if (win && !win.isDestroyed()) {
    win.focus()
    return win
  }
  win = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: false,
    title: 'DuckClaude Settings',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js') },
  })
  win.removeMenu()
  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'))
  win.on('closed', () => {
    win = null
  })
  return win
}

module.exports = { openSettingsWindow }
