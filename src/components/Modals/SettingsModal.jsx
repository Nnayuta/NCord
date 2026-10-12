import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  Video,
  Sparkles,
  Wifi,
  ArrowUpCircle,
  X,
  Camera,
  Trash2,
  Check,
  RotateCw,
  RefreshCw,
  Sun,
  Heart,
  Flame,
  Film,
  Moon,
  Globe,
  Copy,
  ShieldCheck,
  Zap,
  Clapperboard,
  Gamepad2,
  Sliders
} from 'lucide-react';
import { useProfiles } from '../../context/ProfileContext';
import { useWebRTC, CAMERA_FILTERS, CAMERA_RESOLUTIONS } from '../../context/WebRTCContext';
import { useServer } from '../../context/ServerContext';
import { useAutoUpdate } from '../../context/UpdateContext';
import { QUALITY_PRESETS } from '../../services/webrtcEngine';
import { QRCodeCanvas } from '../Common/QRCodeCanvas';
import { useToast } from '../../hooks/useToast';
import { isElectron } from '../../services/electronBridge';

const FILTER_ICONS = {
  'none': Sun,
  'soft-glow': Heart,
  'warm-cozy': Flame,
  'cinema': Film,
  'vintage': Sparkles,
  'noir': Moon
};

export function SettingsModal({ isOpen, onClose, initialTab = 'profile' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { showToast } = useToast();

  // Perfis
  const { profiles, activeProfileId, updateProfileName, updateProfileAvatar, removeProfileAvatar } = useProfiles();
  const currentProfile = profiles[activeProfileId] || { name: '', avatar: null };
  const [name, setName] = useState(currentProfile.name || '');
  const [previewAvatar, setPreviewAvatar] = useState(currentProfile.avatar || null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAvatarRemoved, setIsAvatarRemoved] = useState(false);
  const fileInputRef = useRef(null);

  // WebRTC / Câmera
  const {
    availableCameras,
    selectedCameraId,
    cameraFacingMode,
    isCameraMirrored,
    cameraFilter,
    cameraResolution,
    isVideoOff,
    localStream,
    switchCamera,
    flipCamera,
    toggleCameraMirror,
    setCameraFilter,
    setCameraResolution,
    refreshCameraDevices,
    getCameraStream,
    activePreset,
    changeQualityPreset
  } = useWebRTC();

  const previewVideoRef = useRef(null);
  const [previewStream, setPreviewStream] = useState(null);
  const [isRefreshingCams, setIsRefreshingCams] = useState(false);

  // Servidor & Rede
  const {
    myIp,
    lanIp,
    isFirewallApplied,
    webTunnelInfo,
    startWebTunnelAction,
    stopWebTunnelAction,
    regenerateTokenAction
  } = useServer();

  // Atualizações
  const { currentVersion, status: updateStatus, updateInfo, checkUpdates, startDownload } = useAutoUpdate();
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(currentProfile.name || '');
      setPreviewAvatar(currentProfile.avatar || null);
      setSelectedFile(null);
      setIsAvatarRemoved(false);
      setActiveTab(initialTab || 'profile');
    }
  }, [isOpen, currentProfile.name, currentProfile.avatar, initialTab]);

  // Gerenciamento da Prévia da Câmera na aba 'video'
  useEffect(() => {
    let active = true;
    let tempStream = null;

    if (!isOpen || activeTab !== 'video') {
      if (previewStream) {
        previewStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
        setPreviewStream(null);
      }
      return;
    }

    if (!isVideoOff && localStream) {
      if (previewVideoRef.current && previewVideoRef.current.srcObject !== localStream) {
        previewVideoRef.current.srcObject = localStream;
        previewVideoRef.current.play().catch(() => {});
      }
    } else {
      const startTempPreview = async () => {
        try {
          const stream = await getCameraStream(selectedCameraId, cameraFacingMode, cameraResolution);
          if (!active) {
            stream.getTracks().forEach((t) => {
              try { t.stop(); } catch (e) {}
            });
            return;
          }
          tempStream = stream;
          setPreviewStream(stream);
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
            previewVideoRef.current.play().catch(() => {});
          }
        } catch (err) {
          console.warn('[SettingsModal] Erro ao carregar prévia de câmera:', err);
        }
      };
      startTempPreview();
    }

    return () => {
      active = false;
      if (tempStream) {
        tempStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
    };
  }, [isOpen, activeTab, isVideoOff, localStream, selectedCameraId, cameraFacingMode, cameraResolution, getCameraStream]);

  if (!isOpen) return null;

  // Handlers de Avatar
  const handleChoosePhoto = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setIsAvatarRemoved(false);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviewAvatar(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPreviewAvatar(null);
    setIsAvatarRemoved(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentProfile.name) {
      await updateProfileName(activeProfileId, trimmed);
    }
    if (isAvatarRemoved) {
      await removeProfileAvatar(activeProfileId);
    } else if (selectedFile) {
      await updateProfileAvatar(activeProfileId, selectedFile);
    }
    showToast('Perfil atualizado com sucesso! 💕', 'success');
    onClose();
  };

  const handleRefreshCameras = async () => {
    setIsRefreshingCams(true);
    await refreshCameraDevices();
    setTimeout(() => setIsRefreshingCams(false), 500);
  };

  const presetsList = [
    { key: 'ultra', icon: Zap, ...QUALITY_PRESETS.ultra },
    { key: 'cinema', icon: Clapperboard, ...QUALITY_PRESETS.cinema },
    { key: 'gamer', icon: Gamepad2, ...QUALITY_PRESETS.gamer },
    { key: 'balanced', icon: Sliders, ...QUALITY_PRESETS.balanced }
  ];

  const magicLink = webTunnelInfo?.url
    ? `${webTunnelInfo.url}/?room=lovechat&role=guest&profile=user2${webTunnelInfo.token ? `&token=${encodeURIComponent(webTunnelInfo.token)}` : ''}`
    : `http://${lanIp || 'localhost'}:3000/?room=lovechat&role=guest&profile=user2`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(magicLink);
    setCopiedLink(true);
    showToast('Link Mágico copiado! 💕', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="modal-overlay-backdrop settings-modal-backdrop" onClick={onClose}>
      <div className="modal-dialog settings-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Barra Lateral de Navegação (Estilo Discord) */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <span className="settings-app-tag">CONFIGURAÇÕES</span>
          </div>

          <nav className="settings-nav">
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={18} />
              <span>Meu Perfil</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <Video size={18} />
              <span>Voz & Vídeo</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'quality' ? 'active' : ''}`}
              onClick={() => setActiveTab('quality')}
            >
              <Sparkles size={18} />
              <span>Transmissão</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'network' ? 'active' : ''}`}
              onClick={() => setActiveTab('network')}
            >
              <Wifi size={18} />
              <span>Conexão & Rede</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              <ArrowUpCircle size={18} />
              <span>Atualizações</span>
            </button>
          </nav>
        </aside>

        {/* Painel de Conteúdo */}
        <main className="settings-content-pane">
          <div className="settings-content-header">
            <div className="settings-tab-title">
              {activeTab === 'profile' && <h2>Meu Perfil</h2>}
              {activeTab === 'video' && <h2>Configurações de Câmera & Filtros</h2>}
              {activeTab === 'quality' && <h2>Qualidade de Transmissão</h2>}
              {activeTab === 'network' && <h2>Rede, Firewall & Convites</h2>}
              {activeTab === 'about' && <h2>Sobre o LoveChat & Atualizações</h2>}
            </div>

            <button
              type="button"
              className="btn-close-settings"
              onClick={onClose}
              title="Fechar (ESC)"
            >
              <X size={20} />
            </button>
          </div>

          <div className="settings-content-body">
            {/* ABA 1: MEU PERFIL */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="settings-profile-form">
                <div className="profile-avatar-edit-section">
                  <div
                    className="profile-avatar-preview-frame"
                    onClick={handleChoosePhoto}
                    title="Clique para escolher imagem"
                  >
                    {previewAvatar ? (
                      <img src={previewAvatar} alt="Prévia" className="profile-avatar-preview-img" />
                    ) : (
                      <div className="profile-avatar-preview-placeholder">
                        <Heart size={36} color="#f43f8e" />
                      </div>
                    )}
                    <div className="profile-avatar-badge-cam">
                      <Camera size={14} />
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  <div className="profile-avatar-actions">
                    <button
                      type="button"
                      className="btn-choose-photo"
                      onClick={handleChoosePhoto}
                    >
                      <Camera size={15} />
                      <span>Trocar Foto</span>
                    </button>
                    {previewAvatar && (
                      <button
                        type="button"
                        className="btn-remove-photo"
                        onClick={handleRemovePhoto}
                        title="Remover foto"
                      >
                        <Trash2 size={15} />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-form-group">
                  <label className="settings-label">Como o seu amor te chama:</label>
                  <input
                    type="text"
                    className="settings-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu apelido carinhoso..."
                    maxLength={32}
                    required
                  />
                  <small className="settings-hint">Esse nome aparecerá nas chamadas e no chat.</small>
                </div>

                <div className="settings-footer-actions">
                  <button type="button" className="btn-picker-cancel" onClick={onClose}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-picker-confirm">
                    Salvar Alterações
                  </button>
                </div>
              </form>
            )}

            {/* ABA 2: VOZ & VÍDEO (CÂMERA, FILTROS, ESPELHO) */}
            {activeTab === 'video' && (
              <div className="settings-video-section">
                {/* Prévia ao vivo da Câmera */}
                <div className="cam-preview-container">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    className={`cam-preview-video ${isCameraMirrored ? 'video-mirrored' : ''} ${cameraFilter ? `cam-filter-${cameraFilter}` : ''}`}
                  />
                  <div className="cam-preview-overlay">
                    <span className="cam-preview-tag">PRÉ-VISUALIZAÇÃO AO VIVO</span>
                    <button
                      type="button"
                      className="cam-preview-btn-mirror"
                      onClick={toggleCameraMirror}
                      title={isCameraMirrored ? 'Espelhamento ativado' : 'Espelhamento desativado'}
                    >
                      {isCameraMirrored ? '🪞 Espelho: Ligado' : '👁️ Espelho: Desligado'}
                    </button>
                  </div>
                </div>

                {/* Seleção de Webcam */}
                <div className="settings-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="settings-label">Câmera Selecionada:</label>
                    <button
                      type="button"
                      className="btn-refresh-cams"
                      onClick={handleRefreshCameras}
                      disabled={isRefreshingCams}
                    >
                      <RotateCw size={12} className={isRefreshingCams ? 'spin' : ''} />
                      <span>{isRefreshingCams ? 'Buscando...' : 'Atualizar Dispositivos'}</span>
                    </button>
                  </div>
                  <select
                    className="settings-select"
                    value={selectedCameraId}
                    onChange={(e) => switchCamera(e.target.value)}
                  >
                    {availableCameras.length === 0 ? (
                      <option value="">Câmera padrão do sistema</option>
                    ) : (
                      availableCameras.map((cam, idx) => (
                        <option key={cam.deviceId || idx} value={cam.deviceId}>
                          {cam.label || `Câmera ${idx + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Resolução */}
                <div className="settings-form-group">
                  <label className="settings-label">Resolução de Captura da Webcam:</label>
                  <div className="cam-resolutions-grid">
                    {Object.entries(CAMERA_RESOLUTIONS).map(([resKey, resObj]) => {
                      const isSel = cameraResolution === resKey;
                      return (
                        <button
                          key={resKey}
                          type="button"
                          className={`cam-res-card ${isSel ? 'selected' : ''}`}
                          onClick={() => setCameraResolution(resKey)}
                        >
                          <span className="cam-res-label">{resObj.label}</span>
                          <span className="cam-res-desc">{resObj.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Filtros de Câmera */}
                <div className="settings-form-group">
                  <label className="settings-label">Filtro Romântico & Estético:</label>
                  <div className="cam-filters-grid">
                    {CAMERA_FILTERS.map((f) => {
                      const isSelected = cameraFilter === f.id;
                      const IconComp = FILTER_ICONS[f.id] || Sun;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={`cam-filter-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setCameraFilter(f.id)}
                        >
                          <div className="cam-filter-icon-box">
                            <IconComp size={18} />
                          </div>
                          <span className="cam-filter-name">{f.label}</span>
                          {isSelected && <Check size={14} className="filter-check-badge" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: QUALIDADE DE TRANSMISSÃO */}
            {activeTab === 'quality' && (
              <div className="settings-quality-section">
                <p className="settings-hint" style={{ marginBottom: '14px' }}>
                  Ajusta dinamicamente a taxa de bits (bitrate), FPS e resolução para a sua conexão LAN ou ZeroTier sem limites:
                </p>
                <div className="quality-options-list">
                  {presetsList.map((p) => {
                    const Icon = p.icon;
                    const isActive = activePreset.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`quality-option ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          changeQualityPreset(p.key);
                          showToast(`Qualidade: ${p.label} ativada! 🚀`, 'success');
                        }}
                      >
                        <div className="quality-opt-icon">
                          <Icon size={20} />
                        </div>
                        <div className="quality-opt-info">
                          <div className="quality-opt-title">
                            {p.label}
                            {isActive && <span className="badge-recom">Ativo</span>}
                          </div>
                          <div className="quality-opt-desc">{p.description}</div>
                        </div>
                        {isActive && <Check size={18} className="profile-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ABA 4: REDE & CONEXÃO */}
            {activeTab === 'network' && (
              <div className="settings-network-section">
                <div className="network-info-card">
                  <div className="network-info-row">
                    <span>IP da Rede Local (LAN):</span>
                    <strong>{lanIp || '127.0.0.1'}</strong>
                  </div>
                  <div className="network-info-row">
                    <span>IP ZeroTier / VPN:</span>
                    <strong>{myIp || 'Não detectado'}</strong>
                  </div>
                  <div className="network-info-row">
                    <span>Status do Firewall:</span>
                    <span style={{ color: isFirewallApplied ? '#4ade80' : '#f59e0b' }}>
                      {isFirewallApplied ? '✅ Regras aplicadas' : '⚠️ Pendente'}
                    </span>
                  </div>
                </div>

                {/* Link Mágico de Convite */}
                <div className="web-invite-box">
                  <div className="web-invite-title">
                    <Globe size={18} color="#f43f8e" />
                    <span>Convidar o Par via Navegador Web</span>
                  </div>
                  <p className="settings-hint">
                    Envie este link para seu par conectar pelo celular ou computador sem instalar aplicativo:
                  </p>
                  <div className="web-invite-input-row">
                    <input
                      type="text"
                      className="settings-input"
                      readOnly
                      value={magicLink}
                    />
                    <button
                      type="button"
                      className="btn-copy-link"
                      onClick={handleCopyLink}
                    >
                      {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '12px', display: 'inline-block' }}>
                      <QRCodeCanvas text={magicLink} size={130} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 5: ATUALIZAÇÕES */}
            {activeTab === 'about' && (
              <div className="settings-about-section">
                <div className="about-brand-box">
                  <div className="about-logo-heart">
                    <Heart size={32} color="#f43f8e" />
                  </div>
                  <h3>LoveChat Desktop</h3>
                  <span className="about-version-tag">Versão atual: v{currentVersion}</span>
                </div>

                <div className="about-update-status-card">
                  <div className="about-update-info">
                    {updateStatus === 'checking' && <span>Verificando novas versões no GitHub... 🔍</span>}
                    {updateStatus === 'available' && (
                      <span style={{ color: '#4ade80', fontWeight: 600 }}>
                        🎉 Nova versão disponível: v{updateInfo?.latestVersion}!
                      </span>
                    )}
                    {updateStatus === 'upToDate' && <span>✨ Você está na versão mais recente!</span>}
                    {updateStatus === 'idle' && <span>Clique abaixo para buscar atualizações automáticas.</span>}
                  </div>

                  <div className="about-update-actions">
                    {updateStatus === 'available' ? (
                      <button
                        type="button"
                        className="btn-picker-confirm"
                        onClick={startDownload}
                      >
                        Baixar e Atualizar Agora
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-change-server"
                        onClick={() => checkUpdates(true)}
                        disabled={updateStatus === 'checking'}
                      >
                        <RefreshCw size={14} className={updateStatus === 'checking' ? 'spin' : ''} />
                        <span>Verificar Atualizações</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
