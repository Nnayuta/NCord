import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { StreamControlsOverlay } from './StreamControlsOverlay';

export function ScreenShareCard({
  stream,
  isLocal,
  ownerLabel,
  onOpenScreenPicker,
  cardId = 'screen-share-card'
}) {
  const {
    activePreset,
    screenFitMode,
    screenVolume,
    isScreenMuted,
    isDeafened
  } = useWebRTC();

  const videoRef = useRef(null);
  const [playBlocked, setPlayBlocked] = useState(false);

  const tryPlay = () => {
    const vEl = videoRef.current;
    if (!vEl) return;

    const targetMuted = isLocal ? true : (isScreenMuted || isDeafened);
    vEl.muted = targetMuted;
    vEl.volume = targetMuted ? 0 : screenVolume;

    const promise = vEl.play();
    if (promise && typeof promise.then === 'function') {
      promise
        .then(() => setPlayBlocked(false))
        .catch((err) => {
          console.warn('[ScreenShareCard] Autoplay bloqueado pelo navegador:', err?.message || err);
          setPlayBlocked(true);
        });
    }
  };

  // Desbloqueio global por interação do usuário (clique ou toque em qualquer lugar)
  useEffect(() => {
    const handleGlobalUnlock = () => {
      const vEl = videoRef.current;
      if (vEl && vEl.paused) {
        vEl.play().then(() => setPlayBlocked(false)).catch(() => {});
      }
    };
    window.addEventListener('click', handleGlobalUnlock, { capture: true, passive: true });
    window.addEventListener('touchstart', handleGlobalUnlock, { capture: true, passive: true });
    return () => {
      window.removeEventListener('click', handleGlobalUnlock, { capture: true });
      window.removeEventListener('touchstart', handleGlobalUnlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    const vEl = videoRef.current;
    if (!vEl || !stream) return;

    const currentVTrack = vEl.srcObject?.getVideoTracks()[0];
    const newVTrack = stream.getVideoTracks()[0];

    if (vEl.srcObject !== stream || currentVTrack !== newVTrack) {
      vEl.srcObject = stream;
    }

    tryPlay();

    // Desmutar/iniciar assim que as tracks de vídeo ou áudio receberem os primeiros pacotes RTP
    const vTrack = stream.getVideoTracks()[0];
    const aTrack = stream.getAudioTracks()[0];

    const handleTrackActivity = () => {
      console.log('[ScreenShareCard] Track ativa/desmutada, atualizando playback...');
      tryPlay();
    };

    if (vTrack) vTrack.addEventListener('unmute', handleTrackActivity);
    if (aTrack) aTrack.addEventListener('unmute', handleTrackActivity);

    return () => {
      if (vTrack) vTrack.removeEventListener('unmute', handleTrackActivity);
      if (aTrack) aTrack.removeEventListener('unmute', handleTrackActivity);
    };
  }, [stream, isLocal, isScreenMuted, isDeafened]);

  useEffect(() => {
    const vEl = videoRef.current;
    if (!vEl) return;
    const targetMuted = isLocal ? true : (isScreenMuted || isDeafened);
    vEl.muted = targetMuted;
    vEl.volume = targetMuted ? 0 : screenVolume;
  }, [screenVolume, isScreenMuted, isLocal, isDeafened]);

  if (!stream) return null;

  const targetMuted = isLocal ? true : (isScreenMuted || isDeafened);

  return (
    <div id={cardId} className="video-card screen-card">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={targetMuted}
        onLoadedMetadata={tryPlay}
        className={screenFitMode}
      />

      {/* Botão de desbloqueio para celular/navegadores onde o autoplay com áudio foi bloqueado */}
      {playBlocked && (
        <button
          type="button"
          className="btn-tap-to-play"
          onClick={(e) => {
            e.stopPropagation();
            tryPlay();
          }}
        >
          <Play size={24} />
          <span>Toque para assistir à transmissão com áudio</span>
        </button>
      )}

      {/* Top Bar */}
      <div className="stream-top-bar">
        <div className="stream-live-tag">
          <span className="pulse-dot"></span> AO VIVO
        </div>
        <span className="screen-owner-name">{ownerLabel}</span>
        <span className="screen-quality-badge">{activePreset.badge}</span>
      </div>

      {/* Overlay Controls */}
      <StreamControlsOverlay
        onOpenScreenPicker={onOpenScreenPicker}
        cardElementId={cardId}
        isLocalStream={isLocal}
      />
    </div>
  );
}
