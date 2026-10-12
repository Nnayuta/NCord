import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PanelLeftOpen,
  PhoneOff,
  Maximize
} from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { toggleFullscreen } from '../../../services/fullscreen';
import { isElectron } from '../../../services/electronBridge';

export function FloatingControlsPill({ onOpenScreenPicker }) {
  const {
    isMicMuted,
    isVideoOff,
    isLocalScreenSharing,
    toggleMic,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    leaveRoom,
    setIsTheaterMode
  } = useWebRTC();

  const handleScreenClick = () => {
    if (isLocalScreenSharing) {
      stopScreenShare();
    } else {
      if (isElectron) {
        if (onOpenScreenPicker) onOpenScreenPicker();
      } else {
        startScreenShare();
      }
    }
  };

  const handleFullscreen = () => {
    toggleFullscreen(document.documentElement);
  };

  return (
    <div className="floating-controls-pill">
      {/* Reabrir Barra Lateral */}
      <button
        type="button"
        className="btn-pill-control"
        onClick={() => setIsTheaterMode(false)}
        title="Mostrar Barra Lateral (Tecla T)"
        aria-label="Mostrar Barra Lateral"
      >
        <PanelLeftOpen size={18} />
      </button>

      {/* Microfone */}
      <button
        type="button"
        className={`btn-pill-control ${isMicMuted ? 'muted' : ''}`}
        onClick={toggleMic}
        title={isMicMuted ? 'Ativar Microfone (Tecla M)' : 'Silenciar Microfone (Tecla M)'}
        aria-label={isMicMuted ? 'Ativar Microfone' : 'Silenciar Microfone'}
      >
        {isMicMuted ? <MicOff size={18} color="#f23f43" /> : <Mic size={18} />}
      </button>

      {/* Câmera */}
      <button
        type="button"
        className={`btn-pill-control ${isVideoOff ? 'muted' : ''}`}
        onClick={toggleVideo}
        title={isVideoOff ? 'Ligar Câmera (Tecla V)' : 'Desligar Câmera (Tecla V)'}
        aria-label={isVideoOff ? 'Ligar Câmera' : 'Desligar Câmera'}
      >
        {isVideoOff ? <VideoOff size={18} color="#f23f43" /> : <Video size={18} />}
      </button>

      {/* Compartilhar Tela */}
      <button
        type="button"
        className={`btn-pill-control ${isLocalScreenSharing ? 'active-share' : ''}`}
        onClick={handleScreenClick}
        title={isLocalScreenSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
        aria-label="Compartilhar Tela"
      >
        <Monitor size={18} />
      </button>

      {/* Tela Cheia */}
      <button
        type="button"
        className="btn-pill-control"
        onClick={handleFullscreen}
        title="Tela Cheia (Atalho: F)"
        aria-label="Tela Cheia"
      >
        <Maximize size={18} />
      </button>

      {/* Desconectar */}
      <button
        type="button"
        className="btn-pill-control btn-pill-leave"
        onClick={leaveRoom}
        title="Desconectar da Chamada"
        aria-label="Desconectar da chamada"
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
