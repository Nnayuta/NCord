import React from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VideoGrid } from './VideoGrid';
import { ControlsBar } from '../Controls/ControlsBar';

export function StreamArea({ onOpenMixer, onOpenQuality, onOpenScreenPicker, onOpenAlbum }) {
  const { isTheaterMode, setIsTheaterMode } = useWebRTC();

  return (
    <main className="stream-area">
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

      <VideoGrid onOpenMixer={onOpenMixer} onOpenScreenPicker={onOpenScreenPicker} />

      <ControlsBar
        onOpenMixer={onOpenMixer}
        onOpenQuality={onOpenQuality}
        onOpenScreenPicker={onOpenScreenPicker}
        onOpenAlbum={onOpenAlbum}
      />
    </main>
  );
}
