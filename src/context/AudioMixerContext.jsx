import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { electronBridge, isElectron } from '../services/electronBridge';
import { audioWorkletManager } from '../services/audioWorkletManager';
import { useToast } from '../hooks/useToast';

const AudioMixerContext = createContext(null);

export function AudioMixerProvider({ children }) {
  const { showToast } = useToast();
  const [apps, setApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [isAntiEcho, setIsAntiEcho] = useState(true);
  const [activeProcessPids, setActiveProcessPids] = useState(new Set());
  const [appVolumes, setAppVolumes] = useState({}); // pid -> number (0 to 1)

  // Inicializar listeners de chunks PCM do Electron
  useEffect(() => {
    if (!isElectron) return;

    audioWorkletManager.init().catch((e) => console.warn('Falha AudioWorklet init:', e));

    electronBridge.onMixerProcessAudioChunk((data) => {
      const buffer = data?.chunk || data?.data || (data instanceof ArrayBuffer ? data : null) || data;
      if (buffer) {
        audioWorkletManager.feedPCM(buffer);
      }
    });

    electronBridge.onProcessAudioChunk((data) => {
      const buffer = data?.chunk || data?.data || (data instanceof ArrayBuffer ? data : null) || data;
      if (buffer) {
        audioWorkletManager.feedPCM(buffer);
      }
    });

    return () => {
      electronBridge.offMixerProcessAudioChunk();
      electronBridge.offProcessAudioChunk();
    };
  }, []);

  const refreshApps = useCallback(async () => {
    if (!isElectron) {
      // Mock para ambiente web
      setApps([
        { pid: 101, name: 'Spotify.exe', windowTitle: 'Spotify Free', isSelected: false },
        { pid: 102, name: 'Discord.exe', windowTitle: 'Discord', isSelected: false },
        { pid: 103, name: 'chrome.exe', windowTitle: 'YouTube - Google Chrome', isSelected: false }
      ]);
      return;
    }

    setLoadingApps(true);
    try {
      const sources = await electronBridge.getAudioMixerSources();
      const appList = (sources && Array.isArray(sources.apps)) ? sources.apps : (Array.isArray(sources) ? sources : []);
      setApps(appList);
    } catch (err) {
      console.warn('[AudioMixer] Erro ao carregar programas:', err);
    } finally {
      setLoadingApps(false);
    }
  }, []);

  const toggleProcessCapture = useCallback(async (pid, enable) => {
    if (!isElectron) return;
    try {
      if (enable) {
        await electronBridge.startMixerProcessAudio(pid, true);
        setActiveProcessPids((prev) => new Set(prev).add(pid));
        showToast('Áudio do aplicativo ativado na transmissão! 🎵', 'success');
      } else {
        await electronBridge.stopMixerProcessAudio(pid);
        setActiveProcessPids((prev) => {
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
      }
    } catch (err) {
      showToast('Falha ao alternar captura do aplicativo.', 'error');
    }
  }, [showToast]);

  const updateMasterVolume = useCallback((val) => {
    const num = Number(val);
    setMasterVolume(num);
    setIsMasterMuted(num === 0);
    audioWorkletManager.setMasterVolume(num);
  }, []);

  const toggleMasterMute = useCallback(() => {
    if (isMasterMuted) {
      updateMasterVolume(1.0);
    } else {
      updateMasterVolume(0);
    }
  }, [isMasterMuted, updateMasterVolume]);

  return (
    <AudioMixerContext.Provider
      value={{
        apps,
        loadingApps,
        masterVolume,
        isMasterMuted,
        isAntiEcho,
        activeProcessPids,
        appVolumes,
        setIsAntiEcho,
        refreshApps,
        toggleProcessCapture,
        updateMasterVolume,
        toggleMasterMute
      }}
    >
      {children}
    </AudioMixerContext.Provider>
  );
}

export function useAudioMixer() {
  const context = useContext(AudioMixerContext);
  if (!context) {
    throw new Error('useAudioMixer must be used within an AudioMixerProvider');
  }
  return context;
}
