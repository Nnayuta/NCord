import React, { useState, useRef } from 'react';
import { RotateCcw, UserCheck, User, Camera, Edit2, Check, Sparkles, ArrowRight } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useProfiles } from '../../context/ProfileContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { EditNameModal } from '../Common/EditNameModal';

export function ProfileSelectorPanel() {
  const { connectedServerDesc, resetServerConnection } = useServer();
  const {
    activeProfileId,
    profiles,
    selectActiveProfile,
    updateProfileName,
    updateProfileAvatar
  } = useProfiles();
  const { joinRoom } = useWebRTC();

  const [editingUserId, setEditingUserId] = useState(null);
  const fileInputRefUser1 = useRef(null);
  const fileInputRefUser2 = useRef(null);

  const handleJoin = (e) => {
    e.preventDefault();
    joinRoom('lovechat');
  };

  const handleAvatarClick = (e, userId) => {
    e.stopPropagation();
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

  const handleEditName = (e, userId) => {
    e.stopPropagation();
    setEditingUserId(userId);
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
          <span className="identity-card-hint">Clique para escolher ou trocar foto</span>
        </div>

        <div className="identity-profile-selector">
          {/* Perfil 1 (Roxo) */}
          <div
            className={`profile-choice-btn ${activeProfileId === 'user1' ? 'active' : ''}`}
            onClick={() => selectActiveProfile('user1')}
          >
            <div
              className="profile-thumb-wrapper"
              onClick={(e) => handleAvatarClick(e, 'user1')}
              title="Clique para trocar a foto de perfil"
            >
              {profiles.user1.avatar ? (
                <img src={profiles.user1.avatar} className="profile-choice-avatar" alt="Perfil 1" />
              ) : (
                <div className="profile-choice-icon"><User size={22} /></div>
              )}
              <span className="profile-badge-dot purple"></span>
              <div className="profile-avatar-overlay">
                <Camera size={16} />
              </div>
            </div>
            <div className="profile-choice-info">
              <div className="profile-name-row">
                <span className="profile-choice-name">{profiles.user1.name || 'Usuário 1'}</span>
                <button
                  type="button"
                  className="btn-login-edit-name"
                  onClick={(e) => handleEditName(e, 'user1')}
                  title="Editar nome"
                >
                  <Edit2 size={14} />
                </button>
              </div>
              <span className="profile-choice-desc">
                {activeProfileId === 'user1' ? 'Selecionado ✓' : 'Clique para usar'}
              </span>
            </div>
            {activeProfileId === 'user1' && <Check size={18} className="profile-check-icon" />}
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
            className={`profile-choice-btn ${activeProfileId === 'user2' ? 'active' : ''}`}
            onClick={() => selectActiveProfile('user2')}
          >
            <div
              className="profile-thumb-wrapper"
              onClick={(e) => handleAvatarClick(e, 'user2')}
              title="Clique para trocar a foto de perfil"
            >
              {profiles.user2.avatar ? (
                <img src={profiles.user2.avatar} className="profile-choice-avatar" alt="Perfil 2" />
              ) : (
                <div className="profile-choice-icon"><User size={22} /></div>
              )}
              <span className="profile-badge-dot pink"></span>
              <div className="profile-avatar-overlay">
                <Camera size={16} />
              </div>
            </div>
            <div className="profile-choice-info">
              <div className="profile-name-row">
                <span className="profile-choice-name">{profiles.user2.name || 'Usuário 2'}</span>
                <button
                  type="button"
                  className="btn-login-edit-name"
                  onClick={(e) => handleEditName(e, 'user2')}
                  title="Editar nome"
                >
                  <Edit2 size={14} />
                </button>
              </div>
              <span className="profile-choice-desc">
                {activeProfileId === 'user2' ? 'Selecionado ✓' : 'Clique para usar'}
              </span>
            </div>
            {activeProfileId === 'user2' && <Check size={18} className="profile-check-icon" />}
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

      {/* Modal de Edição de Nome */}
      <EditNameModal
        isOpen={!!editingUserId}
        onClose={() => setEditingUserId(null)}
        currentName={editingUserId ? profiles[editingUserId].name : ''}
        onSave={(newName) => updateProfileName(editingUserId, newName)}
      />
    </div>
  );
}
