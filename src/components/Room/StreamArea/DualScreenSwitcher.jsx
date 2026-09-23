import React from 'react';
import { Monitor, Columns2 } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useProfiles } from '../../../context/ProfileContext';

export function DualScreenSwitcher() {
  const {
    isLocalScreenSharing,
    isRemoteScreenSharing,
    dualScreenViewMode,
    setDualScreenViewMode
  } = useWebRTC();
  const { otherProfile } = useProfiles();

  if (!isLocalScreenSharing || !isRemoteScreenSharing) return null;

  return (
    <div className="dual-screen-switcher-bar">
      <button
        type="button"
        className={`dual-screen-tab ${dualScreenViewMode === 'remote' ? 'active' : ''}`}
        onClick={() => setDualScreenViewMode('remote')}
      >
        <Monitor size={15} />
        <span>Tela de {otherProfile.name || 'Parceiro'}</span>
      </button>

      <button
        type="button"
        className={`dual-screen-tab ${dualScreenViewMode === 'local' ? 'active' : ''}`}
        onClick={() => setDualScreenViewMode('local')}
      >
        <Monitor size={15} />
        <span>Minha Tela</span>
      </button>

      <button
        type="button"
        className={`dual-screen-tab ${dualScreenViewMode === 'split' ? 'active' : ''}`}
        onClick={() => setDualScreenViewMode('split')}
      >
        <Columns2 size={15} />
        <span>Dividir Tela (Lado a Lado)</span>
      </button>
    </div>
  );
}
