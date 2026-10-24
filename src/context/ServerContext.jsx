import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { electronBridge, isElectron } from '../services/electronBridge';
import { useToast } from '../hooks/useToast';

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('host'); // 'host' | 'remote'
  const [myIp, setMyIp] = useState('Detectando IP...');
  const [lanIp, setLanIp] = useState('');
  const [remoteIp, setRemoteIp] = useState('');
  const [serverStatus, setServerStatus] = useState('online'); // 'online' | 'connecting' | 'error'
  const [connectedServerDesc, setConnectedServerDesc] = useState('Servidor Local (Hospedando)');
  const [isServerConfigured, setIsServerConfigured] = useState(false);
  const [isFirewallApplied, setIsFirewallApplied] = useState(true);

  // Auto-descoberta de servidores ativos
  const [discoveredServers, setDiscoveredServers] = useState([]);
  const [isScanningServers, setIsScanningServers] = useState(false);

  // Estado do Túnel Web Seguro (Cloudflare) e Token de Sala
  const [webTunnelInfo, setWebTunnelInfo] = useState({
    isOnline: false,
    url: null,
    token: '',
    status: 'idle',
    error: null
  });

  // Carregar configurações iniciais salvas no Electron ou localStorage
  useEffect(() => {
    async function initSettings() {
      if (isElectron) {
        try {
          const settings = await electronBridge.getSavedSettings();
          if (settings && settings.targetIp) {
            setRemoteIp(settings.targetIp);
          }
          const fw = await electronBridge.checkFirewall();
          setIsFirewallApplied(!!fw.applied);

          // Verificar status do túnel web se o app for reaberto
          const tunnelStatus = await electronBridge.getWebTunnelStatus();
          if (tunnelStatus) {
            setWebTunnelInfo((prev) => ({ ...prev, ...tunnelStatus }));
            if (tunnelStatus.token) {
              apiService.setRoomToken(tunnelStatus.token);
            }
          }

          // Sincronizar token secreto de sala imediatamente no Host local
          await apiService.fetchRoomToken();
        } catch (e) {}
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          apiService.setRoomToken(urlToken);
        }

        // Se está rodando no browser servido via HTTP/HTTPS (não dev port 5173 e não file://)
        if (window.location.protocol !== 'file:' && window.location.port !== '5173') {
          setMode('remote');
          setIsServerConfigured(true);
          const isTunnel = window.location.hostname.includes('trycloudflare.com');
          setConnectedServerDesc(isTunnel ? 'Conectado via Túnel Seguro Cloudflare ✨' : `Conectado via Web (${window.location.hostname})`);
        } else {
          const savedRemoteIp = localStorage.getItem('lovechat_remote_ip');
          if (savedRemoteIp) {
            setRemoteIp(savedRemoteIp);
          }
        }
      }
    }
    initSettings();
  }, []);

  // Detectar IP do ZeroTier / Rede
  const detectMyIp = useCallback(async () => {
    try {
      const res = await apiService.getMyIp();
      if (res && res.ip) {
        setMyIp(res.zerotierIp || res.ip);
        setLanIp(res.lanIp || '');
      }
    } catch (e) {
      setMyIp('127.0.0.1');
    }
  }, []);

  useEffect(() => {
    detectMyIp();
  }, [detectMyIp]);

  // Varrer e buscar servidores ativos no ZeroTier e na rede local
  const scanForServers = useCallback(async (manual = false) => {
    setIsScanningServers(true);
    try {
      const res = await apiService.discoverServers();
      if (res && Array.isArray(res.servers)) {
        setDiscoveredServers(res.servers);
        if (manual) {
          if (res.servers.length > 0) {
            showToast(`✨ Encontrado ${res.servers.length} servidor ativo no ZeroTier/Rede!`, 'success');
          } else {
            showToast('Nenhum servidor encontrado na rede no momento.', 'info');
          }
        }
      }
    } catch (e) {
      console.warn('[ServerContext] Erro na varredura:', e);
      if (manual) {
        showToast('Erro ao varrer a rede por servidores.', 'error');
      }
    } finally {
      setIsScanningServers(false);
    }
  }, [showToast]);

  // Varrer automaticamente ao inicializar (em segundo plano, sem toast)
  useEffect(() => {
    scanForServers(false);
    const interval = setInterval(() => {
      scanForServers(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [scanForServers]);

  // Ação de confirmar modo Host
  const selectHostMode = useCallback(async () => {
    setMode('host');
    setRemoteIp('');
    apiService.setBaseUrl('');
    if (isElectron) {
      await electronBridge.hostLocalServer();
    }
    setConnectedServerDesc(`Hospedando no meu PC (${myIp})`);
    setIsServerConfigured(true);
  }, [myIp]);

  // Ação de conectar ao IP remoto do parceiro
  const connectToRemote = useCallback(async (targetIp) => {
    const cleanIp = (targetIp || '').trim();
    if (!cleanIp) {
      showToast('Digite um IP válido do ZeroTier.', 'error');
      return false;
    }

    setServerStatus('connecting');
    try {
      apiService.setBaseUrl(`http://${cleanIp}:3000`);
      if (isElectron) {
        const res = await electronBridge.connectToServer(cleanIp);
        if (!res.success) {
          showToast(`Não foi possível conectar ao IP ${cleanIp}. Verifique se o servidor está aberto.`, 'error');
          setServerStatus('error');
          return false;
        }
      }

      // Sincronizar token de sala do anfitrião
      try {
        await apiService.fetchRoomToken();
      } catch (e) {}

      // Testar probe do servidor remoto
      setMode('remote');
      setRemoteIp(cleanIp);
      localStorage.setItem('lovechat_remote_ip', cleanIp);
      setConnectedServerDesc(`Conectado no Amor (${cleanIp})`);
      setServerStatus('online');
      setIsServerConfigured(true);
      showToast('Conectado ao servidor com sucesso! 💕', 'success');
      return true;
    } catch (err) {
      showToast(`Não foi possível alcançar o servidor em ${cleanIp}.`, 'error');
      setServerStatus('error');
      return false;
    }
  }, [showToast]);

  const resetServerConnection = useCallback(async () => {
    setIsServerConfigured(false);
    setMode('host');
    setRemoteIp('');
    apiService.setBaseUrl('');
    if (isElectron) {
      try {
        await electronBridge.stopLocalServer();
      } catch (e) {
        console.warn('[ServerContext] Erro ao parar servidor local:', e);
      }
    }
  }, []);

  const requestFirewall = useCallback(async () => {
    if (!isElectron) {
      showToast('Liberação de Firewall disponível apenas no aplicativo Desktop.', 'info');
      return;
    }
    showToast('Solicitando permissão de Administrador para liberar o Firewall...', 'info');
    const res = await electronBridge.requestFirewall();
    if (res.success) {
      setIsFirewallApplied(true);
      showToast('Regras do Firewall do Windows aplicadas com sucesso! 🛡️', 'success');
    } else {
      showToast('Não foi possível aplicar as regras do Firewall.', 'error');
    }
  }, [showToast]);

  const copyMyIp = useCallback(() => {
    if (!myIp || myIp.includes('Detectando')) return;
    navigator.clipboard.writeText(myIp);
    showToast('IP copiado para a área de transferência! Envie para o seu amor 💕', 'success');
  }, [myIp, showToast]);

  // Iniciar Túnel Web Seguro
  const startWebTunnelAction = useCallback(async () => {
    if (!isElectron) {
      const devUrl = `http://${lanIp || 'localhost'}:3000`;
      setWebTunnelInfo({
        isOnline: true,
        url: devUrl,
        token: 'token-dev',
        lanIp: lanIp || '127.0.0.1',
        zerotierIp: '',
        status: 'online',
        error: null
      });
      showToast('Modo Web Local ativo (Porta 3000)! ✨', 'success');
      return { success: true, url: devUrl, token: 'token-dev' };
    }

    setWebTunnelInfo((prev) => ({ ...prev, status: 'starting' }));
    showToast('Iniciando Túnel Web Seguro (Cloudflare)... 🚀', 'info');

    try {
      const res = await electronBridge.startWebTunnel();
      if (res.success && res.url) {
        if (res.token) {
          apiService.setRoomToken(res.token);
        }
        setWebTunnelInfo({
          isOnline: true,
          url: res.url,
          token: res.token || '',
          lanIp: res.lanIp || '',
          zerotierIp: res.zerotierIp || '',
          status: 'online',
          error: null
        });
        showToast('Link Web Seguro gerado com sucesso! ✨', 'success');
        return res;
      } else {
        const errorMsg = res.error || 'Não foi possível iniciar o túnel.';
        setWebTunnelInfo((prev) => ({ ...prev, status: 'error', error: errorMsg }));
        showToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      setWebTunnelInfo((prev) => ({ ...prev, status: 'error', error: err.message }));
      showToast('Erro ao iniciar túnel web.', 'error');
      return { success: false, error: err.message };
    }
  }, [lanIp, showToast]);

  // Iniciar Túnel e Copiar Link em 1 Clique Rápido
  const startAndCopyWebLink = useCallback(async () => {
    if (webTunnelInfo?.isOnline && webTunnelInfo?.url) {
      if (webTunnelInfo?.token) {
        apiService.setRoomToken(webTunnelInfo.token);
      }
      const tokenParam = webTunnelInfo?.token ? `&token=${encodeURIComponent(webTunnelInfo.token)}` : '';
      const magicLink = `${webTunnelInfo.url}/?room=lovechat&role=guest&profile=user2${tokenParam}`;
      try {
        await navigator.clipboard.writeText(magicLink);
        showToast('Link Web copiado para a área de transferência! 💕', 'success');
        return { success: true, link: magicLink };
      } catch {
        return { success: false };
      }
    }

    const res = await startWebTunnelAction();
    if (res?.success && res?.url) {
      if (res.token) {
        apiService.setRoomToken(res.token);
      }
      const tokenParam = res.token ? `&token=${encodeURIComponent(res.token)}` : '';
      const magicLink = `${res.url}/?room=lovechat&role=guest&profile=user2${tokenParam}`;
      try {
        await navigator.clipboard.writeText(magicLink);
        showToast('Link Mágico copiado com sucesso! Envie para o seu amor 💕', 'success');
      } catch (e) {
        console.warn('Clipboard write error:', e);
      }
      return { success: true, link: magicLink };
    }
    return { success: false };
  }, [webTunnelInfo?.isOnline, webTunnelInfo?.url, webTunnelInfo?.token, startWebTunnelAction, showToast]);

  // Parar Túnel Web Seguro
  const stopWebTunnelAction = useCallback(async () => {
    if (isElectron) {
      await electronBridge.stopWebTunnel();
    }
    setWebTunnelInfo({
      isOnline: false,
      url: null,
      token: '',
      status: 'idle',
      error: null
    });
    showToast('Conexão Web encerrada.', 'info');
  }, [showToast]);

  // Renovar Token Secreto
  const regenerateTokenAction = useCallback(async () => {
    if (!isElectron) return;
    const res = await electronBridge.regenerateRoomToken();
    if (res && res.token) {
      apiService.setRoomToken(res.token);
      setWebTunnelInfo((prev) => ({ ...prev, token: res.token }));
      showToast('Nova chave secreta gerada com sucesso! 🔑', 'success');
      return res.token;
    }
  }, [showToast]);

  // Controle do Modal de Convite Web
  const [isWebInviteModalOpen, setIsWebInviteModalOpen] = useState(false);
  const openWebInviteModal = useCallback(() => setIsWebInviteModalOpen(true), []);
  const closeWebInviteModal = useCallback(() => setIsWebInviteModalOpen(false), []);

  return (
    <ServerContext.Provider
      value={{
        mode,
        setMode,
        myIp,
        lanIp,
        remoteIp,
        setRemoteIp,
        serverStatus,
        connectedServerDesc,
        isServerConfigured,
        isFirewallApplied,
        discoveredServers,
        isScanningServers,
        scanForServers,
        selectHostMode,
        connectToRemote,
        resetServerConnection,
        requestFirewall,
        copyMyIp,
        detectMyIp,
        webTunnelInfo,
        startWebTunnelAction,
        stopWebTunnelAction,
        startAndCopyWebLink,
        regenerateTokenAction,
        isWebInviteModalOpen,
        openWebInviteModal,
        closeWebInviteModal
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}
