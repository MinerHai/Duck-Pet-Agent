'use strict'
const { Tray, nativeImage } = require('electron')

// Creates the menu-bar item. The menu itself (live agent status + controls) is built and
// refreshed by main via tray.setContextMenu(), so it can reflect the current Claude state.
function createTray() {
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🦆')
  tray.setToolTip('DuckClaude')
  return tray
}

module.exports = { createTray }
