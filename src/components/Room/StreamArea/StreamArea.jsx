import React from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VideoGrid } from './VideoGrid';
import { ControlsBar } from '../Controls/ControlsBar';
import { RemoteAudioPlayer } from './RemoteAudioPlayer';

export function StreamArea({ onOpenMixer, onOpenQuality, onOpenScreenPicker, onOpenAlbum, onOpenCamSettings }) {
  const { isTheaterMode, setIsTheaterMode, spotlightTarget } = useWebRTC();

  return (
    <main className={`stream-area ${spotlightTarget ? 'has-spotlight' : ''}`}>
      {/* Reprodutor de áudio de voz do parceiro (independente de câmera) */}
      <RemoteAudioPlayer />

      {/* Botão flutuante para reabrir a sidebar no Modo Teatro */}
      {isTheaterMode && (
        <button
          type="button"
          className="btn-floating-expand-sidebar"
          onClick={() => setIsTheaterMode(false)}
          title="Expandir Barra Lateral (Tecla T)"
        >
          <PanelLeftOpen size={16} />
          <span>Mostrar Barra Lateral</span>
        </button>
      )}

      <VideoGrid
        onOpenMixer={onOpenMixer}
        onOpenScreenPicker={onOpenScreenPicker}
        onOpenCamSettings={onOpenCamSettings}
      />

      <ControlsBar
        onOpenMixer={onOpenMixer}
        onOpenQuality={onOpenQuality}
        onOpenScreenPicker={onOpenScreenPicker}
        onOpenAlbum={onOpenAlbum}
        onOpenCamSettings={onOpenCamSettings}
      />
    </main>
  );
}
