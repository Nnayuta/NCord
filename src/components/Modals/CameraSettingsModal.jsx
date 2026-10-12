import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  FlipHorizontal,
  RotateCw,
  RefreshCw,
  Sparkles,
  Check,
  Sun,
  Heart,
  Flame,
  Film,
  Moon,
  Scan,
  Sliders,
  Tv
} from 'lucide-react';
import { useWebRTC, CAMERA_FILTERS, CAMERA_RESOLUTIONS } from '../../context/WebRTCContext';

const FILTER_ICONS = {
  'none': Sun,
  'soft-glow': Heart,
  'warm-cozy': Flame,
  'cinema': Film,
  'vintage': Sparkles,
  'noir': Moon
};

export function CameraSettingsModal({ isOpen, onClose }) {
  const {
    availableCameras,
    selectedCameraId,
    cameraFacingMode,
    isCameraMirrored,
    cameraFilter,
    cameraResolution,
    cameraFitMode,
    isVideoOff,
    localStream,
    switchCamera,
    flipCamera,
    toggleCameraMirror,
    setCameraFilter,
    setCameraResolution,
    setCameraFitMode,
    refreshCameraDevices,
    getCameraStream
  } = useWebRTC();

  const previewVideoRef = useRef(null);
  const [previewStream, setPreviewStream] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Se a câmera já estiver ligada na chamada, usamos o localStream.
  // Se a câmera estiver desligada, geramos um stream de prévia temporário para o usuário testar antes de ligar!
  useEffect(() => {
    let active = true;
    let tempStream = null;

    if (!isOpen) {
      if (previewStream) {
        previewStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
        setPreviewStream(null);
      }
      return;
    }

    if (!isVideoOff && localStream) {
      // Já possui stream de câmera ativa na chamada
      if (previewVideoRef.current && previewVideoRef.current.srcObject !== localStream) {
        previewVideoRef.current.srcObject = localStream;
        previewVideoRef.current.play().catch(() => {});
      }
    } else {
      // Inicia prévia temporária para teste
      const startTempPreview = async () => {
        try {
          const stream = await getCameraStream(selectedCameraId, cameraFacingMode, cameraResolution);
          if (!active) {
            stream.getTracks().forEach((t) => {
              try { t.stop(); } catch (e) {}
            });
            return;
          }
          tempStream = stream;
          setPreviewStream(stream);
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
            previewVideoRef.current.play().catch(() => {});
          }
        } catch (err) {
          console.warn('[CameraSettingsModal] Não foi possível carregar prévia de vídeo:', err);
        }
      };

      startTempPreview();
    }

    return () => {
      active = false;
      if (tempStream) {
        tempStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
    };
  }, [isOpen, isVideoOff, localStream, selectedCameraId, cameraFacingMode, cameraResolution, getCameraStream]);

  // Atualizar lista de dispositivos ao abrir
  useEffect(() => {
    if (isOpen) {
      refreshCameraDevices();
    }
  }, [isOpen, refreshCameraDevices]);

  if (!isOpen) return null;

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    await refreshCameraDevices();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const currentStream = (!isVideoOff && localStream) ? localStream : previewStream;
  const hasLiveFeed = currentStream && currentStream.getVideoTracks().length > 0;

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog camera-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <div className="camera-modal-icon-badge">
              <Camera size={20} color="#f43f8e" />
            </div>
            <div>
              <h3>Configurações de Câmera</h3>
              <p className="camera-modal-subtitle">Alterne câmeras, espelhe sua imagem e use efeitos românticos</p>
            </div>
          </div>
          <button type="button" className="btn-close-quality" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="camera-modal-content-scroll">
          {/* Caixa de Prévia em Tempo Real */}
          <div className="camera-preview-wrapper">
            <div className="camera-preview-box">
              {hasLiveFeed ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted={true}
                  className={`camera-preview-video ${isCameraMirrored ? 'video-mirrored' : ''} cam-filter-${cameraFilter} ${cameraFitMode || 'contain'}`}
                />
              ) : (
                <div className="camera-preview-placeholder">
                  <Camera size={36} color="#a855f7" />
                  <span>Câmera desligada ou indisponível</span>
                  <p>Selecione um dispositivo abaixo para testar a imagem</p>
                </div>
              )}

              {/* Badges e Ações na Prévia */}
              <div className="camera-preview-badge">
                <span className="camera-live-dot"></span>
                <span>{(!isVideoOff && localStream) ? 'Câmera na Chamada' : 'Prévia ao Vivo'}</span>
              </div>

              <div className="camera-preview-quick-actions">
                <button
                  type="button"
                  className={`btn-preview-action ${isCameraMirrored ? 'active' : ''}`}
                  onClick={toggleCameraMirror}
                  title="Inverter/Espelhar horizontalmente"
                >
                  <FlipHorizontal size={14} />
                  <span>{isCameraMirrored ? 'Espelhado' : 'Normal'}</span>
                </button>

                <button
                  type="button"
                  className="btn-preview-action"
                  onClick={flipCamera}
                  title="Virar Câmera (Frontal / Traseira)"
                >
                  <RotateCw size={14} />
                  <span>Virar</span>
                </button>

                <button
                  type="button"
                  className={`btn-preview-action ${cameraFitMode === 'cover' ? 'active' : ''}`}
                  onClick={() => setCameraFitMode((prev) => (prev === 'cover' ? 'contain' : 'cover'))}
                  title="Ajuste de enquadramento"
                >
                  <Scan size={14} />
                  <span>{cameraFitMode === 'cover' ? 'Preencher' : 'Sem Cortes'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Seleção do Dispositivo de Câmera */}
          <div className="camera-section-card">
            <div className="camera-section-title-row">
              <div className="camera-section-label">
                <Camera size={16} color="#f43f8e" />
                <span>Dispositivo de Câmera</span>
              </div>
              <div className="camera-device-actions">
                <button
                  type="button"
                  className={`btn-cam-refresh-devices ${isRefreshing ? 'rotating' : ''}`}
                  onClick={handleRefreshClick}
                  title="Buscar novas câmeras conectadas"
                >
                  <RefreshCw size={14} />
                  <span>Atualizar</span>
                </button>
                <button
                  type="button"
                  className="btn-cam-flip-devices"
                  onClick={flipCamera}
                  title="Inverter entre Câmera Frontal e Traseira"
                >
                  <RotateCw size={14} />
                  <span>Inverter Câmera</span>
                </button>
              </div>
            </div>

            <div className="camera-select-wrapper">
              <select
                className="camera-dropdown-select"
                value={selectedCameraId}
                onChange={(e) => switchCamera(e.target.value)}
              >
                {availableCameras.length > 0 ? (
                  availableCameras.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Câmera ${idx + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">Nenhuma câmera detectada (Verifique permissões)</option>
                )}
              </select>
            </div>
          </div>

          {/* Espelhamento Horizontal */}
          <div className="camera-section-card">
            <div className="camera-toggle-row">
              <div className="camera-toggle-info">
                <div className="camera-toggle-title">
                  <FlipHorizontal size={16} color="#a855f7" />
                  <span>Espelhar Meu Vídeo (Modo Selfie)</span>
                </div>
                <div className="camera-toggle-desc">
                  Inverte a imagem horizontalmente como um espelho real. Ideal para câmeras frontais.
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isCameraMirrored}
                  onChange={toggleCameraMirror}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Filtros Românticos & Estéticos */}
          <div className="camera-section-card">
            <div className="camera-section-label">
              <Sparkles size={16} color="#f43f8e" />
              <span>Filtros Românticos & Clima Visual</span>
            </div>
            <p className="camera-section-hint">
              Efeitos de imagem em tempo real transmitidos e visíveis com um clique
            </p>

            <div className="camera-filters-grid">
              {CAMERA_FILTERS.map((f) => {
                const IconComponent = FILTER_ICONS[f.id] || Sparkles;
                const isActive = cameraFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`camera-filter-card ${isActive ? 'active' : ''}`}
                    onClick={() => setCameraFilter(f.id)}
                  >
                    <div className="filter-card-header">
                      <div className="filter-icon-bubble">
                        <IconComponent size={16} />
                      </div>
                      {isActive && <Check size={14} className="filter-active-check" />}
                    </div>
                    <span className="filter-name">{f.label}</span>
                    <span className="filter-desc">{f.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resolução & Nitidez */}
          <div className="camera-section-card">
            <div className="camera-section-label">
              <Tv size={16} color="#f43f8e" />
              <span>Resolução e Nitidez da Câmera</span>
            </div>
            <div className="camera-resolution-grid">
              {Object.values(CAMERA_RESOLUTIONS).map((res) => {
                const isActive = cameraResolution === res.id;
                return (
                  <button
                    key={res.id}
                    type="button"
                    className={`camera-resolution-card ${isActive ? 'active' : ''}`}
                    onClick={() => setCameraResolution(res.id)}
                  >
                    <div className="resolution-top-row">
                      <span className="resolution-name">{res.label}</span>
                      {isActive && <span className="resolution-badge">Ativo</span>}
                    </div>
                    <span className="resolution-desc">{res.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Enquadramento */}
          <div className="camera-section-card">
            <div className="camera-section-label">
              <Scan size={16} color="#f43f8e" />
              <span>Proporção de Visualização</span>
            </div>
            <div className="camera-fit-grid">
              <button
                type="button"
                className={`camera-fit-card ${cameraFitMode === 'contain' ? 'active' : ''}`}
                onClick={() => setCameraFitMode('contain')}
              >
                <div className="fit-card-title">Sem Cortes (100% Visível)</div>
                <div className="fit-card-desc">Exibe todo o ângulo da câmera sem recortar bordas</div>
              </button>
              <button
                type="button"
                className={`camera-fit-card ${cameraFitMode === 'cover' ? 'active' : ''}`}
                onClick={() => setCameraFitMode('cover')}
              >
                <div className="fit-card-title">Preencher Card</div>
                <div className="fit-card-desc">Preenche todo o espaço do card sem barras pretas</div>
              </button>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="camera-modal-footer">
          <button type="button" className="btn-camera-modal-confirm" onClick={onClose}>
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}
