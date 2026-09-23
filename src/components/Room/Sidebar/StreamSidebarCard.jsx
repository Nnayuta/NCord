import React from 'react';
import { Monitor, Play } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function StreamSidebarCard() {
  const {
    isScreenSharing,
    isLocalScreenSharing,
    isRemoteScreenSharing,
    activePreset,
    spotlightTarget,
    setSpotlightTarget,
    setDualScreenViewMode
  } = useWebRTC();

  if (!isScreenSharing) return null;

  const ownerText = (isLocalScreenSharing && isRemoteScreenSharing)
    ? 'Ambos transmitindo'
    : isLocalScreenSharing
    ? 'Você está transmitindo'
    : 'Parceiro transmitindo';

  const handleWatchStream = () => {
    // Se estava em foco numa câmera específica, sai do foco para exibir a transmissão
    if (spotlightTarget) {
      setSpotlightTarget(null);
    }
    if (isRemoteScreenSharing) {
      setDualScreenViewMode('remote');
    } else if (isLocalScreenSharing) {
      setDualScreenViewMode('local');
    }
  };

  return (
    <div className="sidebar-stream-card" onClick={handleWatchStream} style={{ cursor: 'pointer' }}>
      <div className="stream-card-header">
        <span className="live-pill">
          <span className="pulse-dot"></span> AO VIVO
        </span>
        <span className="stream-quality-pill">{activePreset?.badge?.split('•')[0]?.trim() || 'HD'}</span>
      </div>

      <div className="stream-card-body">
        <div className="stream-icon-box">
          <Monitor size={18} />
        </div>
        <div className="stream-card-meta">
          <span className="stream-card-owner">{ownerText}</span>
          <span className="stream-card-hint">Clique para focar na transmissão</span>
        </div>
      </div>

      <button
        type="button"
        className="btn-sidebar-watch"
        onClick={(e) => {
          e.stopPropagation();
          handleWatchStream();
        }}
        title="Assistir Transmissão em Destaque"
      >
        <Play size={14} />
        <span>Assistir Transmissão</span>
      </button>
    </div>
  );
}
