/**
 * Wrapper seguro para a API do Electron exposta via preload.js
 */

export const isElectron = typeof window !== 'undefined' && !!(window.electronAPI && window.electronAPI.isElectron);

export const electronBridge = {
  isElectron,
  platform: isElectron ? window.electronAPI.platform : 'web',

  // Controles de janela
  minimize: () => {
    if (isElectron) window.electronAPI.minimize();
  },
  maximize: () => {
    if (isElectron) window.electronAPI.maximize();
  },
  close: () => {
    if (isElectron) window.electronAPI.close();
  },
  reload: () => {
    if (isElectron) window.electronAPI.reload();
  },
  toggleDevTools: () => {
    if (isElectron) window.electronAPI.toggleDevTools();
  },

  // Capturador de telas e janelas nativo do Electron
  getDesktopSources: async () => {
    if (!isElectron) return [];
    try {
      return await window.electronAPI.getDesktopSources();
    } catch (e) {
      console.warn('[ElectronBridge] Falha ao obter desktop sources:', e);
      return [];
    }
  },
  selectDesktopSource: async (sourceId, withAudio, sourceName) => {
    if (!isElectron) return { success: false };
    return await window.electronAPI.selectDesktopSource(sourceId, withAudio, sourceName);
  },
  cancelDesktopSource: async () => {
    if (!isElectron) return;
    await window.electronAPI.cancelDesktopSource();
  },
  onOpenScreenPicker: (callback) => {
    if (!isElectron) return () => {};
    window.electronAPI.onOpenScreenPicker(callback);
  },
  stopProcessAudio: async () => {
    if (isElectron && window.electronAPI.stopProcessAudio) {
      await window.electronAPI.stopProcessAudio();
    }
  },

  // Mixer de Áudio da Transmissão (WASAPI Multi-Process)
  getAudioMixerSources: async () => {
    if (!isElectron || !window.electronAPI.getAudioMixerSources) return [];
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
    if (!isElectron || !window.electronAPI.startMixerProcessAudio) return { success: false };
    return await window.electronAPI.startMixerProcessAudio(pid, includeProcessTree);
  },
  stopMixerProcessAudio: async (pid) => {
    if (!isElectron || !window.electronAPI.stopMixerProcessAudio) return;
    await window.electronAPI.stopMixerProcessAudio(pid);
  },
  onMixerProcessAudioChunk: (callback) => {
    if (!isElectron || !window.electronAPI.onMixerProcessAudioChunk) return;
    window.electronAPI.onMixerProcessAudioChunk(callback);
  },
  offMixerProcessAudioChunk: () => {
    if (!isElectron || !window.electronAPI.offMixerProcessAudioChunk) return;
    window.electronAPI.offMixerProcessAudioChunk();
  },

  // Controle de conexão e hospedagem de servidor
  connectToServer: async (targetIp) => {
    if (!isElectron || !window.electronAPI.connectToServer) return { success: true };
    return await window.electronAPI.connectToServer(targetIp);
  },
  hostLocalServer: async () => {
    if (!isElectron || !window.electronAPI.hostLocalServer) return { success: true };
    return await window.electronAPI.hostLocalServer();
  },
  getServerStatus: async () => {
    if (!isElectron || !window.electronAPI.getServerStatus) return { isAlive: true, host: '127.0.0.1', port: 3000 };
    return await window.electronAPI.getServerStatus();
  },
  getSavedSettings: async () => {
    if (!isElectron || !window.electronAPI.getSavedSettings) return { targetIp: null, activeProfileId: 'user1' };
    return await window.electronAPI.getSavedSettings();
  },
  saveUserProfile: async (profileId) => {
    if (!isElectron || !window.electronAPI.saveUserProfile) return;
    await window.electronAPI.saveUserProfile(profileId);
  },
  requestFirewall: async () => {
    if (!isElectron || !window.electronAPI.requestFirewall) return { success: true };
    return await window.electronAPI.requestFirewall();
  },
  checkFirewall: async () => {
    if (!isElectron || !window.electronAPI.checkFirewall) return { applied: true };
    return await window.electronAPI.checkFirewall();
  }
};
