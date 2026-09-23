const { contextBridge, ipcRenderer } = require('electron');

// Expor utilitários seguros para a janela do LoveChat
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
  onProcessAudioSelected: (callback) => {
    ipcRenderer.removeAllListeners('process-audio-selected');
    ipcRenderer.on('process-audio-selected', (_, data) => callback(data));
  },
  onProcessAudioChunk: (callback) => {
    ipcRenderer.removeAllListeners('process-audio-chunk');
    ipcRenderer.on('process-audio-chunk', (_, chunk) => callback(chunk));
  },
  offProcessAudioChunk: () => {
    ipcRenderer.removeAllListeners('process-audio-chunk');
  },
  stopProcessAudio: () => ipcRenderer.invoke('stop-process-audio'),
  
  // Mixer de Áudio da Transmissão (WASAPI Multi-Process)
  getAudioMixerSources: () => ipcRenderer.invoke('get-audio-mixer-sources'),
  startMixerProcessAudio: (pid, includeProcessTree) => ipcRenderer.invoke('start-mixer-process-audio', { pid, includeProcessTree }),
  stopMixerProcessAudio: (pid) => ipcRenderer.invoke('stop-mixer-process-audio', pid),
  onMixerProcessAudioChunk: (callback) => {
    ipcRenderer.removeAllListeners('mixer-process-audio-chunk');
    ipcRenderer.on('mixer-process-audio-chunk', (_, data) => callback(data));
  },
  offMixerProcessAudioChunk: () => {
    ipcRenderer.removeAllListeners('mixer-process-audio-chunk');
  },
  
  // Álbum de Fotos Compartilhado
  selectAlbumFolder: () => ipcRenderer.invoke('select-album-folder'),
  getAlbumFolder: () => ipcRenderer.invoke('get-album-folder'),
  clearAlbumFolder: () => ipcRenderer.invoke('clear-album-folder'),
  
  // Controle de conexão e hospedagem de servidor
  getMyIp: () => ipcRenderer.invoke('get-my-ip'),
  discoverServers: () => ipcRenderer.invoke('discover-servers'),
  connectToServer: (targetIp) => ipcRenderer.invoke('connect-to-server', targetIp),
  hostLocalServer: () => ipcRenderer.invoke('host-local-server'),
  stopLocalServer: () => ipcRenderer.invoke('stop-local-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getSavedSettings: () => ipcRenderer.invoke('get-saved-settings'),
  saveUserProfile: (profileId) => ipcRenderer.invoke('save-user-profile', profileId),
  requestFirewall: () => ipcRenderer.invoke('request-firewall'),
  checkFirewall: () => ipcRenderer.invoke('check-firewall')
});
