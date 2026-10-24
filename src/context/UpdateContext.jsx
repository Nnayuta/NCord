import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { electronBridge, isElectron } from '../services/electronBridge';
import { useToast } from '../hooks/useToast';

const UpdateContext = createContext(null);

export function UpdateProvider({ children }) {
  const { showToast } = useToast();

  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [status, setStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({
    percent: 0,
    speedFormatted: '0 MB/s',
    downloadedFormatted: '0 MB',
    totalFormatted: '0 MB'
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Carregar versão atual ao inicializar
  useEffect(() => {
    if (!isElectron) return;
    electronBridge.getAppVersion().then((res) => {
      if (res && res.version) {
        setCurrentVersion(res.version);
      }
    });
  }, []);

  // Iniciar download da atualização (com suporte a parâmetro direto para auto-start)
  const startDownload = useCallback(async (customInfo = null) => {
    const info = customInfo || updateInfo;
    if (!info || !info.downloadUrl) return;

    setStatus('downloading');
    setErrorMessage('');
    setDownloadProgress({
      percent: 0,
      speedFormatted: '0 MB/s',
      downloadedFormatted: '0 MB',
      totalFormatted: info.assetSize ? `${(info.assetSize / (1024 * 1024)).toFixed(1)} MB` : '0 MB'
    });

    try {
      const res = await electronBridge.downloadUpdate(info.downloadUrl);
      if (res && res.success) {
        setStatus('downloaded');
      } else if (res && res.error) {
        setStatus('error');
        setErrorMessage(res.error);
        showToast('Falha no download da atualização.', 'error');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao baixar atualização.');
      showToast('Falha no download da atualização.', 'error');
    }
  }, [updateInfo, showToast]);

  // Verificar atualizações manualmente ou em segundo plano
  const checkUpdates = useCallback(async (isManual = false) => {
    if (!isElectron) return;

    setStatus('checking');
    setErrorMessage('');
    if (isManual) {
      showToast('Verificando atualizações no GitHub... 🔍', 'info');
    }

    try {
      const res = await electronBridge.checkForUpdates();
      if (res && res.currentVersion) {
        setCurrentVersion(res.currentVersion);
      }

      if (res && res.updateAvailable) {
        console.log(`[UpdateContext] Nova versão obrigatória encontrada: v${res.latestVersion}`);
        setUpdateInfo(res);
        setStatus('available');
        setIsModalOpen(true);
        showToast(`🚀 Atualização obrigatória disponível: v${res.latestVersion}!`, 'info');
        // Em modo obrigatório, dispara o download imediatamente
        startDownload(res);
      } else {
        setStatus('upToDate');
        if (isManual) {
          showToast('Você já está usando a versão mais recente! ✨', 'success');
        }
      }
    } catch (err) {
      console.warn('[UpdateContext] Erro ao verificar atualizações:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Erro ao conectar com o GitHub.');
      if (isManual) {
        showToast('Não foi possível verificar atualizações no momento.', 'error');
      }
    }
  }, [showToast, startDownload]);

  // Ouvir eventos do Main Process
  useEffect(() => {
    if (!isElectron) return;

    electronBridge.onUpdateAvailable((info) => {
      if (info && info.updateAvailable) {
        setUpdateInfo(info);
        setStatus('available');
        setIsModalOpen(true);
        showToast(`✨ Atualização obrigatória disponível (v${info.latestVersion})!`, 'info');
        startDownload(info);
      }
    });

    electronBridge.onUpdateProgress((progress) => {
      setStatus('downloading');
      setDownloadProgress({
        percent: progress.percent || 0,
        speedFormatted: progress.speedFormatted || '0 MB/s',
        downloadedFormatted: progress.downloadedFormatted || '0 MB',
        totalFormatted: progress.totalFormatted || '0 MB'
      });
    });

    electronBridge.onUpdateDownloaded((data) => {
      setStatus('downloaded');
      setDownloadProgress((prev) => ({ ...prev, percent: 100 }));
      showToast('Download 100% concluído! Pronto para reiniciar e atualizar.', 'success');
    });
  }, [showToast, startDownload]);

  // Checagem imediata ao iniciar o app e periódica a cada 5 minutos
  useEffect(() => {
    if (!isElectron) return;

    const timer = setTimeout(() => {
      checkUpdates(false);
    }, 1500);

    const interval = setInterval(() => {
      checkUpdates(false);
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkUpdates]);

  // Instalar e reiniciar o aplicativo
  const installAndRestart = useCallback(async () => {
    try {
      const res = await electronBridge.installUpdate();
      if (res && res.isDev) {
        showToast('Ambiente de desenvolvimento: o instalador foi aberto.', 'info');
      }
    } catch (err) {
      showToast('Erro ao aplicar atualização.', 'error');
    }
  }, [showToast]);

  const openReleasesPage = useCallback(() => {
    electronBridge.openReleasesPage();
  }, []);

  const openUpdateModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeUpdateModal = useCallback(() => {
    // Atualização é estritamente obrigatória quando há nova versão
    if (status === 'available' || status === 'downloading' || status === 'downloaded') {
      showToast('Esta atualização é obrigatória para continuar usando o LoveChat.', 'warning');
      return;
    }
    setIsModalOpen(false);
  }, [status, showToast]);

  return (
    <UpdateContext.Provider
      value={{
        currentVersion,
        status,
        updateInfo,
        downloadProgress,
        isModalOpen,
        errorMessage,
        checkUpdates,
        startDownload,
        installAndRestart,
        openReleasesPage,
        openUpdateModal,
        closeUpdateModal,
        hasUpdate: status === 'available' || status === 'downloading' || status === 'downloaded',
        isMandatory: true
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useAutoUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useAutoUpdate deve ser usado dentro de um UpdateProvider');
  }
  return context;
}
