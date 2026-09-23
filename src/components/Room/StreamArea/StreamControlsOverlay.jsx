import React from 'react';
import { Volume2, VolumeX, Scan, SlidersHorizontal, PanelLeftClose, Maximize, ScreenShare } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';

export function StreamControlsOverlay({
  onOpenMixer,
  onOpenScreenPicker,
  cardElementId = 'screen-share-card',
  isLocalStream = false
}) {
  const {
    screenVolume,
    setScreenVolume,
    isScreenMuted,
    setIsScreenMuted,
    screenFitMode,
    setScreenFitMode,
    setIsTheaterMode,
    isLocalScreenSharing
  } = useWebRTC();

  const toggleMute = () => {
    setIsScreenMuted(!isScreenMuted);
  };

  const toggleFit = () => {
    setScreenFitMode(screenFitMode === 'contain' ? 'cover' : 'contain');
  };

  const handleFullscreen = () => {
    const el = document.getElementById(cardElementId);
    if (el) {
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div className="stream-controls-overlay">
      {/* Trocar Janela / Tela durante a transmissão ativa */}
      {(isLocalStream || isLocalScreenSharing) && onOpenScreenPicker && (
        <button
          type="button"
          className="btn-stream-action btn-swap-screen"
          onClick={onOpenScreenPicker}
          title="Trocar Janela / Tela da Transmissão"
        >
          <ScreenShare size={16} color="#f43f8e" />
          <span className="btn-swap-label">Trocar Fonte</span>
        </button>
      )}

      {/* Volume da Transmissão */}
      <div className="stream-audio-control" title="Volume da Transmissão">
        <button
          type="button"
          className="btn-stream-action"
          onClick={toggleMute}
          title="Mutar/Desmutar Áudio da Transmissão"
        >
          {isScreenMuted || screenVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isScreenMuted ? 0 : screenVolume}
          onChange={(e) => {
            setIsScreenMuted(false);
            setScreenVolume(Number(e.target.value));
          }}
          className="stream-vol-slider"
        />
      </div>

      {/* Proporção (Sem cortes / Preencher) */}
      <button
        type="button"
        className="btn-stream-action"
        onClick={toggleFit}
        title="Ajustar Proporção (Sem Cortes / Preencher)"
      >
        <Scan size={16} />
      </button>

      {/* Mixer de Áudio */}
      {onOpenMixer && (
        <button
          type="button"
          className="btn-stream-action"
          onClick={onOpenMixer}
          title="Mixer de Áudio da Transmissão"
        >
          <SlidersHorizontal size={16} />
        </button>
      )}

      {/* Modo Teatro */}
      <button
        type="button"
        className="btn-stream-action"
        onClick={() => setIsTheaterMode((prev) => !prev)}
        title="Modo Teatro / Ocultar Barra (Tecla T)"
      >
        <PanelLeftClose size={16} />
      </button>

      {/* Tela Cheia */}
      <button
        type="button"
        className="btn-stream-action"
        onClick={handleFullscreen}
        title="Tela Cheia (Atalho: Tecla F)"
      >
        <Maximize size={16} />
      </button>
    </div>
  );
}
