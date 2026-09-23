import React, { useState, useRef } from 'react';
import { Heart, Mic, MicOff, Video, VideoOff, Edit3, Tv, Camera } from 'lucide-react';
import { useProfiles } from '../../../context/ProfileContext';
import { useWebRTC } from '../../../context/WebRTCContext';
import { EditProfileModal } from '../../Common/EditProfileModal';

export function VoiceMembersList() {
  const { myProfile, otherProfile, activeProfileId, updateProfileAvatar } = useProfiles();
  const {
    isMicMuted,
    isVideoOff,
    isLocalSpeaking,
    isRemoteSpeaking,
    connectionState,
    isLocalScreenSharing,
    isRemoteScreenSharing
  } = useWebRTC();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const fileInputRef = useRef(null);

  const isRemoteOnline = connectionState === 'connected';

  const handleAvatarClick = () => {
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

  return (
    <div className="voice-members-list">
      {/* Membro Local (Você) */}
      <div className="member-item">
        <div className="member-info">
          <div
            className={`member-avatar-wrapper ${isLocalSpeaking ? 'speaking' : ''} member-avatar-editable`}
            onClick={handleAvatarClick}
            title="Clique para trocar sua foto de perfil"
            style={{ cursor: 'pointer' }}
          >
            {myProfile.avatar ? (
              <img src={myProfile.avatar} className="sidebar-avatar-img" alt="Você" />
            ) : (
              <div className="sidebar-default-avatar"><Heart size={16} /></div>
            )}
            <div className="sidebar-avatar-overlay">
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
          <span className="editable-name" onClick={() => setIsEditingProfile(true)} style={{ cursor: 'pointer' }}>
            {myProfile.name || 'Você'}
          </span>

          {isLocalScreenSharing && (
            <span className="member-live-badge">
              <Tv size={12} /> AO VIVO
            </span>
          )}

          <button
            type="button"
            className="btn-edit-name"
            onClick={() => setIsEditingProfile(true)}
            title="Personalizar meu perfil (Foto e Apelido)"
          >
            <Edit3 size={13} />
          </button>
        </div>

        <div className="member-status-icons">
          <span>{isMicMuted ? <MicOff size={14} className="muted" /> : <Mic size={14} />}</span>
          <span>{isVideoOff ? <VideoOff size={14} className="muted" /> : <Video size={14} />}</span>
        </div>
      </div>

      {/* Membro Remoto (Parceiro) */}
      <div className="member-item">
        <div className="member-info">
          <div className={`member-avatar-wrapper ${isRemoteSpeaking ? 'speaking' : ''}`}>
            {otherProfile.avatar ? (
              <img src={otherProfile.avatar} className="sidebar-avatar-img" alt="Parceiro" />
            ) : (
              <div className="sidebar-default-avatar"><Heart size={16} /></div>
            )}
          </div>
          <span>{isRemoteOnline ? (otherProfile.name || 'Parceiro') : 'Aguardando Parceiro...'}</span>

          {isRemoteScreenSharing && (
            <span className="member-live-badge">
              <Tv size={12} /> AO VIVO
            </span>
          )}
        </div>

        {isRemoteOnline && (
          <div className="member-status-icons">
            <span><Mic size={14} /></span>
            <span><Video size={14} /></span>
          </div>
        )}
      </div>

      {/* Modal de Edição Completa de Perfil */}
      <EditProfileModal
        isOpen={isEditingProfile}
        onClose={() => setIsEditingProfile(false)}
        profileId={activeProfileId}
      />
    </div>
  );
}
