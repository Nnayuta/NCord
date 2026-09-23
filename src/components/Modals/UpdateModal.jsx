import React from 'react';
import {
  Sparkles,
  Download,
  RefreshCw,
  ArrowUpCircle,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Rocket
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
    openReleasesPage,
    closeUpdateModal
  } = useAutoUpdate();

  if (!isModalOpen || !updateInfo) return null;

  const isDownloading = status === 'downloading';
  const isDownloaded = status === 'downloaded';
  const isError = status === 'error';

  return (
    <div className="modal-overlay-backdrop update-modal-overlay" onClick={closeUpdateModal}>
      <div
        className="modal-dialog update-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        {/* Cabeçalho do Modal */}
        <div className="update-modal-header">
          <div className="update-modal-title">
            <div className="update-title-icon-wrap">
              <Rocket size={20} color="#ec4899" className="pulse-icon" />
            </div>
            <div>
              <h3>Nova Atualização Disponível!</h3>
              <p className="update-subtitle">Uma nova versão do LoveChat está pronta para você 💕</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-quality"
            onClick={closeUpdateModal}
            title="Fechar"
            disabled={isDownloading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Comparação de Versões */}
        <div className="update-version-row">
          <div className="update-version-chip current">
            <span className="chip-label">Sua versão</span>
            <span className="chip-val">v{currentVersion}</span>
          </div>
          <div className="update-version-arrow">
            <ArrowUpCircle size={18} color="#ec4899" />
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
            <span>O que há de novo:</span>
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
                <p>Melhorias contínuas de estabilidade, qualidade de transmissão e novidades.</p>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Progresso de Download */}
        {isDownloading && (
          <div className="update-progress-container">
            <div className="update-progress-info">
              <span className="progress-status-text">
                <RefreshCw size={13} className="spin-fast" /> Baixando atualização...
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

        {/* Mensagem de Download Concluído */}
        {isDownloaded && (
          <div className="update-success-banner">
            <CheckCircle2 size={18} color="#10b981" />
            <span>Download 100% concluído! Clique abaixo para reiniciar e aplicar a atualização.</span>
          </div>
        )}

        {/* Mensagem de Erro */}
        {isError && (
          <div className="update-error-banner">
            <AlertCircle size={18} color="#ef4444" />
            <span>{errorMessage || 'Ocorreu um erro durante o download.'}</span>
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="update-modal-footer">
          <button
            type="button"
            className="btn-update-github"
            onClick={openReleasesPage}
            title="Ver página da Release no GitHub"
          >
            <ExternalLink size={14} />
            <span>GitHub</span>
          </button>

          <div className="update-footer-main-actions">
            {!isDownloading && !isDownloaded && (
              <>
                <button
                  type="button"
                  className="btn-update-cancel"
                  onClick={closeUpdateModal}
                >
                  Lembrar Mais Tarde
                </button>
                <button
                  type="button"
                  className="btn-update-primary"
                  onClick={startDownload}
                >
                  <Download size={15} />
                  <span>Baixar e Atualizar</span>
                </button>
              </>
            )}

            {isDownloading && (
              <button
                type="button"
                className="btn-update-primary disabled"
                disabled
              >
                <RefreshCw size={15} className="spin-fast" />
                <span>Baixando...</span>
              </button>
            )}

            {isDownloaded && (
              <button
                type="button"
                className="btn-update-primary success-btn"
                onClick={installAndRestart}
              >
                <Rocket size={15} />
                <span>Reiniciar e Aplicar ✨</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
