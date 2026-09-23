import React from 'react';
import { Monitor, Play } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function StreamSidebarCard() {
  const { isScreenSharing, screenShareOwner, activePreset, setSpotlightId } = useWebRTC();

  if (!isScreenSharing) return null;

  const ownerText = screenShareOwner === 'local' ? 'Você está transmitindo' : 'Parceiro transmitindo';

  return (
    <div className="sidebar-stream-card">
      <div className="stream-card-header">
        <span className="live-pill">
          <span className="pulse-dot"></span> AO VIVO
        </span>
        <span className="stream-quality-pill">{activePreset.badge.split('•')[0].trim()}</span>
      </div>

      <div className="stream-card-body">
        <div className="stream-icon-box">
          <Monitor size={18} />
        </div>
        <div className="stream-card-meta">
          <span className="stream-card-owner">{ownerText}</span>
          <span className="stream-card-hint">Clique para assistir em destaque</span>
        </div>
      </div>

      <button
        type="button"
        className="btn-sidebar-watch"
        onClick={() => setSpotlightId('screen')}
        title="Assistir Transmissão em Destaque"
      >
        <Play size={14} />
        <span>Assistir Transmissão</span>
      </button>
    </div>
  );
}
