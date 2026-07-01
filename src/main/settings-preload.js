'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settingsBridge', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (partial) => ipcRenderer.invoke('settings:set', partial),
  feed: () => ipcRenderer.invoke('duck:feed'),
  openMemes: () => ipcRenderer.invoke('content:openMemes'),
  openNotes: () => ipcRenderer.invoke('content:openNotes'),
  accessibilityOk: () => ipcRenderer.invoke('perm:accessibility'),
})
