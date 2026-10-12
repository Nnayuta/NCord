import React from 'react';
import { Heart, Mic, MicOff, Video, VideoOff, Volume2, Tv, Sparkles } from 'lucide-react';
import { useProfiles } from '../../../context/ProfileContext';
import { useWebRTC } from '../../../context/WebRTCContext';

export function VoiceMembersList({ onOpenSettings }) {
  const { myProfile, otherProfile } = useProfiles();
  const {
    isMicMuted,
    isVideoOff,
    isRemoteMicMuted,
    isRemoteVideoOff,
    isLocalSpeaking,
    isRemoteSpeaking,
    connectionState,
    isLocalScreenSharing,
    isRemoteScreenSharing,
    toggleSpotlight,
    setDualScreenViewMode
  } = useWebRTC();

  const isRemoteOnline = connectionState === 'connected';

  const handleWatchRemote = () => {
    if (isRemoteScreenSharing) {
      setDualScreenViewMode('remote');
    } else {
      toggleSpotlight('remote-camera');
    }
  };

  return (
    <div className="voice-channel-section">
      <div className="voice-channel-header">
        <Volume2 size={15} color="#4ade80" />
        <span className="voice-channel-title">SALA DE VOZ • CANAL PRIVADO</span>
      </div>

      <div className="voice-members-tree">
        {/* Membro Local (Você) */}
        <div
          className={`member-tree-item ${isLocalSpeaking ? 'speaking' : ''}`}
          onClick={() => onOpenSettings && onOpenSettings('profile')}
          title="Clique para personalizar seu perfil"
          style={{ cursor: 'pointer' }}
        >
          <div className="member-avatar-wrapper">
            {myProfile.avatar ? (
              <img src={myProfile.avatar} className="sidebar-avatar-img" alt="Você" />
            ) : (
              <div className="sidebar-default-avatar"><Heart size={14} /></div>
            )}
            <span className={`member-voice-indicator ${isLocalSpeaking ? 'active' : ''}`} />
          </div>

          <span className="member-name-label">{myProfile.name || 'Você'}</span>

          {isLocalScreenSharing && (
            <span className="member-live-badge" title="Você está transmitindo tela">
              <Tv size={11} /> AO VIVO
            </span>
          )}

          <div className="member-status-icons">
            {isMicMuted && <MicOff size={13} className="status-muted" />}
            {isVideoOff && <VideoOff size={13} className="status-muted" />}
          </div>
        </div>

        {/* Membro Remoto (Parceiro) */}
        <div
          className={`member-tree-item ${isRemoteSpeaking ? 'speaking' : ''} ${!isRemoteOnline ? 'offline' : ''}`}
          onClick={handleWatchRemote}
          title={isRemoteScreenSharing ? 'Clique para assistir à transmissão' : 'Clique para focar na câmera do parceiro'}
          style={{ cursor: 'pointer' }}
        >
          <div className="member-avatar-wrapper">
            {otherProfile.avatar ? (
              <img src={otherProfile.avatar} className="sidebar-avatar-img" alt="Parceiro" />
            ) : (
              <div className="sidebar-default-avatar"><Heart size={14} /></div>
            )}
            {isRemoteOnline && (
              <span className={`member-voice-indicator ${isRemoteSpeaking ? 'active' : ''}`} />
            )}
          </div>

          <span className="member-name-label">
            {isRemoteOnline ? (otherProfile.name || 'Parceiro') : 'Aguardando Parceiro...'}
          </span>

          {isRemoteScreenSharing && (
            <button
              type="button"
              className="member-live-badge live-clickable"
              onClick={(e) => {
                e.stopPropagation();
                handleWatchRemote();
              }}
              title="Clique para assistir à transmissão"
            >
              <Tv size={11} /> ASSISTIR
            </button>
          )}

          {isRemoteOnline && (
            <div className="member-status-icons">
              {isRemoteMicMuted && <MicOff size={13} className="status-muted" />}
              {isRemoteVideoOff && <VideoOff size={13} className="status-muted" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
