import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Loader2 } from 'lucide-react';
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
    remoteScreenPreset,
    openQualityModal,
    screenFitMode,
    screenVolume,
    isScreenMuted,
    isDeafened
  } = useWebRTC();

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [videoPlayBlocked, setVideoPlayBlocked] = useState(false);
  const [audioPlayBlocked, setAudioPlayBlocked] = useState(false);
  const [detectedResolution, setDetectedResolution] = useState('');

  const updateDetectedDimensions = useCallback(() => {
    const vEl = videoRef.current;
    if (vEl && vEl.videoWidth && vEl.videoHeight) {
      const h = vEl.videoHeight;
      const tag = h >= 1440 ? '1440P' : h >= 1080 ? '1080P' : h >= 720 ? '720P' : `${h}P`;
      setDetectedResolution(tag);
    }
  }, []);

  // Web Audio API para controle de volume real no mobile web e equalização de clareza
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const highpassRef = useRef(null);
  const highshelfRef = useRef(null);

  const audioMuted = isLocal || isScreenMuted || isDeafened;

  // Configuração do pipeline de áudio de alta fidelidade
  const setupWebAudio = useCallback((audioTrack) => {
    if (typeof window === 'undefined' || !audioTrack || isLocal) return;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtxClass();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch (e) {}
        sourceNodeRef.current = null;
      }

      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain();
      }

      if (!highpassRef.current) {
        // Highpass a 35Hz: remove interferências DC/subgraves que abafam os alto-falantes de celulares
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(35, ctx.currentTime);
        hp.Q.setValueAtTime(0.7, ctx.currentTime);
        highpassRef.current = hp;
      }

      if (!highshelfRef.current) {
        // Highshelf a 4.5kHz (+2.2 dB): traz presença e brilho cristalino (desabafando o som)
        const hs = ctx.createBiquadFilter();
        hs.type = 'highshelf';
        hs.frequency.setValueAtTime(4500, ctx.currentTime);
        hs.gain.setValueAtTime(2.2, ctx.currentTime);
        highshelfRef.current = hs;
      }

      const mediaStream = new MediaStream([audioTrack]);
      const source = ctx.createMediaStreamSource(mediaStream);
      sourceNodeRef.current = source;

      try { source.disconnect(); } catch (e) {}
      try { highpassRef.current.disconnect(); } catch (e) {}
      try { highshelfRef.current.disconnect(); } catch (e) {}
      try { gainNodeRef.current.disconnect(); } catch (e) {}

      source.connect(highpassRef.current);
      highpassRef.current.connect(highshelfRef.current);
      highshelfRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(ctx.destination);
    } catch (err) {
      console.warn('[ScreenShareCard] Web Audio API setup:', err);
    }
  }, [isLocal]);

  const tryPlayVideo = () => {
    const vEl = videoRef.current;
    if (!vEl) return;

    vEl.muted = true;
    vEl.volume = 0;

    const promise = vEl.play();
    if (promise && typeof promise.then === 'function') {
      promise
        .then(() => setVideoPlayBlocked(false))
        .catch((err) => {
          console.warn('[ScreenShareCard] Autoplay de vídeo bloqueado pelo navegador:', err?.message || err);
          setVideoPlayBlocked(true);
        });
    }
  };

  const tryPlayAudio = () => {
    if (isLocal) return;

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    const aEl = audioRef.current;
    if (!aEl) return;

    // Se Web Audio estiver ativo, mantemos o elemento mudo para evitar áudio duplicado/eco
    aEl.muted = gainNodeRef.current ? true : audioMuted;
    try {
      aEl.volume = gainNodeRef.current ? 0 : Math.min(1.0, Math.max(0, audioMuted ? 0 : screenVolume));
    } catch (e) {}

    const promise = aEl.play();
    if (promise && typeof promise.then === 'function') {
      promise
        .then(() => setAudioPlayBlocked(false))
        .catch((err) => {
          if (!audioMuted) {
            console.warn('[ScreenShareCard] Autoplay de áudio bloqueado pelo navegador:', err?.message || err);
            setAudioPlayBlocked(true);
          }
        });
    }
  };

  // Desbloqueio global por interação do usuário (clique ou toque em qualquer lugar)
  useEffect(() => {
    const handleGlobalUnlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      const vEl = videoRef.current;
      if (vEl && vEl.paused) {
        vEl.play().then(() => setVideoPlayBlocked(false)).catch(() => {});
      }

      const aEl = audioRef.current;
      if (aEl && aEl.paused) {
        aEl.play().then(() => setAudioPlayBlocked(false)).catch(() => {});
      }
    };
    window.addEventListener('click', handleGlobalUnlock, { capture: true, passive: true });
    window.addEventListener('touchstart', handleGlobalUnlock, { capture: true, passive: true });
    return () => {
      window.removeEventListener('click', handleGlobalUnlock, { capture: true });
      window.removeEventListener('touchstart', handleGlobalUnlock, { capture: true });
    };
  }, []);

  // Cleanup de nós Web Audio ao desmontar
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch (e) {}
        sourceNodeRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
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

    tryPlayVideo();

    const vTrack = stream.getVideoTracks()[0];
    const handleTrackActivity = () => {
      tryPlayVideo();
    };

    if (vTrack) vTrack.addEventListener('unmute', handleTrackActivity);
    return () => {
      if (vTrack) vTrack.removeEventListener('unmute', handleTrackActivity);
    };
  }, [stream]);

  useEffect(() => {
    const vEl = videoRef.current;
    if (!vEl) return;
    vEl.muted = true;
    vEl.volume = 0;
  }, []);

  useEffect(() => {
    const aEl = audioRef.current;
    if (!stream || isLocal) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      if (aEl && aEl.srcObject) aEl.srcObject = null;
      setAudioPlayBlocked(false);
      return;
    }

    setupWebAudio(audioTrack);

    if (aEl) {
      const existingTrack = aEl.srcObject?.getAudioTracks()[0];
      if (!aEl.srcObject || existingTrack !== audioTrack) {
        aEl.srcObject = new MediaStream([audioTrack]);
      }
      tryPlayAudio();
    }

    const handleAudioActivity = () => {
      setupWebAudio(audioTrack);
      tryPlayAudio();
    };

    audioTrack.addEventListener('unmute', handleAudioActivity);
    return () => {
      audioTrack.removeEventListener('unmute', handleAudioActivity);
    };
  }, [stream, isLocal, setupWebAudio]);

  // Atualização em tempo real de volume / mute (tanto em GainNode quanto elemento HTML)
  useEffect(() => {
    const targetGain = audioMuted ? 0 : screenVolume;
    if (gainNodeRef.current && audioCtxRef.current) {
      try {
        gainNodeRef.current.gain.setValueAtTime(targetGain, audioCtxRef.current.currentTime);
      } catch (e) {}
    }

    const aEl = audioRef.current;
    if (aEl && !isLocal) {
      if (gainNodeRef.current) {
        aEl.muted = true;
      } else {
        aEl.muted = audioMuted;
        try { aEl.volume = Math.min(1.0, Math.max(0, targetGain)); } catch (e) {}
      }
    }

    if (audioMuted) {
      setAudioPlayBlocked(false);
    } else {
      tryPlayAudio();
    }
  }, [screenVolume, audioMuted, isLocal]);

  if (!stream) {
    return (
      <div id={cardId} className="video-card screen-card connecting-screen" style={{ minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', color: 'rgba(255,255,255,0.7)', width: '100%', height: '100%', padding: '40px 20px' }}>
          <Loader2 size={36} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-purple, #a855f7)' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.3px' }}>
            Conectando à transmissão de {ownerLabel}...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div id={cardId} className="video-card screen-card">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          tryPlayVideo();
          updateDetectedDimensions();
        }}
        onResize={updateDetectedDimensions}
        className={screenFitMode}
      />

      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          muted
          style={{ display: 'none', position: 'absolute', pointerEvents: 'none' }}
        />
      )}

      {(videoPlayBlocked || audioPlayBlocked) && (
        <button
          type="button"
          className="btn-tap-to-play"
          onClick={(e) => {
            e.stopPropagation();
            tryPlayVideo();
            tryPlayAudio();
          }}
        >
          <Play size={24} />
          <span>{audioPlayBlocked ? 'Toque para ativar o áudio da transmissão' : 'Toque para assistir à transmissão'}</span>
        </button>
      )}

      {/* Top Bar */}
      <div className="stream-top-bar">
        <div className="stream-live-tag">
          <span className="pulse-dot"></span> AO VIVO
        </div>
        <span className="screen-owner-name">{ownerLabel}</span>
        {isLocal ? (
          <button
            type="button"
            className="screen-quality-badge btn-quality-pill"
            onClick={(e) => {
              e.stopPropagation();
              openQualityModal();
            }}
            title="Alterar Resolução e Taxa de Quadros (FPS) da sua transmissão"
          >
            {activePreset.badge}
          </button>
        ) : (
          <span
            className="screen-quality-badge screen-quality-viewer-badge"
            title={`Transmissão recebida: ${remoteScreenPreset?.label || (detectedResolution ? `${detectedResolution}` : 'Ao Vivo')}`}
          >
            {remoteScreenPreset?.badge || (detectedResolution ? `${detectedResolution} • AO VIVO` : 'HD')}
          </span>
        )}
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
