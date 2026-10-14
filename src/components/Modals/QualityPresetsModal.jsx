import React from 'react';
import { Sparkles, X, Check, Monitor, Cpu, Gauge } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { STREAM_RESOLUTIONS, STREAM_FPS_OPTIONS, getModularStreamPreset } from '../../services/webrtcEngine';

export function QualityPresetsModal({ isOpen, onClose }) {
  const {
    streamResolution,
    streamFps,
    changeModularQuality,
    isLocalScreenSharing,
    remoteScreenPreset
  } = useWebRTC();

  if (!isOpen) return null;

  const currentPreset = getModularStreamPreset(streamResolution, streamFps);
  const bitrateMbps = (currentPreset.screenBitrate / 1_000_000).toFixed(1);

  const handleSelectResolution = (resKey) => {
    changeModularQuality(resKey, streamFps);
  };

  const handleSelectFps = (fps) => {
    changeModularQuality(streamResolution, fps);
  };

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog quality-modular-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="quality-header">
          <div className="quality-title">
            <Sparkles size={20} color="#f43f8e" />
            <span>Qualidade da Sua Transmissão</span>
          </div>
          <button type="button" className="btn-close-quality" onClick={onClose} title="Fechar (ESC)">
            <X size={18} />
          </button>
        </div>
        <p className="quality-subtitle">
          Configure a resolução e taxa de quadros de saída da sua transmissão. O parceiro receberá exatamente estas configurações.
        </p>

        {remoteScreenPreset && !isLocalScreenSharing && (
          <div className="remote-stream-info-banner">
            <span>📺 Você está assistindo à transmissão do parceiro em <strong>{remoteScreenPreset.label || remoteScreenPreset.badge}</strong>. A qualidade de saída é determinada por quem está transmitindo.</span>
          </div>
        )}

        {/* Bloco 1: Seleção de Resolução */}
        <div className="modular-quality-section">
          <label className="modular-section-label">
            <Monitor size={15} color="#f43f8e" />
            <span>Resolução de Vídeo</span>
          </label>
          <div className="modular-res-grid">
            {Object.values(STREAM_RESOLUTIONS).map((res) => {
              const isSelected = streamResolution === res.id;
              return (
                <button
                  key={res.id}
                  type="button"
                  className={`modular-opt-card ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectResolution(res.id)}
                >
                  <div className="modular-opt-header">
                    <span className="modular-opt-title">{res.label}</span>
                    {isSelected && <Check size={16} className="profile-check-icon" />}
                  </div>
                  <span className="modular-opt-desc">{res.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bloco 2: Seleção de FPS */}
        <div className="modular-quality-section">
          <label className="modular-section-label">
            <Cpu size={15} color="#f43f8e" />
            <span>Taxa de Quadros (FPS)</span>
          </label>
          <div className="modular-fps-grid">
            {STREAM_FPS_OPTIONS.map((opt) => {
              const isSelected = Number(streamFps) === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`modular-opt-card modular-fps-card ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectFps(opt.id)}
                >
                  <div className="modular-opt-header">
                    <span className="modular-opt-title">{opt.label}</span>
                    <span className="modular-fps-badge">{opt.badge}</span>
                    {isSelected && <Check size={16} className="profile-check-icon" />}
                  </div>
                  <span className="modular-opt-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bloco 3: Bitrate e Perfil Automático */}
        <div className="modular-summary-card">
          <div className="modular-summary-icon">
            <Gauge size={22} color="#f43f8e" />
          </div>
          <div className="modular-summary-info">
            <div className="modular-summary-title">
              <span>Bitrate Automático: <strong>{bitrateMbps} Mbps</strong></span>
              <span className="modular-auto-tag">Auto</span>
            </div>
            <div className="modular-summary-desc">
              Mantém os {streamFps} FPS com estabilidade e sem congelamentos na transmissão, adaptando o consumo em tempo real.
            </div>
            <div className="modular-summary-specs">
              <span>🔊 Áudio Opus 320 kbps VBR Broadcast</span>
              <span>⚡ Fluidez Prioritária Contínua</span>
            </div>
          </div>
        </div>

        <div className="modular-modal-actions">
          <button type="button" className="btn-picker-confirm" onClick={onClose} style={{ width: '100%' }}>
            Concluir Configuração
          </button>
        </div>
      </div>
    </div>
  );
}
