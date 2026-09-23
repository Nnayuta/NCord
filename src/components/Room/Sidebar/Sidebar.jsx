import React from 'react';
import { PanelLeftClose } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VoiceChannelItem } from './VoiceChannelItem';
import { StreamSidebarCard } from './StreamSidebarCard';
import { VoiceMembersList } from './VoiceMembersList';
import { CoupleBoard } from './CoupleBoard';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';

export function Sidebar() {
  const { isTheaterMode, setIsTheaterMode } = useWebRTC();

  return (
    <aside className={`sidebar ${isTheaterMode ? 'theater' : ''}`}>
      <div className="sidebar-header">
        <h2>Nosso Cantinho 💖</h2>
        <button
          type="button"
          className="btn-sidebar-toggle"
          onClick={() => setIsTheaterMode(true)}
          title="Recolher Barra Lateral (Modo Teatro - Tecla T)"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="sidebar-content">
        <div className="channel-section">
          <div className="section-title">Canais de Voz</div>
          <VoiceChannelItem />
          <StreamSidebarCard />
          <VoiceMembersList />
        </div>

        <CoupleBoard />
      </div>

      <ConnectionStatusBadge />
    </aside>
  );
}
