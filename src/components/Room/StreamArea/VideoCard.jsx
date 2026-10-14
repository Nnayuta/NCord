import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  MicOff,
  VideoOff,
  Maximize,
  Maximize2,
  Minimize2,
  Sparkles,
  Scan,
  FlipHorizontal,
  RotateCw,
  Sliders,
  Play
} from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { toggleFullscreen } from '../../../services/fullscreen';

export function VideoCard({
  isLocal,
  stream,
  profile,
  isVideoOff,
  isMicMuted,
  isSpeaking,
  targetId,
  onOpenCamSettings
}) {
  const videoRef = useRef(null);
  const {
    spotlightTarget,
    toggleSpotlight,
    cameraFitMode,
    isCameraMirrored,
    cameraFilter,
    remoteCameraFilter,
    flipCamera,
    toggleCameraMirror
  } = useWebRTC();
  const [localFitMode, setLocalFitMode] = useState(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  const [avatarErr, setAvatarErr] = useState(false);

  useEffect(() => {
    setAvatarErr(false);
  }, [profile?.avatar]);

  const tryPlay = (el) => {
    if (!el) return;
    el.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
  };

  // Modo de ajuste do vídeo: se definido localmente no card, usa o local; caso contrário, usa o global do contexto (padrão 'contain')
  const currentFitMode = localFitMode || cameraFitMode || 'contain';

  const isSpotlight = spotlightTarget === targetId;
  const hasVideoTrack = !isVideoOff && stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => { });
    }
  }, [stream, hasVideoTrack, isVideoOff]);

  // Duplo clique (mouse) ou duplo toque (celular) alterna o foco desta câmera.
  // Implementado manualmente porque o evento 'dblclick' não é confiável em telas de toque.
  const lastTapRef = useRef(0);
  const handleCardClick = (e) => {
    if (e.target.closest('button')) return;
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      toggleSpotlight(targetId);
    } else {
      lastTapRef.current = now;
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
    toggleFullscreen(cardEl);
  };

  const activeFilterClass = isLocal
    ? (cameraFilter ? `cam-filter-${cameraFilter}` : '')
    : (remoteCameraFilter ? `cam-filter-${remoteCameraFilter}` : '');

  return (
    <div
      className={`video-card ${isSpotlight ? 'spotlight-active' : ''}`}
      onClick={handleCardClick}
      title={isSpotlight ? 'Dois cliques para sair do destaque' : 'Dois cliques para focar nesta câmera'}
      style={{ cursor: 'pointer' }}
    >
      {hasVideoTrack ? (
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el && stream && el.srcObject !== stream) {
              el.srcObject = stream;
              tryPlay(el);
            }
          }}
          autoPlay
          playsInline
          muted={true}
          className={`${currentFitMode} ${isLocal && isCameraMirrored ? 'video-mirrored' : ''} ${activeFilterClass}`}
        />
      ) : (
        <div className="avatar-placeholder">
          {profile.avatar && !avatarErr && (
            <img src={profile.avatar} className="avatar-backdrop-img" alt="Backdrop" onError={() => setAvatarErr(true)} />
          )}
          <div className={`avatar-frame ${isSpeaking ? 'speaking' : ''} ${isSpotlight ? 'spotlight-frame' : ''}`}>
            {profile.avatar && !avatarErr ? (
              <img src={profile.avatar} className="avatar-img" alt="Avatar" onError={() => setAvatarErr(true)} />
            ) : (
              <Heart size={44} />
            )}
          </div>
        </div>
      )}

      {/* Autoplay bloqueado pelo navegador (iOS/Android): toque para exibir */}
      {hasVideoTrack && playBlocked && (
        <button
          type="button"
          className="btn-tap-to-play"
          onClick={(e) => {
            e.stopPropagation();
            tryPlay(videoRef.current);
          }}
        >
          <Play size={22} />
          <span>Toque para ver o vídeo</span>
        </button>
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
        {/* Ações específicas da câmera local */}
        {isLocal && (
          <>
            <button
              type="button"
              className={`btn-card-action ${isCameraMirrored ? 'active-fit' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleCameraMirror();
              }}
              title={isCameraMirrored ? 'Desativar espelho' : 'Espelhar minha câmera (Modo Selfie)'}
            >
              <FlipHorizontal size={15} />
            </button>
            <button
              type="button"
              className="btn-card-action"
              onClick={(e) => {
                e.stopPropagation();
                flipCamera();
              }}
              title="Virar Câmera (Frontal / Traseira)"
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              className="btn-card-action"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCamSettings) onOpenCamSettings();
              }}
              title="Configurações de Câmera (Filtros, Qualidade)"
            >
              <Sliders size={15} />
            </button>
          </>
        )}

        {hasVideoTrack && (
          <button
            type="button"
            className={`btn-card-action ${currentFitMode === 'contain' ? 'active-fit' : ''}`}
            onClick={toggleFitMode}
            title={currentFitMode === 'contain' ? 'Proporção: Sem Cortes (100% visível) - Clique para Preencher Card' : 'Proporção: Preencher Card - Clique para Sem Cortes'}
          >
            <Scan size={15} />
          </button>
        )}
        <button
          type="button"
          className="btn-card-action btn-spotlight-toggle"
          onClick={(e) => {
            e.stopPropagation();
            toggleSpotlight(targetId);
          }}
          title={isSpotlight ? 'Sair do Destaque' : 'Focar nesta Câmera'}
        >
          {isSpotlight ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button
          type="button"
          className="btn-card-action"
          onClick={handleFullscreen}
          title="Tela Cheia"
        >
          <Maximize size={15} />
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
