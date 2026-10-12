import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { electronBridge, isElectron } from '../services/electronBridge';
import { audioWorkletManager } from '../services/audioWorkletManager';

const AudioMixerContext = createContext(null);

export function AudioMixerProvider({ children }) {
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState(false);

  // Inicializar listeners de chunks PCM do Electron (captura de processo ou tela cheia)
  useEffect(() => {
    if (!isElectron) return;

    audioWorkletManager.init().catch((e) => console.warn('[AudioStream] Falha ao inicializar AudioWorklet:', e));

    electronBridge.onProcessAudioChunk((data) => {
      const buffer = data?.chunk || data?.data || (data instanceof ArrayBuffer ? data : null) || data;
      if (buffer) {
        audioWorkletManager.feedPCM(buffer, data?.id ?? 'main');
      }
    });

    return () => {
      if (typeof electronBridge.offProcessAudioChunk === 'function') {
        electronBridge.offProcessAudioChunk();
      }
    };
  }, []);

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
        masterVolume,
        isMasterMuted,
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
    return {
      masterVolume: 1.0,
      isMasterMuted: false,
      updateMasterVolume: () => {},
      toggleMasterMute: () => {}
    };
  }
  return context;
}

