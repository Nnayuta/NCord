import React, { useState, useRef } from 'react';
import { Camera, Settings, Heart, Mic, MicOff, Video, VideoOff, ArrowUpCircle } from 'lucide-react';
import { useProfiles } from '../../../context/ProfileContext';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useServer } from '../../../context/ServerContext';
import { useAutoUpdate } from '../../../context/UpdateContext';
import { EditProfileModal } from '../../Common/EditProfileModal';
import { UpdateBadge } from '../../Common/UpdateBadge';

export function UserFooterBar() {
  const { mode } = useServer();
  const { myProfile, activeProfileId, updateProfileAvatar } = useProfiles();
  const { isMicMuted, toggleMic, isVideoOff, toggleVideo } = useWebRTC();
  const { hasUpdate } = useAutoUpdate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      updateProfileAvatar(activeProfileId, file);
    }
  };

  const isPink = activeProfileId === 'user2';

  return (
    <>
      <UpdateBadge />
      <div className="sidebar-user-footer">
        <div
          className="sidebar-user-info"
          onClick={() => setIsEditModalOpen(true)}
          title="Personalizar meu perfil (Foto e Nome)"
          style={{ cursor: 'pointer' }}
        >
          <div
            className={`sidebar-user-avatar-wrap ${isPink ? 'pink-dot' : 'purple-dot'}`}
            onClick={handleAvatarClick}
            title="Clique para trocar foto"
          >
            {myProfile.avatar ? (
              <img src={myProfile.avatar} className="sidebar-footer-avatar-img" alt="Você" />
            ) : (
              <div className="sidebar-footer-default-avatar">
                <Heart size={16} color={isPink ? '#f43f8e' : '#a855f7'} />
              </div>
            )}
            <span className="sidebar-online-status-dot"></span>
            <div className="sidebar-avatar-hover-icon">
              <Camera size={12} />
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          <div className="sidebar-user-text">
            <span className="sidebar-user-name">{myProfile.name || 'Você'}</span>
            <span className="sidebar-user-sub">
              {mode === 'host' ? 'Anfitrião • Online' : 'Convidado • Online'}
            </span>
          </div>
        </div>

        <div className="sidebar-user-actions">
          <button
            type="button"
            className={`btn-user-footer-action ${isMicMuted ? 'active-off' : ''}`}
            onClick={toggleMic}
            title={isMicMuted ? 'Ativar Microfone (Tecla M)' : 'Silenciar Microfone (Tecla M)'}
          >
            {isMicMuted ? <MicOff size={16} color="#f23f43" /> : <Mic size={16} />}
          </button>
          <button
            type="button"
            className={`btn-user-footer-action ${isVideoOff ? 'active-off' : ''}`}
            onClick={toggleVideo}
            title={isVideoOff ? 'Ligar Câmera (Tecla V)' : 'Desligar Câmera (Tecla V)'}
          >
            {isVideoOff ? <VideoOff size={16} color="#f23f43" /> : <Video size={16} />}
          </button>
          <button
            type="button"
            className={`btn-user-footer-action ${hasUpdate ? 'has-update-indicator' : ''}`}
            onClick={() => setIsEditModalOpen(true)}
            title={hasUpdate ? 'Atualização disponível! Clique para ver configurações' : 'Configurações do Perfil'}
          >
            <Settings size={16} />
            {hasUpdate && <span className="settings-update-dot"></span>}
          </button>
        </div>
      </div>

      {/* Modal de Personalização de Perfil */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profileId={activeProfileId}
      />
    </>
  );
}
