'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('duckBridge', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onGift: (cb) => ipcRenderer.on('gift', (_e, g) => cb(g)),
  onMud: (cb) => ipcRenderer.on('mud', () => cb()),
})
