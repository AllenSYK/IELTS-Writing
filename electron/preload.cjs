const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopLicense', {
  activate: (licenseKey) => ipcRenderer.invoke('license:activate', { licenseKey }),
  getInfo: () => ipcRenderer.invoke('license:getInfo')
})

contextBridge.exposeInMainWorld('desktopAi', {
  evaluateEssay: (payload) => ipcRenderer.invoke('ai:evaluate', payload),
  generatePrompt: (payload) => ipcRenderer.invoke('ai:generatePrompt', payload)
})

contextBridge.exposeInMainWorld('desktopUpdater', {
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getState: () => ipcRenderer.invoke('updater:getState'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  dismissUpdate: () => ipcRenderer.invoke('updater:dismiss'),
  contactDeveloper: () => ipcRenderer.invoke('updater:contactDeveloper'),
  onStatus: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('updater:state', listener)
    return () => ipcRenderer.removeListener('updater:state', listener)
  },
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('updater:progress', listener)
    return () => ipcRenderer.removeListener('updater:progress', listener)
  }
})

contextBridge.exposeInMainWorld('desktopApp', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getDeviceInfo: () => ipcRenderer.invoke('app:getDeviceInfo'),
  clearCache: () => ipcRenderer.invoke('app:clearCache'),
  openUserHome: () => ipcRenderer.invoke('app:openUserHome')
})
