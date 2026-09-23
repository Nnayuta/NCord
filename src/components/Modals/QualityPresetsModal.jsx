import React from 'react';
import { Sparkles, X, Zap, Clapperboard, Gamepad2, Sliders, Check } from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';
import { QUALITY_PRESETS } from '../../services/webrtcEngine';

export function QualityPresetsModal({ isOpen, onClose }) {
  const { activePreset, changeQualityPreset } = useWebRTC();

  if (!isOpen) return null;

  const presets = [
    {
      key: 'ultra',
      icon: Zap,
      badge: 'Ativo',
      ...QUALITY_PRESETS.ultra
    },
    {
      key: 'cinema',
      icon: Clapperboard,
      ...QUALITY_PRESETS.cinema
    },
    {
      key: 'gamer',
      icon: Gamepad2,
      ...QUALITY_PRESETS.gamer
    },
    {
      key: 'balanced',
      icon: Sliders,
      ...QUALITY_PRESETS.balanced
    }
  ];

  const handleSelect = (key) => {
    changeQualityPreset(key);
    onClose();
  };

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="quality-header">
          <div className="quality-title">
            <Sparkles size={20} color="#f43f8e" />
            <span>Qualidade de Transmissão</span>
          </div>
          <button type="button" className="btn-close-quality" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>
        <p className="quality-subtitle">Otimizado para ZeroTier / Rede sem limite de banda</p>

        <div className="quality-options-list">
          {presets.map((p) => {
            const Icon = p.icon;
            const isActive = activePreset.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`quality-option ${isActive ? 'active' : ''}`}
                onClick={() => handleSelect(p.key)}
              >
                <div className="quality-opt-icon">
                  <Icon size={20} />
                </div>
                <div className="quality-opt-info">
                  <div className="quality-opt-title">
                    {p.label}
                    {isActive && <span className="badge-recom">Ativo</span>}
                  </div>
                  <div className="quality-opt-desc">{p.description}</div>
                </div>
                {isActive && <Check size={18} className="profile-check-icon" />}
              </button>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#949ba4', paddingTop: '8px', borderTop: '1px solid rgba(244, 63, 142, 0.1)' }}>
          <span>🚀 Perfil Selecionado: <strong>{activePreset.label}</strong></span>
        </div>
      </div>
    </div>
  );
}
