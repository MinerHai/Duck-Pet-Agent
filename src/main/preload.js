'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('duckBridge', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onGift: (cb) => ipcRenderer.on('gift', (_e, g) => cb(g)),
  onMud: (cb) => ipcRenderer.on('mud', () => cb()),
  onFeed: (cb) => ipcRenderer.on('feed', () => cb()),
  onCoopPlace: (cb) => ipcRenderer.on('coop-place', (_e, edge) => cb(edge)),
  onActivity: (cb) => ipcRenderer.on('activity', (_e, t) => cb(t)),
  reachedCursor: () => ipcRenderer.send('reached-cursor'),
  setHover: (on) => ipcRenderer.send('hover', on),
  showMenu: () => ipcRenderer.send('show-menu'),
  moveCoop: (pos) => ipcRenderer.send('coop-move', pos),
  crossCoop: (dir) => ipcRenderer.send('coop-cross', dir),
})
