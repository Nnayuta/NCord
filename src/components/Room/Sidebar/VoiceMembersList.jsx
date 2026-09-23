import React, { useState } from 'react';
import { Heart, Mic, MicOff, Video, VideoOff, Edit3, Tv } from 'lucide-react';
import { useProfiles } from '../../../context/ProfileContext';
import { useWebRTC } from '../../../context/WebRTCContext';
import { EditNameModal } from '../../Common/EditNameModal';

export function VoiceMembersList() {
  const { myProfile, otherProfile, activeProfileId, updateProfileName } = useProfiles();
  const {
    isMicMuted,
    isVideoOff,
    isLocalSpeaking,
    isRemoteSpeaking,
    connectionState,
    isScreenSharing,
    screenShareOwner
  } = useWebRTC();

  const [isEditingName, setIsEditingName] = useState(false);

  const isRemoteOnline = connectionState === 'connected';

  return (
    <div className="voice-members-list">
      {/* Membro Local (Você) */}
      <div className="member-item">
        <div className="member-info">
          <div className={`member-avatar-wrapper ${isLocalSpeaking ? 'speaking' : ''}`}>
            {myProfile.avatar ? (
              <img src={myProfile.avatar} className="sidebar-avatar-img" alt="Você" />
            ) : (
              <div className="sidebar-default-avatar"><Heart size={16} /></div>
            )}
          </div>
          <span className="editable-name">{myProfile.name || 'Você'}</span>

          {isScreenSharing && screenShareOwner === 'local' && (
            <span className="member-live-badge">
              <Tv size={12} /> AO VIVO
            </span>
          )}

          <button
            type="button"
            className="btn-edit-name"
            onClick={() => setIsEditingName(true)}
            title="Mudar meu apelido"
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

          {isScreenSharing && screenShareOwner === 'remote' && (
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

      <EditNameModal
        isOpen={isEditingName}
        onClose={() => setIsEditingName(false)}
        currentName={myProfile.name}
        onSave={(name) => updateProfileName(activeProfileId, name)}
      />
    </div>
  );
}
