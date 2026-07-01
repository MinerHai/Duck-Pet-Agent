'use strict'
const { Tray, nativeImage } = require('electron')

function createTray({
  onToggleChaos,
  onToggleCoop,
  onFeed,
  onNextDisplay,
  onFollowDisplay,
  onSettings,
  onQuit,
  getChaos,
  getCoop,
  hasMultiDisplay,
  isPinned,
}) {
  // An empty image keeps the tray icon valid without shipping an asset; the title
  // (🦆) is what the user sees in the menu bar.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🦆')
  tray.setToolTip('DuckClaude')

  function displayItems() {
    if (!hasMultiDisplay || !hasMultiDisplay()) return []
    return [
      {
        label: '🖥️ Vịt sang màn hình khác',
        click: () => {
          if (onNextDisplay) onNextDisplay()
          rebuild()
        },
      },
      {
        label: isPinned && isPinned() ? '📍 Theo con trỏ' : '✓ Theo con trỏ',
        click: () => {
          if (onFollowDisplay) onFollowDisplay()
          rebuild()
        },
      },
      { type: 'separator' },
    ]
  }

  function rebuild() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '🌾 Cho vịt ăn', click: onFeed },
        {
          label: getCoop && getCoop() ? '✓ Chuồng vịt' : 'Chuồng vịt',
          click: () => {
            if (onToggleCoop) onToggleCoop()
            rebuild()
          },
        },
        { type: 'separator' },
        ...displayItems(),
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
