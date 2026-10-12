import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services/apiService';
import { electronBridge, isElectron } from '../services/electronBridge';
import { useToast } from '../hooks/useToast';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const { showToast } = useToast();
  const [activeProfileId, setActiveProfileId] = useState('user1');
  const [occupiedProfiles, setOccupiedProfiles] = useState([]);
  const [profiles, setProfiles] = useState({
    user1: { id: 'user1', name: 'Usuário 1', avatar: null },
    user2: { id: 'user2', name: 'Usuário 2', avatar: null }
  });

  const normalizeAvatar = useCallback((avatar) => {
    if (!avatar) return null;
    if (avatar.startsWith('data:') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
      return avatar;
    }
    return apiService.getFullUrl(avatar);
  }, []);

  // Carregar perfis do servidor e perfil ativo salvo
  const fetchProfiles = useCallback(async () => {
    try {
      const db = await apiService.getDb();
      if (db) {
        if (db.profiles) {
          setProfiles((prev) => {
            const nextU1Name = db.profiles.user1?.name || prev.user1.name;
            const nextU1Avatar = normalizeAvatar(db.profiles.user1?.avatar);
            const nextU2Name = db.profiles.user2?.name || prev.user2.name;
            const nextU2Avatar = normalizeAvatar(db.profiles.user2?.avatar);

            const u1Changed = prev.user1.name !== nextU1Name || prev.user1.avatar !== nextU1Avatar;
            const u2Changed = prev.user2.name !== nextU2Name || prev.user2.avatar !== nextU2Avatar;

            if (!u1Changed && !u2Changed) {
              return prev;
            }

            return {
              user1: {
                ...prev.user1,
                ...(db.profiles.user1 || {}),
                name: nextU1Name,
                avatar: nextU1Avatar
              },
              user2: {
                ...prev.user2,
                ...(db.profiles.user2 || {}),
                name: nextU2Name,
                avatar: nextU2Avatar
              }
            };
          });
        }
        if (Array.isArray(db.occupiedProfiles)) {
          setOccupiedProfiles((prev) => {
            if (
              prev.length === db.occupiedProfiles.length &&
              prev.every((val, idx) => val === db.occupiedProfiles[idx])
            ) {
              return prev;
            }
            return db.occupiedProfiles;
          });
        }
      }
    } catch (e) {
      console.warn('[ProfileContext] Falha ao sincronizar perfis:', e);
    }
  }, [normalizeAvatar]);

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
        const urlParams = new URLSearchParams(window.location.search);
        const urlProfile = urlParams.get('profile');
        if (urlProfile && (urlProfile === 'user1' || urlProfile === 'user2')) {
          setActiveProfileId(urlProfile);
        } else {
          const savedId = localStorage.getItem('lovechat_active_profile');
          if (savedId) setActiveProfileId(savedId);
          else setActiveProfileId('user2');
        }
      }
      await fetchProfiles();
    }
    initProfile();
  }, [fetchProfiles]);

  // Sincronização periódica com o servidor (a cada 3s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchProfiles();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchProfiles]);

  const selectActiveProfile = useCallback(async (profileId) => {
    setActiveProfileId(profileId);
    if (isElectron) {
      await electronBridge.saveUserProfile(profileId);
    } else {
      localStorage.setItem('lovechat_active_profile', profileId);
    }
  }, []);

  // Aplicar atualização recebida remotamente do parceiro via WebRTC DataChannel
  const applyRemoteProfileUpdate = useCallback((remoteProf) => {
    if (!remoteProf || !remoteProf.id) return;
    setProfiles((prev) => ({
      ...prev,
      [remoteProf.id]: {
        ...prev[remoteProf.id],
        ...remoteProf
      }
    }));
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

  // Remover foto de perfil (deletar arquivo no servidor)
  const removeProfileAvatar = useCallback(async (profileId) => {
    setProfiles((prev) => ({
      ...prev,
      [profileId]: {
        ...prev[profileId],
        avatar: null
      }
    }));

    try {
      await apiService.deleteAvatar(profileId);
      showToast('Foto de perfil removida com sucesso.', 'info');
    } catch (err) {
      showToast('Erro ao remover foto do servidor.', 'error');
    }
  }, [showToast]);

  // Processar e atualizar avatar (imagem real em disco)
  const updateProfileAvatar = useCallback((profileId, file) => {
    if (!file) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        showToast('Erro ao processar imagem.', 'error');
        reject(err);
      };

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 512;
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

          canvas.toBlob(async (blob) => {
            if (!blob) {
              showToast('Erro ao comprimir imagem.', 'error');
              reject(new Error('Canvas toBlob falhou'));
              return;
            }

            try {
              const res = await apiService.uploadAvatar(profileId, blob);
              const fullAvatarUrl = apiService.getFullUrl(res.avatarUrl);

              setProfiles((prev) => ({
                ...prev,
                [profileId]: {
                  ...prev[profileId],
                  avatar: fullAvatarUrl
                }
              }));

              showToast('Foto de perfil atualizada com sucesso! ✨', 'success');
              resolve(fullAvatarUrl);
            } catch (uploadErr) {
              showToast('Erro ao enviar foto para o servidor.', 'error');
              reject(uploadErr);
            }
          }, 'image/jpeg', 0.85);
        } catch (err) {
          showToast('Erro ao processar imagem.', 'error');
          reject(err);
        }
      };

      img.src = objectUrl;
    });
  }, [showToast]);

  const myProfile = useMemo(() => {
    return profiles[activeProfileId] || {
      id: activeProfileId,
      name: activeProfileId === 'user1' ? 'Usuário 1' : 'Usuário 2',
      avatar: null
    };
  }, [profiles, activeProfileId]);

  const otherProfileId = activeProfileId === 'user1' ? 'user2' : 'user1';
  const otherProfile = useMemo(() => {
    return profiles[otherProfileId] || {
      id: otherProfileId,
      name: otherProfileId === 'user1' ? 'Usuário 1' : 'Usuário 2',
      avatar: null
    };
  }, [profiles, otherProfileId]);

  const contextValue = useMemo(() => ({
    activeProfileId,
    occupiedProfiles,
    profiles,
    myProfile,
    otherProfile,
    otherProfileId,
    selectActiveProfile,
    updateProfileName,
    updateProfileAvatar,
    removeProfileAvatar,
    applyRemoteProfileUpdate,
    fetchProfiles
  }), [
    activeProfileId,
    occupiedProfiles,
    profiles,
    myProfile,
    otherProfile,
    otherProfileId,
    selectActiveProfile,
    updateProfileName,
    updateProfileAvatar,
    removeProfileAvatar,
    applyRemoteProfileUpdate,
    fetchProfiles
  ]);

  return (
    <ProfileContext.Provider value={contextValue}>
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
