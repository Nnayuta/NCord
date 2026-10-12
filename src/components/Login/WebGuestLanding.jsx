import React, { useState, useEffect } from 'react';
import {
  Heart,
  Lock,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Camera,
  Edit2,
  Check,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useProfiles } from '../../context/ProfileContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { apiService } from '../../services/apiService';
import { useToast } from '../../hooks/useToast';

export function WebGuestLanding() {
  const { showToast } = useToast();
  const { joinRoom } = useWebRTC();
  const { profiles, activeProfileId, selectActiveProfile, updateProfileName, updateProfileAvatar } = useProfiles();

  const [tokenStatus, setTokenStatus] = useState('checking'); // 'checking' | 'valid' | 'invalid'
  const [inputToken, setInputToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [hostAvatarErr, setHostAvatarErr] = useState(false);
  const [guestAvatarErr, setGuestAvatarErr] = useState(false);

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const targetGuestId = urlParams?.get('profile') === 'user1' ? 'user1' : 'user2';
  const targetHostId = targetGuestId === 'user1' ? 'user2' : 'user1';
  const roomName = urlParams?.get('room') || 'lovechat';

  const hostProfile = profiles?.[targetHostId] || { name: 'Anfitrião', avatar: null };
  const guestProfile = profiles?.[targetGuestId] || { name: 'Convidado', avatar: null };

  // Verificar token inicial
  useEffect(() => {
    async function checkInitialToken() {
      const token = apiService.getRoomToken();
      if (!token) {
        setTokenStatus('invalid');
        return;
      }
      try {
        const isValid = await apiService.verifyToken(token);
        setTokenStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) {
          setErrorMsg('A chave no link expirou ou é inválida.');
        }
      } catch (e) {
        setTokenStatus('valid'); // Fallback tolerante se já estiver dentro
      }
    }
    checkInitialToken();
  }, []);

  // Garantir que no Web Guest o perfil ativo seja o selecionado
  useEffect(() => {
    if (activeProfileId !== targetGuestId) {
      selectActiveProfile(targetGuestId);
    }
  }, [activeProfileId, targetGuestId, selectActiveProfile]);

  const handleValidateKey = async (e) => {
    e.preventDefault();
    const clean = inputToken.trim();
    if (!clean) {
      setErrorMsg('Digite a chave secreta de acesso.');
      return;
    }

    setIsValidating(true);
    setErrorMsg('');

    try {
      const isValid = await apiService.verifyToken(clean);
      if (isValid) {
        apiService.setRoomToken(clean);
        setTokenStatus('valid');
        showToast('Chave de acesso validada com sucesso! 💕', 'success');
      } else {
        setErrorMsg('Chave incorreta ou expirada. Confirme com o anfitrião.');
        showToast('Chave de acesso incorreta.', 'error');
      }
    } catch (err) {
      setErrorMsg('Não foi possível verificar a chave no momento.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleJoinCall = (e) => {
    e.preventDefault();
    joinRoom(roomName);
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      updateProfileName(targetGuestId, tempName.trim());
      showToast('Nome atualizado!', 'success');
    }
    setIsEditingName(false);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      updateProfileAvatar(targetGuestId, file);
      showToast('Foto atualizada! 📸', 'success');
    }
  };

  // 1. Estado de Carregamento Inicial
  if (tokenStatus === 'checking') {
    return (
      <div className="web-guest-card web-guest-loading">
        <div className="web-pulse-heart">
          <Heart size={36} color="#f43f8e" fill="#f43f8e" />
        </div>
        <h3>Conectando ao Cantinho do Amor...</h3>
        <p>Aguarde um instante enquanto preparamos a chamada 💕</p>
      </div>
    );
  }

  // 2. Estado de Bloqueio por Chave / Token
  if (tokenStatus === 'invalid') {
    return (
      <div className="web-guest-card">
        <div className="web-guest-header">
          <div className="web-lock-badge">
            <Lock size={26} color="#f43f8e" />
          </div>
          <h3>Sala Privada & Protegida</h3>
          <p>
            Este espaço é exclusivo. Para entrar, digite a <strong>Chave Secreta</strong> da sala ou abra o link de convite completo.
          </p>
        </div>

        <form onSubmit={handleValidateKey} className="web-token-form">
          <div className="web-token-input-box">
            <KeyRound size={18} color="#f43f8e" />
            <input
              type="text"
              value={inputToken}
              onChange={(e) => {
                setInputToken(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Digite a Chave Secreta..."
              className="web-token-text-input"
              autoFocus
            />
          </div>

          {errorMsg && <div className="web-token-error-banner">{errorMsg}</div>}

          <button
            type="submit"
            className="btn-web-guest-enter"
            disabled={isValidating || !inputToken.trim()}
          >
            {isValidating ? (
              <>
                <RefreshCw size={18} className="spin" />
                <span>Validando...</span>
              </>
            ) : (
              <>
                <span>Desbloquear e Continuar</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="web-guest-security-footnote">
          <ShieldCheck size={14} color="#a855f7" />
          <span>Acesso Criptografado Ponto-a-Ponto</span>
        </div>
      </div>
    );
  }

  // 3. Estado Desbloqueado - Tela de Boas-Vindas e Entrada
  return (
    <div className="web-guest-card web-guest-welcome">
      {/* Banner de Recepção do Anfitrião */}
      <div className="web-host-invite-card">
        <div className="web-host-avatar-ring">
          {hostProfile.avatar && !hostAvatarErr ? (
            <img
              src={hostProfile.avatar}
              alt={hostProfile.name}
              className="web-host-avatar-img"
              onError={() => setHostAvatarErr(true)}
            />
          ) : (
            <div className="web-host-default-avatar">
              <Heart size={20} color="#a855f7" />
            </div>
          )}
          <span className="web-host-live-dot"></span>
        </div>
        <div className="web-host-info">
          <h4>{hostProfile.name || 'Seu Amor'}</h4>
          <span className="web-host-tag">Está te esperando na chamada 💕</span>
        </div>
      </div>

      {/* Cartão do Convidado (Seu Perfil) */}
      <div className="web-guest-profile-card">
        <div className="web-guest-avatar-picker">
          <label htmlFor="web-avatar-input" className="web-guest-avatar-label" title="Clique para trocar foto">
            {guestProfile.avatar && !guestAvatarErr ? (
              <img
                src={guestProfile.avatar}
                alt="Você"
                className="web-guest-avatar-img"
                onError={() => setGuestAvatarErr(true)}
              />
            ) : (
              <div className="web-guest-avatar-placeholder">
                <Heart size={24} color="#f43f8e" />
              </div>
            )}
            <div className="web-guest-avatar-overlay">
              <Camera size={14} color="#fff" />
            </div>
          </label>
          <input
            id="web-avatar-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
        </div>

        <div className="web-guest-name-details">
          <span className="web-guest-label">Entrando como:</span>
          {isEditingName ? (
            <div className="web-name-edit-row">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="web-name-input"
                autoFocus
              />
              <button type="button" className="btn-save-name" onClick={handleSaveName}>
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div className="web-name-display-row">
              <span className="web-guest-display-name">{guestProfile.name || 'Você'}</span>
              <button
                type="button"
                className="btn-edit-name-icon"
                onClick={() => {
                  setTempName(guestProfile.name || '');
                  setIsEditingName(true);
                }}
                title="Mudar meu nome"
              >
                <Edit2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Botão Principal de Entrada */}
      <button type="button" className="btn-web-guest-enter btn-glow-large" onClick={handleJoinCall}>
        <Sparkles size={20} />
        <span>Entrar na Chamada com o Amor 💕</span>
      </button>

      <div className="web-guest-footer-info">
        <ShieldCheck size={13} color="#22c55e" />
        <span>Zero instalação • Áudio e vídeo em alta definição</span>
      </div>
    </div>
  );
}
