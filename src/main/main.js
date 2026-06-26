'use strict'
const path = require('node:path')
const fs = require('node:fs')
const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  shell,
  systemPreferences,
} = require('electron')
const { StateMachine } = require('./state-machine')
const { createListener } = require('./status-listener')
const { installHooks, uninstallHooks } = require('./hook-installer')
const { createTray } = require('./tray')
const { openSettingsWindow } = require('./settings-window')
const settingsStore = require('./settings-store')
const content = require('./content')
const effects = require('./effects')
const config = require('../config')

let overlay = null
let tray = null
let listener = null
let cursorTimer = null
let sm = null
let dirs = null
let settings = settingsStore.DEFAULTS

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds
  overlay = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
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
function stopCursorStream() {
  if (cursorTimer) {
    clearInterval(cursorTimer)
    cursorTimer = null
  }
}

// Pick a meme (image) if any exist, else a random note. Returns null if nothing.
function pickGift() {
  if (!dirs) return null
  const memes = content.listFiles(dirs.memesDir, ['.png', '.jpg', '.jpeg', '.gif', '.webp'])
  if (memes.length) {
    return { type: 'meme', src: 'file://' + content.pickRandom(memes) }
  }
  const note = content.pickRandom(content.listFiles(dirs.notesDir, ['.txt']))
  if (note) {
    try {
      return { type: 'note', text: fs.readFileSync(note, 'utf8').slice(0, 200) }
    } catch {
      return null
    }
  }
  return null
}

function onState(s) {
  send('state', s)

  if (s === 'NEEDS_INPUT') {
    startCursorStream()
    if (settings.chaos.enabled && settings.chaos.grabCursor) {
      const from = screen.getCursorScreenPoint()
      const { width, height } = screen.getPrimaryDisplay().bounds
      effects.cursorGrab(from, { x: Math.round(width / 2), y: Math.round(height / 2) })
    }
  } else {
    stopCursorStream()
  }

  if (s === 'MISCHIEF' && settings.chaos.enabled) {
    if (settings.chaos.bringMemes) {
      const g = pickGift()
      if (g) send('gift', g)
    }
    if (settings.chaos.nudgeWindows) effects.nudgeWindow(120, 80)
  }
}

function applySettings() {
  send('settings', settings)
  if (sm) {
    sm.applySettings({
      wanderMinMs: settings.wanderMinSeconds * 1000,
      wanderMaxMs: settings.wanderMaxSeconds * 1000,
    })
  }
  if (overlay && !overlay.isDestroyed()) overlay.setOpacity(settings.opacity)
}

app.whenReady().then(() => {
  settings = settingsStore.load(settingsFile())
  dirs = content.ensureFolders(app.getPath('userData'))
  createOverlay()

  sm = new StateMachine({
    onChange: onState,
    wanderMinMs: settings.wanderMinSeconds * 1000,
    wanderMaxMs: settings.wanderMaxSeconds * 1000,
  })

  listener = createListener({
    port: config.PORT,
    host: config.HOST,
    onEvent: (name, payload) => sm.handle(name, payload),
  })
  listener.listen()

  if (settings.hooksInstalled) installHooks({ url: config.hookUrl() })
  overlay.webContents.once('did-finish-load', applySettings)

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, partial) => {
    settings = settingsStore.deepMerge(settings, partial)
    settingsStore.save(settingsFile(), settings)
    applySettings()
    return settings
  })
  ipcMain.handle('content:openMemes', () => shell.openPath(dirs.memesDir))
  ipcMain.handle('content:openNotes', () => shell.openPath(dirs.notesDir))
  ipcMain.handle('perm:accessibility', () =>
    process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false)
      : true,
  )

  tray = createTray({
    getChaos: () => settings.chaos.enabled,
    onToggleChaos: () => {
      settings = settingsStore.deepMerge(settings, { chaos: { enabled: !settings.chaos.enabled } })
      settingsStore.save(settingsFile(), settings)
      applySettings()
    },
    onSettings: () => openSettingsWindow(),
    onQuit: () => app.quit(),
  })

  // Keep DuckClaude out of the Dock — it's a menu-bar companion.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
})

app.on('before-quit', () => {
  if (settings.hooksInstalled) uninstallHooks({ url: config.hookUrl() })
  if (listener) listener.close()
  stopCursorStream()
})

// The overlay has no close affordance; quitting happens via the tray menu.
app.on('window-all-closed', () => app.quit())
