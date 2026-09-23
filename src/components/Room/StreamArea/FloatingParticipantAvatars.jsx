import React from 'react';
import { Heart, MicOff, VideoOff, Eye, EyeOff, Minus, Maximize2 } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useProfiles } from '../../../context/ProfileContext';

export function FloatingParticipantAvatars() {
  const {
    localStream,
    remoteStream,
    isMicMuted,
    isVideoOff,
    isRemoteMicMuted,
    isRemoteVideoOff,
    isLocalSpeaking,
    isRemoteSpeaking,
    isFloatingAvatarsMinimized,
    setIsFloatingAvatarsMinimized,
    isFloatingAvatarsHidden,
    setIsFloatingAvatarsHidden,
    toggleSpotlight
  } = useWebRTC();
  const { myProfile, otherProfile } = useProfiles();

  if (isFloatingAvatarsHidden) {
    return (
      <button
        type="button"
        className="btn-floating-pill btn-show-avatars"
        onClick={() => setIsFloatingAvatarsHidden(false)}
        title="Mostrar Câmeras/Avatares dos Participantes"
      >
        <Eye size={14} />
        <span>Ver Câmeras</span>
      </button>
    );
  }

  if (isFloatingAvatarsMinimized) {
    return (
      <div className="floating-avatars-pill">
        <div className="pill-speakers">
          <div
            className="pill-user-dot-wrapper"
            onClick={() => toggleSpotlight('local-camera')}
            style={{ cursor: 'pointer' }}
            title="Focar em você"
          >
            <span className={`pill-dot ${isLocalSpeaking ? 'speaking' : ''}`}></span>
            <span className="pill-username">Você</span>
          </div>
          <span className="pill-divider">•</span>
          <div
            className="pill-user-dot-wrapper"
            onClick={() => toggleSpotlight('remote-camera')}
            style={{ cursor: 'pointer' }}
            title={`Focar em ${otherProfile.name || 'Amor'}`}
          >
            <span className={`pill-dot ${isRemoteSpeaking ? 'speaking' : ''}`}></span>
            <span className="pill-username">{otherProfile.name || 'Amor'}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn-pill-action"
          onClick={() => setIsFloatingAvatarsMinimized(false)}
          title="Expandir Miniaturas"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    );
  }

  const hasLocalVideo = !isVideoOff && localStream && localStream.getVideoTracks().some((t) => t.enabled);
  const hasRemoteVideo = !isRemoteVideoOff && remoteStream && remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <div className="floating-participants-container">
      <div className="floating-participants-header">
        <span className="floating-title">Participantes</span>
        <div className="floating-actions">
          <button
            type="button"
            className="btn-floating-action"
            onClick={() => setIsFloatingAvatarsMinimized(true)}
            title="Minimizar para Pill"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="btn-floating-action"
            onClick={() => setIsFloatingAvatarsHidden(true)}
            title="Ocultar Câmeras (Foco Total na Tela)"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>

      <div className="floating-cards-row">
        {/* Miniatura Local (Você) */}
        <div
          className={`mini-video-card ${isLocalSpeaking ? 'speaking' : ''}`}
          onClick={() => toggleSpotlight('local-camera')}
          title="Clique para focar na sua câmera"
          style={{ cursor: 'pointer' }}
        >
          {hasLocalVideo ? (
            <video
              ref={(el) => {
                if (el && localStream) el.srcObject = localStream;
              }}
              autoPlay
              playsInline
              muted
              className="mini-video-feed"
            />
          ) : (
            <div className="mini-avatar-placeholder">
              {myProfile.avatar ? (
                <img src={myProfile.avatar} className="mini-avatar-img" alt="Você" />
              ) : (
                <Heart size={20} color="#a855f7" />
              )}
            </div>
          )}
          <div className="mini-card-overlay">
            <span className="mini-name">Você</span>
            {isMicMuted && <MicOff size={11} color="#f23f43" />}
          </div>
        </div>

        {/* Miniatura Remota (Parceiro) */}
        <div
          className={`mini-video-card ${isRemoteSpeaking ? 'speaking' : ''}`}
          onClick={() => toggleSpotlight('remote-camera')}
          title={`Clique para focar em ${otherProfile.name || 'Parceiro'}`}
          style={{ cursor: 'pointer' }}
        >
          {hasRemoteVideo ? (
            <video
              ref={(el) => {
                if (el && remoteStream) el.srcObject = remoteStream;
              }}
              autoPlay
              playsInline
              className="mini-video-feed"
            />
          ) : (
            <div className="mini-avatar-placeholder">
              {otherProfile.avatar ? (
                <img src={otherProfile.avatar} className="mini-avatar-img" alt="Parceiro" />
              ) : (
                <Heart size={20} color="#f43f8e" />
              )}
            </div>
          )}
          <div className="mini-card-overlay">
            <span className="mini-name">{otherProfile.name || 'Parceiro'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
