'use strict'
// Spike 0.3 — transparent, click-through overlay that does not steal focus.
const { app, BrowserWindow, screen } = require('electron')

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().bounds
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        '<body style="margin:0;background:transparent">' +
          '<div style="position:absolute;left:200px;top:200px;font-size:80px">DUCK</div></body>',
      ),
  )
})
