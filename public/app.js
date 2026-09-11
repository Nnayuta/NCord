// ==========================================
// CONFIGURAÇÕES DE INICIALIZAÇÃO (PREFERÊNCIAS DO CASAL)
// ==========================================
const START_MIC_ACTIVE = false; // Define se o microfone inicia ativo (true) ou mutado (false)
const START_CAM_ACTIVE = false;  // Define se a câmera inicia ativa (true) ou desligada (false)

// ==========================================
// CONFIGURAÇÕES WEBRTC
// ==========================================
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ==========================================
// PRESETS DE QUALIDADE (SEM LIMITES DE BANDA)
// ==========================================
const QUALITY_PRESETS = {
  ultra: {
    id: 'ultra',
    label: 'Ultra HD Sem Limites',
    badge: '35 Mbps • Ultra HD',
    screenBitrate: 35_000_000,    // 35 Mbps para compartilhamento de tela
    screenMinBitrate: 15_000_000, // 15 Mbps piso mínimo
    mediaBitrate: 8_000_000,      // 8 Mbps para webcam
    mediaMinBitrate: 3_000_000,   // 3 Mbps piso mínimo
    degradationPreference: 'maintain-resolution', // NUNCA reduz resolução
    contentHint: 'detail',        // Preserva 100% dos detalhes espaciais
    maxFps: 60,
    sdpScreenKbps: 35000,
    sdpMediaKbps: 8000
  },
  cinema: {
    id: 'cinema',
    label: 'Modo Cinema (Nitidez Máxima)',
    badge: '20 Mbps • Cinema HD',
    screenBitrate: 20_000_000,    // 20 Mbps
    screenMinBitrate: 10_000_000,
    mediaBitrate: 6_000_000,
    mediaMinBitrate: 2_500_000,
    degradationPreference: 'maintain-resolution',
    contentHint: 'detail',
    maxFps: 60,
    sdpScreenKbps: 20000,
    sdpMediaKbps: 6000
  },
  gamer: {
    id: 'gamer',
    label: 'Modo Gamer (60 FPS)',
    badge: '25 Mbps • 60 FPS',
    screenBitrate: 25_000_000,    // 25 Mbps
    screenMinBitrate: 12_000_000,
    mediaBitrate: 6_000_000,
    mediaMinBitrate: 2_500_000,
    degradationPreference: 'maintain-resolution',
    contentHint: 'motion',
    maxFps: 60,
    sdpScreenKbps: 25000,
    sdpMediaKbps: 6000
  },
  balanced: {
    id: 'balanced',
    label: 'Modo Equilibrado',
    badge: '8 Mbps • 1080p',
    screenBitrate: 8_000_000,     // 8 Mbps
    screenMinBitrate: 3_000_000,
    mediaBitrate: 3_000_000,
    mediaMinBitrate: 1_000_000,
    degradationPreference: 'balanced',
    contentHint: 'detail',
    maxFps: 30,
    sdpScreenKbps: 8000,
    sdpMediaKbps: 3000
  }
};

let currentQualityPreset = QUALITY_PRESETS.ultra;

const MIN_BITRATE = 3_000_000;        // 3 Mbps mínimo adaptativo
const MAX_BITRATE = 12_000_000;       // 12 Mbps máximo adaptativo para webcam
let currentTargetBitrate = QUALITY_PRESETS.ultra.mediaBitrate;

// ==========================================
// ESTADO DA APLICAÇÃO
// ==========================================
let peer = null;
let dataConn = null;

// RTCPeerConnections nativos (substituem PeerJS media calls)
let mediaPC = null;    // Conexão WebRTC para webcam/microfone
let screenPC = null;   // Conexão WebRTC para compartilhamento de tela

let roomName = "lovechat-main";
let roomPin = "ncord";
let peerRole = ""; // "host" ou "guest"
let myIp = "";
let guestIp = "";

let localStream = null;
let screenStream = null;

let isAudioMuted = true;
let isVideoOff = true;
let isScreenSharing = false;

// Sistema de foco (spotlight)
let focusedStreamId = null; // 'local', 'remote', 'screen', ou null

// Monitoramento de qualidade adaptativa
let statsInterval = null;
let guestReconnectInterval = null;

// Faixas de mídia reais obtidas via getUserMedia
let realMicTrack = null;
let realCameraTrack = null;
let dummyVideoTrack = null;
let dummyAudioTrack = null;

// RTCRtpSenders para substituição de faixa dinâmica (replaceTrack)
let videoSender = null;
let audioSender = null;

// Buffer de candidatos ICE (para candidatos que chegam antes do remote description)
let pendingMediaICE = [];
let pendingScreenICE = [];

// Contextos de Áudio para Indicador de Voz Ativa
let localAudioContext = null;
let localAnalyser = null;
let localInterval = null;
let remoteAudioContext = null;
let remoteAnalyser = null;
let remoteInterval = null;

// ==========================================
// ELEMENTOS DOM
// ==========================================
const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-screen');
const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-input');
const pinInput = document.getElementById('pin-input');
const btnSubmit = document.getElementById('btn-submit');
const loginError = document.getElementById('login-error');
const errorText = document.getElementById('error-text');

// Elementos de Conexão e Seleção de Servidor
const tabHost = document.getElementById('tab-mode-host');
const tabRemote = document.getElementById('tab-mode-remote');
const panelHost = document.getElementById('panel-mode-host');
const panelRemote = document.getElementById('panel-mode-remote');
const btnCopyIp = document.getElementById('btn-copy-my-ip');
const inputRemoteIp = document.getElementById('remote-ip-input');
const btnApplyRemoteIp = document.getElementById('btn-apply-remote-ip');
const serverStatusBox = document.getElementById('server-status-box');
const statusServerDot = document.getElementById('status-server-dot');
const lblServerStatus = document.getElementById('lbl-server-status');
const remoteStatusBox = document.getElementById('remote-status-box');
const statusRemoteDot = document.getElementById('status-remote-dot');
const lblRemoteStatus = document.getElementById('lbl-remote-status');

const roomTitleLbl = document.getElementById('room-title-lbl');
const localNameLbl = document.getElementById('local-name-lbl');
const remoteNameLbl = document.getElementById('remote-name-lbl');
const remoteMemberItem = document.getElementById('remote-member-item');
const remoteStatusDot = document.getElementById('remote-status-dot');
const remoteStatusIcons = document.getElementById('remote-status-icons');

const statusCircle = document.getElementById('con-circle');
const statusTextLbl = document.getElementById('con-text-lbl');

const videosGridElement = document.getElementById('videos-grid-element');
const screenShareCard = document.getElementById('screen-share-card');
const localVideoCard = document.getElementById('local-video-card');
const remoteVideoCard = document.getElementById('remote-video-card');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const screenVideo = document.getElementById('screen-video');

const localAvatar = document.getElementById('local-avatar');
const remoteAvatar = document.getElementById('remote-avatar');

// Botões de controle
const btnMic = document.getElementById('btn-mic');
const btnVideo = document.getElementById('btn-video');
const btnScreen = document.getElementById('btn-screen');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnQuality = document.getElementById('btn-quality');
const qualityMenu = document.getElementById('quality-menu');
const btnCloseQuality = document.getElementById('btn-close-quality');
const qualityOptions = document.querySelectorAll('.quality-option');
const screenQualityBadge = document.getElementById('screen-quality-badge');
const currentQualityStatus = document.getElementById('current-quality-status');

// Wrappers dos indicadores de status da sidebar
const statusLocalMicWrapper = document.getElementById('status-local-mic-wrapper');
const statusLocalVideoWrapper = document.getElementById('status-local-video-wrapper');
const statusRemoteMicWrapper = document.getElementById('status-remote-mic-wrapper');
const statusRemoteVideoWrapper = document.getElementById('status-remote-video-wrapper');

// Sidebar Stream & Controles UX
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnExpandSidebar = document.getElementById('btn-expand-sidebar');
const sidebarStreamCard = document.getElementById('sidebar-stream-card');
const sidebarStreamOwner = document.getElementById('sidebar-stream-owner');
const sidebarStreamQuality = document.getElementById('sidebar-stream-quality');
const btnSidebarWatch = document.getElementById('btn-sidebar-watch');
const localLiveBadge = document.getElementById('local-live-badge');
const remoteLiveBadge = document.getElementById('remote-live-badge');

// Controles Overlay da Transmissão de Tela
const btnScreenCardFullscreen = document.getElementById('btn-screen-card-fullscreen');
const btnExitCardFullscreen = document.getElementById('btn-exit-card-fullscreen');
const btnStreamTheater = document.getElementById('btn-stream-theater');
const btnStreamFit = document.getElementById('btn-stream-fit');
const streamVolSlider = document.getElementById('stream-vol-slider');
const btnStreamVolToggle = document.getElementById('btn-stream-vol-toggle');
const streamVolIcon = document.getElementById('stream-vol-icon');

// Overlays dos vídeos
const overlayLocalMic = document.getElementById('overlay-local-mic');
const overlayLocalVideo = document.getElementById('overlay-local-video');
const overlayRemoteMic = document.getElementById('overlay-remote-mic');
const overlayRemoteVideo = document.getElementById('overlay-remote-video');

// Inicialização do Lucide Icons
lucide.createIcons();

// ==========================================
// IDENTIFICAÇÃO FIXA DO USUÁRIO (PERFIS)
// ==========================================
let activeProfileId = 'user1'; // 'user1' | 'user2'
let cachedProfiles = {
  user1: { id: 'user1', name: 'Usuário 1', avatar: null },
  user2: { id: 'user2', name: 'Usuário 2', avatar: null }
};
let remoteUserProfile = null;

function getMyUserProfile() {
  return cachedProfiles[activeProfileId] || {
    id: activeProfileId,
    name: activeProfileId === 'user1' ? 'Usuário 1' : 'Usuário 2',
    avatar: null
  };
}

function getOtherUserProfile() {
  const otherId = activeProfileId === 'user1' ? 'user2' : 'user1';
  return cachedProfiles[otherId] || {
    id: otherId,
    name: otherId === 'user1' ? 'Usuário 1' : 'Usuário 2',
    avatar: null
  };
}

function selectActiveProfile(profileId) {
  activeProfileId = profileId;
  localStorage.setItem('ncord_active_profile', profileId);
  if (window.electronAPI && window.electronAPI.saveUserProfile) {
    window.electronAPI.saveUserProfile(profileId).catch(() => {});
  }
  updateLoginProfilesUI();

  // Atualizar também na sala se já estiver aberta
  const myProfile = getMyUserProfile();
  if (localNameLbl) localNameLbl.textContent = myProfile.name;
  updateLocalAvatarUI(myProfile.avatar);

  const defaultRemote = getOtherUserProfile();
  if (remoteNameLbl) remoteNameLbl.textContent = defaultRemote.name;
  updateRemoteAvatarUI(defaultRemote.avatar);
}

function updateLoginProfilesUI() {
  const p1Name = document.getElementById('login-name-user1');
  const p2Name = document.getElementById('login-name-user2');
  const p1Avatar = document.getElementById('login-avatar-user1');
  const p2Avatar = document.getElementById('login-avatar-user2');
  const p1Icon = document.getElementById('login-default-icon-user1');
  const p2Icon = document.getElementById('login-default-icon-user2');
  const desc1 = document.getElementById('login-desc-user1');
  const desc2 = document.getElementById('login-desc-user2');

  if (p1Name && cachedProfiles.user1.name) p1Name.textContent = cachedProfiles.user1.name;
  if (p2Name && cachedProfiles.user2.name) p2Name.textContent = cachedProfiles.user2.name;

  if (p1Avatar && p1Icon) {
    if (cachedProfiles.user1.avatar) {
      p1Avatar.src = cachedProfiles.user1.avatar;
      p1Avatar.classList.remove('hide');
      p1Icon.classList.add('hide');
    } else {
      p1Avatar.classList.add('hide');
      p1Icon.classList.remove('hide');
    }
  }

  if (p2Avatar && p2Icon) {
    if (cachedProfiles.user2.avatar) {
      p2Avatar.src = cachedProfiles.user2.avatar;
      p2Avatar.classList.remove('hide');
      p2Icon.classList.add('hide');
    } else {
      p2Avatar.classList.add('hide');
      p2Icon.classList.remove('hide');
    }
  }

  // Atualizar classe active nos botões de escolha
  const btn1 = document.getElementById('profile-btn-user1');
  const btn2 = document.getElementById('profile-btn-user2');
  if (btn1 && btn2) {
    const chk1 = btn1.querySelector('.profile-check-icon');
    const chk2 = btn2.querySelector('.profile-check-icon');

    if (activeProfileId === 'user1') {
      btn1.classList.add('active');
      btn2.classList.remove('active');
      if (chk1) chk1.classList.remove('hide');
      if (chk2) chk2.classList.add('hide');
      if (desc1) desc1.textContent = 'Selecionado ✓';
      if (desc2) desc2.textContent = 'Clique para usar';
    } else {
      btn2.classList.add('active');
      btn1.classList.remove('active');
      if (chk1) chk1.classList.add('hide');
      if (chk2) chk2.classList.remove('hide');
      if (desc1) desc1.textContent = 'Clique para usar';
      if (desc2) desc2.textContent = 'Selecionado ✓';
    }
  }
}

function handleLoginAvatarUpload(file, profileId) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Por favor, selecione um arquivo de imagem.', 'info');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 640;
      canvas.height = 640;

      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;

      ctx.drawImage(img, sx, sy, size, size, 0, 0, 640, 640);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

      if (cachedProfiles[profileId]) {
        cachedProfiles[profileId].avatar = compressedBase64;
      }
      updateLoginProfilesUI();

      // Salva no banco de dados local
      fetch(apiUrl('/api/db'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUpdate: {
            id: profileId,
            avatar: compressedBase64
          }
        })
      }).then(() => {
        showToast(`Foto de perfil atualizada com sucesso! 📸`, 'info');
      }).catch(err => {
        console.error('Erro ao salvar avatar:', err);
      });

      if (profileId === activeProfileId) {
        updateLocalAvatarUI(compressedBase64);
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function handleLoginNameEdit(profileId) {
  const current = cachedProfiles[profileId]?.name || (profileId === 'user1' ? 'Usuário 1' : 'Usuário 2');
  const nameEl = document.getElementById(`login-name-${profileId}`);
  if (!nameEl) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'edit-name-input';
  input.maxLength = 18;
  input.style.fontSize = '0.85rem';
  input.style.padding = '2px 6px';
  input.style.maxWidth = '110px';

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const save = () => {
    const val = input.value.trim() || current;
    input.replaceWith(nameEl);
    nameEl.textContent = val;

    if (cachedProfiles[profileId]) {
      cachedProfiles[profileId].name = val;
    }
    updateLoginProfilesUI();

    fetch(apiUrl('/api/db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileUpdate: {
          id: profileId,
          name: val
        }
      })
    }).catch(err => console.error('Erro ao salvar nome:', err));

    if (profileId === activeProfileId && localNameLbl) {
      localNameLbl.textContent = val;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });
  input.addEventListener('blur', save);
}

async function loadProfilesFromDatabase() {
  try {
    const res = await fetch(apiUrl('/api/db'), { signal: AbortSignal.timeout(3000) });
    const db = await res.json();
    if (db.profiles) {
      if (db.profiles.user1) cachedProfiles.user1 = { ...cachedProfiles.user1, ...db.profiles.user1 };
      if (db.profiles.user2) cachedProfiles.user2 = { ...cachedProfiles.user2, ...db.profiles.user2 };
    } else {
      if (db.hostName) cachedProfiles.user1.name = db.hostName;
      if (db.hostAvatar) cachedProfiles.user1.avatar = db.hostAvatar;
      if (db.guestName) cachedProfiles.user2.name = db.guestName;
      if (db.guestAvatar) cachedProfiles.user2.avatar = db.guestAvatar;
    }
    updateLoginProfilesUI();
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    console.warn('Aviso ao carregar perfis do banco (tentando novamente em breve):', e);
    setTimeout(async () => {
      try {
        const res2 = await fetch(apiUrl('/api/db'), { signal: AbortSignal.timeout(3000) });
        const db2 = await res2.json();
        if (db2.profiles) {
          if (db2.profiles.user1) cachedProfiles.user1 = { ...cachedProfiles.user1, ...db2.profiles.user1 };
          if (db2.profiles.user2) cachedProfiles.user2 = { ...cachedProfiles.user2, ...db2.profiles.user2 };
        }
        updateLoginProfilesUI();
        if (window.lucide) window.lucide.createIcons();
      } catch (err2) {}
    }, 800);
  }
}

function setupProfileSelector() {
  const btn1 = document.getElementById('profile-btn-user1');
  const btn2 = document.getElementById('profile-btn-user2');

  const saved = localStorage.getItem('ncord_active_profile');
  if (saved === 'user1' || saved === 'user2') {
    activeProfileId = saved;
  }

  if (window.electronAPI && window.electronAPI.getSavedSettings) {
    window.electronAPI.getSavedSettings().then(settings => {
      if (settings && settings.activeProfileId && !saved) {
        activeProfileId = settings.activeProfileId;
        updateLoginProfilesUI();
      }
    }).catch(() => {});
  }

  if (btn1) {
    btn1.addEventListener('click', (e) => {
      if (e.target.closest('.profile-thumb-wrapper') || e.target.closest('.btn-login-edit-name')) return;
      selectActiveProfile('user1');
    });
  }
  if (btn2) {
    btn2.addEventListener('click', (e) => {
      if (e.target.closest('.profile-thumb-wrapper') || e.target.closest('.btn-login-edit-name')) return;
      selectActiveProfile('user2');
    });
  }

  // Upload de avatar do perfil 1
  const thumb1 = document.getElementById('login-thumb-user1');
  const inputAvatar1 = document.getElementById('login-avatar-input-user1');
  if (thumb1 && inputAvatar1) {
    thumb1.addEventListener('click', (e) => {
      e.stopPropagation();
      inputAvatar1.click();
    });
    inputAvatar1.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleLoginAvatarUpload(e.target.files[0], 'user1');
        e.target.value = '';
      }
    });
  }

  // Upload de avatar do perfil 2
  const thumb2 = document.getElementById('login-thumb-user2');
  const inputAvatar2 = document.getElementById('login-avatar-input-user2');
  if (thumb2 && inputAvatar2) {
    thumb2.addEventListener('click', (e) => {
      e.stopPropagation();
      inputAvatar2.click();
    });
    inputAvatar2.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleLoginAvatarUpload(e.target.files[0], 'user2');
        e.target.value = '';
      }
    });
  }

  // Edição de nome perfil 1
  const btnEdit1 = document.getElementById('btn-login-edit-user1');
  if (btnEdit1) {
    btnEdit1.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLoginNameEdit('user1');
    });
  }

  // Edição de nome perfil 2
  const btnEdit2 = document.getElementById('btn-login-edit-user2');
  if (btnEdit2) {
    btnEdit2.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLoginNameEdit('user2');
    });
  }

  updateLoginProfilesUI();
  loadProfilesFromDatabase();
}

function applyRemoteProfile(profile) {
  if (!profile) return;
  remoteUserProfile = profile;

  if (profile.name) {
    remoteNameLbl.textContent = profile.name;
    const remoteVideoName = document.getElementById('remote-video-name-lbl');
    if (remoteVideoName) remoteVideoName.textContent = profile.name;
  }

  if (profile.avatar) {
    updateRemoteAvatarUI(profile.avatar);
  } else {
    updateRemoteAvatarUI(null);
  }
}

// ==========================================
// CONFIGURAÇÃO DE ORIGEM DO SERVIDOR (NATIVO ELECTRON)
// ==========================================
let currentServerHost = '127.0.0.1';
let currentServerPort = 3000;
let isRemoteServerMode = false;

function getServerBaseUrl() {
  if (window.electronAPI) {
    return `http://${currentServerHost}:${currentServerPort}`;
  }
  return window.location.origin;
}

function apiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${getServerBaseUrl()}${cleanEndpoint}`;
}

// ==========================================
// OBTENÇÃO DE IP LOCAL E CONTROLE DE SERVIDOR
// ==========================================
async function fetchMyIp() {
  try {
    // Sempre consulta o servidor local na porta 3000 para obter as interfaces desta máquina
    const res = await fetch('http://127.0.0.1:3000/api/my-ip', {
      signal: AbortSignal.timeout(3000)
    });
    const data = await res.json();
    myIp = data.ip || data.zerotierIp || data.lanIp;
    console.log("Meu IP ZeroTier detectado pelo servidor:", myIp);
    const lblIp = document.getElementById('lbl-display-my-ip');
    if (lblIp && myIp) {
      lblIp.textContent = myIp;
    }
  } catch (e) {
    console.warn("Aviso ao obter IP local via servidor local:", e);
    try {
      const fallbackRes = await fetch(apiUrl('/api/my-ip'), { signal: AbortSignal.timeout(3000) });
      const fallbackData = await fallbackRes.json();
      if (fallbackData.ip) {
        myIp = fallbackData.ip;
        const lblIp = document.getElementById('lbl-display-my-ip');
        if (lblIp) lblIp.textContent = myIp;
      }
    } catch (err2) {}
  }
}

async function checkServerStatus() {
  if (!lblServerStatus) return;
  try {
    let isRunning = false;
    if (window.electronAPI && window.electronAPI.getServerStatus) {
      const status = await window.electronAPI.getServerStatus();
      isRunning = !!(status && status.running);
    } else {
      const res = await fetch('http://127.0.0.1:3000/api/my-ip', { signal: AbortSignal.timeout(1500) });
      isRunning = res.ok;
    }

    if (isRunning) {
      if (serverStatusBox) serverStatusBox.classList.remove('offline');
      if (lblServerStatus) lblServerStatus.textContent = 'Servidor Ativo (Porta 3000)';
    } else {
      if (serverStatusBox) serverStatusBox.classList.add('offline');
      if (lblServerStatus) lblServerStatus.textContent = 'Servidor Offline (Iniciando...)';
      if (window.electronAPI && window.electronAPI.hostLocalServer) {
        window.electronAPI.hostLocalServer();
      }
    }
  } catch (e) {
    if (serverStatusBox) serverStatusBox.classList.add('offline');
    if (lblServerStatus) lblServerStatus.textContent = 'Servidor Offline';
  }
}

function setupServerModeSelector() {
  if (!tabHost || !tabRemote) return;

  function updateModeUI() {
    if (isRemoteServerMode) {
      tabRemote.classList.add('active');
      tabHost.classList.remove('active');
      panelRemote.classList.remove('hide');
      panelHost.classList.add('hide');
      if (inputRemoteIp && currentServerHost !== '127.0.0.1' && currentServerHost !== 'localhost') {
        inputRemoteIp.value = currentServerHost;
      }
    } else {
      tabHost.classList.add('active');
      tabRemote.classList.remove('active');
      panelHost.classList.remove('hide');
      panelRemote.classList.add('hide');
    }
  }

  // Preenche o campo de IP com o último IP digitado, se houver,
  // mas INICIA SEMPRE em Modo Anfitrião (Host) para garantir que o servidor local esteja pronto
  if (window.electronAPI && window.electronAPI.getSavedSettings) {
    window.electronAPI.getSavedSettings().then(settings => {
      if (settings && settings.targetIp && settings.targetIp !== 'localhost' && settings.targetIp !== '127.0.0.1') {
        if (inputRemoteIp) inputRemoteIp.value = settings.targetIp;
      }
    });
  } else {
    const savedRemoteIp = localStorage.getItem('ncord_saved_remote_ip') || '';
    if (savedRemoteIp && inputRemoteIp) {
      inputRemoteIp.value = savedRemoteIp;
    }
  }

  // Inicializar estado padrão
  isRemoteServerMode = false;
  currentServerHost = '127.0.0.1';
  updateModeUI();

  // Buscar IP local e checar status do servidor
  fetchMyIp();
  checkServerStatus();
  setInterval(checkServerStatus, 4000);

  tabHost.addEventListener('click', async () => {
    isRemoteServerMode = false;
    currentServerHost = '127.0.0.1';
    updateModeUI();

    if (window.electronAPI && window.electronAPI.hostLocalServer) {
      try {
        await window.electronAPI.hostLocalServer();
        await fetchMyIp();
        checkServerStatus();
        updateFirewallUI();
      } catch (err) {
        console.error('Erro ao restaurar anfitrião:', err);
      }
    }
  });

  tabRemote.addEventListener('click', () => {
    isRemoteServerMode = true;
    updateModeUI();
    if (inputRemoteIp) {
      const rawIp = inputRemoteIp.value.trim();
      if (rawIp) {
        currentServerHost = rawIp.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
      }
      inputRemoteIp.focus();
    }
  });

  if (btnCopyIp) {
    btnCopyIp.addEventListener('click', () => {
      const lblIp = document.getElementById('lbl-display-my-ip');
      const ipText = lblIp ? lblIp.textContent : myIp;
      if (ipText && ipText !== 'Detectando IP...' && ipText !== 'Carregando IP...') {
        navigator.clipboard.writeText(ipText).then(() => {
          showToast('IP copiado! Mande para seu amor conectar 💖', 'check');
        }).catch(() => {
          showToast(`Seu IP é: ${ipText}`, 'info');
        });
      }
    });
  }

  // ==========================================
  // LIBERAÇÃO AUTOMÁTICA DO FIREWALL DO WINDOWS
  // ==========================================
  const btnFirewall = document.getElementById('btn-request-firewall');
  const lblFirewall = document.getElementById('lbl-firewall-action');

  async function updateFirewallUI() {
    if (!btnFirewall || !window.electronAPI || !window.electronAPI.checkFirewall) return;
    try {
      const isConfigured = await window.electronAPI.checkFirewall();
      if (isConfigured) {
        btnFirewall.classList.add('configured');
        if (lblFirewall) lblFirewall.textContent = 'Firewall Liberado ✅';
        btnFirewall.title = 'Porta 3000 e conexões WebRTC liberadas no Firewall do Windows!';
      } else {
        btnFirewall.classList.remove('configured');
        if (lblFirewall) lblFirewall.textContent = 'Liberar Firewall do Windows';
        btnFirewall.title = 'Clique para solicitar liberação automática de portas no Firewall';
      }
    } catch (e) {
      console.warn('Erro ao verificar status do firewall:', e);
    }
  }

  // Verificar status ao inicializar
  updateFirewallUI();

  if (btnFirewall) {
    btnFirewall.addEventListener('click', async () => {
      if (!window.electronAPI || !window.electronAPI.requestFirewall) {
        showToast('Recurso exclusivo do aplicativo para Desktop.', 'info');
        return;
      }
      if (lblFirewall) lblFirewall.textContent = 'Solicitando permissão... ⏳';
      btnFirewall.disabled = true;
      showToast('Verifique a janela de permissão de Administrador (UAC) do Windows...', 'info');

      try {
        const res = await window.electronAPI.requestFirewall();
        if (res && res.success) {
          showToast('Firewall configurado com sucesso! Conexões liberadas 💖', 'check');
          btnFirewall.classList.add('configured');
          if (lblFirewall) lblFirewall.textContent = 'Firewall Liberado ✅';
        } else {
          showToast('Não foi possível liberar o firewall ou a permissão foi recusada.', 'alert-circle');
          await updateFirewallUI();
        }
      } catch (err) {
        console.error('Erro ao solicitar firewall:', err);
        showToast('Erro ao configurar regras do firewall.', 'alert-circle');
        await updateFirewallUI();
      } finally {
        btnFirewall.disabled = false;
      }
    });
  }

  async function connectToTargetIp() {
    if (!inputRemoteIp) return;
    const rawIp = inputRemoteIp.value.trim();
    if (!rawIp) {
      showToast('Digite o IP do ZeroTier do parceiro!', 'alert-circle');
      return;
    }

    const cleanIp = rawIp.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    localStorage.setItem('ncord_saved_remote_ip', cleanIp);

    if (btnApplyRemoteIp) {
      btnApplyRemoteIp.disabled = true;
      btnApplyRemoteIp.innerHTML = '<span>Testando...</span> <i data-lucide="loader-2"></i>';
      if (window.lucide) window.lucide.createIcons();
    }

    showToast(`Testando conexão com ${cleanIp}... 🌐`, 'info');

    try {
      if (window.electronAPI && window.electronAPI.connectToServer) {
        const result = await window.electronAPI.connectToServer(cleanIp);
        if (result && result.success) {
          currentServerHost = cleanIp;
          isRemoteServerMode = true;
          updateModeUI();

          if (remoteStatusBox) {
            remoteStatusBox.classList.remove('hide', 'offline');
          }
          if (lblRemoteStatus) {
            lblRemoteStatus.textContent = `Conectado ao Amor (${cleanIp}) 🟢 Pronto!`;
          }
          if (btnApplyRemoteIp) {
            btnApplyRemoteIp.classList.add('connected');
            btnApplyRemoteIp.innerHTML = '<span>Conectado</span> <i data-lucide="check"></i>';
          }
          if (btnSubmit) {
            btnSubmit.classList.add('pulse-attention');
          }
          if (window.lucide) window.lucide.createIcons();
          showToast(`Conectado ao parceiro em ${cleanIp}! Clique em "Entrar no Nosso Espaço" 💖`, 'check');
        } else {
          const errDetail = result.error || `Não foi possível alcançar ${cleanIp}.`;
          if (remoteStatusBox) {
            remoteStatusBox.classList.remove('hide');
            remoteStatusBox.classList.add('offline');
          }
          if (lblRemoteStatus) {
            lblRemoteStatus.textContent = `Offline em ${cleanIp}`;
          }
          if (btnApplyRemoteIp) {
            btnApplyRemoteIp.classList.remove('connected');
            btnApplyRemoteIp.innerHTML = '<span>Tentar Novamente</span> <i data-lucide="rotate-cw"></i>';
          }
          if (window.lucide) window.lucide.createIcons();
          showToast(errDetail, 'alert-circle');
        }
      } else {
        // Fallback navegador
        const testRes = await fetch(`http://${cleanIp}:3000/api/my-ip`, { signal: AbortSignal.timeout(5000) });
        if (testRes.ok) {
          currentServerHost = cleanIp;
          isRemoteServerMode = true;
          updateModeUI();
          if (remoteStatusBox) {
            remoteStatusBox.classList.remove('hide', 'offline');
          }
          if (lblRemoteStatus) {
            lblRemoteStatus.textContent = `Conectado ao Amor (${cleanIp}) 🟢 Pronto!`;
          }
          if (btnApplyRemoteIp) {
            btnApplyRemoteIp.classList.add('connected');
            btnApplyRemoteIp.innerHTML = '<span>Conectado</span> <i data-lucide="check"></i>';
          }
          if (btnSubmit) {
            btnSubmit.classList.add('pulse-attention');
          }
          if (window.lucide) window.lucide.createIcons();
          showToast(`Conectado ao parceiro em ${cleanIp}! 💖`, 'check');
        } else {
          throw new Error('Servidor não respondeu.');
        }
      }
    } catch (err) {
      console.error('Falha de conexão com IP remoto:', err);
      if (remoteStatusBox) {
        remoteStatusBox.classList.remove('hide');
        remoteStatusBox.classList.add('offline');
      }
      if (lblRemoteStatus) {
        lblRemoteStatus.textContent = `Erro ao conectar a ${cleanIp}`;
      }
      if (btnApplyRemoteIp) {
        btnApplyRemoteIp.classList.remove('connected');
        btnApplyRemoteIp.innerHTML = '<span>Tentar Novamente</span> <i data-lucide="rotate-cw"></i>';
      }
      if (window.lucide) window.lucide.createIcons();
      showToast(`Não foi possível conectar a ${cleanIp}.\nVerifique se o parceiro está com o NCord aberto e conectado ao ZeroTier.`, 'alert-circle');
    } finally {
      if (btnApplyRemoteIp && !btnApplyRemoteIp.classList.contains('connected')) {
        btnApplyRemoteIp.disabled = false;
        btnApplyRemoteIp.innerHTML = '<span>Ir</span> <i data-lucide="arrow-right"></i>';
        if (window.lucide) window.lucide.createIcons();
      } else if (btnApplyRemoteIp) {
        btnApplyRemoteIp.disabled = false;
      }
    }
  }

  if (btnApplyRemoteIp) {
    btnApplyRemoteIp.addEventListener('click', connectToTargetIp);
  }

  if (inputRemoteIp) {
    inputRemoteIp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        connectToTargetIp();
      }
    });
  }
}

// Inicializar seletor de modo
setupServerModeSelector();

// ==========================================
// AUTO-PREENCHIMENTO E RECONEXÃO
// ==========================================
async function initApp() {
  // Inicializar seletor de perfil e carregar perfis
  setupProfileSelector();

  // CRÍTICO: Obter IP local antes de qualquer conexão para que fixMDNS funcione
  await fetchMyIp();
  await checkServerStatus();
  await loadProfilesFromDatabase();

  const savedQuality = localStorage.getItem('lovechat_quality_preset');

  // Restaurar preset de qualidade salvo
  if (savedQuality && QUALITY_PRESETS[savedQuality]) {
    currentQualityPreset = QUALITY_PRESETS[savedQuality];
    currentTargetBitrate = currentQualityPreset.mediaBitrate;
    if (screenQualityBadge) {
      screenQualityBadge.textContent = currentQualityPreset.badge;
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ==========================================
// FORMULÁRIO DE ENTRADA
// ==========================================
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hide');

  // Se o usuário estiver no modo Anfitrião, sempre usa o servidor local
  if (!isRemoteServerMode) {
    currentServerHost = '127.0.0.1';
  } else {
    // Modo Conectar Remoto
    const rawIp = inputRemoteIp ? inputRemoteIp.value.trim() : '';
    if (rawIp) {
      const cleanIp = rawIp.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
      if (cleanIp !== currentServerHost) {
        if (window.electronAPI && window.electronAPI.connectToServer) {
          const res = await window.electronAPI.connectToServer(cleanIp);
          if (!res || !res.success) {
            showToast(res && res.error ? res.error : `Não foi possível conectar ao servidor em ${cleanIp}`, 'alert-circle');
            return;
          }
          currentServerHost = cleanIp;
        }
      }
    } else if (!currentServerHost || currentServerHost === '127.0.0.1') {
      showToast('Digite o IP do ZeroTier do parceiro!', 'alert-circle');
      if (inputRemoteIp) inputRemoteIp.focus();
      return;
    }
  }

  roomPin = "ncord";
  roomName = "lovechat-main";

  btnSubmit.disabled = true;
  btnSubmit.style.opacity = '0.7';

  // 1. Obter microfone real (respeitando o estado de mute salvo no reload estilo Discord)
  const savedMicMuted = localStorage.getItem('lovechat_mic_muted');
  const shouldMicBeActive = savedMicMuted !== null ? (savedMicMuted === 'false') : START_MIC_ACTIVE;

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    realMicTrack = audioStream.getAudioTracks()[0];
    if (realMicTrack) {
      realMicTrack.enabled = shouldMicBeActive;
    }
    isAudioMuted = !shouldMicBeActive;
  } catch (err) {
    console.error('Erro ao acessar microfone:', err);
    dummyAudioTrack = createDummyAudioTrack();
    isAudioMuted = true;
  }

  // 2. Câmera: inicia DESLIGADA por padrão com o avatar em destaque
  // (só liga se explicitamente ativada nas preferências)
  const savedCamActive = localStorage.getItem('lovechat_camera_active');
  const shouldCamBeActive = (savedCamActive === 'true') && START_CAM_ACTIVE;

  if (shouldCamBeActive) {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        }
      });
      realCameraTrack = videoStream.getVideoTracks()[0];
      isVideoOff = false;
    } catch (err) {
      console.error('Erro ao acessar câmera automaticamente:', err);
      dummyVideoTrack = createDummyVideoTrack();
      isVideoOff = true;
    }
  } else {
    dummyVideoTrack = createDummyVideoTrack();
    isVideoOff = true;
  }

  localStream = new MediaStream();

  // Adicionar faixa de vídeo ao stream WebRTC local
  if (!isVideoOff && realCameraTrack) {
    localStream.addTrack(realCameraTrack);
  } else if (dummyVideoTrack) {
    localStream.addTrack(dummyVideoTrack);
  }

  // Adicionar faixa de áudio ao stream local
  if (realMicTrack) {
    localStream.addTrack(realMicTrack);
  } else if (dummyAudioTrack) {
    localStream.addTrack(dummyAudioTrack);
  }

  if (!isVideoOff) {
    localVideo.srcObject = localStream;
    localVideo.classList.remove('hide');
    localVideo.play().catch(e => console.error(e));
    localAvatar.classList.add('hide');
  } else {
    localVideo.srcObject = null;
    localVideo.classList.add('hide');
    localAvatar.classList.remove('hide');
  }

  // Configurar estado inicial na interface
  // Áudio/Microfone
  if (!isAudioMuted) {
    btnMic.classList.remove('muted');
    btnMic.innerHTML = '<i data-lucide="mic"></i>';
    overlayLocalMic.classList.add('hide');
    statusLocalMicWrapper.innerHTML = '<i data-lucide="mic"></i>';
  } else {
    btnMic.classList.add('muted');
    btnMic.innerHTML = '<i data-lucide="mic-off"></i>';
    overlayLocalMic.classList.remove('hide');
    statusLocalMicWrapper.innerHTML = '<i data-lucide="mic-off" class="muted"></i>';
  }

  // Câmera/Webcam
  if (!isVideoOff) {
    btnVideo.classList.remove('muted');
    btnVideo.innerHTML = '<i data-lucide="video"></i>';
    overlayLocalVideo.classList.add('hide');
    statusLocalVideoWrapper.innerHTML = '<i data-lucide="video"></i>';
  } else {
    btnVideo.classList.add('muted');
    btnVideo.innerHTML = '<i data-lucide="video-off"></i>';
    overlayLocalVideo.classList.remove('hide');
    statusLocalVideoWrapper.innerHTML = '<i data-lucide="video-off" class="muted"></i>';
  }

  lucide.createIcons();

  // Configurar layout inicial de vídeo
  updateVideoLayout();

  // Entrar na sala de forma inteligente (Host se estiver vazia, Guest se o par já estiver)
  joinRoomSmart();
});

// ==========================================
// FUNÇÕES GERADORAS DE DUMMY TRACKS
// ==========================================
function createDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#120b18'; // fundo padrão violeta escuro
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const videoStream = canvas.captureStream(1);
  return videoStream.getVideoTracks()[0];
}

function createDummyAudioTrack() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const dst = audioCtx.createMediaStreamDestination();
    osc.connect(dst);
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return track;
  } catch (e) {
    return null;
  }
}

// ==========================================
// HELPERS WEBRTC - CODEC E BITRATE
// ==========================================

/**
 * Otimiza a lista de codecs nos transceivers de vídeo.
 * Prioridade: AV1 > VP9 > H264 > VP8
 * - AV1: Padrão moderno de altíssima eficiência e nitidez cristalina, zero artefatos de bloco.
 * - VP9: Perfil de alta fidelidade superior ao VP8.
 * - H264: Aceleração nativa por GPU (NVENC/Intel/AMD/Apple) para performance e fidelidade.
 * - VP8: Fallback de compatibilidade.
 */
function optimizeCodecPreferences(pc) {
  if (!RTCRtpReceiver.getCapabilities) return;

  const capabilities = RTCRtpReceiver.getCapabilities('video');
  if (!capabilities || !capabilities.codecs) return;

  const av1 = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'video/av1');
  const vp9 = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'video/vp9');
  const h264 = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'video/h264');
  const vp8 = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'video/vp8');
  const rest = capabilities.codecs.filter(c =>
    !['video/av1', 'video/vp9', 'video/h264', 'video/vp8'].includes(c.mimeType.toLowerCase())
  );

  const preferred = [...av1, ...vp9, ...h264, ...vp8, ...rest];

  try {
    pc.getTransceivers().forEach(t => {
      if (t.sender && t.sender.track && t.sender.track.kind === 'video') {
        t.setCodecPreferences(preferred);
      }
    });
    console.log('✨ Codecs WebRTC priorizados: AV1 > VP9 > H264 > VP8');
  } catch (e) {
    console.warn('Não foi possível definir preferência de codec:', e);
  }
}

// Alias de retrocompatibilidade
function preferVP8(pc) {
  optimizeCodecPreferences(pc);
}

/**
 * Configura parâmetros de codificação de vídeo no WebRTC sender.
 * Aplica o bitrate alvo, piso mínimo, framerate e IMPEDE redução de resolução (scaleResolutionDownBy = 1.0).
 */
function configureSenderParams(pc, isScreen = false, customBitrate = null) {
  if (!pc) return;

  const preset = currentQualityPreset;
  const maxBitrateBps = customBitrate || (isScreen ? preset.screenBitrate : preset.mediaBitrate);
  const minBitrateBps = isScreen ? preset.screenMinBitrate : preset.mediaMinBitrate;
  const degradation = isScreen ? preset.degradationPreference : 'maintain-resolution';

  pc.getSenders().forEach(sender => {
    if (sender.track && sender.track.kind === 'video') {
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrateBps;
        params.encodings[0].minBitrate = minBitrateBps;
        params.encodings[0].maxFramerate = preset.maxFps;
        // CRÍTICO: scaleResolutionDownBy = 1.0 impede o navegador de reduzir a resolução para economizar banda!
        params.encodings[0].scaleResolutionDownBy = 1.0;
        params.encodings[0].degradationPreference = degradation;

        sender.setParameters(params)
          .then(() => console.log(`🚀 WebRTC Sender (${isScreen ? 'Tela' : 'Câmera'}): ${(maxBitrateBps / 1_000_000).toFixed(1)} Mbps | ${degradation} | Escala 1.0x`))
          .catch(e => console.error('Erro ao configurar parâmetros do sender:', e));
      } catch (e) {
        console.error('Erro ao acessar parâmetros do sender:', e);
      }
    }
  });
}

/**
 * SDP Munging: Força o navegador a utilizar bitrates altos imediatamente,
 * eliminando a fase de warmup de 300 kbps do Google Congestion Control (GCC).
 */
function boostSdpBitrate(sdp, isScreen = true) {
  if (!sdp) return sdp;

  const preset = currentQualityPreset;
  const targetKbps = isScreen ? preset.sdpScreenKbps : preset.sdpMediaKbps;
  const tiasBps = targetKbps * 1000;

  let modifiedSdp = sdp;

  // 1. Injetar b=AS e b=TIAS na seção de vídeo
  if (modifiedSdp.includes('m=video')) {
    modifiedSdp = modifiedSdp.replace(/(m=video[^\r\n]*(\r\n|\n))/gi, (match) => {
      return `${match}b=AS:${targetKbps}\r\nb=TIAS:${tiasBps}\r\n`;
    });

    // 2. Injetar parâmetros do Google nos codecs de vídeo para forçar piso e teto altos
    const minKbps = Math.floor(targetKbps * 0.4);
    const startKbps = Math.floor(targetKbps * 0.8);
    const maxKbps = Math.floor(targetKbps * 1.5);

    modifiedSdp = modifiedSdp.replace(/a=fmtp:(\d+)( [^\r\n]+)/gi, (match, pt, rest) => {
      if (!rest.includes('x-google-min-bitrate')) {
        return `a=fmtp:${pt}${rest};x-google-min-bitrate=${minKbps};x-google-start-bitrate=${startKbps};x-google-max-bitrate=${maxKbps}`;
      }
      return match;
    });
  }

  return modifiedSdp;
}

function fixMDNS(str) {
  if (!str) return str;
  
  // O IP do host é o IP do servidor em modo remoto, ou o meu IP local se formos anfitrião
  const hostIp = isRemoteServerMode ? currentServerHost : (myIp || '127.0.0.1');
  
  // Se somos o Host, o IP de destino é o guestIp (enviado no handshake).
  // Se somos o Guest, o IP de destino é o hostIp (endereço do servidor).
  const targetIp = (peerRole === 'host') ? guestIp : hostIp;
  
  if (!targetIp) {
    console.warn("⚠️ IP de destino do par não resolvido ainda para mDNS.");
    return str;
  }
  
  return str.replace(/([a-f0-9\-]+\.local)/gi, targetIp);
}

// ==========================================
// PEERJS - ENTRADA INTELIGENTE & TROCA DE DONO (HANDOVER)
// ==========================================
let promotionTimer = null;

/**
 * Consulta o servidor e entra como Host se a sala estiver vazia,
 * ou como Convidado (Guest) se o parceiro já for o Host ativo.
 */
async function joinRoomSmart() {
  try {
    const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomName)}/status`), {
      signal: AbortSignal.timeout(6000)
    });
    const status = await res.json();
    console.log("📊 Status atual da sala:", status);

    if (status.hostOnline) {
      console.log("👑 Host ativo detectado na sala. Conectando como Convidado (Guest)...");
      initializePeerAsGuest();
    } else {
      console.log("✨ Sala sem host ativo. Assumindo como Dono (Host)...");
      initializePeerAsHost();
    }
  } catch (err) {
    console.warn("⚠️ Não foi possível obter status da sala, tentando Host por padrão:", err);
    initializePeerAsHost();
  }
}

function initializePeerAsHost() {
  const hostId = `${roomName}-host`;

  if (promotionTimer) {
    clearTimeout(promotionTimer);
    promotionTimer = null;
  }

  if (peer) {
    try { peer.destroy(); } catch (e) {}
    peer = null;
  }

  let peerTimeout = setTimeout(() => {
    if (!peer || !peer.open) {
      console.warn('⚠️ Timeout ao conectar ao servidor de sinalização PeerJS (Host).');
      showLoginError('Tempo esgotado ao iniciar sala no servidor de sinalização. Verifique se o servidor está ativo.');
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
      stopLocalMediaTracks();
    }
  }, 10000);

  peer = new Peer(hostId, {
    host: currentServerHost,
    port: currentServerPort,
    path: '/peerjs',
    secure: false,
    config: ICE_CONFIG
  });

  peer.on('open', (id) => {
    clearTimeout(peerTimeout);
    peerRole = "host";
    transitionToRoom();
    updateP2PConnectionStatus('waiting', 'Aguardando Meu Amor... 💖');
    showToast('Você é o anfitrião da sala! Aguardando o amor... 💕', 'info');

    // Escutar conexões de dados (handshake PIN)
    peer.on('connection', (conn) => {
      handleIncomingDataConnection(conn);
    });
  });

  peer.on('error', async (err) => {
    clearTimeout(peerTimeout);
    if (err.type === 'unavailable-id') {
      console.warn('⚠️ ID de host em uso. Verificando se o par já assumiu ou se é resíduo...');
      try {
        const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomName)}/status`), {
          signal: AbortSignal.timeout(4000)
        });
        const status = await res.json();
        if (status.hostOnline) {
          console.log('✅ Host ativo confirmado na sala. Conectando como Convidado (Guest)...');
          initializePeerAsGuest();
          return;
        }
      } catch (e) {}

      // Se não tem host ativo confirmado, é apenas resíduo de reload. Tenta novamente em 800ms
      setTimeout(() => {
        if (!dataConn || !dataConn.open) {
          initializePeerAsHost();
        }
      }, 800);
      return;
    }

    console.error('Erro PeerJS Host:', err);
    disconnectAndReset();
    showLoginError('Erro ao se registrar no servidor de sinalização: ' + (err.type || 'erro'));
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = '1';
    stopLocalMediaTracks();
  });
}

/**
 * Promove o Guest a novo Dono da sala caso o Host anterior saia ou caia.
 * Isso garante que a sala nunca fique órfã e a reconexão pós-F5 seja instantânea!
 */
function promoteGuestToHost() {
  if (promotionTimer) clearTimeout(promotionTimer);

  updateP2PConnectionStatus('waiting', 'Meu amor desconectou. Assumindo a sala... 💖');
  showToast('Meu amor desconectou. Assumindo como anfitrião... 💕', 'info');

  promotionTimer = setTimeout(async () => {
    try {
      const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomName)}/status`), {
        signal: AbortSignal.timeout(4000)
      });
      const status = await res.json();
      if (status.hostOnline) {
        console.log('🔄 Outro host já está ativo. Reconectando como Convidado...');
        initializePeerAsGuest();
        return;
      }
    } catch (e) {}

    console.log('👑 Promovendo este cliente a NOVO HOST da sala...');

    if (guestReconnectInterval) {
      clearInterval(guestReconnectInterval);
      guestReconnectInterval = null;
    }

    if (dataConn) { try { dataConn.close(); } catch (e) {} dataConn = null; }
    if (mediaPC) { try { mediaPC.close(); } catch (e) {} mediaPC = null; }
    if (screenPC) { try { screenPC.close(); } catch (e) {} screenPC = null; }

    initializePeerAsHost();
  }, 1200);
}

function handleIncomingDataConnection(conn) {
  conn.on('open', () => {
    conn.on('data', async (data) => {
      if (data.type === 'auth') {
        guestIp = data.ip; // Salva o IP real do guest enviado no handshake
        console.log("✅ Conexão autorizada com sucesso! IP do Guest:", guestIp);

        // Identificar perfil do visitante conectado
        if (data.profile) {
          applyRemoteProfile(data.profile);
        }

        // Se já existia uma conexão anterior na memória, encerra graciosamente sem travar
        if (dataConn && dataConn !== conn) {
          try { dataConn.close(); } catch (e) {}
        }
        if (mediaPC) {
          try { mediaPC.close(); } catch (e) {}
          mediaPC = null;
        }
        if (screenPC) {
          try { screenPC.close(); } catch (e) {}
          screenPC = null;
        }

        dataConn = conn;
        dataConn.send({ 
          type: 'auth-success',
          profile: getMyUserProfile(),
          isScreenSharing: isScreenSharing,
          qualityPreset: currentQualityPreset.id
        });
        updateP2PConnectionStatus('connecting', 'Conectando com meu amor...');
        setupDataConnectionListeners(dataConn);

        // Se o Host já estiver transmitindo a tela, re-oferece a transmissão automaticamente para quem reconectou!
        if (isScreenSharing && screenStream && screenStream.active) {
          console.log("🖥️ Host já está transmitindo tela. Reenviando oferta de tela após reconexão...");
          setTimeout(async () => {
            try {
              await startScreenOffer(screenStream);
            } catch (err) {
              console.error("Erro ao re-oferecer tela do Host:", err);
            }
          }, 800);
        }

        sendStateUpdate();
      }
    });
  });
}

function initializePeerAsGuest() {
  if (promotionTimer) {
    clearTimeout(promotionTimer);
    promotionTimer = null;
  }

  // Sufixo aleatório no guest evita colisões de ID de reload
  const guestSuffix = Math.random().toString(36).substring(2, 6);
  const guestId = `${roomName}-guest-${guestSuffix}`;

  if (peer) {
    try { peer.destroy(); } catch (e) {}
    peer = null;
  }

  let peerTimeout = setTimeout(() => {
    if (!peer || !peer.open) {
      console.warn('⚠️ Timeout ao conectar ao servidor de sinalização PeerJS (Guest).');
      showLoginError('Tempo esgotado ao conectar ao anfitrião. Verifique se o parceiro está com o NCord aberto e o ZeroTier ativo.');
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
      stopLocalMediaTracks();
    }
  }, 10000);

  peer = new Peer(guestId, {
    host: currentServerHost,
    port: currentServerPort,
    path: '/peerjs',
    secure: false,
    config: ICE_CONFIG
  });

  peer.on('open', (id) => {
    clearTimeout(peerTimeout);
    peerRole = "guest";
    transitionToRoom();
    updateP2PConnectionStatus('connecting', 'Conectando ao anfitrião...');

    connectGuestToHost();
  });

  peer.on('error', (err) => {
    clearTimeout(peerTimeout);
    if (err.type === 'unavailable-id') {
      console.warn('⚠️ ID de guest em uso. Gerando novo identificador...');
      setTimeout(() => {
        if (!dataConn || !dataConn.open) {
          initializePeerAsGuest();
        }
      }, 500);
      return;
    }

    // Host ainda não registrou ou caiu momentaneamente — verifica promoção a Host
    if (err.type === 'peer-unavailable') {
      console.warn('⚠️ Host não encontrado ainda. Verificando promoção a Host em 1.5s...');
      updateP2PConnectionStatus('waiting', 'Procurando meu amor... 💖');
      setTimeout(async () => {
        try {
          const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomName)}/status`), {
            signal: AbortSignal.timeout(4000)
          });
          const status = await res.json();
          if (!status.hostOnline) {
            console.log('👑 Nenhum host ativo na sala. Assumindo como Host!');
            promoteGuestToHost();
            return;
          }
        } catch (e) {}

        if (!dataConn || !dataConn.open) {
          connectGuestToHost();
        }
      }, 1500);
      return;
    }

    console.error('Erro PeerJS Guest:', err);
    disconnectAndReset();
    showLoginError('Não foi possível conectar ao anfitrião: ' + (err.type || 'falha de rede'));
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = '1';
    stopLocalMediaTracks();
  });
}

function connectGuestToHost() {
  if (dataConn) {
    try { dataConn.close(); } catch (e) {}
    dataConn = null;
  }

  dataConn = peer.connect(`${roomName}-host`, { reliable: true });

  dataConn.on('open', () => {
    dataConn.send({
      type: 'auth',
      pin: roomPin,
      ip: myIp,
      profile: getMyUserProfile(),
      isScreenSharing: isScreenSharing
    });
  });

  dataConn.on('error', (err) => {
    console.error('Erro na DataConnection do Guest:', err);
    // Tentar reconectar se a conexão de dados falhou
    if (peerRole === 'guest') {
      setTimeout(() => {
        if (!dataConn || !dataConn.open) {
          console.log('🔄 Reconectando DataConnection do Guest ao Host...');
          connectGuestToHost();
        }
      }, 1500);
    }
  });

  setupDataConnectionListeners(dataConn);
}

// ==========================================
// WEBRTC NATIVO - CONEXÃO DE MÍDIA (WEBCAM/MIC)
// ==========================================

/**
 * Cria a RTCPeerConnection nativa para webcam e microfone.
 * Adiciona as faixas locais e configura handlers de ICE e track remoto.
 */
function createMediaPeerConnection() {
  if (mediaPC) {
    try { mediaPC.close(); } catch (e) {}
    mediaPC = null;
  }
  mediaPC = new RTCPeerConnection(ICE_CONFIG);
  pendingMediaICE = [];

  // Adicionar faixas locais ao PeerConnection
  const audioTrack = (!isAudioMuted && realMicTrack) ? realMicTrack : dummyAudioTrack;
  const videoTrack = (!isVideoOff && realCameraTrack) ? realCameraTrack : dummyVideoTrack;

  if (audioTrack) {
    audioSender = mediaPC.addTrack(audioTrack, localStream);
  }
  if (videoTrack) {
    videoSender = mediaPC.addTrack(videoTrack, localStream);
  }

  // Forçar preferência de codecs de alta fidelidade (AV1/VP9/H264) nos transceivers
  optimizeCodecPreferences(mediaPC);

  // Trocar candidatos ICE via DataConnection
  mediaPC.onicecandidate = (e) => {
    if (e.candidate && dataConn && dataConn.open) {
      dataConn.send({ type: 'media-ice', candidate: e.candidate.toJSON() });
    }
  };

  // Receber faixas remotas (webcam/mic do par)
  mediaPC.ontrack = (e) => {
    // Configurar playout delay mínimo para zero latência (Chrome/Edge/Brave)
    if (e.receiver && 'playoutDelayHint' in e.receiver) {
      e.receiver.playoutDelayHint = 0;
    }
    if (e.streams && e.streams[0]) {
      setupRemoteMediaStream(e.streams[0]);
    }
  };

  // Monitorar estado da conexão ICE
  mediaPC.oniceconnectionstatechange = () => {
    const state = mediaPC.iceConnectionState;
    console.log(`📡 Media ICE state: ${state}`);

    if (state === 'connected' || state === 'completed') {
      updateP2PConnectionStatus('connected', 'Conectados! Te amo! 💕');
      // Aplicar configurações de bitrate após conexão estável
      configureSenderParams(mediaPC, false);
      // Iniciar monitoramento de qualidade adaptativa
      startAdaptiveBitrateMonitor();
    } else if (state === 'disconnected') {
      updateP2PConnectionStatus('connecting', 'Reconectando...');
    } else if (state === 'failed') {
      updateP2PConnectionStatus('connecting', 'Conexão falhou. Tentando novamente...');
      // Tentar restart ICE
      try { mediaPC.restartIce(); } catch (e) { /* ignore */ }
    }
  };

  return mediaPC;
}

/**
 * Guest inicia a oferta de mídia WebRTC com bitrate turbo.
 */
async function startMediaOffer() {
  createMediaPeerConnection();

  const offer = await mediaPC.createOffer();
  const boostedSdp = boostSdpBitrate(offer.sdp, false);
  await mediaPC.setLocalDescription({ type: 'offer', sdp: boostedSdp });

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'media-offer', sdp: boostedSdp });
  }
}

/**
 * Host recebe a oferta de mídia do Guest.
 */
async function handleMediaOffer(sdp) {
  createMediaPeerConnection();

  const fixedSdp = fixMDNS(boostSdpBitrate(sdp, false));
  await mediaPC.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: fixedSdp }));

  // Aplicar preferência de codecs nos transceivers
  optimizeCodecPreferences(mediaPC);

  // Processar candidatos ICE que chegaram antes do remote description
  for (const c of pendingMediaICE) {
    try { await mediaPC.addIceCandidate(c); } catch (e) { /* ignore */ }
  }
  pendingMediaICE = [];

  const answer = await mediaPC.createAnswer();
  const boostedAnswer = boostSdpBitrate(answer.sdp, false);
  await mediaPC.setLocalDescription({ type: 'answer', sdp: boostedAnswer });

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'media-answer', sdp: boostedAnswer });
  }
}

/**
 * Guest recebe a resposta de mídia do Host.
 */
async function handleMediaAnswer(sdp) {
  if (!mediaPC) return;

  const fixedSdp = fixMDNS(boostSdpBitrate(sdp, false));
  await mediaPC.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: fixedSdp }));

  // Processar candidatos ICE pendentes
  for (const c of pendingMediaICE) {
    try { await mediaPC.addIceCandidate(c); } catch (e) { /* ignore */ }
  }
  pendingMediaICE = [];
}

/**
 * Processa candidato ICE recebido do par para mídia.
 */
async function handleMediaICE(candidateData) {
  if (!candidateData) return;

  // Corrigir mDNS no candidato
  let candidateStr = candidateData.candidate || '';
  candidateStr = fixMDNS(candidateStr);

  const candidate = new RTCIceCandidate({
    ...candidateData,
    candidate: candidateStr
  });

  if (mediaPC && mediaPC.remoteDescription && mediaPC.remoteDescription.type) {
    try { await mediaPC.addIceCandidate(candidate); } catch (e) { /* ignore */ }
  } else {
    pendingMediaICE.push(candidate);
  }
}

// ==========================================
// WEBRTC NATIVO - CONEXÃO DE TELA
// ==========================================

/**
 * Inicia oferta de compartilhamento de tela com máxima fidelidade (Sem Limites).
 * - Codecs de última geração (AV1 / VP9 / H264)
 * - 35 Mbps de bitrate nativo
 * - degradationPreference: maintain-resolution (sem pixelado/compressão)
 * - contentHint: detail (foco em máxima nitidez)
 */
async function startScreenOffer(stream) {
  if (screenPC) {
    try { screenPC.close(); } catch (e) {}
    screenPC = null;
  }
  screenPC = new RTCPeerConnection(ICE_CONFIG);
  pendingScreenICE = [];

  // Marcar faixas de vídeo conforme o preset para otimização do encoder
  stream.getVideoTracks().forEach(track => {
    track.contentHint = currentQualityPreset.contentHint;
  });

  // Adicionar todas as faixas da tela (vídeo + áudio se disponível)
  stream.getTracks().forEach(track => {
    screenPC.addTrack(track, stream);
  });

  // Codecs modernos de ponta
  optimizeCodecPreferences(screenPC);

  // Trocar candidatos ICE via DataConnection
  screenPC.onicecandidate = (e) => {
    if (e.candidate && dataConn && dataConn.open) {
      dataConn.send({ type: 'screen-ice', candidate: e.candidate.toJSON() });
    }
  };

  // Aplicar bitrate sem limites quando a conexão estiver estável
  screenPC.oniceconnectionstatechange = () => {
    const state = screenPC.iceConnectionState;
    console.log(`🖥️ Screen ICE state: ${state}`);

    if (state === 'connected' || state === 'completed') {
      configureSenderParams(screenPC, true);
    }
  };

  const offer = await screenPC.createOffer();
  const boostedSdp = boostSdpBitrate(offer.sdp, true);
  await screenPC.setLocalDescription({ type: 'offer', sdp: boostedSdp });

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'screen-offer', sdp: boostedSdp });
  }
}

/**
 * Recebe oferta de compartilhamento de tela do par.
 */
async function handleScreenOffer(sdp) {
  if (screenPC) {
    try { screenPC.close(); } catch (e) {}
    screenPC = null;
  }
  screenPC = new RTCPeerConnection(ICE_CONFIG);
  pendingScreenICE = [];

  // Trocar candidatos ICE via DataConnection
  screenPC.onicecandidate = (e) => {
    if (e.candidate && dataConn && dataConn.open) {
      dataConn.send({ type: 'screen-ice', candidate: e.candidate.toJSON() });
    }
  };

  // Receber a tela remota
  screenPC.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
      showRemoteScreenShare(e.streams[0]);
    }
  };

  const fixedSdp = fixMDNS(boostSdpBitrate(sdp, true));
  await screenPC.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: fixedSdp }));

  // Processar candidatos ICE pendentes
  for (const c of pendingScreenICE) {
    try { await screenPC.addIceCandidate(c); } catch (e) { /* ignore */ }
  }
  pendingScreenICE = [];

  const answer = await screenPC.createAnswer();
  const boostedAnswer = boostSdpBitrate(answer.sdp, true);
  await screenPC.setLocalDescription({ type: 'answer', sdp: boostedAnswer });

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'screen-answer', sdp: boostedAnswer });
  }
}

/**
 * Recebe resposta de compartilhamento de tela do par.
 */
async function handleScreenAnswer(sdp) {
  if (!screenPC) return;

  const fixedSdp = fixMDNS(boostSdpBitrate(sdp, true));
  await screenPC.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: fixedSdp }));

  // Processar candidatos ICE pendentes
  for (const c of pendingScreenICE) {
    try { await screenPC.addIceCandidate(c); } catch (e) { /* ignore */ }
  }
  pendingScreenICE = [];
}

/**
 * Processa candidato ICE recebido do par para tela.
 */
async function handleScreenICE(candidateData) {
  if (!candidateData) return;

  let candidateStr = candidateData.candidate || '';
  candidateStr = fixMDNS(candidateStr);

  const candidate = new RTCIceCandidate({
    ...candidateData,
    candidate: candidateStr
  });

  if (screenPC && screenPC.remoteDescription && screenPC.remoteDescription.type) {
    try { await screenPC.addIceCandidate(candidate); } catch (e) { /* ignore */ }
  } else {
    pendingScreenICE.push(candidate);
  }
}

// ==========================================
// HANDLER DE MENSAGENS DE SINALIZAÇÃO
// ==========================================
function setupDataConnectionListeners(conn) {
  conn.on('data', async (data) => {
    // --- Autenticação ---
    if (data.type === 'auth-success') {
      if (data.profile) {
        applyRemoteProfile(data.profile);
      }
      if (guestReconnectInterval) {
        clearInterval(guestReconnectInterval);
        guestReconnectInterval = null;
      }
      showToast('Acesso aceito! Conectando mídia... 💕', 'info');
      updateP2PConnectionStatus('connecting', 'Abrindo nosso cantinho...');

      // Guest inicia a oferta de mídia WebRTC nativo
      await startMediaOffer();
      sendStateUpdate();

      // Se o Guest já estiver compartilhando tela, re-oferece a transmissão de tela ao Host!
      if (isScreenSharing && screenStream && screenStream.active) {
        console.log("🖥️ Guest já está transmitindo tela. Reenviando oferta de tela ao Host...");
        setTimeout(async () => {
          try {
            await startScreenOffer(screenStream);
          } catch (err) {
            console.error("Erro ao re-oferecer tela do Guest:", err);
          }
        }, 800);
      } else if (data.isScreenSharing) {
        // Host está compartilhando tela! Solicita retransmissão se não receber em 1.2s
        console.log("🖥️ Host avisou que está transmitindo tela. Aguardando oferta...");
        setTimeout(() => {
          if (!screenVideo.srcObject && dataConn && dataConn.open) {
            console.log("📡 Solicitando re-oferta de tela ao Host...");
            dataConn.send({ type: 'request-screen-reoffer' });
          }
        }, 1200);
      }
    }

    if (data.type === 'auth-failed') {
      showLoginError('Erro: Senha secreta incorreta.');
      localStorage.removeItem('lovechat_pin');
      disconnectAndReset();
    }

    if (data.type === 'auth-rejected') {
      showLoginError('Acesso recusado: ' + (data.reason || 'O cantinho está ocupado.'));
      localStorage.removeItem('lovechat_pin');
      disconnectAndReset();
    }

    // --- Sinalização WebRTC Nativo (Mídia) ---
    if (data.type === 'media-offer') {
      await handleMediaOffer(data.sdp);
    }
    if (data.type === 'media-answer') {
      await handleMediaAnswer(data.sdp);
    }
    if (data.type === 'media-ice') {
      await handleMediaICE(data.candidate);
    }

    // --- Sinalização WebRTC Nativo (Tela) ---
    if (data.type === 'screen-offer') {
      await handleScreenOffer(data.sdp);
    }
    if (data.type === 'screen-answer') {
      await handleScreenAnswer(data.sdp);
    }
    if (data.type === 'screen-ice') {
      await handleScreenICE(data.candidate);
    }
    if (data.type === 'request-screen-reoffer') {
      console.log("📨 Pedido de re-oferta de tela recebido do par!");
      if (isScreenSharing && screenStream && screenStream.active) {
        showToast('Parceiro reconectou! Retomando transmissão de tela... 🎬', 'info');
        await startScreenOffer(screenStream);
      }
    }

    // --- Mensagens de Estado ---
    if (data.type === 'remote-state') {
      updateRemoteIndicators(data.audio, data.video);
      // Se o par está transmitindo a tela, mas nós ainda não a temos ativa
      if (data.isScreenSharing && !screenVideo.srcObject && !isScreenSharing) {
        console.log("📡 Par está transmitindo tela. Solicitando re-oferta...");
        if (dataConn && dataConn.open) {
          dataConn.send({ type: 'request-screen-reoffer' });
        }
      }
    }

    if (data.type === 'profile-update') {
      if (data.profile) {
        applyRemoteProfile(data.profile);
      }
    }

    if (data.type === 'name-change') {
      remoteNameLbl.textContent = data.name;
      document.getElementById('remote-video-name-lbl').textContent = data.name;
    }

    if (data.type === 'notes-updated') {
      renderNotes(data.notes);
    }

    if (data.type === 'avatar-change') {
      updateRemoteAvatarUI(data.avatar);
    }

    if (data.type === 'screen-stopped') {
      hideRemoteScreenShare();
    }

    if (data.type === 'quality-changed') {
      setTransmissionQuality(data.presetKey, false);
    }

    if (data.type === 'peer-reloading') {
      console.log('🔄 O parceiro está recarregando a página...');
      showToast('Meu amor está recarregando a página... 🔄', 'info');
      handleRemoteDisconnect();
    }

    if (data.type === 'peer-left') {
      handleRemoteDisconnect();
    }
  });

  conn.on('close', () => {
    handleRemoteDisconnect();
  });

  conn.on('error', (err) => {
    console.error('Erro na DataConnection:', err);
    handleRemoteDisconnect();
  });
}

// ==========================================
// CONFIGURAÇÃO DO STREAM REMOTO
// ==========================================
function setupRemoteMediaStream(remoteStream) {
  remoteVideo.srcObject = remoteStream;
  remoteVideo.play().catch(e => console.error(e));

  // Extrair e reproduzir áudio do microfone remoto em um elemento <audio> separado.
  // Evita que o navegador silencie a chamada se o elemento <video> principal estiver oculto/coberto.
  const audioTrack = remoteStream.getAudioTracks()[0];
  if (audioTrack) {
    const oldAudio = document.getElementById('remote-mic-audio');
    if (oldAudio) oldAudio.remove();

    const audioEl = document.createElement('audio');
    audioEl.id = 'remote-mic-audio';
    audioEl.srcObject = new MediaStream([audioTrack]);
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
    console.log("🔊 Áudio do microfone remoto conectado a um elemento <audio> dedicado.");
  }

  // Por padrão, a câmera remota inicia oculta e com o avatar ativo
  remoteVideo.classList.add('hide');
  remoteAvatar.classList.remove('hide');

  // Customizar cor do dot na sidebar
  remoteStatusDot.classList.remove('offline');
  if (peerRole === 'host') {
    remoteStatusDot.style.backgroundColor = 'var(--accent-pink)';
    remoteStatusDot.style.boxShadow = '0 0 8px var(--accent-pink)';
  } else {
    remoteStatusDot.style.backgroundColor = 'var(--accent-purple)';
    remoteStatusDot.style.boxShadow = '0 0 8px var(--accent-purple)';
  }

  remoteNameLbl.textContent = peerRole === 'host' ? 'Meu Amor 💖' : 'Meu Amor 💜';
  document.getElementById('remote-video-name-lbl').textContent = peerRole === 'host' ? 'Meu Amor 💖' : 'Meu Amor 💜';
  remoteStatusIcons.classList.remove('hide');

  updateP2PConnectionStatus('connected', 'Conectados! Te amo! 💕');

  // Atualizar layout de vídeo para incluir o stream remoto
  updateVideoLayout();

  // Iniciar monitoramento de voz ativa
  startVolumeMonitoring(remoteStream, 'remote-video-card', false);
  startVolumeMonitoring(localStream, 'local-video-card', true);

  // Tocar som de entrada estilo Discord
  playDiscordSound('join');
}

function sendStateUpdate() {
  if (dataConn && dataConn.open) {
    dataConn.send({
      type: 'remote-state',
      audio: !isAudioMuted,
      video: !isVideoOff,
      isScreenSharing: isScreenSharing
    });
  }
}

function updateRemoteIndicators(audioEnabled, videoEnabled) {
  if (audioEnabled) {
    statusRemoteMicWrapper.innerHTML = '<i data-lucide="mic"></i>';
    overlayRemoteMic.classList.add('hide');
  } else {
    statusRemoteMicWrapper.innerHTML = '<i data-lucide="mic-off" class="muted"></i>';
    overlayRemoteMic.classList.remove('hide');
  }

  if (videoEnabled) {
    statusRemoteVideoWrapper.innerHTML = '<i data-lucide="video"></i>';
    overlayRemoteVideo.classList.add('hide');
    remoteAvatar.classList.add('hide');
    remoteVideo.classList.remove('hide');
  } else {
    statusRemoteVideoWrapper.innerHTML = '<i data-lucide="video-off" class="muted"></i>';
    overlayRemoteVideo.classList.remove('hide');
    remoteAvatar.classList.remove('hide');
    remoteVideo.classList.add('hide');
  }
  lucide.createIcons();
}

// ==========================================
// CONTROLE DE MÍDIA - ÁUDIO & WEBCAM
// ==========================================
async function toggleMuteMicrophone() {
  if (isAudioMuted) {
    if (!realMicTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        realMicTrack = stream.getAudioTracks()[0];
      } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        showToast('Erro ao acessar microfone.', 'info');
        return;
      }
    }

    realMicTrack.enabled = true;
    isAudioMuted = false;

    // Salvar estado para manter no reload
    localStorage.setItem('lovechat_mic_muted', 'false');

    // Substituir faixa de áudio no sender WebRTC nativo
    if (audioSender && realMicTrack) {
      await audioSender.replaceTrack(realMicTrack);
    }

    if (localStream) {
      const tracks = localStream.getAudioTracks();
      if (tracks.length > 0) localStream.removeTrack(tracks[0]);
      localStream.addTrack(realMicTrack);
    }

    btnMic.classList.remove('muted');
    btnMic.innerHTML = '<i data-lucide="mic"></i>';
    overlayLocalMic.classList.add('hide');
    statusLocalMicWrapper.innerHTML = '<i data-lucide="mic"></i>';

    startVolumeMonitoring(localStream, 'local-video-card', true);

    // Tocar som de desmutar estilo Discord
    playDiscordSound('unmute');

  } else {
    isAudioMuted = true;
    if (realMicTrack) {
      realMicTrack.enabled = false;
    }

    // Salvar estado para manter no reload
    localStorage.setItem('lovechat_mic_muted', 'true');

    btnMic.classList.add('muted');
    btnMic.innerHTML = '<i data-lucide="mic-off"></i>';
    overlayLocalMic.classList.remove('hide');
    statusLocalMicWrapper.innerHTML = '<i data-lucide="mic-off" class="muted"></i>';

    stopVolumeMonitoring(true);

    // Tocar som de mutar estilo Discord
    playDiscordSound('mute');
  }
  lucide.createIcons();
  sendStateUpdate();
}

async function toggleVideoWebcam() {
  if (isVideoOff) {
    if (!realCameraTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          }
        });
        realCameraTrack = stream.getVideoTracks()[0];
      } catch (err) {
        console.error('Erro ao acessar câmera:', err);
        showToast('Erro ao acessar câmera.', 'info');
        return;
      }
    }

    realCameraTrack.enabled = true;
    isVideoOff = false;

    // Salvar estado para manter no reload
    localStorage.setItem('lovechat_camera_active', 'true');

    // Substituir faixa de vídeo no sender WebRTC nativo
    if (videoSender && realCameraTrack) {
      await videoSender.replaceTrack(realCameraTrack);
    }

    if (localStream) {
      const tracks = localStream.getVideoTracks();
      if (tracks.length > 0) localStream.removeTrack(tracks[0]);
      localStream.addTrack(realCameraTrack);
    }

    localVideo.srcObject = localStream;
    localVideo.classList.remove('hide');
    localVideo.play().catch(e => console.error(e));

    btnVideo.classList.remove('muted');
    btnVideo.innerHTML = '<i data-lucide="video"></i>';
    overlayLocalVideo.classList.add('hide');
    localAvatar.classList.add('hide');
    statusLocalVideoWrapper.innerHTML = '<i data-lucide="video"></i>';

  } else {
    isVideoOff = true;
    if (realCameraTrack) {
      realCameraTrack.stop();
      realCameraTrack = null;
    }

    // Salvar estado para manter no reload
    localStorage.setItem('lovechat_camera_active', 'false');

    dummyVideoTrack = createDummyVideoTrack();

    // Substituir faixa de vídeo por dummy no sender WebRTC nativo
    if (videoSender && dummyVideoTrack) {
      await videoSender.replaceTrack(dummyVideoTrack);
    }

    if (localStream) {
      const tracks = localStream.getVideoTracks();
      if (tracks.length > 0) localStream.removeTrack(tracks[0]);
      localStream.addTrack(dummyVideoTrack);
    }

    localVideo.srcObject = null;
    localVideo.classList.add('hide');

    btnVideo.classList.add('muted');
    btnVideo.innerHTML = '<i data-lucide="video-off"></i>';
    overlayLocalVideo.classList.remove('hide');
    localAvatar.classList.remove('hide');
    statusLocalVideoWrapper.innerHTML = '<i data-lucide="video-off" class="muted"></i>';
  }
  lucide.createIcons();
  sendStateUpdate();
}

btnMic.addEventListener('click', toggleMuteMicrophone);
btnVideo.addEventListener('click', toggleVideoWebcam);

// ==========================================
// CAPTURA EXCLUSIVA DE ÁUDIO DE JANELA (AUDIO WORKLET + WASAPI)
// ==========================================
let processAudioContext = null;
let processAudioWorkletNode = null;
let processAudioDestination = null;
let lastSelectedSourceResult = null;

async function setupProcessAudioTrack() {
  cleanupProcessAudio();

  try {
    processAudioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000
    });

    // Registrar processador AudioWorklet de baixa latência
    await processAudioContext.audioWorklet.addModule('audio-stream-processor.js');

    processAudioWorkletNode = new AudioWorkletNode(processAudioContext, 'window-audio-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    processAudioDestination = processAudioContext.createMediaStreamDestination();
    processAudioWorkletNode.connect(processAudioDestination);

    if (window.electronAPI && window.electronAPI.onProcessAudioChunk) {
      window.electronAPI.onProcessAudioChunk((chunk) => {
        if (processAudioWorkletNode && processAudioWorkletNode.port) {
          const uint8 = new Uint8Array(chunk);
          const bufferCopy = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
          processAudioWorkletNode.port.postMessage({ type: 'pcm', buffer: bufferCopy }, [bufferCopy]);
        }
      });
    }

    const audioTracks = processAudioDestination.stream.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      console.log('🎧 [NCord] Faixa de áudio exclusivo de janela criada com sucesso via AudioWorklet!');
      return audioTracks[0];
    }
  } catch (err) {
    console.error('❌ [NCord] Erro ao configurar AudioWorklet para áudio exclusivo de janela:', err);
    cleanupProcessAudio();
  }
  return null;
}

function cleanupProcessAudio() {
  if (window.electronAPI && window.electronAPI.offProcessAudioChunk) {
    window.electronAPI.offProcessAudioChunk();
  }
  if (window.electronAPI && window.electronAPI.stopProcessAudio) {
    window.electronAPI.stopProcessAudio().catch(() => {});
  }
  if (processAudioWorkletNode) {
    try {
      processAudioWorkletNode.port.postMessage({ type: 'clear' });
      processAudioWorkletNode.disconnect();
    } catch (e) {}
    processAudioWorkletNode = null;
  }
  if (processAudioDestination) {
    try { processAudioDestination.disconnect(); } catch (e) {}
    processAudioDestination = null;
  }
  if (processAudioContext) {
    try {
      if (processAudioContext.state !== 'closed') {
        processAudioContext.close();
      }
    } catch (e) {}
    processAudioContext = null;
  }
}

// ==========================================
// COMPARTILHAMENTO DE TELA SIMULTÂNEO
// ==========================================
btnScreen.addEventListener('click', async () => {
  if (!isScreenSharing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast('Compartilhamento de tela não é suportado neste ambiente.', 'info');
      return;
    }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 },
          cursor: 'always'
        },
        audio: true
      });

      // Se a fonte selecionada for uma janela com áudio de processo exclusivo via WASAPI
      if (lastSelectedSourceResult && lastSelectedSourceResult.hasProcessAudio) {
        console.log('🎧 [NCord] Injetando faixa de áudio exclusivo de janela no screenStream...');
        const isolatedAudioTrack = await setupProcessAudioTrack();
        if (isolatedAudioTrack) {
          // Remover qualquer faixa padrão silenciosa ou redundante
          screenStream.getAudioTracks().forEach((t) => {
            try { t.stop(); } catch (e) {}
            screenStream.removeTrack(t);
          });
          screenStream.addTrack(isolatedAudioTrack);
        }
      }

      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = currentQualityPreset.contentHint;
        videoTrack.onended = () => {
          stopScreenSharing();
        };
      }

      isScreenSharing = true;
      btnScreen.classList.add('active');

      showLocalScreenShare(screenStream);

      // Iniciar oferta de tela via WebRTC nativo
      if (dataConn && dataConn.open) {
        await startScreenOffer(screenStream);
      }

      const hasIsolated = lastSelectedSourceResult && lastSelectedSourceResult.hasProcessAudio;
      showToast(hasIsolated ? 'Compartilhando janela com áudio exclusivo! 🎧💻' : 'Compartilhamento de tela ativo! 💻', 'info');

    } catch (err) {
      console.error('Falha ao compartilhar tela:', err);
      cleanupProcessAudio();
      lastSelectedSourceResult = null;
      isScreenSharing = false;
      btnScreen.classList.remove('active');
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        showToast('Compartilhamento de tela cancelado.', 'info');
      } else {
        showToast('Aviso de transmissão: ' + (err.message || 'cancelado'), 'info');
      }
      if (window.electronAPI && window.electronAPI.cancelDesktopSource) {
        window.electronAPI.cancelDesktopSource();
      }
    }
  } else {
    stopScreenSharing();
  }
});

function stopScreenSharing() {
  if (!isScreenSharing && !screenStream) return;

  cleanupProcessAudio();
  lastSelectedSourceResult = null;

  if (screenStream) {
    screenStream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) {}
    });
    screenStream = null;
  }

  if (screenPC) {
    try { screenPC.close(); } catch (e) {}
    screenPC = null;
  }

  if (dataConn && dataConn.open) {
    try { dataConn.send({ type: 'screen-stopped' }); } catch (e) {}
  }

  isScreenSharing = false;
  btnScreen.classList.remove('active');
  hideLocalScreenShare();
  showToast('Compartilhamento de tela encerrado.', 'info');
}

function updateSidebarStreamState() {
  const isLocalActive = isScreenSharing && screenStream;
  const isRemoteActive = screenVideo.srcObject && !isLocalActive;

  if (localLiveBadge) {
    if (isLocalActive) {
      localLiveBadge.classList.remove('hide');
    } else {
      localLiveBadge.classList.add('hide');
    }
  }

  if (remoteLiveBadge) {
    if (isRemoteActive) {
      remoteLiveBadge.classList.remove('hide');
    } else {
      remoteLiveBadge.classList.add('hide');
    }
  }

  if (sidebarStreamCard) {
    if (isLocalActive || isRemoteActive) {
      sidebarStreamCard.classList.remove('hide');
      if (sidebarStreamOwner) {
        sidebarStreamOwner.textContent = isLocalActive ? 'Você está transmitindo' : 'Seu amor está transmitindo';
      }
      if (sidebarStreamQuality) {
        sidebarStreamQuality.textContent = (currentQualityPreset.badge && currentQualityPreset.badge.split(' • ')[0]) || '35 Mbps';
      }
    } else {
      sidebarStreamCard.classList.add('hide');
    }
  }
}

function showLocalScreenShare(stream) {
  screenVideo.srcObject = stream;
  screenVideo.play().catch(e => console.error(e));
  screenShareCard.classList.remove('hide');
  document.getElementById('screen-owner-lbl').textContent = 'Sua Tela';
  if (screenQualityBadge) {
    screenQualityBadge.textContent = currentQualityPreset.badge;
  }
  // Auto-focar na tela compartilhada (comportamento Discord)
  focusedStreamId = 'screen';
  updateVideoLayout();
  updateSidebarStreamState();
}

function hideLocalScreenShare() {
  screenVideo.srcObject = null;
  screenShareCard.classList.add('hide');
  // Se estava em tela cheia da transmissão, sair
  if (typeof isScreenShareFullscreen === 'function' && isScreenShareFullscreen()) {
    if (document.exitFullscreen) document.exitFullscreen().catch(e => console.error(e));
  }
  // Voltar ao layout normal
  focusedStreamId = null;
  updateVideoLayout();
  updateSidebarStreamState();
}

function showRemoteScreenShare(stream) {
  screenVideo.srcObject = stream;
  screenVideo.play().catch(e => console.error(e));

  // Extrair e reproduzir áudio do compartilhamento de tela separadamente
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    const oldAudio = document.getElementById('remote-screen-audio');
    if (oldAudio) oldAudio.remove();

    const audioEl = document.createElement('audio');
    audioEl.id = 'remote-screen-audio';
    audioEl.srcObject = new MediaStream([audioTrack]);
    audioEl.autoplay = true;
    if (streamVolSlider) {
      audioEl.volume = parseFloat(streamVolSlider.value) || 1;
      audioEl.muted = (parseFloat(streamVolSlider.value) === 0);
    }
    document.body.appendChild(audioEl);
  }

  screenShareCard.classList.remove('hide');
  document.getElementById('screen-owner-lbl').textContent = 'Tela do Par';
  if (screenQualityBadge) {
    screenQualityBadge.textContent = currentQualityPreset.badge;
  }
  // Auto-focar na tela compartilhada (comportamento Discord)
  focusedStreamId = 'screen';
  updateVideoLayout();
  updateSidebarStreamState();
}

// Oculta tela remota
function hideRemoteScreenShare() {
  screenVideo.srcObject = null;

  // Remover reprodutor de áudio de tela
  const oldAudio = document.getElementById('remote-screen-audio');
  if (oldAudio) oldAudio.remove();

  if (screenPC) {
    screenPC.close();
    screenPC = null;
  }

  // Se estava em tela cheia da transmissão, sair
  if (typeof isScreenShareFullscreen === 'function' && isScreenShareFullscreen()) {
    if (document.exitFullscreen) document.exitFullscreen().catch(e => console.error(e));
  }

  screenShareCard.classList.add('hide');
  // Voltar ao layout normal
  focusedStreamId = null;
  updateVideoLayout();
  updateSidebarStreamState();
}

// ==========================================
// LAYOUT MANAGER - SISTEMA DINÂMICO DE VÍDEO
// ==========================================

/**
 * Gerenciador central de layout de vídeo.
 * Calcula o layout correto baseado nos streams ativos e no foco atual.
 * Aplica classes CSS para: layout-solo, layout-duo, layout-focus.
 */
function updateVideoLayout() {
  const visibleCards = [];

  // Tela compartilhada está visível?
  if (!screenShareCard.classList.contains('hide')) {
    visibleCards.push(screenShareCard);
  }

  // Câmera/Avatar local está visível?
  if (localVideoCard && !localVideoCard.classList.contains('hide')) {
    visibleCards.push(localVideoCard);
  }

  // Câmera/Avatar remoto está visível? (respeita avatar quando webcam desligada)
  if (remoteVideoCard && !remoteVideoCard.classList.contains('hide')) {
    visibleCards.push(remoteVideoCard);
  }

  const allCards = [screenShareCard, localVideoCard, remoteVideoCard];

  // Limpar todas as classes de layout dos cards
  allCards.forEach(card => {
    if (card) card.classList.remove('active-stream', 'focused', 'thumbnail');
  });

  // Limpar classes de layout do container
  videosGridElement.classList.remove('layout-solo', 'layout-duo', 'layout-focus');

  // Remover colunas legadas se existirem
  const screenCol = document.getElementById('screen-col');
  const camerasCol = document.getElementById('cameras-col');
  if (screenCol) {
    videosGridElement.appendChild(screenShareCard);
    videosGridElement.appendChild(localVideoCard);
    videosGridElement.appendChild(remoteVideoCard);
    screenCol.remove();
  }
  if (camerasCol) camerasCol.remove();

  const count = visibleCards.length;

  if (count === 0) return;

  if (count === 1) {
    // LAYOUT SOLO
    videosGridElement.classList.add('layout-solo');
    visibleCards[0].classList.add('active-stream');

  } else if (focusedStreamId) {
    // LAYOUT FOCUS (spotlight)
    videosGridElement.classList.add('layout-focus');

    const focusedCard = visibleCards.find(c => c.dataset.streamId === focusedStreamId);
    if (focusedCard) {
      focusedCard.classList.add('focused');
      visibleCards.filter(c => c !== focusedCard).forEach(c => c.classList.add('thumbnail'));
    } else {
      // Foco inválido (stream saiu), voltar ao duo
      focusedStreamId = null;
      videosGridElement.classList.remove('layout-focus');
      videosGridElement.classList.add('layout-duo');
      visibleCards.forEach(c => c.classList.add('active-stream'));
    }

  } else {
    // LAYOUT DUO (ou trio sem foco = duo equalizado)
    videosGridElement.classList.add('layout-duo');
    visibleCards.forEach(c => c.classList.add('active-stream'));
  }
}

// ==========================================
// SISTEMA DE FOCO (SPOTLIGHT) - CLICK HANDLERS
// ==========================================

/**
 * Clique simples em um video card → foca nele (spotlight).
 * Clique no card já focado → volta ao layout equilibrado (duo/trio).
 * Duplo clique → fullscreen nativo do navegador.
 */
function setupVideoCardClickHandlers() {
  const cards = document.querySelectorAll('.video-card[data-stream-id]');

  cards.forEach(card => {
    let clickTimer = null;

    card.addEventListener('click', (e) => {
      // Evitar que clique duplo dispare 2 simples
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        return; // será tratado pelo dblclick
      }

      clickTimer = setTimeout(() => {
        clickTimer = null;
        const streamId = card.dataset.streamId;

        if (focusedStreamId === streamId) {
          // Já está focado → desfoca (volta ao duo/trio)
          focusedStreamId = null;
        } else {
          // Foca neste stream
          focusedStreamId = streamId;
        }
        updateVideoLayout();
      }, 250);
    });

    card.addEventListener('dblclick', () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      // Fullscreen nativo
      if (!document.fullscreenElement) {
        card.requestFullscreen()
          .then(() => showToast('Duplo clique para sair da tela cheia 📺', 'info'))
          .catch(err => console.error('Erro ao abrir tela cheia do card:', err));
      } else {
        document.exitFullscreen();
      }
    });
  });
}

// Inicializar click handlers ao carregar a página
setupVideoCardClickHandlers();

// ==========================================
// INDICADOR DE FALA ATIVA (WEB AUDIO API)
// ==========================================
function startVolumeMonitoring(stream, cardId, isLocal) {
  stopVolumeMonitoring(isLocal);

  if (!stream || stream.getAudioTracks().length === 0) return;

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const videoCard = document.getElementById(cardId);

    const intervalId = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Se a intensidade sonora passar do limite, destaca o painel
      if (average > 18) {
        if (isLocal && isAudioMuted) {
          videoCard.classList.remove('speaking');
        } else {
          videoCard.classList.add('speaking');
        }
      } else {
        videoCard.classList.remove('speaking');
      }
    }, 100);

    if (isLocal) {
      localAudioContext = audioCtx;
      localAnalyser = analyser;
      localInterval = intervalId;
    } else {
      remoteAudioContext = audioCtx;
      remoteAnalyser = analyser;
      remoteInterval = intervalId;
    }

  } catch (e) {
    console.error('Falha ao monitorar volume de áudio:', e);
  }
}

function stopVolumeMonitoring(isLocal) {
  if (isLocal) {
    if (localInterval) clearInterval(localInterval);
    if (localAudioContext) localAudioContext.close();
    localInterval = null;
    localAudioContext = null;
    document.getElementById('local-video-card').classList.remove('speaking');
  } else {
    if (remoteInterval) clearInterval(remoteInterval);
    if (remoteAudioContext) remoteAudioContext.close();
    remoteInterval = null;
    remoteAudioContext = null;
    document.getElementById('remote-video-card').classList.remove('speaking');
  }
}

// ==========================================
// ATALHOS DE TECLADO & COPIAR LINK
// ==========================================
window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }

  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleMuteMicrophone();
    showToast(isAudioMuted ? 'Microfone Mutado 🤫' : 'Microfone Ativo 🎙️', 'info');
  }
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .then(() => {
        btnFullscreen.classList.add('active');
        btnFullscreen.innerHTML = '<i data-lucide="minimize"></i>';
        lucide.createIcons();
      })
      .catch(err => console.error('Erro tela cheia:', err));
  } else {
    document.exitFullscreen();
    btnFullscreen.classList.remove('active');
    btnFullscreen.innerHTML = '<i data-lucide="maximize"></i>';
    lucide.createIcons();
  }
});

btnDisconnect.addEventListener('click', () => {
  // Limpar credenciais apenas ao sair voluntariamente
  localStorage.removeItem('lovechat_pin');
  disconnectAndReset();
  showToast('Saímos do nosso cantinho. 👋', 'info');
});

// ==========================================
// DESCONEXÃO E LIMPEZA
// ==========================================
// RECONEXÃO AUTOMÁTICA DO GUEST (Bypass de Reload do Host)
// ==========================================
function startGuestReconnectionLoop() {
  if (guestReconnectInterval) return;

  updateP2PConnectionStatus('waiting', 'Meu amor desconectou. Reconectando...');

  guestReconnectInterval = setInterval(() => {
    if (dataConn && dataConn.open) {
      clearInterval(guestReconnectInterval);
      guestReconnectInterval = null;
      return;
    }

    if (!peer || peer.destroyed) {
      console.log("🔄 Recriando PeerJS Guest para reconexão...");
      initializePeerAsGuest();
      return;
    }

    console.log("🔄 Convidado tentando reconectar ao Host...");
    connectGuestToHost();
  }, 3000);
}

// ==========================================
// DESCONEXÃO E LIMPEZA
// ==========================================
function handleRemoteDisconnect() {
  // Tocar som de saída estilo Discord
  playDiscordSound('leave');

  // Fechar conexões WebRTC nativas
  if (mediaPC) { mediaPC.close(); mediaPC = null; }
  if (screenPC) { screenPC.close(); screenPC = null; }
  if (dataConn) { dataConn.close(); dataConn = null; }

  videoSender = null;
  audioSender = null;

  stopVolumeMonitoring(false);

  // CRÍTICO: Só oculta e reseta tela se era o parceiro remoto quem estava compartilhando!
  // Se o usuário local estiver transmitindo a tela, MANTÉM ativa para o par retomar ao voltar!
  if (!isScreenSharing) {
    hideRemoteScreenShare();
    focusedStreamId = null;
  } else {
    console.log("🖥️ Mantendo transmissão de tela local ativa para quando o parceiro reconectar!");
  }

  // Remover reprodutor de áudio do microfone remoto
  const oldMicAudio = document.getElementById('remote-mic-audio');
  if (oldMicAudio) oldMicAudio.remove();

  // Resetar UI remota (ambos ficam aguardando re-conexão)
  remoteVideo.srcObject = null;
  remoteAvatar.classList.remove('hide');
  remoteStatusDot.classList.add('offline');
  remoteNameLbl.textContent = "Aguardando Meu Amor...";
  remoteStatusIcons.classList.add('hide');

  overlayRemoteMic.classList.add('hide');
  overlayRemoteVideo.classList.add('hide');

  updateVideoLayout();

  // Se somos o Convidado (Guest), assumimos a sala como Dono (Host Handover)!
  if (peerRole === 'guest') {
    promoteGuestToHost();
    return;
  }

  updateP2PConnectionStatus('waiting', 'Aguardando Meu Amor... 💖');
  showToast('Meu amor saiu do nosso cantinho. 🥺', 'info');
}

function disconnectAndReset() {
  // Tocar som de saída local estilo Discord
  playDiscordSound('leave');

  // Limpar timer de promoção a host
  if (promotionTimer) {
    clearTimeout(promotionTimer);
    promotionTimer = null;
  }

  // Limpar loop de reconexão do guest se ativo
  if (guestReconnectInterval) {
    clearInterval(guestReconnectInterval);
    guestReconnectInterval = null;
  }

  if (dataConn && dataConn.open) {
    try {
      dataConn.send({ type: 'peer-left' });
    } catch (e) {
      console.error('Erro ao notificar saída P2P:', e);
    }
  }

  stopScreenSharing();
  stopLocalMediaTracks();
  stopVolumeMonitoring(true);
  stopVolumeMonitoring(false);

  // Remover reprodutor de áudio do microfone remoto
  const oldMicAudio = document.getElementById('remote-mic-audio');
  if (oldMicAudio) oldMicAudio.remove();

  // Fechar conexões WebRTC nativas
  if (mediaPC) { mediaPC.close(); mediaPC = null; }
  if (screenPC) { screenPC.close(); screenPC = null; }
  if (dataConn) { dataConn.close(); dataConn = null; }
  if (peer) { peer.destroy(); peer = null; }

  videoSender = null;
  audioSender = null;
  pendingMediaICE = [];
  pendingScreenICE = [];

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  localVideo.classList.add('hide');
  remoteVideo.classList.add('hide');

  localAvatar.classList.remove('hide');
  remoteAvatar.classList.remove('hide');

  overlayLocalMic.classList.remove('hide');
  overlayLocalVideo.classList.remove('hide');
  overlayRemoteMic.classList.add('hide');
  overlayRemoteVideo.classList.add('hide');

  btnMic.classList.add('muted');
  btnMic.innerHTML = '<i data-lucide="mic-off"></i>';
  btnVideo.classList.add('muted');
  btnVideo.innerHTML = '<i data-lucide="video-off"></i>';
  btnScreen.classList.remove('active');
  lucide.createIcons();

  isAudioMuted = true;
  isVideoOff = true;
  isScreenSharing = false;
  focusedStreamId = null;
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }

  realMicTrack = null;
  realCameraTrack = null;
  dummyVideoTrack = null;
  dummyAudioTrack = null;

  updateSidebarStreamState();
  if (typeof isScreenShareFullscreen === 'function' && isScreenShareFullscreen()) {
    if (document.exitFullscreen) document.exitFullscreen().catch(e => console.error(e));
  }

  roomScreen.classList.add('hide');
  loginScreen.classList.remove('hide');

  btnSubmit.disabled = false;
  btnSubmit.style.opacity = '1';
}

function stopLocalMediaTracks() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (realMicTrack) {
    realMicTrack.stop();
    realMicTrack = null;
  }
  if (realCameraTrack) {
    realCameraTrack.stop();
    realCameraTrack = null;
  }
}

// ==========================================
// CICLO DE VIDA - DESCARREGAMENTO E RELOAD (F5)
// ==========================================
function handlePageUnload() {
  // Avisa o parceiro via WebRTC DataChannel se ainda estiver aberto
  if (dataConn && dataConn.open) {
    try {
      dataConn.send({ type: 'peer-reloading', role: peerRole });
    } catch (e) {}
  }

  // Notifica o servidor para desalocar o ID imediatamente sem esperar timeout
  const myId = peer ? peer.id : null;
  if (myId) {
    try {
      const payload = JSON.stringify({ peerId: myId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(apiUrl('/api/room/leave'), payload);
      } else {
        fetch(apiUrl('/api/room/leave'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        });
      }
    } catch (e) {}
  }

  // Destrói o socket PeerJS para fechamento gracioso imediato
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (e) {}
  }
}

window.addEventListener('beforeunload', handlePageUnload);
window.addEventListener('pagehide', handlePageUnload);

// ==========================================
// HELPERS DE UI
// ==========================================
function updateP2PConnectionStatus(type, label) {
  statusCircle.className = `status-circle ${type}`;
  statusTextLbl.textContent = label;
}

async function transitionToRoom() {
  loginScreen.classList.add('hide');
  roomScreen.classList.remove('hide');
  roomTitleLbl.textContent = "Nosso Cantinho 💖";

  // Obter nomes e notas salvas no banco de dados JSON
  try {
    const response = await fetch(apiUrl('/api/db'));
    const dbData = await response.json();

    if (dbData.profiles) {
      if (dbData.profiles.user1) cachedProfiles.user1 = { ...cachedProfiles.user1, ...dbData.profiles.user1 };
      if (dbData.profiles.user2) cachedProfiles.user2 = { ...cachedProfiles.user2, ...dbData.profiles.user2 };
    } else {
      if (dbData.hostName) cachedProfiles.user1.name = dbData.hostName;
      if (dbData.hostAvatar) cachedProfiles.user1.avatar = dbData.hostAvatar;
      if (dbData.guestName) cachedProfiles.user2.name = dbData.guestName;
      if (dbData.guestAvatar) cachedProfiles.user2.avatar = dbData.guestAvatar;
    }

    // Renderizar notas carregadas
    renderNotes(dbData.notes || []);
  } catch (e) {
    console.error('Erro ao ler do banco de dados JSON:', e);
  }

  // Definir UI do usuário local baseado no perfil deste computador (sempre fiel à pessoa)
  const myProfile = getMyUserProfile();
  localNameLbl.textContent = myProfile.name;
  if (myProfile.avatar) {
    updateLocalAvatarUI(myProfile.avatar);
  }

  // Definir UI do parceiro remoto
  if (remoteUserProfile) {
    applyRemoteProfile(remoteUserProfile);
  } else {
    const defaultRemote = getOtherUserProfile();
    remoteNameLbl.textContent = defaultRemote.name;
    const remoteVidName = document.getElementById('remote-video-name-lbl');
    if (remoteVidName) remoteVidName.textContent = defaultRemote.name;
    if (defaultRemote.avatar) {
      updateRemoteAvatarUI(defaultRemote.avatar);
    }
  }
}

function showLoginError(msg) {
  loginError.classList.remove('hide');
  errorText.textContent = msg;
}

let toastTimeout = null;
function showToast(message, iconName = 'info') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');

  toastText.textContent = message;
  toastIcon.setAttribute('data-lucide', iconName);
  lucide.createIcons();

  toast.classList.remove('hide');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hide');
  }, 3500);
}

// ==========================================
// QUALIDADE ADAPTATIVA (ADAPTIVE BITRATE)
// ==========================================

/**
 * Monitora as estatísticas da conexão WebRTC a cada 5 segundos.
 * Se detectar perda de pacotes alta ou bitrate real muito abaixo do alvo,
 * reduz o maxBitrate do sender dinamicamente.
 * Se a conexão estiver saudável, restaura gradualmente.
 */
function startAdaptiveBitrateMonitor() {
  if (statsInterval) clearInterval(statsInterval);

  let lastBytesSent = 0;
  let lastTimestamp = 0;

  statsInterval = setInterval(async () => {
    if (!mediaPC) return;

    try {
      const stats = await mediaPC.getStats();
      let packetsSent = 0;
      let packetsLost = 0;
      let currentBytesSent = 0;
      let currentTimestamp = 0;

      stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          packetsSent = report.packetsSent || 0;
          currentBytesSent = report.bytesSent || 0;
          currentTimestamp = report.timestamp || Date.now();
        }
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
          packetsLost = report.packetsLost || 0;
        }
      });

      // Calcular perda de pacotes percentual
      const totalPackets = packetsSent + packetsLost;
      const lossRate = totalPackets > 0 ? (packetsLost / totalPackets) : 0;

      // Calcular bitrate real
      const timeDelta = (currentTimestamp - lastTimestamp) / 1000;
      const realBitrate = timeDelta > 0 ? ((currentBytesSent - lastBytesSent) * 8) / timeDelta : 0;

      lastBytesSent = currentBytesSent;
      lastTimestamp = currentTimestamp;

      // Ajustar bitrate baseado na qualidade da conexão (apenas em perda real expressiva > 8%)
      if (lossRate > 0.08) {
        currentTargetBitrate = Math.max(MIN_BITRATE, currentTargetBitrate * 0.8);
        console.log(`📉 Reduzindo bitrate da câmera para ${(currentTargetBitrate / 1_000_000).toFixed(2)} Mbps (perda: ${(lossRate * 100).toFixed(1)}%)`);
        configureSenderParams(mediaPC, false, currentTargetBitrate);
      } else if (lossRate < 0.02 && currentTargetBitrate < currentQualityPreset.mediaBitrate) {
        currentTargetBitrate = Math.min(currentQualityPreset.mediaBitrate, currentTargetBitrate * 1.15);
        configureSenderParams(mediaPC, false, currentTargetBitrate);
      }

    } catch (e) {
      // getStats pode falhar se a conexão foi fechada
    }
  }, 5000);
}

// Detecção automática de fechamento de aba / recarregamento para desconectar limpo
window.addEventListener('beforeunload', () => {
  disconnectAndReset();
});

// ==========================================
// CONTROLES DO QUADRO DO CASAL & APELIDOS & AVATAR
// ==========================================
const btnEditName = document.getElementById('btn-edit-name');
const btnAddNote = document.getElementById('btn-add-note');
const boardNoteInput = document.getElementById('board-note-input');
const boardNotesList = document.getElementById('board-notes-list');

const btnEditAvatar = document.getElementById('btn-edit-avatar');
const avatarInput = document.getElementById('avatar-input');

// Lógica de alteração e compressão de avatar
if (btnEditAvatar && avatarInput) {
  btnEditAvatar.addEventListener('click', () => {
    avatarInput.click();
  });

  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        // Redimensionar e recortar a imagem usando canvas para 640x640 (alta nitidez para visual grande)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 640;

        // Fazer corte quadrado proporcional no centro da imagem
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        ctx.drawImage(img, sx, sy, size, size, 0, 0, 640, 640);

        // Converter para Base64 JPEG com qualidade 85% (alta fidelidade visual)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

        // Atualizar visualização do próprio avatar na UI
        updateLocalAvatarUI(compressedBase64);

        // Salvar no JSON database
        saveAvatarToDatabase(compressedBase64);

        // Notificar o parceiro via Data Connection em tempo real
        if (dataConn && dataConn.open) {
          dataConn.send({ type: 'profile-update', profile: getMyUserProfile() });
          dataConn.send({ type: 'avatar-change', avatar: compressedBase64 });
        }

        showToast('Sua foto de perfil foi atualizada com sucesso! 📸', 'info');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateLocalAvatarUI(base64) {
  const localSidebarImg = document.getElementById('local-sidebar-avatar-img');
  const localAvatarImg = document.getElementById('local-avatar-img');
  const localAvatarBg = document.getElementById('local-avatar-bg');
  const localAvatarIcon = document.getElementById('local-avatar-icon');

  if (base64) {
    if (localSidebarImg) {
      localSidebarImg.src = base64;
      localSidebarImg.classList.remove('hide');
    }
    if (localAvatarImg) {
      localAvatarImg.src = base64;
      localAvatarImg.classList.remove('hide');
    }
    if (localAvatarBg) {
      localAvatarBg.src = base64;
      localAvatarBg.classList.remove('hide');
    }
    if (localAvatarIcon) {
      localAvatarIcon.classList.add('hide');
    }
  } else {
    if (localSidebarImg) localSidebarImg.classList.add('hide');
    if (localAvatarImg) localAvatarImg.classList.add('hide');
    if (localAvatarBg) localAvatarBg.classList.add('hide');
    if (localAvatarIcon) localAvatarIcon.classList.remove('hide');
  }
}

function updateRemoteAvatarUI(base64) {
  const remoteSidebarImg = document.getElementById('remote-sidebar-avatar-img');
  const remoteAvatarImg = document.getElementById('remote-avatar-img');
  const remoteAvatarBg = document.getElementById('remote-avatar-bg');
  const remoteAvatarIcon = document.getElementById('remote-avatar-icon');

  if (base64) {
    if (remoteSidebarImg) {
      remoteSidebarImg.src = base64;
      remoteSidebarImg.classList.remove('hide');
    }
    if (remoteAvatarImg) {
      remoteAvatarImg.src = base64;
      remoteAvatarImg.classList.remove('hide');
    }
    if (remoteAvatarBg) {
      remoteAvatarBg.src = base64;
      remoteAvatarBg.classList.remove('hide');
    }
    if (remoteAvatarIcon) {
      remoteAvatarIcon.classList.add('hide');
    }
  } else {
    // Se não houver avatar customizado, restaura o estado padrão
    if (remoteSidebarImg) remoteSidebarImg.classList.add('hide');
    if (remoteAvatarImg) remoteAvatarImg.classList.add('hide');
    if (remoteAvatarBg) remoteAvatarBg.classList.add('hide');
    if (remoteAvatarIcon) remoteAvatarIcon.classList.remove('hide');
  }
}

async function saveAvatarToDatabase(base64) {
  try {
    const myProfile = getMyUserProfile();
    myProfile.avatar = base64;
    cachedProfiles[activeProfileId].avatar = base64;
    updateLoginProfilesUI();

    await fetch(apiUrl('/api/db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileUpdate: {
          id: activeProfileId,
          avatar: base64
        }
      })
    });
  } catch (e) {
    console.error('Erro ao persistir avatar no banco:', e);
  }
}

// Editar Apelido em Tempo Real
btnEditName.addEventListener('click', () => {
  const myProfile = getMyUserProfile();
  const currentName = localNameLbl.textContent.trim();

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'edit-name-input';
  input.maxLength = 18;

  localNameLbl.replaceWith(input);
  input.focus();
  input.select();

  const saveName = async () => {
    const rawVal = input.value.trim();
    const newName = rawVal || currentName;

    localNameLbl.textContent = newName;
    input.replaceWith(localNameLbl);

    myProfile.name = newName;
    cachedProfiles[activeProfileId].name = newName;
    updateLoginProfilesUI();

    // Salvar no JSON database pelo id do perfil
    try {
      await fetch(apiUrl('/api/db'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUpdate: {
            id: activeProfileId,
            name: newName
          }
        })
      });
    } catch (e) {
      console.error('Erro ao salvar apelido no banco:', e);
    }

    // Compartilhar mudança com o outro par via data channel
    if (dataConn && dataConn.open) {
      dataConn.send({ type: 'profile-update', profile: myProfile });
      dataConn.send({ type: 'name-change', name: newName });
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveName();
  });
  input.addEventListener('blur', saveName);
});

// Adicionar Desejo/Desafio ao Quadro
btnAddNote.addEventListener('click', async () => {
  const text = boardNoteInput.value.trim();
  if (!text) return;

  try {
    const response = await fetch(apiUrl('/api/db'));
    const dbData = await response.json();
    const notes = dbData.notes || [];

    const newNote = {
      id: Date.now(),
      text: text,
      category: 'custom'
    };
    notes.push(newNote);

    // Gravar no banco de dados JSON do servidor
    await fetch(apiUrl('/api/db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });

    boardNoteInput.value = '';
    renderNotes(notes);

    // Sincronizar quadro em tempo real
    if (dataConn && dataConn.open) {
      dataConn.send({ type: 'notes-updated', notes });
    }
  } catch (err) {
    console.error('Erro ao adicionar nota ao quadro:', err);
  }
});

boardNoteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnAddNote.click();
});

// Deletar Desejo/Desafio do Quadro
async function deleteNote(id) {
  try {
    const response = await fetch(apiUrl('/api/db'));
    const dbData = await response.json();
    const notes = (dbData.notes || []).filter(n => n.id !== id);

    await fetch(apiUrl('/api/db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });

    renderNotes(notes);

    if (dataConn && dataConn.open) {
      dataConn.send({ type: 'notes-updated', notes });
    }
  } catch (err) {
    console.error('Erro ao deletar nota do quadro:', err);
  }
}

// Renderizar lista de notas no DOM
function renderNotes(notes) {
  boardNotesList.innerHTML = '';
  notes.forEach(note => {
    const li = document.createElement('li');
    li.className = 'board-note-item';

    const span = document.createElement('span');
    span.textContent = note.text;
    li.appendChild(span);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-delete-note';
    btnDel.title = 'Deletar desafio/segredo';
    btnDel.innerHTML = '<i data-lucide="trash-2"></i>';
    btnDel.addEventListener('click', () => deleteNote(note.id));

    li.appendChild(btnDel);
    boardNotesList.appendChild(li);
  });
  lucide.createIcons();
}

// ==========================================
// EFEITOS SONOROS ESTILO DISCORD
// ==========================================
function playDiscordSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'join') {
      // Efeito de entrada (dois tons subindo)
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(587.33, now + 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.setValueAtTime(0.08, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'leave') {
      // Efeito de saída (dois tons descendo)
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.setValueAtTime(0.08, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'mute') {
      // Efeito de mutar (bipe simples e seco)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'unmute') {
      // Efeito de desmutar (bipe agudo e suave)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {
    console.warn('Erro ao reproduzir áudio dinâmico:', e);
  }
}

// ==========================================
// CONTROLE DE GAVETA DA SIDEBAR (MOBILE)
// ==========================================
const btnOpenSidebar = document.getElementById('btn-open-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

if (btnOpenSidebar) {
  btnOpenSidebar.addEventListener('click', () => {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  });
}

const closeSidebarFunc = () => {
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
};

if (btnCloseSidebar) {
  btnCloseSidebar.addEventListener('click', closeSidebarFunc);
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeSidebarFunc);
}

// ==========================================
// CONTROLE DE SIDEBAR / MODO TEATRO
// ==========================================
function toggleSidebarCollapse(forceState) {
  if (!roomScreen) return;
  const isCollapsed = typeof forceState === 'boolean' 
    ? forceState 
    : !roomScreen.classList.contains('sidebar-collapsed');

  if (isCollapsed) {
    roomScreen.classList.add('sidebar-collapsed');
    if (btnExpandSidebar) btnExpandSidebar.classList.remove('hide');
    if (btnToggleSidebar) {
      btnToggleSidebar.innerHTML = '<i data-lucide="panel-left-open"></i>';
      btnToggleSidebar.title = 'Restaurar Barra Lateral (Modo Teatro - Tecla T)';
    }
    if (btnStreamTheater) {
      btnStreamTheater.innerHTML = '<i data-lucide="panel-left-open"></i>';
      btnStreamTheater.title = 'Restaurar Barra Lateral (Modo Teatro - Tecla T)';
    }
    showToast('Modo Teatro Ativado 🎭 (Tecla T para restaurar)', 'info');
  } else {
    roomScreen.classList.remove('sidebar-collapsed');
    if (btnExpandSidebar) btnExpandSidebar.classList.add('hide');
    if (btnToggleSidebar) {
      btnToggleSidebar.innerHTML = '<i data-lucide="panel-left-close"></i>';
      btnToggleSidebar.title = 'Recolher Barra Lateral (Modo Teatro - Tecla T)';
    }
    if (btnStreamTheater) {
      btnStreamTheater.innerHTML = '<i data-lucide="panel-left-close"></i>';
      btnStreamTheater.title = 'Modo Teatro / Ocultar Barra (Tecla T)';
    }
  }
  lucide.createIcons();
}

if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', () => toggleSidebarCollapse());
}

if (btnExpandSidebar) {
  btnExpandSidebar.addEventListener('click', () => toggleSidebarCollapse(false));
}

if (btnStreamTheater) {
  btnStreamTheater.addEventListener('click', () => toggleSidebarCollapse());
}

// ==========================================
// TELA CHEIA DEDICADA DA TRANSMISSÃO DE TELA
// ==========================================
let screenFullscreenIdleTimer = null;

function isScreenShareFullscreen() {
  return document.fullscreenElement === screenShareCard || 
         document.webkitFullscreenElement === screenShareCard ||
         document.mozFullScreenElement === screenShareCard;
}

function toggleScreenShareFullscreen() {
  if (!screenShareCard || screenShareCard.classList.contains('hide')) {
    showToast('Nenhuma transmissão de tela ativa no momento.', 'info');
    return;
  }

  if (!isScreenShareFullscreen()) {
    const requestFs = screenShareCard.requestFullscreen || 
                      screenShareCard.webkitRequestFullscreen || 
                      screenShareCard.mozRequestFullScreen || 
                      screenShareCard.msRequestFullscreen;
    if (requestFs) {
      requestFs.call(screenShareCard)
        .then(() => {
          showToast('Transmissão em Tela Cheia! 🖥️ (ESC ou Tecla F para sair)', 'info');
        })
        .catch(err => {
          console.error('Erro ao ativar tela cheia:', err);
          showToast('Não foi possível ativar tela cheia.', 'alert-circle');
        });
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(e => console.error(e));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

if (btnScreenCardFullscreen) {
  btnScreenCardFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleScreenShareFullscreen();
  });
}

if (btnExitCardFullscreen) {
  btnExitCardFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.error(err));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  });
}

// Duplo clique na transmissão para alternar tela cheia
if (screenShareCard) {
  screenShareCard.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    toggleScreenShareFullscreen();
  });

  screenShareCard.addEventListener('mousemove', () => {
    if (isScreenShareFullscreen()) {
      resetScreenFullscreenIdle();
    }
  });
}

function resetScreenFullscreenIdle() {
  if (!screenShareCard || !isScreenShareFullscreen()) return;
  screenShareCard.classList.remove('fullscreen-idle');
  if (screenFullscreenIdleTimer) {
    clearTimeout(screenFullscreenIdleTimer);
  }
  screenFullscreenIdleTimer = setTimeout(() => {
    if (isScreenShareFullscreen()) {
      screenShareCard.classList.add('fullscreen-idle');
    }
  }, 2500);
}

function handleFullscreenChange() {
  const isFs = isScreenShareFullscreen();
  if (isFs) {
    if (btnExitCardFullscreen) btnExitCardFullscreen.classList.remove('hide');
    if (btnScreenCardFullscreen) {
      btnScreenCardFullscreen.innerHTML = '<i data-lucide="minimize"></i>';
      btnScreenCardFullscreen.title = 'Sair da Tela Cheia (Tecla F ou ESC)';
    }
    resetScreenFullscreenIdle();
  } else {
    if (btnExitCardFullscreen) btnExitCardFullscreen.classList.add('hide');
    if (btnScreenCardFullscreen) {
      btnScreenCardFullscreen.innerHTML = '<i data-lucide="maximize"></i>';
      btnScreenCardFullscreen.title = 'Tela Cheia (Atalho: Tecla F ou Duplo Clique)';
    }
    if (screenShareCard) screenShareCard.classList.remove('fullscreen-idle');
    if (screenFullscreenIdleTimer) {
      clearTimeout(screenFullscreenIdleTimer);
      screenFullscreenIdleTimer = null;
    }
  }
  lucide.createIcons();
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);

// ==========================================
// CONTROLE DE VOLUME DO ÁUDIO DA TELA
// ==========================================
function updateStreamVolIcon(val) {
  if (!streamVolIcon) return;
  if (val === 0) {
    streamVolIcon.setAttribute('data-lucide', 'volume-x');
  } else if (val < 0.5) {
    streamVolIcon.setAttribute('data-lucide', 'volume-1');
  } else {
    streamVolIcon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

if (streamVolSlider) {
  streamVolSlider.addEventListener('input', () => {
    const val = parseFloat(streamVolSlider.value);
    const audioEl = document.getElementById('remote-screen-audio');
    if (audioEl) {
      audioEl.volume = val;
      audioEl.muted = (val === 0);
    }
    updateStreamVolIcon(val);
  });
}

let lastNonZeroStreamVol = 1;
if (btnStreamVolToggle) {
  btnStreamVolToggle.addEventListener('click', () => {
    const audioEl = document.getElementById('remote-screen-audio');
    if (!streamVolSlider) return;
    const currentVal = parseFloat(streamVolSlider.value);
    if (currentVal > 0) {
      lastNonZeroStreamVol = currentVal;
      streamVolSlider.value = 0;
      if (audioEl) { audioEl.volume = 0; audioEl.muted = true; }
      updateStreamVolIcon(0);
    } else {
      const restored = lastNonZeroStreamVol || 1;
      streamVolSlider.value = restored;
      if (audioEl) { audioEl.volume = restored; audioEl.muted = false; }
      updateStreamVolIcon(restored);
    }
  });
}

// ==========================================
// AJUSTE DE PROPORÇÃO DA TELA (FIT / COVER)
// ==========================================
if (btnStreamFit) {
  btnStreamFit.addEventListener('click', () => {
    if (!screenVideo) return;
    const isCover = screenVideo.classList.toggle('screen-cover');
    const icon = btnStreamFit.querySelector('i') || btnStreamFit.querySelector('svg');
    if (isCover) {
      showToast('Ajuste: Preencher Tela (com cortes)', 'info');
      if (icon) icon.setAttribute('data-lucide', 'shrink');
    } else {
      showToast('Ajuste: Proporção Original (sem cortes)', 'info');
      if (icon) icon.setAttribute('data-lucide', 'scan');
    }
    lucide.createIcons();
  });
}

// ==========================================
// ASSISTIR TRANSMISSÃO VIA SIDEBAR (DISCORD UX)
// ==========================================
if (btnSidebarWatch) {
  btnSidebarWatch.addEventListener('click', () => {
    if (!screenShareCard.classList.contains('hide')) {
      focusedStreamId = 'screen';
      updateVideoLayout();
      showToast('Assistindo transmissão em destaque! 📺', 'info');
      if (window.innerWidth <= 900 && typeof closeSidebarFunc === 'function') {
        closeSidebarFunc();
      }
    }
  });
}

// ==========================================
// ATALHOS DE TECLADO GLOBAIS (F / T)
// ==========================================
window.addEventListener('keydown', (e) => {
  // Ignorar quando digitando em inputs
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') return;

  // Tecla F: Tela cheia na transmissão de tela
  if (e.key === 'f' || e.key === 'F') {
    if (!screenShareCard.classList.contains('hide')) {
      e.preventDefault();
      toggleScreenShareFullscreen();
    }
  }

  // Tecla T: Modo Teatro / Alternar Sidebar
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    toggleSidebarCollapse();
  }
});

// ==========================================
// GERADOR DE ÍCONES PNG PARA PWA (AUTOMÁTICO CLIENT-SIDE)
// ==========================================
async function checkAndGeneratePWAIcons() {
  if (window.electronAPI) return; // No app Electron os ícones já estão compilados e locais
  try {
    // Verificar se os ícones PNG já foram gerados e estão disponíveis no servidor
    const check192 = await fetch('/icon-192.png', { method: 'HEAD' });
    const check512 = await fetch('/icon-512.png', { method: 'HEAD' });

    if (check192.ok && check512.ok) {
      console.log('✨ Ícones PNG do PWA já estão prontos no servidor.');
      return;
    }
  } catch (err) {
    // Se falhar a checagem, assume que precisa gerar
  }

  console.log('⚙️ Gerando ícones PWA PNG a partir do SVG original...');

  const img = new Image();
  img.onload = async () => {
    // 1. Gerar icon-192.png
    const canvas192 = document.createElement('canvas');
    canvas192.width = 192;
    canvas192.height = 192;
    const ctx192 = canvas192.getContext('2d');
    ctx192.drawImage(img, 0, 0, 192, 192);
    const base64_192 = canvas192.toDataURL('image/png');

    // 2. Gerar icon-512.png
    const canvas512 = document.createElement('canvas');
    canvas512.width = 512;
    canvas512.height = 512;
    const ctx512 = canvas512.getContext('2d');
    ctx512.drawImage(img, 0, 0, 512, 512);
    const base64_512 = canvas512.toDataURL('image/png');

    // 3. Enviar para o servidor persistir na pasta public/
    try {
      await fetch('/api/save-icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'icon-192.png', base64: base64_192 })
      });
      await fetch('/api/save-icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'icon-512.png', base64: base64_512 })
      });
      console.log('✅ Ícones PNG gerados e salvos no servidor com sucesso.');
    } catch (e) {
      console.error('Falha ao salvar ícones PNG gerados:', e);
    }
  };
  img.src = '/icon.svg';
}

// Disparar geração na inicialização do script
checkAndGeneratePWAIcons();

// ==========================================
// CONTROLE DO MENU DE QUALIDADE DE TRANSMISSÃO
// ==========================================
function setTransmissionQuality(presetKey, notifyPar = true) {
  const preset = QUALITY_PRESETS[presetKey];
  if (!preset) return;

  currentQualityPreset = preset;
  currentTargetBitrate = preset.mediaBitrate;
  localStorage.setItem('lovechat_quality_preset', presetKey);

  // Atualizar UI dos botões de opção
  if (qualityOptions && qualityOptions.length > 0) {
    qualityOptions.forEach(btn => {
      const isSelected = btn.dataset.quality === presetKey;
      btn.classList.toggle('active', isSelected);
      const checkIcon = btn.querySelector('.quality-check-icon');
      if (checkIcon) {
        checkIcon.classList.toggle('hide', !isSelected);
      }
      const badge = btn.querySelector('.badge-recom');
      if (badge) {
        badge.textContent = isSelected ? 'Ativo' : 'Recomendado';
      }
    });
  }

  // Atualizar badge do card de tela e da barra lateral
  if (screenQualityBadge) {
    screenQualityBadge.textContent = preset.badge;
  }
  if (sidebarStreamQuality) {
    sidebarStreamQuality.textContent = (preset.badge && preset.badge.split(' • ')[0]) || '35 Mbps';
  }

  // Atualizar status no popover
  if (currentQualityStatus) {
    currentQualityStatus.innerHTML = `🚀 Perfil Ativo: <strong>${preset.label} (${(preset.screenBitrate / 1_000_000).toFixed(0)} Mbps)</strong>`;
  }

  // Reconfigurar senders ativos em tempo real com novos bitrates e codecs
  if (screenPC) {
    configureSenderParams(screenPC, true);
    if (screenStream) {
      screenStream.getVideoTracks().forEach(t => {
        t.contentHint = preset.contentHint;
      });
    }
  }
  if (mediaPC) {
    configureSenderParams(mediaPC, false);
  }

  showToast(`Qualidade: ${preset.label} (${(preset.screenBitrate / 1_000_000).toFixed(0)} Mbps) ✨`, 'sparkles');

  // Sincronizar com o par
  if (notifyPar && dataConn && dataConn.open) {
    dataConn.send({ type: 'quality-changed', presetKey });
  }
}

if (btnQuality && qualityMenu) {
  btnQuality.addEventListener('click', (e) => {
    e.stopPropagation();
    qualityMenu.classList.toggle('hide');
    btnQuality.classList.toggle('active', !qualityMenu.classList.contains('hide'));
    lucide.createIcons();
  });
}

if (btnCloseQuality && qualityMenu) {
  btnCloseQuality.addEventListener('click', () => {
    qualityMenu.classList.add('hide');
    if (btnQuality) btnQuality.classList.remove('active');
  });
}

// Fechar menu ao clicar fora
document.addEventListener('click', (e) => {
  if (qualityMenu && !qualityMenu.classList.contains('hide')) {
    if (!qualityMenu.contains(e.target) && (!btnQuality || !btnQuality.contains(e.target))) {
      qualityMenu.classList.add('hide');
      if (btnQuality) btnQuality.classList.remove('active');
    }
  }
});

// Eventos de clique nas opções de qualidade
if (qualityOptions) {
  qualityOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const presetKey = opt.dataset.quality;
      setTransmissionQuality(presetKey, true);
      setTimeout(() => {
        if (qualityMenu) qualityMenu.classList.add('hide');
        if (btnQuality) btnQuality.classList.remove('active');
      }, 300);
    });
  });
}

// ==========================================
// SELETOR NATIVO DE TELA ESTILO DISCORD (ELECTRON)
// ==========================================
let cachedDesktopSources = [];
let currentScreenTab = 'apps'; // 'apps' | 'displays'
let selectedSourceId = null;
let selectedSourceName = null;

function setupElectronScreenPicker() {
  if (!window.electronAPI) return;

  console.log('🚀 Rodando no modo Electron Desktop com suporte a captura de janelas e telas nativo.');

  const overlay = document.getElementById('electron-screen-modal-overlay');
  const modal = document.getElementById('electron-screen-modal');
  if (!modal) return;

  const btnClose = document.getElementById('btn-close-screen-modal');
  const btnCancel = document.getElementById('btn-cancel-screen-modal');
  const btnConfirm = document.getElementById('btn-confirm-screen-modal');
  const tabApps = document.getElementById('tab-screen-applications');
  const tabDisplays = document.getElementById('tab-screen-displays');
  const grid = document.getElementById('screen-sources-grid');
  const chkAudio = document.getElementById('chk-stream-audio');
  const audioContainer = document.getElementById('screen-audio-toggle-container');
  const lblAudioDesc = document.getElementById('lbl-audio-toggle-desc');

  function updateAudioToggleState() {
    if (chkAudio) {
      chkAudio.disabled = false;
    }
    if (audioContainer) audioContainer.style.opacity = '1';
    if (lblAudioDesc) {
      if (currentScreenTab === 'apps') {
        lblAudioDesc.innerHTML = '<span style="color:#4ade80;font-weight:600;"><i data-lucide="volume-2" style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>Áudio Exclusivo da Janela</span> — Transmite apenas o som deste aplicativo (sem ruídos do sistema, outros programas ou sua chamada de voz).';
      } else {
        lblAudioDesc.innerHTML = '<span style="color:#60a5fa;font-weight:600;"><i data-lucide="monitor" style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>Áudio do Sistema</span> — Transmite todos os sons do computador na tela selecionada.';
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function renderSources() {
    grid.innerHTML = '';
    const filtered = cachedDesktopSources.filter(s => currentScreenTab === 'displays' ? s.isScreen : !s.isScreen);

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #949ba4; padding: 2rem;">Nenhuma fonte encontrada nesta categoria.</div>`;
      return;
    }

    filtered.forEach(source => {
      const card = document.createElement('div');
      card.className = `screen-source-card ${selectedSourceId === source.id ? 'selected' : ''}`;
      
      const appIconHtml = source.appIcon 
        ? `<img src="${source.appIcon}" class="screen-source-app-icon" alt="Icon">` 
        : `<i data-lucide="${source.isScreen ? 'monitor' : 'app-window'}" style="width:16px;height:16px;color:#c084fc;"></i>`;

      const isWin = !source.isScreen;
      const badgeHtml = isWin
        ? `<span class="screen-source-badge" style="font-size: 10px; background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; backdrop-filter: blur(4px);"><i data-lucide="volume-2" style="width:10px;height:10px;"></i> Áudio Exclusivo</span>`
        : `<span class="screen-source-badge" style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; backdrop-filter: blur(4px);"><i data-lucide="monitor" style="width:10px;height:10px;"></i> Áudio Sistema</span>`;

      card.innerHTML = `
        <div style="position: relative; overflow: hidden; border-radius: 6px;">
          <img src="${source.thumbnail}" class="screen-source-thumb" alt="${source.name}">
          <div style="position: absolute; bottom: 6px; right: 6px; z-index: 2;">${badgeHtml}</div>
        </div>
        <div class="screen-source-info">
          ${appIconHtml}
          <span class="screen-source-title" title="${source.name}">${source.name}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedSourceId = source.id;
        selectedSourceName = source.name;
        document.querySelectorAll('.screen-source-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        btnConfirm.disabled = false;
      });

      card.addEventListener('dblclick', () => {
        selectedSourceId = source.id;
        selectedSourceName = source.name;
        btnConfirm.disabled = false;
        btnConfirm.click();
      });

      grid.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  if (tabApps) {
    tabApps.addEventListener('click', () => {
      currentScreenTab = 'apps';
      tabApps.classList.add('active');
      if (tabDisplays) tabDisplays.classList.remove('active');
      selectedSourceId = null;
      selectedSourceName = null;
      if (btnConfirm) btnConfirm.disabled = true;
      updateAudioToggleState();
      renderSources();
    });
  }

  if (tabDisplays) {
    tabDisplays.addEventListener('click', () => {
      currentScreenTab = 'displays';
      tabDisplays.classList.add('active');
      if (tabApps) tabApps.classList.remove('active');
      selectedSourceId = null;
      selectedSourceName = null;
      if (btnConfirm) btnConfirm.disabled = true;
      updateAudioToggleState();
      renderSources();
    });
  }

  function closeModal(cancel = true) {
    if (overlay) overlay.classList.add('hide');
    modal.classList.add('hide');
    selectedSourceId = null;
    selectedSourceName = null;
    if (btnConfirm) btnConfirm.disabled = true;
    if (cancel && window.electronAPI && window.electronAPI.cancelDesktopSource) {
      window.electronAPI.cancelDesktopSource();
    }
  }

  if (btnClose) btnClose.addEventListener('click', () => closeModal(true));
  if (btnCancel) btnCancel.addEventListener('click', () => closeModal(true));

  // Fechar ao pressionar ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ((overlay && !overlay.classList.contains('hide')) || !modal.classList.contains('hide'))) {
      closeModal(true);
    }
  });

  // Fechar ao clicar no backdrop escuro
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(true);
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      if (!selectedSourceId) return;
      const withAudio = chkAudio ? chkAudio.checked : true;
      const targetId = selectedSourceId;
      const targetName = selectedSourceName;
      closeModal(false);
      lastSelectedSourceResult = await window.electronAPI.selectDesktopSource(targetId, withAudio, targetName);
    });
  }

  // Ouvir evento emitido pelo processo principal do Electron
  if (window.electronAPI.onOpenScreenPicker) {
    window.electronAPI.onOpenScreenPicker(async () => {
      try {
        cachedDesktopSources = await window.electronAPI.getDesktopSources();
        selectedSourceId = null;
        selectedSourceName = null;
        if (btnConfirm) btnConfirm.disabled = true;
        currentScreenTab = 'apps';
        if (tabApps) tabApps.classList.add('active');
        if (tabDisplays) tabDisplays.classList.remove('active');
        updateAudioToggleState();
        renderSources();
        if (overlay) overlay.classList.remove('hide');
        modal.classList.remove('hide');
        if (window.lucide) window.lucide.createIcons();
      } catch (e) {
        console.error('Erro ao abrir seletor nativo de tela:', e);
        closeModal(true);
      }
    });
  }
}

// Inicializar seletor nativo do Electron se disponível
setupElectronScreenPicker();

// ==========================================
// TRATAMENTO GLOBAL DE ERROS E SEGURANÇA
// ==========================================
window.addEventListener('unhandledrejection', (event) => {
  console.warn('⚠️ [NCord] Promessa rejeitada não tratada:', event.reason);
});

window.addEventListener('error', (event) => {
  console.warn('⚠️ [NCord] Erro global na janela:', event.message);
});

