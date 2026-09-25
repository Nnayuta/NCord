import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScreenShare, X, LayoutGrid, Monitor, Volume2, Loader2, RotateCw, Check } from 'lucide-react';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useWebRTC } from '../../context/WebRTCContext';

export function ScreenPickerModal({ isOpen, onClose }) {
  const { startScreenShare, isLocalScreenSharing } = useWebRTC();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('applications'); // 'applications' | 'displays'
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [streamAudio, setStreamAudio] = useState(true);
  const isFetchingRef = useRef(false);

  const fetchSources = useCallback(async () => {
    if (!isElectron || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      const rawSources = await electronBridge.getDesktopSources();
      if (Array.isArray(rawSources)) {
        setSources(rawSources);

        // Se ainda não selecionou ou o item selecionado não existe mais na lista
        setSelectedSourceId((prevId) => {
          const exists = rawSources.some((s) => s.id === prevId);
          if (exists) return prevId;

          const firstApp = rawSources.find((s) => !s.id.startsWith('screen:'));
          const firstDisplay = rawSources.find((s) => s.id.startsWith('screen:'));
          return (firstApp ? firstApp.id : (firstDisplay ? firstDisplay.id : null));
        });
      }
    } catch (e) {
      console.warn('[ScreenPickerModal] Erro ao buscar fontes de desktop:', e);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Executar busca SOMENTE quando o modal abre
  useEffect(() => {
    if (isOpen) {
      fetchSources();
    }
  }, [isOpen, fetchSources]);

  // Suporte a teclado: ESC para fechar, ENTER para confirmar
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && selectedSourceId) {
        e.preventDefault();
        handleConfirm();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedSourceId]);

  if (!isOpen) return null;

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
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
      >
        <div className="quality-header">
          <div className="quality-title">
            <ScreenShare size={20} color="#f43f8e" />
            <span>{isLocalScreenSharing ? 'Trocar Janela / Tela da Transmissão' : 'Compartilhar sua Tela'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-change-server"
              onClick={fetchSources}
              disabled={loading}
              title="Atualizar lista de janelas e telas abertas"
            >
              <RotateCw size={13} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Buscando...' : 'Atualizar'}</span>
            </button>
            <button
              type="button"
              className="btn-close-quality"
              onClick={handleCancel}
              title="Fechar (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Abas com contador reactivo */}
        <div className="screen-picker-tabs">
          <button
            type="button"
            className={`screen-tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('applications');
              const first = applications[0];
              if (first) setSelectedSourceId(first.id);
            }}
          >
            <LayoutGrid size={16} />
            <span>Aplicativos / Janelas ({applications.length})</span>
          </button>

          <button
            type="button"
            className={`screen-tab-btn ${activeTab === 'displays' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('displays');
              const first = displays[0];
              if (first) setSelectedSourceId(first.id);
            }}
          >
            <Monitor size={16} />
            <span>Telas Inteiras ({displays.length})</span>
          </button>
        </div>

        {/* Grade de fontes sem sumir da tela durante refresh */}
        <div className="screen-sources-container">
          {displayedSources.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '36px 16px', textAlign: 'center', color: '#949ba4' }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={24} className="spin" color="#f43f8e" />
                  <span>Localizando janelas ativas...</span>
                </div>
              ) : (
                <div>Nenhuma janela ou tela encontrada nesta categoria.</div>
              )}
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
                  title={`${source.name} (Dois cliques para transmitir)`}
                >
                  <div className="source-thumbnail-frame">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} loading="lazy" />
                    ) : (
                      <Monitor size={32} color="#949ba4" />
                    )}

                    {source.appIcon && (
                      <img src={source.appIcon} alt="App Icon" className="source-app-icon" />
                    )}

                    {isSelected && (
                      <div className="source-selected-badge">
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                  <span className="source-card-title">{source.name || 'Janela'}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Toggle de Áudio */}
        <div className="mixer-anti-echo-card" style={{ marginBottom: '1.25rem' }}>
          <div className="mixer-anti-echo-info">
            <div className="mixer-anti-echo-title">
              <Volume2 size={16} color="#4ade80" />
              <span>{activeTab === 'applications' ? 'Transmitir Áudio Exclusivo (WASAPI)' : 'Transmitir Áudio do Computador / Sistema (WASAPI)'}</span>
            </div>
            <div className="mixer-anti-echo-desc">
              {activeTab === 'applications'
                ? 'Transmite o som do aplicativo selecionado em alta definição sem chiados de fundo.'
                : 'Transmite todo o som do computador/jogos/navegador em alta fidelidade com isolamento de eco.'}
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

        {/* Ações */}
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

