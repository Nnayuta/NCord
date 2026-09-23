import React from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function ConnectionStatusBadge() {
  const { connectionState } = useWebRTC();

  const isConnected = connectionState === 'connected';

  return (
    <div className="connection-status-panel">
      <div className="status-badge">
        <span className={`status-circle ${isConnected ? 'connected' : 'waiting'}`}></span>
        <span>{isConnected ? 'Conectado no Amor 💕' : 'Aguardando par...'}</span>
      </div>
    </div>
  );
}
