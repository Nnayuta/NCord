const { contextBridge, ipcRenderer } = require('electron');

// Expor utilitários seguros para a janela do NCord
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // Controles de janela
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  reload: () => ipcRenderer.send('window-reload'),
  toggleDevTools: () => ipcRenderer.send('window-devtools'),
  
  // Capturador de telas e janelas nativo do Electron
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  selectDesktopSource: (sourceId, withAudio, sourceName) => ipcRenderer.invoke('select-desktop-source', { sourceId, withAudio, sourceName }),
  cancelDesktopSource: () => ipcRenderer.invoke('cancel-desktop-source'),
  onOpenScreenPicker: (callback) => {
    ipcRenderer.on('open-native-screen-picker', () => callback());
  },
  
  // Controle de conexão e hospedagem de servidor
  connectToServer: (targetIp) => ipcRenderer.invoke('connect-to-server', targetIp),
  hostLocalServer: () => ipcRenderer.invoke('host-local-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getSavedSettings: () => ipcRenderer.invoke('get-saved-settings'),
  saveUserProfile: (profileId) => ipcRenderer.invoke('save-user-profile', profileId),
  requestFirewall: () => ipcRenderer.invoke('request-firewall'),
  checkFirewall: () => ipcRenderer.invoke('check-firewall')
});
