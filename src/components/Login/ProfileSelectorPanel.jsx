import React, { useState, useRef } from 'react';
import { RotateCcw, UserCheck, User, Camera, Edit2, Check, Sparkles, ArrowRight, Lock } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useProfiles } from '../../context/ProfileContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { useToast } from '../../hooks/useToast';
import { EditProfileModal } from '../Common/EditProfileModal';

export function ProfileSelectorPanel() {
  const { showToast } = useToast();
  const { connectedServerDesc, resetServerConnection } = useServer();
  const {
    activeProfileId,
    occupiedProfiles,
    profiles,
    selectActiveProfile,
    updateProfileAvatar
  } = useProfiles();
  const { joinRoom } = useWebRTC();

  const [editingProfileId, setEditingProfileId] = useState(null);
  const fileInputRefUser1 = useRef(null);
  const fileInputRefUser2 = useRef(null);

  const isUser1Occupied = Array.isArray(occupiedProfiles) && occupiedProfiles.includes('user1');
  const isUser2Occupied = Array.isArray(occupiedProfiles) && occupiedProfiles.includes('user2');

  const handleSelectUser = (userId) => {
    if (userId === 'user1' && isUser1Occupied) {
      showToast(`${profiles.user1.name || 'Usuário 1'} já está conectado(a) na chamada!`, 'warning');
      return;
    }
    if (userId === 'user2' && isUser2Occupied) {
      showToast(`${profiles.user2.name || 'Usuário 2'} já está conectado(a) na chamada!`, 'warning');
      return;
    }
    selectActiveProfile(userId);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (Array.isArray(occupiedProfiles) && occupiedProfiles.includes(activeProfileId)) {
      showToast('O perfil selecionado já está conectado na chamada. Escolha outro perfil!', 'error');
      return;
    }
    joinRoom('lovechat');
  };

  const handleAvatarClick = (e, userId) => {
    e.stopPropagation();
    if (userId === 'user1' && isUser1Occupied) return;
    if (userId === 'user2' && isUser2Occupied) return;

    if (userId === 'user1' && fileInputRefUser1.current) {
      fileInputRefUser1.current.click();
    } else if (userId === 'user2' && fileInputRefUser2.current) {
      fileInputRefUser2.current.click();
    }
  };

  const handleFileChange = (e, userId) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      updateProfileAvatar(userId, file);
    }
  };

  const handleEditProfile = (e, userId) => {
    e.stopPropagation();
    if (userId === 'user1' && isUser1Occupied) return;
    if (userId === 'user2' && isUser2Occupied) return;
    setEditingProfileId(userId);
  };

  return (
    <div className="login-step-panel">
      {/* Badge de Servidor Conectado */}
      <div className="connected-server-badge">
        <div className="connected-server-info">
          <span className="status-indicator-dot"></span>
          <span>{connectedServerDesc}</span>
        </div>
        <button
          type="button"
          className="btn-change-server"
          onClick={resetServerConnection}
          title="Trocar de Servidor"
        >
          <RotateCcw size={14} />
          <span>Trocar Servidor</span>
        </button>
      </div>

      {/* Seletor de Identidade do Usuário */}
      <div className="user-identity-card">
        <div className="identity-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={18} color="#f43f8e" />
            <span>Quem é você neste PC?</span>
          </div>
          <span className="identity-card-hint">Clique para escolher ou personalizar</span>
        </div>

        <div className="identity-profile-selector">
          {/* Perfil 1 (Roxo) */}
          <div
            className={`profile-choice-btn ${activeProfileId === 'user1' && !isUser1Occupied ? 'active' : ''} ${isUser1Occupied ? 'occupied-profile' : ''}`}
            onClick={() => handleSelectUser('user1')}
          >
            <div
              className="profile-thumb-wrapper"
              onClick={(e) => handleAvatarClick(e, 'user1')}
              title={isUser1Occupied ? 'Perfil já conectado na chamada' : 'Clique para trocar a foto de perfil'}
            >
              {profiles.user1.avatar ? (
                <img src={profiles.user1.avatar} className="profile-choice-avatar" alt="Perfil 1" />
              ) : (
                <div className="profile-choice-icon"><User size={22} /></div>
              )}
              <span className={`profile-badge-dot ${isUser1Occupied ? 'occupied' : 'purple'}`}></span>
              {!isUser1Occupied && (
                <div className="profile-avatar-overlay">
                  <Camera size={16} />
                </div>
              )}
            </div>
            <div className="profile-choice-info">
              <div className="profile-name-row">
                <span className="profile-choice-name">{profiles.user1.name || 'Usuário 1'}</span>
                {!isUser1Occupied ? (
                  <button
                    type="button"
                    className="btn-login-edit-name"
                    onClick={(e) => handleEditProfile(e, 'user1')}
                    title="Personalizar foto e apelido"
                  >
                    <Edit2 size={14} />
                  </button>
                ) : (
                  <span className="profile-occupied-badge">
                    <Lock size={12} />
                    <span>Conectado</span>
                  </span>
                )}
              </div>
              <span className="profile-choice-desc">
                {isUser1Occupied
                  ? '🔒 Em uso na chamada'
                  : activeProfileId === 'user1'
                  ? 'Selecionado ✓'
                  : 'Clique para usar'}
              </span>
            </div>
            {activeProfileId === 'user1' && !isUser1Occupied && <Check size={18} className="profile-check-icon" />}
            <input
              type="file"
              ref={fileInputRefUser1}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 'user1')}
            />
          </div>

          {/* Perfil 2 (Rosa) */}
          <div
            className={`profile-choice-btn ${activeProfileId === 'user2' && !isUser2Occupied ? 'active' : ''} ${isUser2Occupied ? 'occupied-profile' : ''}`}
            onClick={() => handleSelectUser('user2')}
          >
            <div
              className="profile-thumb-wrapper"
              onClick={(e) => handleAvatarClick(e, 'user2')}
              title={isUser2Occupied ? 'Perfil já conectado na chamada' : 'Clique para trocar a foto de perfil'}
            >
              {profiles.user2.avatar ? (
                <img src={profiles.user2.avatar} className="profile-choice-avatar" alt="Perfil 2" />
              ) : (
                <div className="profile-choice-icon"><User size={22} /></div>
              )}
              <span className={`profile-badge-dot ${isUser2Occupied ? 'occupied' : 'pink'}`}></span>
              {!isUser2Occupied && (
                <div className="profile-avatar-overlay">
                  <Camera size={16} />
                </div>
              )}
            </div>
            <div className="profile-choice-info">
              <div className="profile-name-row">
                <span className="profile-choice-name">{profiles.user2.name || 'Usuário 2'}</span>
                {!isUser2Occupied ? (
                  <button
                    type="button"
                    className="btn-login-edit-name"
                    onClick={(e) => handleEditProfile(e, 'user2')}
                    title="Personalizar foto e apelido"
                  >
                    <Edit2 size={14} />
                  </button>
                ) : (
                  <span className="profile-occupied-badge">
                    <Lock size={12} />
                    <span>Conectado</span>
                  </span>
                )}
              </div>
              <span className="profile-choice-desc">
                {isUser2Occupied
                  ? '🔒 Em uso na chamada'
                  : activeProfileId === 'user2'
                  ? 'Selecionado ✓'
                  : 'Clique para usar'}
              </span>
            </div>
            {activeProfileId === 'user2' && !isUser2Occupied && <Check size={18} className="profile-check-icon" />}
            <input
              type="file"
              ref={fileInputRefUser2}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 'user2')}
            />
          </div>
        </div>
      </div>

      <form onSubmit={handleJoin}>
        <button type="submit" className="btn-connect">
          <Sparkles size={18} />
          <span>Entrar no Nosso Espaço</span>
          <ArrowRight size={18} />
        </button>
      </form>

      {/* Modal de Personalização Completa de Perfil */}
      <EditProfileModal
        isOpen={!!editingProfileId}
        onClose={() => setEditingProfileId(null)}
        profileId={editingProfileId}
      />
    </div>
  );
}
