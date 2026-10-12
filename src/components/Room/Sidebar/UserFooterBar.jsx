import React from 'react';
import { Settings, Heart, Mic, MicOff, Headphones } from 'lucide-react';
import { useProfiles } from '../../../context/ProfileContext';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useServer } from '../../../context/ServerContext';
import { useAutoUpdate } from '../../../context/UpdateContext';

export function UserFooterBar({ onOpenSettings }) {
  const { mode } = useServer();
  const { myProfile, activeProfileId } = useProfiles();
  const { isMicMuted, toggleMic, isDeafened, toggleDeafen, isLocalSpeaking } = useWebRTC();
  const { hasUpdate } = useAutoUpdate();

  const isPink = activeProfileId === 'user2';

  return (
    <div className="sidebar-user-footer">
      {/* Informações do Usuário (clicar abre configurações na aba de perfil) */}
      <div
        className="sidebar-user-info"
        onClick={() => onOpenSettings && onOpenSettings('profile')}
        title="Configurações do Perfil"
        style={{ cursor: 'pointer' }}
      >
        <div className={`sidebar-user-avatar-wrap ${isLocalSpeaking ? 'speaking-ring' : ''} ${isPink ? 'pink-dot' : 'purple-dot'}`}>
          {myProfile.avatar ? (
            <img src={myProfile.avatar} className="sidebar-footer-avatar-img" alt="Você" />
          ) : (
            <div className="sidebar-footer-default-avatar">
              <Heart size={16} color={isPink ? '#f43f8e' : '#a855f7'} />
            </div>
          )}
          <span className="sidebar-online-status-dot"></span>
        </div>

        <div className="sidebar-user-text">
          <span className="sidebar-user-name">{myProfile.name || 'Você'}</span>
          <span className="sidebar-user-sub">
            {mode === 'host' ? 'Anfitrião • Online' : 'Convidado • Online'}
          </span>
        </div>
      </div>

      {/* Ações de Áudio e Configurações (Estilo Discord) */}
      <div className="sidebar-user-actions">
        {/* Microfone */}
        <button
          type="button"
          className={`btn-user-footer-action ${isMicMuted ? 'active-off' : ''}`}
          onClick={toggleMic}
          title={isMicMuted ? 'Ativar Microfone (Tecla M)' : 'Silenciar Microfone (Tecla M)'}
          aria-label={isMicMuted ? 'Ativar Microfone' : 'Silenciar Microfone'}
        >
          {isMicMuted ? <MicOff size={18} color="#f23f43" /> : <Mic size={18} />}
        </button>

        {/* Ensurdecer / Deafen */}
        <button
          type="button"
          className={`btn-user-footer-action ${isDeafened ? 'active-off' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? 'Desativar Ensurdecer (Ouvir áudio)' : 'Ensurdecer (Silenciar todo o áudio)'}
          aria-label="Ensurdecer áudio"
        >
          <Headphones size={18} color={isDeafened ? '#f23f43' : 'currentColor'} />
          {isDeafened && <span className="deafen-cross-line"></span>}
        </button>

        {/* Configurações (Engrenagem) */}
        <button
          type="button"
          className={`btn-user-footer-action ${hasUpdate ? 'has-update-indicator' : ''}`}
          onClick={() => onOpenSettings && onOpenSettings('profile')}
          title={hasUpdate ? 'Atualização disponível! Configurações' : 'Configurações'}
          aria-label="Abrir Configurações"
        >
          <Settings size={18} />
          {hasUpdate && <span className="settings-update-dot"></span>}
        </button>
      </div>
    </div>
  );
}
