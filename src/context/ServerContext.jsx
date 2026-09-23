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
        } catch (e) {}
      } else {
        const savedRemoteIp = localStorage.getItem('lovechat_remote_ip');
        if (savedRemoteIp) {
          setRemoteIp(savedRemoteIp);
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

      // Testar probe do servidor remoto
      const ipRes = await apiService.getMyIp();
      if (ipRes) {
        setRemoteIp(cleanIp);
        localStorage.setItem('lovechat_remote_ip', cleanIp);
        setConnectedServerDesc(`Conectado no Amor (${cleanIp})`);
        setServerStatus('online');
        setIsServerConfigured(true);
        showToast('Conectado ao servidor com sucesso! 💕', 'success');
        return true;
      } else {
        throw new Error('Falha de resposta do servidor remoto');
      }
    } catch (err) {
      showToast(`Não foi possível alcançar o servidor em ${cleanIp}.`, 'error');
      setServerStatus('error');
      return false;
    }
  }, [showToast]);

  const resetServerConnection = useCallback(async () => {
    setIsServerConfigured(false);
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
        detectMyIp
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
