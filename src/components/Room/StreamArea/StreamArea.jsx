import React from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VideoGrid } from './VideoGrid';
import { RemoteAudioPlayer } from './RemoteAudioPlayer';
import { FloatingControlsPill } from '../Controls/FloatingControlsPill';

export function StreamArea({ onOpenScreenPicker, onOpenSettings }) {
  const { isTheaterMode, spotlightTarget } = useWebRTC();

  return (
    <main className={`stream-area ${spotlightTarget ? 'has-spotlight' : ''}`}>
      {/* Reprodutor de áudio de voz do parceiro (independente de câmera) */}
      <RemoteAudioPlayer />

      {/* Grade de Vídeo e Transmissões (Ocupa 100% da tela) */}
      <VideoGrid
        onOpenScreenPicker={onOpenScreenPicker}
        onOpenCamSettings={() => onOpenSettings && onOpenSettings('video')}
      />

      {/* Pílula de Controles Flutuante apenas quando a Barra Lateral estiver recolhida (Modo Teatro ou Mobile) */}
      {isTheaterMode && (
        <FloatingControlsPill onOpenScreenPicker={onOpenScreenPicker} />
      )}
    </main>
  );
}
