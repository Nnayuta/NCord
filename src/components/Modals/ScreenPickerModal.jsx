import React, { useState, useEffect } from 'react';
import { ScreenShare, X, LayoutGrid, Monitor, Volume2, Loader2 } from 'lucide-react';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useWebRTC } from '../../context/WebRTCContext';

export function ScreenPickerModal({ isOpen, onClose }) {
  const { startScreenShare, isLocalScreenSharing } = useWebRTC();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('applications'); // 'applications' | 'displays'
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [streamAudio, setStreamAudio] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (!isElectron) {
      // No navegador, acionar diretamente o getDisplayMedia
      onClose();
      startScreenShare();
      return;
    }

    async function loadSources() {
      setLoading(true);
      try {
        const rawSources = await electronBridge.getDesktopSources();
        setSources(rawSources || []);
        if (rawSources && rawSources.length > 0) {
          setSelectedSourceId(rawSources[0].id);
        }
      } catch (e) {
        console.warn('Erro ao carregar fontes:', e);
      } finally {
        setLoading(false);
      }
    }
    loadSources();
  }, [isOpen, onClose, startScreenShare]);

  if (!isOpen || !isElectron) return null;

  const applications = sources.filter((s) => !s.id.startsWith('screen:'));
  const displays = sources.filter((s) => s.id.startsWith('screen:'));
  const displayedSources = activeTab === 'applications' ? applications : displays;

  const handleConfirm = async () => {
    if (!selectedSourceId) return;
    const selected = sources.find((s) => s.id === selectedSourceId);
    if (selected) {
      await electronBridge.selectDesktopSource(selected.id, streamAudio, selected.name);
      await startScreenShare(selected.id);
    }
    onClose();
  };

  const handleCancel = async () => {
    await electronBridge.cancelDesktopSource();
    onClose();
  };

  return (
    <div className="modal-overlay-backdrop" onClick={handleCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        <div className="quality-header">
          <div className="quality-title">
            <ScreenShare size={20} color="#f43f8e" />
            <span>{isLocalScreenSharing ? 'Trocar Janela / Tela da Transmissão' : 'Compartilhar sua Tela'}</span>
          </div>
          <button type="button" className="btn-close-quality" onClick={handleCancel} title="Fechar (ESC)">
            <X size={18} />
          </button>
        </div>

        {/* Abas */}
        <div className="screen-picker-tabs">
          <button
            type="button"
            className={`screen-tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => setActiveTab('applications')}
          >
            <LayoutGrid size={16} />
            <span>Aplicativos / Janelas ({applications.length})</span>
          </button>
          <button
            type="button"
            className={`screen-tab-btn ${activeTab === 'displays' ? 'active' : ''}`}
            onClick={() => setActiveTab('displays')}
          >
            <Monitor size={16} />
            <span>Telas Inteiras ({displays.length})</span>
          </button>
        </div>

        {/* Grade de fontes */}
        <div className="screen-sources-container">
          {loading ? (
            <div style={{ gridColumn: '1 / -1', padding: '30px', textAlign: 'center', color: '#949ba4' }}>
              <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
              <div>Buscando janelas e telas disponíveis...</div>
            </div>
          ) : displayedSources.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '30px', textAlign: 'center', color: '#949ba4' }}>
              Nenhuma fonte encontrada nesta categoria.
            </div>
          ) : (
            displayedSources.map((source) => {
              const isSelected = selectedSourceId === source.id;
              return (
                <div
                  key={source.id}
                  className={`screen-source-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedSourceId(source.id)}
                  onDoubleClick={handleConfirm}
                >
                  <div className="source-thumbnail-frame">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} />
                    ) : (
                      <Monitor size={32} color="#949ba4" />
                    )}
                  </div>
                  <span className="source-card-title" title={source.name}>
                    {source.name}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Toggle Áudio */}
        <div className="mixer-anti-echo-card" style={{ marginBottom: '1.25rem' }}>
          <div className="mixer-anti-echo-info">
            <div className="mixer-anti-echo-title">
              <Volume2 size={16} color="#4ade80" />
              <span>Transmitir Áudio Exclusivo</span>
            </div>
            <div className="mixer-anti-echo-desc">
              Transmite o som em alta definição sem ruídos de fundo do Windows.
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={streamAudio}
              onChange={(e) => setStreamAudio(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {/* Botões de Ação */}
        <div className="screen-picker-actions">
          <button type="button" className="btn-picker-cancel" onClick={handleCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-picker-confirm"
            onClick={handleConfirm}
            disabled={!selectedSourceId}
          >
            {isLocalScreenSharing ? 'Atualizar Transmissão' : 'Transmitir ao Vivo'}
          </button>
        </div>
      </div>
    </div>
  );
}
