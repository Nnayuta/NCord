import React, { useEffect, useRef } from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';

/**
 * Reprodutor de Áudio Remoto Persistente
 * Garante que a voz do parceiro seja ouvida independentemente do estado da câmera/vídeo.
 */
export function RemoteAudioPlayer() {
  const { remoteStream } = useWebRTC();
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.play().catch((err) => {
        console.warn('[RemoteAudioPlayer] Autoplay aguardando interação do usuário:', err);
      });
    }
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
