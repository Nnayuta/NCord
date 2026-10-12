import React, { useEffect, useRef } from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';

/**
 * Reprodutor de Áudio Remoto Persistente
 * Garante que a voz do parceiro seja ouvida independentemente do estado da câmera/vídeo.
 */
export function RemoteAudioPlayer() {
  const { remoteStream, isDeafened } = useWebRTC();
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !remoteStream) return;

    el.srcObject = remoteStream;

    const playAudio = () => {
      if (el.paused) {
        el.play().catch((err) => {
          console.warn('[RemoteAudioPlayer] Autoplay aguardando interação do usuário:', err?.message || err);
        });
      }
    };

    playAudio();

    const handleInteract = () => {
      playAudio();
    };

    const aTrack = remoteStream.getAudioTracks()[0];
    if (aTrack) {
      aTrack.addEventListener('unmute', playAudio);
    }

    window.addEventListener('click', handleInteract, { passive: true });
    window.addEventListener('touchstart', handleInteract, { passive: true });

    return () => {
      if (aTrack) {
        aTrack.removeEventListener('unmute', playAudio);
      }
      window.removeEventListener('click', handleInteract);
      window.removeEventListener('touchstart', handleInteract);
    };
  }, [remoteStream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ display: 'none', position: 'absolute', pointerEvents: 'none' }}
    />
  );
}
