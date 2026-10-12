import React from 'react';
import { PanelLeftClose, Images } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { VoiceMembersList } from './VoiceMembersList';
import { CoupleBoard } from './CoupleBoard';
import { VoiceControlWidget } from './VoiceControlWidget';
import { UserFooterBar } from './UserFooterBar';

export function Sidebar({ onOpenAlbum, onOpenScreenPicker, onOpenSettings }) {
  const { isTheaterMode, setIsTheaterMode } = useWebRTC();

  return (
    <aside className={`sidebar ${isTheaterMode ? 'theater' : ''}`}>
      {/* Cabeçalho da Sidebar */}
      <div className="sidebar-header">
        <h2>Nosso Cantinho 💖</h2>
        <button
          type="button"
          className="btn-sidebar-toggle"
          onClick={() => setIsTheaterMode(true)}
          title="Recolher Barra Lateral (Modo Teatro - Tecla T)"
          aria-label="Recolher barra lateral"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      {/* Conteúdo Rolável da Sidebar */}
      <div className="sidebar-content">
        {/* Árvore de Canais e Membros da Chamada */}
        <VoiceMembersList onOpenSettings={onOpenSettings} />

        {/* Atalho do Álbum de Fotos */}
        <div className="sidebar-section-divider">
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
              <span className="sidebar-album-hint">Fotos & Memórias 📸</span>
            </div>
          </button>
        </div>

        {/* Quadro de Recados do Casal */}
        <CoupleBoard />
      </div>

      {/* Doca de Controle Inferior (Estilo Discord) */}
      <div className="sidebar-bottom-dock">
        {/* Card de Chamada Ativa (Voz Conectada + 4 botões de ação) */}
        <VoiceControlWidget
          onOpenAlbum={onOpenAlbum}
          onOpenScreenPicker={onOpenScreenPicker}
        />

        {/* Barra do Usuário (Avatar + Mic + Ensurdecer + Engrenagem) */}
        <UserFooterBar onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}
