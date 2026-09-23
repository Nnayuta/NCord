import React from 'react';
import { Sparkles, ArrowUpCircle } from 'lucide-react';
import { useAutoUpdate } from '../../context/UpdateContext';

export function UpdateBadge({ variant = 'pill' }) {
  const { hasUpdate, updateInfo, openUpdateModal } = useAutoUpdate();

  if (!hasUpdate || !updateInfo) return null;

  if (variant === 'button') {
    return (
      <button
        type="button"
        className="btn-update-available-badge"
        onClick={openUpdateModal}
        title={`Nova versão v${updateInfo.latestVersion} disponível! Clique para atualizar.`}
      >
        <Sparkles size={13} className="sparkle-pulse" />
        <span>v{updateInfo.latestVersion} Disponível</span>
      </button>
    );
  }

  return (
    <div
      className="update-indicator-pill"
      onClick={openUpdateModal}
      title={`Nova versão v${updateInfo.latestVersion} disponível! Clique para atualizar.`}
    >
      <span className="update-pulse-dot"></span>
      <ArrowUpCircle size={13} color="#ec4899" />
      <span>Update v{updateInfo.latestVersion}</span>
    </div>
  );
}
