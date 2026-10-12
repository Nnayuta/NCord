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
  const audioRef = useRef(null);
  const [playBlocked, setPlayBlocked] = useState(false);

  const tryPlay = () => {
    const vEl = videoRef.current;
    const aEl = audioRef.current;

    if (vEl) {
      const promise = vEl.play();
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => setPlayBlocked(false))
          .catch((err) => {
            console.warn('[ScreenShareCard] Autoplay de vídeo bloqueado ou aguardando ativação:', err?.message || err);
            setPlayBlocked(true);
          });
      }
    }

    if (aEl && !isLocal) {
      aEl.volume = isScreenMuted ? 0 : screenVolume;
      const aPromise = aEl.play();
      if (aPromise && typeof aPromise.then === 'function') {
        aPromise.catch((err) => {
          console.warn('[ScreenShareCard] Autoplay de áudio aguardando ativação:', err?.message || err);
        });
      }
    }
  };

  useEffect(() => {
    const vEl = videoRef.current;
    const aEl = audioRef.current;

    if (vEl && stream && vEl.srcObject !== stream) {
      vEl.srcObject = stream;
    }
    if (aEl && stream && !isLocal && aEl.srcObject !== stream) {
      aEl.srcObject = stream;
    }

    tryPlay();

    // Desmutar/iniciar assim que as tracks de vídeo ou áudio receberem os primeiros frames RTP
    const vTrack = stream?.getVideoTracks()[0];
    const aTrack = stream?.getAudioTracks()[0];

    const handleUnmute = () => {
      console.log('[ScreenShareCard] Track recebida/desmutada, atualizando playback...');
      tryPlay();
    };

    if (vTrack) vTrack.addEventListener('unmute', handleUnmute);
    if (aTrack) aTrack.addEventListener('unmute', handleUnmute);

    return () => {
      if (vTrack) vTrack.removeEventListener('unmute', handleUnmute);
      if (aTrack) aTrack.removeEventListener('unmute', handleUnmute);
    };
  }, [stream, isLocal]);

  useEffect(() => {
    const targetVol = (isLocal || isScreenMuted || isDeafened) ? 0 : screenVolume;
    if (videoRef.current) {
      videoRef.current.volume = targetVol;
    }
    if (audioRef.current) {
      audioRef.current.volume = targetVol;
    }
  }, [screenVolume, isScreenMuted, isLocal, isDeafened]);

  if (!stream) return null;

  return (
    <div id={cardId} className="video-card screen-card">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        onLoadedMetadata={tryPlay}
        className={screenFitMode}
      />

      {/* Botão de desbloqueio para celular/navegadores onde o autoplay foi bloqueado */}
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
          <span>Toque para assistir à transmissão</span>
        </button>
      )}

      {/* Áudio dedicado da transmissão remota */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
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
