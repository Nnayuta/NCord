import React from 'react';
import {
  Wifi,
  PhoneOff,
  Video,
  VideoOff,
  Monitor,
  Images,
  Globe,
  Radio,
  Share2
} from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useServer } from '../../../context/ServerContext';
import { isElectron } from '../../../services/electronBridge';

export function VoiceControlWidget({ onOpenAlbum, onOpenScreenPicker }) {
  const {
    connectionState,
    isVideoOff,
    isLocalScreenSharing,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    leaveRoom
  } = useWebRTC();

  const { mode, openWebInviteModal, serverStatus } = useServer();

  const handleScreenShareClick = () => {
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

  const isConnected = connectionState === 'connected';

  return (
    <div className="voice-control-widget">
      {/* Topo: Status de Conexão + Desconectar */}
      <div className="voice-widget-status-bar">
        <div className="voice-status-left">
          <div className={`voice-signal-icon ${isConnected ? 'connected' : 'connecting'}`}>
            <Radio size={16} />
          </div>
          <div className="voice-status-text">
            <span className="voice-status-title">
              {isConnected ? 'Voz conectada' : 'Conectando à sala...'}
            </span>
            <span className="voice-status-sub">
              {mode === 'host' ? '·°✧ Sala Privada (Anfitrião)' : '·°✧ Conectado ao Par'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-voice-disconnect"
          onClick={leaveRoom}
          title="Desconectar da Chamada"
          aria-label="Desconectar da chamada"
        >
          <PhoneOff size={16} />
        </button>
      </div>

      {/* Grade de 4 Ações Rápidas (Estilo Discord) */}
      <div className="voice-actions-grid">
        {/* Câmera */}
        <button
          type="button"
          className={`btn-voice-quick-action ${!isVideoOff ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOff ? 'Ligar Câmera' : 'Desligar Câmera'}
          aria-label="Alternar Câmera"
        >
          {!isVideoOff ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        {/* Compartilhar Tela */}
        <button
          type="button"
          className={`btn-voice-quick-action ${isLocalScreenSharing ? 'active-screen' : ''}`}
          onClick={handleScreenShareClick}
          title={isLocalScreenSharing ? 'Parar Transmissão de Tela' : 'Transmitir Tela ou Janela'}
          aria-label="Compartilhar Tela"
        >
          <Monitor size={18} />
        </button>

        {/* Álbum de Fotos */}
        <button
          type="button"
          className="btn-voice-quick-action"
          onClick={onOpenAlbum}
          title="Álbum de Fotos do Casal 📸"
          aria-label="Abrir Álbum de Fotos"
        >
          <Images size={18} />
        </button>

        {/* Convidar Par via Web (Link & QR Code) */}
        <button
          type="button"
          className="btn-voice-quick-action"
          onClick={openWebInviteModal}
          title="Conectar Par via Web (Link & QR Code 🌐)"
          aria-label="Conectar Par via Web"
        >
          <Globe size={18} />
        </button>
      </div>
    </div>
  );
}
