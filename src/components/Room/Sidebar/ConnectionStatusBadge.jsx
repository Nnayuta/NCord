import React from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function ConnectionStatusBadge() {
  const { connectionState } = useWebRTC();

  let text = 'Aguardando par...';
  let dotClass = 'waiting';

  if (connectionState === 'connected') {
    text = 'Conectado no Amor 💕';
    dotClass = 'connected';
  } else if (connectionState === 'connecting') {
    text = 'Conectando ao par...';
    dotClass = 'connecting';
  } else if (connectionState === 'disconnected') {
    text = 'Desconectado';
    dotClass = 'disconnected';
  }

  return (
    <div className="connection-status-panel">
      <div className="status-badge">
        <span className={`status-circle ${dotClass}`}></span>
        <span>{text}</span>
      </div>
    </div>
  );
}
