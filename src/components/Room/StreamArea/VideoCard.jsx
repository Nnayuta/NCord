import React, { useEffect, useRef } from 'react';
import { Heart, MicOff, VideoOff, Maximize2, Minimize2, Sparkles } from 'lucide-react';
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
  const { spotlightTarget, toggleSpotlight } = useWebRTC();

  const isSpotlight = spotlightTarget === targetId;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideoTrack =
    !isVideoOff && stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  const handleCardClick = (e) => {
    // Se não clicou em um botão de ação interno
    if (!e.target.closest('button')) {
      toggleSpotlight(targetId);
    }
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
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          className="cover"
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
