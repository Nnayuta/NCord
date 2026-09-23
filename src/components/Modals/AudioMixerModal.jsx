import React, { useEffect } from 'react';
import { SlidersHorizontal, X, ShieldCheck, Volume2, VolumeX, RotateCw, Sparkles, Loader2 } from 'lucide-react';
import { useAudioMixer } from '../../context/AudioMixerContext';

export function AudioMixerModal({ isOpen, onClose }) {
  const {
    apps,
    loadingApps,
    masterVolume,
    isMasterMuted,
    isAntiEcho,
    activeProcessPids,
    setIsAntiEcho,
    refreshApps,
    toggleProcessCapture,
    updateMasterVolume,
    toggleMasterMute
  } = useAudioMixer();

  useEffect(() => {
    if (isOpen) {
      refreshApps();
    }
  }, [isOpen, refreshApps]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="quality-header">
          <div className="quality-title">
            <SlidersHorizontal size={20} color="#f43f8e" />
            <span>Mixer de Áudio da Transmissão</span>
          </div>
          <button type="button" className="btn-close-quality" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>
        <p className="quality-subtitle">
          Escolha quais programas transmitem som e ajuste volumes individuais na live
        </p>

        {/* Card Anti-Eco */}
        <div className="mixer-anti-echo-card">
          <div className="mixer-anti-echo-info">
            <div className="mixer-anti-echo-title">
              <ShieldCheck size={16} color="#38bdf8" />
              <span>Anti-Eco / Silenciar LoveChat</span>
            </div>
            <div className="mixer-anti-echo-desc">
              Impede que o parceiro ouça a própria voz na live ao transmitir a tela inteira.
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isAntiEcho}
              onChange={(e) => setIsAntiEcho(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {/* Volume Master */}
        <div className="mixer-master-card">
          <div className="mixer-master-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={16} /> Volume Master da Live
            </span>
            <span className="mixer-vol-val">{Math.round(masterVolume * 100)}%</span>
          </div>
          <div className="mixer-slider-row">
            <button
              type="button"
              className="btn-mixer-mute"
              onClick={toggleMasterMute}
              title="Mutar Som da Live"
              style={{ color: isMasterMuted ? '#f23f43' : 'inherit' }}
            >
              {isMasterMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={masterVolume}
              onChange={(e) => updateMasterVolume(e.target.value)}
              className="mixer-slider"
            />
          </div>
        </div>

        {/* Lista de Aplicativos Detectados */}
        <div className="quality-header" style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#949ba4', letterSpacing: '0.6px' }}>
            APLICATIVOS DETECTADOS
          </span>
          <button
            type="button"
            className="btn-change-server"
            onClick={refreshApps}
            title="Atualizar Lista de Programas"
          >
            <RotateCw size={13} className={loadingApps ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="mixer-apps-container">
          {loadingApps ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', color: '#949ba4', fontSize: '0.85rem' }}>
              <Loader2 size={16} className="spin" />
              <span>Carregando programas abertos...</span>
            </div>
          ) : apps.length === 0 ? (
            <div style={{ padding: '16px', color: '#949ba4', fontSize: '0.85rem', textAlign: 'center' }}>
              Nenhum aplicativo com áudio detectado no momento.
            </div>
          ) : (
            apps.map((app) => {
              const isCaptured = activeProcessPids.has(app.pid);
              return (
                <div key={app.pid} className="mixer-app-item">
                  <div className="mixer-app-meta">
                    <span className="mixer-app-name">{app.name || 'Aplicativo'}</span>
                    <span className="mixer-app-title">{app.windowTitle || `PID: ${app.pid}`}</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isCaptured}
                      onChange={(e) => toggleProcessCapture(app.pid, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#c084fc' }}>
          <Sparkles size={14} />
          <span>Processamento WASAPI nativo de alta fidelidade sem delay.</span>
        </div>
      </div>
    </div>
  );
}
