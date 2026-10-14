import React from 'react';
import { Volume2, VolumeX, Scan, PanelLeftClose, Maximize, ScreenShare, Sliders } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { toggleFullscreen } from '../../../services/fullscreen';

export function StreamControlsOverlay({
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
    isLocalScreenSharing,
    openQualityModal
  } = useWebRTC();

  const toggleMute = () => {
    setIsScreenMuted(!isScreenMuted);
  };

  const toggleFit = () => {
    setScreenFitMode(screenFitMode === 'contain' ? 'cover' : 'contain');
  };

  const handleFullscreen = () => {
    toggleFullscreen(document.getElementById(cardElementId));
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

      {/* Volume da Transmissão (com boost de até 200%) */}
      <div
        className="stream-audio-control"
        title={`Volume da Transmissão: ${isScreenMuted ? 'Mudo' : `${Math.round(screenVolume * 100)}%`}`}
      >
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
          max="2"
          step="0.05"
          value={isScreenMuted ? 0 : screenVolume}
          onChange={(e) => {
            setIsScreenMuted(false);
            setScreenVolume(Number(e.target.value));
          }}
          className="stream-vol-slider"
          aria-label="Volume da Transmissão"
        />
        <span className="stream-vol-percentage">
          {isScreenMuted ? '0%' : `${Math.round(screenVolume * 100)}%`}
        </span>
      </div>

      {/* Qualidade da Transmissão (Resolução & FPS Modular) - Apenas o transmissor altera */}
      {(isLocalStream || isLocalScreenSharing) && (
        <button
          type="button"
          className="btn-stream-action"
          onClick={openQualityModal}
          title="Qualidade da sua Transmissão (Resolução e FPS)"
        >
          <Sliders size={16} />
        </button>
      )}

      {/* Proporção (Sem cortes / Preencher) */}
      <button
        type="button"
        className="btn-stream-action"
        onClick={toggleFit}
        title="Ajustar Proporção (Sem Cortes / Preencher)"
      >
        <Scan size={16} />
      </button>



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
