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
  Menu,
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
const { pickAdjacent, nextDisplay } = require('./displays')
const config = require('../config')

let overlay = null
let tray = null
let listener = null
let cursorTimer = null
let sm = null
let dirs = null
let settings = settingsStore.DEFAULTS
let overlayOrigin = { x: 0, y: 0 } // top-left of the current display the overlay covers (DIP)
let currentDisplayId = null // which display the overlay currently sits on
let pinnedDisplayId = null // when set, the overlay stays on this monitor (stops auto-following)
let displayFollowTimer = null // relocates the overlay to your active monitor
let lastProject = '' // basename of the most recent agent cwd, for notifications
let grabbing = false // a NabMouse cursor drag is in progress
let agentState = 'IDLE_ROAM' // latest Claude state, shown in the menu
let lastActivity = '' // latest live working activity (from tool_name)
let stateSinceMs = Date.now() // when the current state began (for elapsed in the menu)

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

// macOS ("Displays have separate Spaces") won't let one window span two monitors, so the
// overlay covers exactly ONE display and follows your active monitor instead.
function cursorDisplay() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  } catch {
    return screen.getPrimaryDisplay()
  }
}

// Move the overlay to a different display (keeps it always fully on-screen, no dead zones).
function relocateToDisplay(d) {
  if (!overlay || overlay.isDestroyed() || !d || d.id === currentDisplayId) return
  const b = d.bounds
  overlay.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  overlayOrigin = { x: b.x, y: b.y }
  currentDisplayId = d.id
}

// Hop the overlay to the monitor on the given side (when the coop is dragged off the edge),
// pin it there, and tell the renderer to drop the coop at the edge it entered from.
function hopOverlay(dir) {
  const target = pickAdjacent(screen.getAllDisplays(), currentDisplayId, dir)
  if (!target) return
  relocateToDisplay(target)
  pinnedDisplayId = target.id
  send('coop-place', dir === 'left' ? 'right' : 'left')
}
// Menu action: send the flock to the next monitor and pin it there.
function moveToOtherDisplay() {
  const target = nextDisplay(screen.getAllDisplays(), currentDisplayId)
  if (!target) return
  relocateToDisplay(target)
  pinnedDisplayId = target.id
}
function followCursorDisplay() {
  pinnedDisplayId = null
}

function createOverlay() {
  const d = cursorDisplay()
  const b = d.bounds
  overlayOrigin = { x: b.x, y: b.y }
  currentDisplayId = d.id
  overlay = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
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
  // Show on every Space / desktop and over fullscreen apps (not just the launch Space).
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
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
    let to = target || { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.85) }
    // Make the drag dramatic & clearly visible: at least ~480px toward the terminal,
    // clamped to the display, dragged slowly (40 steps × 28ms ≈ 1.1s).
    const dx = to.x - from.x
    const dy = to.y - from.y
    const d = Math.hypot(dx, dy) || 1
    const reach = Math.max(480, d)
    to = {
      x: Math.round(Math.max(b.x + 20, Math.min(b.x + b.width - 20, from.x + (dx / d) * reach))),
      y: Math.round(Math.max(b.y + 20, Math.min(b.y + b.height - 20, from.y + (dy / d) * reach))),
    }
    await effects.cursorGrab(from, to, 40, 28)
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
  if (name === 'UserPromptSubmit') {
    lastActivity = 'Thinking…'
    send('activity', lastActivity)
  } else if (name === 'PreToolUse') {
    lastActivity = claude.formatActivity(payload.tool_name, payload.tool_input)
    send('activity', lastActivity)
  }

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

function toggleChaos() {
  settings = settingsStore.deepMerge(settings, { chaos: { enabled: !settings.chaos.enabled } })
  settingsStore.save(settingsFile(), settings)
  applySettings()
}

function toggleCoop() {
  settings = settingsStore.deepMerge(settings, { coop: { enabled: !settings.coop.enabled } })
  settingsStore.save(settingsFile(), settings)
  applySettings()
}

// Drop grain into the trough; the renderer makes the flock rush over to eat.
function feedDucks() {
  send('feed')
}

// Display controls only make sense with more than one monitor.
function displayMenuItems() {
  if (screen.getAllDisplays().length < 2) return []
  return [
    { label: '🖥️ Vịt sang màn hình khác', click: () => moveToOtherDisplay() },
    {
      label: pinnedDisplayId == null ? '✓ Theo con trỏ' : '📍 Theo con trỏ',
      click: () => followCursorDisplay(),
    },
    { type: 'separator' },
  ]
}

// Right-click menu on the pet (same actions as the tray).
function buildContextMenu() {
  return Menu.buildFromTemplate([
    { label: '🦆 DuckClaude', enabled: false },
    { type: 'separator' },
    { label: '🌾 Cho vịt ăn', click: () => feedDucks() },
    { label: settings.coop.enabled ? '✓ Chuồng vịt' : 'Chuồng vịt', click: () => toggleCoop() },
    { type: 'separator' },
    ...displayMenuItems(),
    { label: 'Settings…', click: () => openSettingsWindow() },
    {
      label: 'Chaos',
      submenu: [
        { label: 'Enable chaos', type: 'checkbox', checked: settings.chaos.enabled, click: () => toggleChaos() },
      ],
    },
    { label: 'Open Memes Folder', click: () => dirs && shell.openPath(dirs.memesDir) },
    { label: 'Open Notes Folder', click: () => dirs && shell.openPath(dirs.notesDir) },
    { type: 'separator' },
    { label: 'Quit DuckClaude', click: () => app.quit() },
  )
  return Menu.buildFromTemplate(items)
}

function refreshTray() {
  if (!tray) return
  tray.setContextMenu(buildMenu())
  tray.setTitle(agentState === 'NEEDS_INPUT' ? '🦆❗' : '🦆') // flag when Claude needs you
}

function onState(s) {
  send('state', s)
  if (s !== agentState) {
    agentState = s
    stateSinceMs = Date.now()
  }
  if (s !== lastFeedbackState) {
    notify(s) // notify only on real transitions
    lastFeedbackState = s
  }
  refreshTray() // keep the menu-bar status fresh

  if (s === 'NEEDS_INPUT') {
    if (pinnedDisplayId == null) relocateToDisplay(cursorDisplay()) // hop to your monitor (unless pinned)
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
  ipcMain.handle('duck:feed', () => feedDucks())
  ipcMain.handle('content:openMemes', () => shell.openPath(dirs.memesDir))
  ipcMain.handle('content:openNotes', () => shell.openPath(dirs.notesDir))
  ipcMain.handle('perm:accessibility', () =>
    process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false)
      : true,
  )
  // Hit-test toggle: the renderer reports when the cursor is over the duck so the overlay
  // can stop being click-through and receive a right-click.
  ipcMain.on('hover', (_e, on) => {
    if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!on, { forward: true })
  })
  ipcMain.on('show-menu', () => {
    if (overlay && !overlay.isDestroyed()) buildMenu().popup({ window: overlay })
  })
  // The pet's coop was dragged to a new spot — persist it so it stays put across restarts.
  ipcMain.on('coop-move', (_e, pos) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return
    settings = settingsStore.deepMerge(settings, { coop: { x: Math.round(pos.x), y: Math.round(pos.y) } })
    settingsStore.save(settingsFile(), settings)
    applySettings()
  })
  // Coop dragged off the screen edge → hop the overlay to the adjacent monitor.
  ipcMain.on('coop-cross', (_e, dir) => {
    if (dir === 'left' || dir === 'right') hopOverlay(dir)
  })

  tray = createTray({
    getChaos: () => settings.chaos.enabled,
    getCoop: () => settings.coop.enabled,
    hasMultiDisplay: () => screen.getAllDisplays().length > 1,
    isPinned: () => pinnedDisplayId != null,
    onToggleChaos: () => toggleChaos(),
    onToggleCoop: () => toggleCoop(),
    onFeed: () => feedDucks(),
    onNextDisplay: () => moveToOtherDisplay(),
    onFollowDisplay: () => followCursorDisplay(),
    onSettings: () => openSettingsWindow(),
    onQuit: () => app.quit(),
  })

  // Follow the active monitor while idle (don't yank mid-chase).
  displayFollowTimer = setInterval(() => {
    if (lastFeedbackState === 'NEEDS_INPUT') return
    if (pinnedDisplayId != null) return // user parked the flock on a specific monitor
    const d = cursorDisplay()
    if (d.id !== currentDisplayId) relocateToDisplay(d)
  }, 1500)

  // Keep DuckClaude out of the Dock — it's a menu-bar companion.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
})

app.on('before-quit', () => {
  if (settings.hooksInstalled) uninstallHooks({ url: config.hookUrl() })
  if (listener) listener.close()
  stopCursorStream()
  if (displayFollowTimer) clearInterval(displayFollowTimer)
  giftWindow.closeAll()
})

// The overlay has no close affordance; quitting happens via the tray menu.
app.on('window-all-closed', () => app.quit())
