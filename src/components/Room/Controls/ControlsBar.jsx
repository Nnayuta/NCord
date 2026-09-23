import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  SlidersHorizontal,
  Sparkles,
  Maximize,
  PhoneOff
} from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function ControlsBar({ onOpenMixer, onOpenQuality, onOpenScreenPicker }) {
  const {
    isMicMuted,
    isVideoOff,
    isScreenSharing,
    toggleMic,
    toggleVideo,
    stopScreenShare,
    leaveRoom
  } = useWebRTC();

  const handleScreenClick = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      if (onOpenScreenPicker) onOpenScreenPicker();
    }
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <footer className="controls-panel">
      {/* Microfone */}
      <button
        type="button"
        className={`btn-control ${isMicMuted ? 'muted' : ''}`}
        onClick={toggleMic}
        title={isMicMuted ? 'Ativar Microfone (Atalho: M)' : 'Mutar Microfone (Atalho: M)'}
      >
        {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      {/* Câmera */}
      <button
        type="button"
        className={`btn-control ${isVideoOff ? 'muted' : ''}`}
        onClick={toggleVideo}
        title={isVideoOff ? 'Ativar Câmera (Atalho: V)' : 'Desativar Câmera (Atalho: V)'}
      >
        {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
      </button>

      {/* Compartilhar Tela */}
      <button
        type="button"
        className={`btn-control ${isScreenSharing ? 'active' : ''}`}
        onClick={handleScreenClick}
        title="Compartilhar Tela"
      >
        <Monitor size={20} />
      </button>

      {/* Mixer de Áudio */}
      <button
        type="button"
        className="btn-control"
        onClick={onOpenMixer}
        title="Mixer de Áudio da Transmissão"
      >
        <SlidersHorizontal size={20} />
      </button>

      {/* Ajustes de Qualidade */}
      <button
        type="button"
        className="btn-control"
        onClick={onOpenQuality}
        title="Ajustes de Qualidade (Sem Limites / 4K / 60 FPS)"
      >
        <Sparkles size={20} />
      </button>

      {/* Tela Cheia */}
      <button
        type="button"
        className="btn-control"
        onClick={handleFullscreen}
        title="Tela Cheia (Atalho: F)"
      >
        <Maximize size={20} />
      </button>

      {/* Desconectar */}
      <button
        type="button"
        className="btn-control btn-leave"
        onClick={leaveRoom}
        title="Sair do Nosso Espaço"
      >
        <PhoneOff size={20} />
      </button>
    </footer>
  );
}
