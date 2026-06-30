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
  Notification,
} = require('electron')
const { StateMachine } = require('./state-machine')
const claude = require('./claude-activity')
const { createListener } = require('./status-listener')
const { installHooks, uninstallHooks } = require('./hook-installer')
const { createTray } = require('./tray')
const { openSettingsWindow } = require('./settings-window')
const settingsStore = require('./settings-store')
const content = require('./content')
const effects = require('./effects')
const { Deck, weightedExpand } = require('./deck')
const giftWindow = require('./gift-window')
const config = require('../config')

let overlay = null
let tray = null
let listener = null
let cursorTimer = null
let sm = null
let dirs = null
let settings = settingsStore.DEFAULTS
let overlayOrigin = { x: 0, y: 0 } // top-left of the multi-display overlay (DIP)
let lastProject = '' // basename of the most recent agent cwd, for notifications
let grabbing = false // a NabMouse cursor drag is in progress

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

// Bounding box of all displays (so the duck can roam across every monitor).
function virtualBounds() {
  const ds = screen.getAllDisplays()
  const minX = Math.min(...ds.map((d) => d.bounds.x))
  const minY = Math.min(...ds.map((d) => d.bounds.y))
  const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function createOverlay() {
  const vb = virtualBounds()
  overlayOrigin = { x: vb.x, y: vb.y }
  overlay = new BrowserWindow({
    x: vb.x,
    y: vb.y,
    width: vb.width,
    height: vb.height,
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
  cursorTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint()
    send('cursor', { x: p.x - overlayOrigin.x, y: p.y - overlayOrigin.y }) // global → window-local
  }, 120)
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

// --- Goose antics: a shuffle bag over the currently-enabled chaos behaviors, weighted
// like the real goose (Mud×2, Meme×2, Nab×3). Rebuilt when the enabled set changes. ---
let anticDeck = null
let anticSig = ''
function enabledAnticWeights() {
  const c = settings.chaos
  const w = {}
  if (c.footprints) w.mud = 2
  if (c.bringMemes) w.gift = 2
  if (c.nudgeWindows) w.nudge = 1
  if (c.grabCursor && c.randomAttacks) w.nab = 3 // random nab gated by CanAttackAtRandom
  return w
}
function nextAntic() {
  const sig = JSON.stringify(enabledAnticWeights())
  if (sig !== anticSig) {
    anticSig = sig
    anticDeck = new Deck(weightedExpand(enabledAnticWeights()))
  }
  return anticDeck.draw()
}

// Drag the real cursor toward the terminal (bottom-centre of the cursor's display), like
// the goose's NabMouse. Visible drag (delay between steps). Gated by chaos + grabCursor.
async function nab(target) {
  if (!(settings.chaos.enabled && settings.chaos.grabCursor) || grabbing) return
  grabbing = true
  try {
    const from = screen.getCursorScreenPoint()
    const b = screen.getDisplayNearestPoint(from).bounds
    const to = target || { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.85) }
    await effects.cursorGrab(from, to, 24, 12) // ~0.3s visible drag
  } finally {
    grabbing = false
  }
}

// Fire OS notifications only on the states that need you (agentpet: waiting/done).
let lastFeedbackState = null
function notify(s) {
  if (!Notification.isSupported || !Notification.isSupported()) return
  const proj = lastProject || 'Claude Code'
  if (s === 'NEEDS_INPUT') new Notification({ title: `${proj} needs input`, body: 'Your duck wants you back 🦆' }).show()
  else if (s === 'DONE') new Notification({ title: `${proj} finished`, body: 'Agent completed its turn ✅' }).show()
}

// Ingest a Claude Code hook event: track project, surface live working activity, split the
// ambiguous Stop into done vs waiting, then drive the state machine.
function handleAgentEvent(name, payload) {
  payload = payload || {}
  if (payload.cwd) {
    lastProject = String(payload.cwd).split('/').filter(Boolean).pop() || lastProject
  }
  if (name === 'UserPromptSubmit') send('activity', 'Thinking…')
  else if (name === 'PreToolUse') send('activity', claude.formatActivity(payload.tool_name, payload.tool_input))

  if (name === 'Stop' && payload.transcript_path &&
      claude.looksLikeQuestion(claude.lastAssistantText(payload.transcript_path))) {
    sm.handle('Notification', { notification_type: 'idle_prompt' }) // really waiting → NEEDS_INPUT
    return
  }
  sm.handle(name, payload)
}

// Deliver a meme/note as a real window the user must close; slam it shut fast → retaliation.
function deliverGift() {
  const g = pickGift()
  if (!g) return
  giftWindow.spawnGift(g, { onEarlyClose: () => nab() })
}

function onState(s) {
  send('state', s)
  if (s !== lastFeedbackState) {
    notify(s) // notify only on real transitions
    lastFeedbackState = s
  }

  if (s === 'NEEDS_INPUT') {
    startCursorStream() // duck runs to the cursor; the grab fires when it reaches it
  } else {
    stopCursorStream()
  }

  if (s === 'MISCHIEF' && settings.chaos.enabled) {
    switch (nextAntic()) {
      case 'mud':
        send('mud') // renderer: run amok + dense footprint trail
        break
      case 'gift':
        deliverGift()
        break
      case 'nudge':
        effects.nudgeWindow(120, 80)
        break
      case 'nab':
        nab()
        break
      default:
        break // no antic enabled
    }
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
    onEvent: handleAgentEvent,
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
  // The duck reached the cursor during NEEDS_INPUT → now grab & drag it toward the terminal.
  ipcMain.on('reached-cursor', () => nab())

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
  giftWindow.closeAll()
})

// The overlay has no close affordance; quitting happens via the tray menu.
app.on('window-all-closed', () => app.quit())
