import React, { useEffect, useRef, useState } from 'react';
import { Heart, MicOff, VideoOff, Maximize2, Minimize2, Sparkles, Scan } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function VideoCard({
  isLocal,
  stream,
  profile,
  isVideoOff,
  isMicMuted,
  isSpeaking,
  targetId
}) {
  const videoRef = useRef(null);
  const { spotlightTarget, toggleSpotlight, cameraFitMode } = useWebRTC();
  const [localFitMode, setLocalFitMode] = useState(null);

  // Modo de ajuste do vídeo: se definido localmente no card, usa o local; caso contrário, usa o global do contexto (padrão 'contain')
  const currentFitMode = localFitMode || cameraFitMode || 'contain';

  const isSpotlight = spotlightTarget === targetId;
  const hasVideoTrack = !isVideoOff && stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, hasVideoTrack, isVideoOff]);

  const handleCardClick = (e) => {
    if (!e.target.closest('button')) {
      toggleSpotlight(targetId);
    }
  };

  const toggleFitMode = (e) => {
    e.stopPropagation();
    setLocalFitMode((prev) => {
      const current = prev || cameraFitMode || 'contain';
      return current === 'contain' ? 'cover' : 'contain';
    });
  };

  const handleFullscreen = (e) => {
    e.stopPropagation();
    const cardEl = e.currentTarget.closest('.video-card');
    if (cardEl) {
      if (!document.fullscreenElement) {
        cardEl.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div
      className={`video-card ${isSpotlight ? 'spotlight-active' : ''}`}
      onClick={handleCardClick}
      onDoubleClick={handleFullscreen}
      title={isSpotlight ? 'Clique para sair do modo destaque (Dois cliques para tela cheia)' : 'Clique para focar nesta câmera (Dois cliques para tela cheia)'}
      style={{ cursor: 'pointer' }}
    >
      {hasVideoTrack ? (
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el && stream && el.srcObject !== stream) {
              el.srcObject = stream;
              el.play().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          muted={true}
          className={currentFitMode}
        />
      ) : (
        <div className="avatar-placeholder">
          {profile.avatar && (
            <img src={profile.avatar} className="avatar-backdrop-img" alt="Backdrop" />
          )}
          <div className={`avatar-frame ${isSpeaking ? 'speaking' : ''} ${isSpotlight ? 'spotlight-frame' : ''}`}>
            {profile.avatar ? (
              <img src={profile.avatar} className="avatar-img" alt="Avatar" />
            ) : (
              <Heart size={44} />
            )}
          </div>
        </div>
      )}

      {/* Badge de Destaque Ativo */}
      {isSpotlight && (
        <div className="spotlight-active-badge">
          <Sparkles size={13} color="#f43f8e" />
          <span>Modo Destaque</span>
        </div>
      )}

      {/* Barra de Ações Rápidas em Hover */}
      <div className="video-card-hover-actions">
        {hasVideoTrack && (
          <button
            type="button"
            className={`btn-card-action ${currentFitMode === 'contain' ? 'active-fit' : ''}`}
            onClick={toggleFitMode}
            title={currentFitMode === 'contain' ? 'Proporção: Sem Cortes (100% visível) - Clique para Preencher Card' : 'Proporção: Preencher Card - Clique para Sem Cortes'}
          >
            <Scan size={16} />
          </button>
        )}
        <button
          type="button"
          className="btn-card-action"
          onClick={(e) => {
            e.stopPropagation();
            toggleSpotlight(targetId);
          }}
          title={isSpotlight ? 'Sair do Destaque' : 'Focar nesta Câmera'}
        >
          {isSpotlight ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          type="button"
          className="btn-card-action"
          onClick={handleFullscreen}
          title="Tela Cheia Nativa (F11)"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Info Overlay Inferior */}
      <div className="video-info-overlay">
        <span>{isLocal ? 'Você' : (profile.name || 'Parceiro')}</span>
        <div className="overlay-icons">
          {isMicMuted && <MicOff size={14} />}
          {isVideoOff && <VideoOff size={14} />}
        </div>
      </div>
    </div>
  );
}
