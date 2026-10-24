import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ArrowUpCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Rocket,
  Lock,
  DownloadCloud
} from 'lucide-react';
import { useAutoUpdate } from '../../context/UpdateContext';

export function UpdateModal() {
  const {
    currentVersion,
    status,
    updateInfo,
    downloadProgress,
    isModalOpen,
    errorMessage,
    startDownload,
    installAndRestart,
    openReleasesPage
  } = useAutoUpdate();

  const [isRestarting, setIsRestarting] = useState(false);
  const [countdown, setCountdown] = useState(4);

  const isDownloading = status === 'downloading';
  const isDownloaded = status === 'downloaded';
  const isError = status === 'error';

  // Contagem regressiva automática para reiniciar quando o download for concluído
  useEffect(() => {
    if (isDownloaded) {
      setCountdown(4);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsRestarting(true);
            installAndRestart();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isDownloaded, installAndRestart]);

  if (!isModalOpen || !updateInfo) return null;

  const handleRestart = async () => {
    setIsRestarting(true);
    await installAndRestart();
  };

  const handleRetryDownload = () => {
    startDownload();
  };

  return (
    <div className="modal-overlay-backdrop update-modal-overlay mandatory-update-backdrop">
      <div
        className="modal-dialog update-modal-dialog mandatory-update-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        {/* Cabeçalho do Modal Obrigatório */}
        <div className="update-modal-header">
          <div className="update-modal-title">
            <div className="update-title-icon-wrap mandatory-icon-wrap">
              <Rocket size={22} color="#ec4899" className="pulse-icon" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Atualização Obrigatória</h3>
                <span className="update-mandatory-badge">
                  <Lock size={11} /> Obrigatório
                </span>
              </div>
              <p className="update-subtitle">
                Uma nova versão do LoveChat é necessária para manter sua conexão e chamadas estáveis 💕
              </p>
            </div>
          </div>
        </div>

        {/* Comparação de Versões */}
        <div className="update-version-row">
          <div className="update-version-chip current">
            <span className="chip-label">Sua versão</span>
            <span className="chip-val">v{currentVersion}</span>
          </div>
          <div className="update-version-arrow">
            <ArrowUpCircle size={20} color="#ec4899" />
          </div>
          <div className="update-version-chip latest">
            <span className="chip-label">Nova versão</span>
            <span className="chip-val">v{updateInfo.latestVersion}</span>
          </div>
        </div>

        {/* Nome da Release & Changelog */}
        <div className="update-changelog-section">
          <div className="update-section-title">
            <Sparkles size={14} color="#f43f8e" />
            <span>Novidades desta versão:</span>
          </div>
          <div className="update-changelog-box">
            {updateInfo.releaseName && updateInfo.releaseName !== `v${updateInfo.latestVersion}` && (
              <div className="update-release-title">
                <strong>{updateInfo.releaseName}</strong>
              </div>
            )}
            <div className="update-release-notes">
              {updateInfo.releaseNotes ? (
                <div style={{ whiteSpace: 'pre-line' }}>{updateInfo.releaseNotes}</div>
              ) : (
                <p>Melhorias de desempenho, estabilidade de transmissão de tela, qualidade de áudio e segurança.</p>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Progresso de Download */}
        {isDownloading && (
          <div className="update-progress-container">
            <div className="update-progress-info">
              <span className="progress-status-text">
                <RefreshCw size={14} className="spin-fast" /> Baixando atualização oficial...
              </span>
              <span className="progress-percent">{downloadProgress.percent}%</span>
            </div>
            <div className="update-progress-bar-track">
              <div
                className="update-progress-bar-fill"
                style={{ width: `${downloadProgress.percent}%` }}
              ></div>
            </div>
            <div className="update-progress-meta">
              <span>{downloadProgress.downloadedFormatted} de {downloadProgress.totalFormatted}</span>
              <span>{downloadProgress.speedFormatted}</span>
            </div>
          </div>
        )}

        {/* Mensagem de Download Concluído com Auto-Restart */}
        {isDownloaded && (
          <div className="update-success-banner" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color="#10b981" />
              <strong style={{ color: '#10b981' }}>Download 100% Concluído!</strong>
            </div>
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
              Reiniciando e aplicando a atualização automaticamente em <strong>{countdown}s</strong>...
            </span>
          </div>
        )}

        {/* Mensagem de Erro com Ação de Contingência */}
        {isError && (
          <div className="update-error-banner">
            <AlertCircle size={18} color="#ef4444" />
            <span>{errorMessage || 'Ocorreu uma instabilidade na conexão durante o download.'}</span>
          </div>
        )}

        {/* Rodapé com Ações do Auto-Updater */}
        <div className="update-modal-footer">
          <button
            type="button"
            className="btn-update-github"
            onClick={openReleasesPage}
            title="Ver detalhes da Release no GitHub"
          >
            <ExternalLink size={14} />
            <span>Ver no GitHub</span>
          </button>

          <div className="update-footer-main-actions">
            {!isDownloading && !isDownloaded && !isError && (
              <button
                type="button"
                className="btn-update-primary"
                onClick={() => startDownload()}
              >
                <DownloadCloud size={16} />
                <span>Iniciar Download Agora</span>
              </button>
            )}

            {isError && (
              <button
                type="button"
                className="btn-update-primary"
                onClick={handleRetryDownload}
              >
                <RefreshCw size={15} />
                <span>Tentar Novamente</span>
              </button>
            )}

            {isDownloading && (
              <button
                type="button"
                className="btn-update-primary disabled"
                disabled
              >
                <RefreshCw size={15} className="spin-fast" />
                <span>Baixando ({downloadProgress.percent}%)...</span>
              </button>
            )}

            {isDownloaded && (
              <button
                type="button"
                className={`btn-update-primary success-btn ${isRestarting ? 'disabled' : ''}`}
                onClick={handleRestart}
                disabled={isRestarting}
              >
                {isRestarting ? (
                  <>
                    <RefreshCw size={15} className="spin-fast" />
                    <span>Reiniciando LoveChat... 🚀</span>
                  </>
                ) : (
                  <>
                    <Rocket size={15} />
                    <span>Reiniciar Agora ({countdown}s) ✨</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
