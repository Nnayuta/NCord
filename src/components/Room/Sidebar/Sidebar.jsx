import React from 'react';
import { PanelLeftClose, Images } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VoiceChannelItem } from './VoiceChannelItem';
import { StreamSidebarCard } from './StreamSidebarCard';
import { VoiceMembersList } from './VoiceMembersList';
import { CoupleBoard } from './CoupleBoard';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { UserFooterBar } from './UserFooterBar';

export function Sidebar({ onOpenAlbum }) {
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
          <div className="section-title">Canais & Recursos</div>
          <VoiceChannelItem />
          <StreamSidebarCard />
          <VoiceMembersList />

          {/* Botão de Acesso Rápido ao Álbum */}
          <button
            type="button"
            className="sidebar-album-btn"
            onClick={onOpenAlbum}
            title="Abrir Álbum de Fotos do Casal"
          >
            <div className="sidebar-album-icon">
              <Images size={16} />
            </div>
            <div className="sidebar-album-text">
              <span className="sidebar-album-title">Álbum de Fotos</span>
              <span className="sidebar-album-hint">Fotos & Avatares 📸</span>
            </div>
          </button>
        </div>

        <CoupleBoard />
      </div>

      <div className="sidebar-footer-container">
        <ConnectionStatusBadge />
        <UserFooterBar />
      </div>
    </aside>
  );
}
