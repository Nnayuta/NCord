/**
 * Wrapper seguro para a API do Electron exposta via preload.js
 */

export const isElectron = typeof window !== 'undefined' && !!(window.electronAPI && window.electronAPI.isElectron);

export const electronBridge = {
  isElectron,
  platform: isElectron ? (window.electronAPI?.platform || 'web') : 'web',

  // Controles de janela
  minimize: () => {
    try {
      if (isElectron && window.electronAPI?.minimize) window.electronAPI.minimize();
    } catch (e) {
      console.warn('[ElectronBridge] Erro minimize:', e);
    }
  },
  maximize: () => {
    try {
      if (isElectron && window.electronAPI?.maximize) window.electronAPI.maximize();
    } catch (e) {
      console.warn('[ElectronBridge] Erro maximize:', e);
    }
  },
  close: () => {
    try {
      if (isElectron && window.electronAPI?.close) window.electronAPI.close();
    } catch (e) {
      console.warn('[ElectronBridge] Erro close:', e);
    }
  },
  reload: () => {
    try {
      if (isElectron && window.electronAPI?.reload) window.electronAPI.reload();
    } catch (e) {
      console.warn('[ElectronBridge] Erro reload:', e);
    }
  },
  toggleDevTools: () => {
    try {
      if (isElectron && window.electronAPI?.toggleDevTools) window.electronAPI.toggleDevTools();
    } catch (e) {
      console.warn('[ElectronBridge] Erro toggleDevTools:', e);
    }
  },

  // Capturador de telas e janelas nativo do Electron
  getDesktopSources: async () => {
    if (!isElectron || !window.electronAPI?.getDesktopSources) return [];
    try {
      const res = await window.electronAPI.getDesktopSources();
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao obter desktop sources:', e);
      return [];
    }
  },
  selectDesktopSource: async (sourceId, withAudio, sourceName) => {
    if (!isElectron || !window.electronAPI?.selectDesktopSource) return { success: false };
    try {
      return await window.electronAPI.selectDesktopSource(sourceId, withAudio, sourceName);
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao selecionar source:', e);
      return { success: false, error: e.message };
    }
  },
  cancelDesktopSource: async () => {
    if (!isElectron || !window.electronAPI?.cancelDesktopSource) return;
    try {
      await window.electronAPI.cancelDesktopSource();
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao cancelar desktop source:', e);
    }
  },
  onOpenScreenPicker: (callback) => {
    if (!isElectron || !window.electronAPI?.onOpenScreenPicker) return () => {};
    try {
      window.electronAPI.onOpenScreenPicker(callback);
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao registrar onOpenScreenPicker:', e);
    }
  },
  onProcessAudioChunk: (callback) => {
    if (!isElectron || !window.electronAPI?.onProcessAudioChunk) return;
    try {
      window.electronAPI.onProcessAudioChunk(callback);
    } catch (e) {
      console.warn('[ElectronBridge] Falha onProcessAudioChunk:', e);
    }
  },
  offProcessAudioChunk: () => {
    if (!isElectron || !window.electronAPI?.offProcessAudioChunk) return;
    try {
      window.electronAPI.offProcessAudioChunk();
    } catch (e) {
      console.warn('[ElectronBridge] Falha offProcessAudioChunk:', e);
    }
  },
  stopProcessAudio: async () => {
    if (!isElectron || !window.electronAPI?.stopProcessAudio) return;
    try {
      await window.electronAPI.stopProcessAudio();
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao parar áudio de processo:', e);
    }
  },

  // Mixer de Áudio da Transmissão (WASAPI Multi-Process)
  getAudioMixerSources: async () => {
    if (!isElectron || !window.electronAPI?.getAudioMixerSources) return [];
    try {
      const res = await window.electronAPI.getAudioMixerSources();
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.apps)) return res.apps;
      return [];
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao obter fontes do mixer:', e);
      return [];
    }
  },
  startMixerProcessAudio: async (pid, includeProcessTree) => {
    if (!isElectron || !window.electronAPI?.startMixerProcessAudio) return { success: false };
    try {
      return await window.electronAPI.startMixerProcessAudio(pid, includeProcessTree);
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao iniciar mixer áudio:', e);
      return { success: false, error: e.message };
    }
  },
  stopMixerProcessAudio: async (pid) => {
    if (!isElectron || !window.electronAPI?.stopMixerProcessAudio) return;
    try {
      await window.electronAPI.stopMixerProcessAudio(pid);
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao parar mixer áudio:', e);
    }
  },
  onMixerProcessAudioChunk: (callback) => {
    if (!isElectron || !window.electronAPI?.onMixerProcessAudioChunk) return;
    try {
      window.electronAPI.onMixerProcessAudioChunk(callback);
    } catch (e) {
      console.warn('[ElectronBridge] Falha onMixerProcessAudioChunk:', e);
    }
  },
  offMixerProcessAudioChunk: () => {
    if (!isElectron || !window.electronAPI?.offMixerProcessAudioChunk) return;
    try {
      window.electronAPI.offMixerProcessAudioChunk();
    } catch (e) {
      console.warn('[ElectronBridge] Falha offMixerProcessAudioChunk:', e);
    }
  },

  // Álbum de Fotos Compartilhado
  selectAlbumFolder: async () => {
    if (!isElectron || !window.electronAPI?.selectAlbumFolder) return { canceled: true };
    try {
      return await window.electronAPI.selectAlbumFolder();
    } catch (e) {
      console.warn('[ElectronBridge] Falha selectAlbumFolder:', e);
      return { canceled: true, error: e.message };
    }
  },
  getAlbumFolder: async () => {
    if (!isElectron || !window.electronAPI?.getAlbumFolder) return { folderPath: null };
    try {
      return await window.electronAPI.getAlbumFolder();
    } catch (e) {
      console.warn('[ElectronBridge] Falha getAlbumFolder:', e);
      return { folderPath: null };
    }
  },
  clearAlbumFolder: async () => {
    if (!isElectron || !window.electronAPI?.clearAlbumFolder) return { success: true };
    try {
      return await window.electronAPI.clearAlbumFolder();
    } catch (e) {
      console.warn('[ElectronBridge] Falha clearAlbumFolder:', e);
      return { success: false, error: e.message };
    }
  },

  // Controle de conexão e hospedagem de servidor
  getMyIp: async () => {
    if (!isElectron || !window.electronAPI?.getMyIp) return null;
    try {
      return await window.electronAPI.getMyIp();
    } catch (e) {
      console.warn('[ElectronBridge] Falha getMyIp:', e);
      return null;
    }
  },
  discoverServers: async () => {
    if (!isElectron || !window.electronAPI?.discoverServers) return { servers: [] };
    try {
      const res = await window.electronAPI.discoverServers();
      return res || { servers: [] };
    } catch (e) {
      console.warn('[ElectronBridge] Falha discoverServers:', e);
      return { servers: [] };
    }
  },
  connectToServer: async (targetIp) => {
    if (!isElectron || !window.electronAPI?.connectToServer) return { success: true };
    try {
      return await window.electronAPI.connectToServer(targetIp);
    } catch (e) {
      console.warn('[ElectronBridge] Falha connectToServer:', e);
      return { success: false, error: e.message };
    }
  },
  hostLocalServer: async () => {
    if (!isElectron || !window.electronAPI?.hostLocalServer) return { success: true };
    try {
      return await window.electronAPI.hostLocalServer();
    } catch (e) {
      console.warn('[ElectronBridge] Falha hostLocalServer:', e);
      return { success: false, error: e.message };
    }
  },
  stopLocalServer: async () => {
    if (!isElectron || !window.electronAPI?.stopLocalServer) return { success: true };
    try {
      return await window.electronAPI.stopLocalServer();
    } catch (e) {
      console.warn('[ElectronBridge] Falha stopLocalServer:', e);
      return { success: false, error: e.message };
    }
  },
  getServerStatus: async () => {
    if (!isElectron || !window.electronAPI?.getServerStatus) return { isAlive: true, host: '127.0.0.1', port: 3000 };
    try {
      return await window.electronAPI.getServerStatus();
    } catch (e) {
      console.warn('[ElectronBridge] Falha getServerStatus:', e);
      return { isAlive: false, host: '127.0.0.1', port: 3000 };
    }
  },
  getSavedSettings: async () => {
    if (!isElectron || !window.electronAPI?.getSavedSettings) return { targetIp: null, activeProfileId: 'user1' };
    try {
      return await window.electronAPI.getSavedSettings();
    } catch (e) {
      console.warn('[ElectronBridge] Falha getSavedSettings:', e);
      return { targetIp: null, activeProfileId: 'user1' };
    }
  },
  saveUserProfile: async (profileId) => {
    if (!isElectron || !window.electronAPI?.saveUserProfile) return;
    try {
      await window.electronAPI.saveUserProfile(profileId);
    } catch (e) {
      console.warn('[ElectronBridge] Falha saveUserProfile:', e);
    }
  },
  requestFirewall: async () => {
    if (!isElectron || !window.electronAPI?.requestFirewall) return { success: true };
    try {
      return await window.electronAPI.requestFirewall();
    } catch (e) {
      console.warn('[ElectronBridge] Falha requestFirewall:', e);
      return { success: false };
    }
  },
  checkFirewall: async () => {
    if (!isElectron || !window.electronAPI?.checkFirewall) return { applied: true };
    try {
      return await window.electronAPI.checkFirewall();
    } catch (e) {
      console.warn('[ElectronBridge] Falha checkFirewall:', e);
      return { applied: true };
    }
  },

  // Sistema de Auto-Update (GitHub Releases)
  checkForUpdates: async () => {
    if (!isElectron || !window.electronAPI?.checkForUpdates) {
      return { updateAvailable: false, currentVersion: '1.0.0', isWeb: true };
    }
    try {
      return await window.electronAPI.checkForUpdates();
    } catch (e) {
      console.warn('[ElectronBridge] Falha checkForUpdates:', e);
      return { updateAvailable: false, error: e.message };
    }
  },
  downloadUpdate: async (downloadUrl) => {
    if (!isElectron || !window.electronAPI?.downloadUpdate) return { success: false };
    try {
      return await window.electronAPI.downloadUpdate(downloadUrl);
    } catch (e) {
      console.warn('[ElectronBridge] Falha downloadUpdate:', e);
      return { success: false, error: e.message };
    }
  },
  installUpdate: async () => {
    if (!isElectron || !window.electronAPI?.installUpdate) return { success: false };
    try {
      return await window.electronAPI.installUpdate();
    } catch (e) {
      console.warn('[ElectronBridge] Falha installUpdate:', e);
      return { success: false, error: e.message };
    }
  },
  getAppVersion: async () => {
    if (!isElectron || !window.electronAPI?.getAppVersion) return { version: '1.0.0' };
    try {
      return await window.electronAPI.getAppVersion();
    } catch (e) {
      return { version: '1.0.0' };
    }
  },
  openReleasesPage: async () => {
    if (!isElectron || !window.electronAPI?.openReleasesPage) return;
    try {
      await window.electronAPI.openReleasesPage();
    } catch (e) {
      console.warn('[ElectronBridge] Falha openReleasesPage:', e);
    }
  },
  onUpdateAvailable: (callback) => {
    if (!isElectron || !window.electronAPI?.onUpdateAvailable) return;
    try {
      window.electronAPI.onUpdateAvailable(callback);
    } catch (e) {}
  },
  onUpdateProgress: (callback) => {
    if (!isElectron || !window.electronAPI?.onUpdateProgress) return;
    try {
      window.electronAPI.onUpdateProgress(callback);
    } catch (e) {}
  },
  onUpdateDownloaded: (callback) => {
    if (!isElectron || !window.electronAPI?.onUpdateDownloaded) return;
    try {
      window.electronAPI.onUpdateDownloaded(callback);
    } catch (e) {}
  }
};


