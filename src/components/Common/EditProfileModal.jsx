import React, { useState, useRef, useEffect } from 'react';
import { User, Camera, Upload, Trash2, X, Check, Sparkles, Heart } from 'lucide-react';
import { useProfiles } from '../../context/ProfileContext';

export function EditProfileModal({ isOpen, onClose, profileId }) {
  const { profiles, updateProfileName, updateProfileAvatar, removeProfileAvatar } = useProfiles();
  const targetId = profileId || 'user1';
  const currentProfile = profiles[targetId] || { name: '', avatar: null };

  const [name, setName] = useState(currentProfile.name || '');
  const [previewAvatar, setPreviewAvatar] = useState(currentProfile.avatar || null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAvatarRemoved, setIsAvatarRemoved] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentProfile.name || '');
      setPreviewAvatar(currentProfile.avatar || null);
      setSelectedFile(null);
      setIsAvatarRemoved(false);
    }
  }, [isOpen, currentProfile.name, currentProfile.avatar]);

  if (!isOpen) return null;

  const handleChoosePhoto = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setIsAvatarRemoved(false);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviewAvatar(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPreviewAvatar(null);
    setIsAvatarRemoved(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentProfile.name) {
      await updateProfileName(targetId, trimmed);
    }

    if (isAvatarRemoved) {
      await removeProfileAvatar(targetId);
    } else if (selectedFile) {
      await updateProfileAvatar(targetId, selectedFile);
    }

    onClose();
  };

  const isPink = targetId === 'user2';

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div
        className="modal-dialog profile-edit-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="quality-header">
          <div className="quality-title">
            <Sparkles size={18} color="#f43f8e" />
            <span>Personalizar Perfil</span>
          </div>
          <button className="btn-close-quality" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="profile-edit-form">
          {/* Seção do Avatar com Pré-visualização */}
          <div className="profile-avatar-edit-section">
            <div
              className={`profile-avatar-preview-frame ${isPink ? 'pink-accent' : 'purple-accent'}`}
              onClick={handleChoosePhoto}
              title="Clique para escolher uma imagem"
            >
              {previewAvatar ? (
                <img src={previewAvatar} alt="Prévia" className="profile-avatar-preview-img" />
              ) : (
                <div className="profile-avatar-preview-placeholder">
                  <Heart size={44} color={isPink ? '#f43f8e' : '#a855f7'} />
                </div>
              )}
              <div className="profile-avatar-hover-badge">
                <Camera size={20} />
                <span>Trocar</span>
              </div>
            </div>

            <div className="profile-avatar-btn-group">
              <button
                type="button"
                className="btn-profile-upload-action"
                onClick={handleChoosePhoto}
              >
                <Upload size={14} />
                <span>{previewAvatar ? 'Mudar Foto' : 'Carregar Foto'}</span>
              </button>
              {previewAvatar && (
                <button
                  type="button"
                  className="btn-profile-remove-action"
                  onClick={handleRemovePhoto}
                  title="Remover foto e usar padrão"
                >
                  <Trash2 size={14} />
                  <span>Remover</span>
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* Campo de Nome */}
          <div className="profile-field-group">
            <label className="profile-field-label">
              <span>Seu Apelido / Nome</span>
              <span className="profile-char-count">{name.length}/24</span>
            </label>
            <div className="remote-ip-box">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como quer ser chamado(a)?"
                maxLength={24}
                autoFocus
              />
            </div>
          </div>

          {/* Rodapé com Ações */}
          <div className="screen-picker-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn-picker-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-picker-confirm">
              <Check size={16} />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
