'use strict'
const { Tray, Menu, nativeImage } = require('electron')

function createTray({ onToggleChaos, onSettings, onQuit, getChaos }) {
  // An empty image keeps the tray icon valid without shipping an asset; the title
  // (🦆) is what the user sees in the menu bar.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🦆')
  tray.setToolTip('DuckClaude')

  function rebuild() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Settings…', click: onSettings },
        {
          label: getChaos() ? '✓ Chaos enabled' : 'Chaos disabled',
          click: () => {
            onToggleChaos()
            rebuild()
          },
        },
        { type: 'separator' },
        { label: 'Quit DuckClaude', click: onQuit },
      ]),
    )
  }
  rebuild()
  return tray
}

module.exports = { createTray }
