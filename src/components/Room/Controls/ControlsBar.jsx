import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Camera,
  Monitor,
  Images,
  SlidersHorizontal,
  Sparkles,
  Maximize,
  PhoneOff,
  Globe,
  MoreHorizontal,
  X
} from 'lucide-react';
import { toggleFullscreen } from '../../../services/fullscreen';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useServer } from '../../../context/ServerContext';
import { isElectron } from '../../../services/electronBridge';

export function ControlsBar({ onOpenMixer, onOpenQuality, onOpenScreenPicker, onOpenAlbum, onOpenCamSettings }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = () => setMoreOpen(false);
  // Fecha o menu 'Mais' depois de acionar uma ação secundária
  const act = (fn) => () => {
    setMoreOpen(false);
    if (fn) fn();
  };
  const { openWebInviteModal } = useServer();
  const {
    isMicMuted,
    isVideoOff,
    isLocalScreenSharing,
    toggleMic,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    leaveRoom
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
    <footer className={`controls-panel ${moreOpen ? 'more-open' : ''}`}>
      {moreOpen && <div className="controls-more-backdrop" onClick={closeMore} />}
      <div className="controls-track">
        {/* Ações primárias (sempre visíveis) */}
        {/* Microfone */}
        <button
          type="button"
          className={`btn-control ${isMicMuted ? 'muted' : ''}`}
          onClick={toggleMic}
          title={isMicMuted ? 'Ativar Microfone (Atalho: M)' : 'Mutar Microfone (Atalho: M)'}
          aria-label={isMicMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
        >
          {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Câmera */}
        <button
          type="button"
          className={`btn-control ${isVideoOff ? 'muted' : ''}`}
          onClick={toggleVideo}
          title={isVideoOff ? 'Ativar Câmera (Atalho: V)' : 'Desativar Câmera (Atalho: V)'}
          aria-label={isVideoOff ? 'Ativar Câmera' : 'Desativar Câmera'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        {/* Compartilhar Tela */}
        <button
          type="button"
          className={`btn-control ${isLocalScreenSharing ? 'active' : ''}`}
          onClick={handleScreenClick}
          title={isLocalScreenSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
          aria-label="Compartilhar Tela"
        >
          <Monitor size={20} />
        </button>

        {/* Botão 'Mais' (apenas mobile) */}
        <button
          type="button"
          className={`btn-control btn-more-toggle ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          title="Mais opções"
          aria-label="Mais opções"
          aria-expanded={moreOpen}
        >
          {moreOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
        </button>

        {/* Ações secundárias: inline no desktop, bottom sheet no mobile */}
        <div className="controls-secondary">
        {/* Configurações de Câmera */}
        <button
          type="button"
          className="btn-control btn-cam-settings"
          onClick={act(onOpenCamSettings)}
          title="Configurações de Câmera (Trocar câmera, filtros, espelho 📷)"
          aria-label="Configurações de Câmera"
        >
          <Camera size={20} />
          <span className="btn-control-label">Câmera</span>
        </button>

        {/* Álbum de Fotos */}
        <button
          type="button"
          className="btn-control"
          onClick={act(onOpenAlbum)}
          title="Álbum de Fotos do Casal 📸"
          aria-label="Álbum de Fotos"
        >
          <Images size={20} />
          <span className="btn-control-label">Álbum</span>
        </button>

        {/* Conectar Par via Web (Apenas no Electron) */}
        {isElectron && (
          <button
            type="button"
            className="btn-control"
            onClick={act(openWebInviteModal)}
            title="Conectar Par via Web (Link & QR Code 🌐)"
            aria-label="Conectar Par via Web"
          >
            <Globe size={20} />
            <span className="btn-control-label">Convidar</span>
          </button>
        )}

        {/* Mixer de Áudio */}
        <button
          type="button"
          className="btn-control"
          onClick={act(onOpenMixer)}
          title="Mixer de Áudio da Transmissão"
          aria-label="Mixer de Áudio"
        >
          <SlidersHorizontal size={20} />
          <span className="btn-control-label">Mixer</span>
        </button>

        {/* Ajustes de Qualidade */}
        <button
          type="button"
          className="btn-control"
          onClick={act(onOpenQuality)}
          title="Ajustes de Qualidade (Sem Limites / 4K / 60 FPS)"
          aria-label="Ajustes de Qualidade"
        >
          <Sparkles size={20} />
          <span className="btn-control-label">Qualidade</span>
        </button>

        {/* Tela Cheia */}
        <button
          type="button"
          className="btn-control btn-fullscreen-toggle"
          onClick={act(handleFullscreen)}
          title="Tela Cheia (Atalho: F)"
          aria-label="Tela Cheia"
        >
          <Maximize size={20} />
          <span className="btn-control-label">Tela cheia</span>
        </button>
        </div>

        {/* Desconectar Chamada */}
        <button
          type="button"
          className="btn-control btn-leave"
          onClick={leaveRoom}
          title="Sair do Nosso Espaço"
          aria-label="Desconectar da chamada"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </footer>
  );
}
