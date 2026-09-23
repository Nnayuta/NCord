import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { electronBridge, isElectron } from '../services/electronBridge';
import { useToast } from '../hooks/useToast';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const { showToast } = useToast();
  const [activeProfileId, setActiveProfileId] = useState('user1');
  const [profiles, setProfiles] = useState({
    user1: { id: 'user1', name: 'Usuário 1', avatar: null },
    user2: { id: 'user2', name: 'Usuário 2', avatar: null }
  });

  // Carregar perfis do servidor e perfil ativo salvo
  const fetchProfiles = useCallback(async () => {
    try {
      const db = await apiService.getDb();
      if (db && db.profiles) {
        setProfiles((prev) => ({
          user1: { ...prev.user1, ...(db.profiles.user1 || {}) },
          user2: { ...prev.user2, ...(db.profiles.user2 || {}) }
        }));
      }
    } catch (e) {
      console.warn('[ProfileContext] Falha ao sincronizar perfis:', e);
    }
  }, []);

  useEffect(() => {
    async function initProfile() {
      if (isElectron) {
        try {
          const settings = await electronBridge.getSavedSettings();
          if (settings && settings.activeProfileId) {
            setActiveProfileId(settings.activeProfileId);
          }
        } catch (e) {}
      } else {
        const savedId = localStorage.getItem('lovechat_active_profile');
        if (savedId) setActiveProfileId(savedId);
      }
      await fetchProfiles();
    }
    initProfile();
  }, [fetchProfiles]);

  const selectActiveProfile = useCallback(async (profileId) => {
    setActiveProfileId(profileId);
    if (isElectron) {
      await electronBridge.saveUserProfile(profileId);
    } else {
      localStorage.setItem('lovechat_active_profile', profileId);
    }
  }, []);

  // Atualizar nome de um perfil
  const updateProfileName = useCallback(async (profileId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;

    setProfiles((prev) => ({
      ...prev,
      [profileId]: {
        ...prev[profileId],
        name: trimmed
      }
    }));

    try {
      await apiService.updateProfile({
        id: profileId,
        name: trimmed
      });
      showToast(`Nome atualizado para "${trimmed}"! 💕`, 'success');
    } catch (e) {
      showToast('Erro ao sincronizar nome com o servidor.', 'error');
    }
  }, [showToast]);

  // Processar e atualizar avatar (imagem base64 redimensionada)
  const updateProfileAvatar = useCallback(async (profileId, file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawBase64 = e.target.result;
      
      // Redimensionar para tamanho otimizado (max 256x256)
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.85);

        setProfiles((prev) => ({
          ...prev,
          [profileId]: {
            ...prev[profileId],
            avatar: optimizedBase64
          }
        }));

        try {
          await apiService.updateProfile({
            id: profileId,
            avatar: optimizedBase64
          });
          showToast('Foto de perfil atualizada com sucesso! ✨', 'success');
        } catch (err) {
          showToast('Erro ao sincronizar foto com o servidor.', 'error');
        }
      };
      img.src = rawBase64;
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  const myProfile = profiles[activeProfileId] || {
    id: activeProfileId,
    name: activeProfileId === 'user1' ? 'Usuário 1' : 'Usuário 2',
    avatar: null
  };

  const otherProfileId = activeProfileId === 'user1' ? 'user2' : 'user1';
  const otherProfile = profiles[otherProfileId] || {
    id: otherProfileId,
    name: otherProfileId === 'user1' ? 'Usuário 1' : 'Usuário 2',
    avatar: null
  };

  return (
    <ProfileContext.Provider
      value={{
        activeProfileId,
        profiles,
        myProfile,
        otherProfile,
        otherProfileId,
        selectActiveProfile,
        updateProfileName,
        updateProfileAvatar,
        fetchProfiles
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfiles must be used within a ProfileProvider');
  }
  return context;
}
