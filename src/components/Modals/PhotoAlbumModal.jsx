import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  FolderOpen,
  FolderX,
  Images,
  Download,
  UserCheck,
  Search,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  FileImage,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { apiService } from '../../services/apiService';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useServer } from '../../context/ServerContext';
import { useProfiles } from '../../context/ProfileContext';
import { useToast } from '../../hooks/useToast';
import './PhotoAlbum.css';

const POLL_INTERVAL_MS = 10000;
const SWIPE_MIN_PX = 60;
const DOUBLE_TAP_MS = 300;

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

// Assinatura leve da lista: só atualiza o estado (e re-renderiza a grade) quando algo mudou de fato
const photosSignature = (list) => list.map((p) => `${p.name}:${p.mtime || 0}:${p.size || 0}`).join('|');

export function PhotoAlbumModal({ isOpen, onClose }) {
  const { mode } = useServer();
  const { activeProfileId, updateProfileAvatar } = useProfiles();
  const { showToast } = useToast();

  const isHost = mode === 'host';
  const [photos, setPhotos] = useState([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState('recent'); // 'recent' | 'old' | 'name'
  const [viewerIndex, setViewerIndex] = useState(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [isSettingAvatar, setIsSettingAvatar] = useState(false);

  const signatureRef = useRef('');
  const touchRef = useRef({ x: 0, y: 0, t: 0, lastTap: 0 });

  const fetchPhotos = useCallback(async (showNotification = false) => {
    setIsLoading(true);
    try {
      const res = await apiService.getAlbumPhotos();
      if (res) {
        const list = Array.isArray(res.photos) ? res.photos : [];
        setIsConfigured(!!res.isConfigured);
        setFolderName(res.folderName || '');
        const sig = photosSignature(list);
        if (sig !== signatureRef.current) {
          signatureRef.current = sig;
          setPhotos(list);
        }
        if (showNotification) {
          showToast(`Álbum atualizado! ${list.length} ${list.length === 1 ? 'foto' : 'fotos'} 📸`, 'info');
        }
      }
    } catch (err) {
      console.warn('[PhotoAlbumModal] Erro ao carregar fotos:', err);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [showToast]);

  // Carrega ao abrir e atualiza periodicamente (pausa com a aba oculta)
  useEffect(() => {
    if (!isOpen) {
      setViewerIndex(null);
      setSearchTerm('');
      setZoomed(false);
      return undefined;
    }
    fetchPhotos();
    const interval = setInterval(() => {
      if (!document.hidden) fetchPhotos();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOpen, fetchPhotos]);

  // Trava o scroll da página enquanto o álbum está aberto
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleSelectFolder = async () => {
    if (!isElectron) {
      showToast('A seleção de pasta local está disponível apenas no aplicativo Desktop do Anfitrião.', 'info');
      return;
    }
    try {
      const res = await electronBridge.selectAlbumFolder();
      if (!res.canceled && res.folderPath) {
        await apiService.setAlbumFolder(res.folderPath);
        showToast('Pasta compartilhada com sucesso no Álbum! ✨', 'success');
        fetchPhotos();
      }
    } catch (err) {
      showToast('Erro ao selecionar pasta.', 'error');
    }
  };

  const handleClearFolder = async () => {
    try {
      if (isElectron) {
        await electronBridge.clearAlbumFolder();
      }
      await apiService.clearAlbumFolder();
      signatureRef.current = '';
      setIsConfigured(false);
      setFolderName('');
      setPhotos([]);
      showToast('Compartilhamento de fotos desativado.', 'info');
    } catch (e) {
      showToast('Erro ao desativar compartilhamento.', 'error');
    }
  };

  const handleDownload = async (photo) => {
    try {
      showToast('Iniciando download...', 'info');
      const response = await fetch(apiService.getPhotoUrl(photo.name));
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = photo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      showToast(`Foto "${photo.name}" salva com sucesso! 💾`, 'success');
    } catch (err) {
      console.error('Erro ao baixar foto:', err);
      showToast('Erro ao baixar a imagem.', 'error');
    }
  };

  const handleSetAsAvatar = async (photo) => {
    setIsSettingAvatar(true);
    try {
      const response = await fetch(apiService.getPhotoUrl(photo.name));
      const blob = await response.blob();
      const file = new File([blob], photo.name, { type: blob.type || 'image/jpeg' });
      await updateProfileAvatar(activeProfileId, file);
      showToast('Foto definida como seu avatar com sucesso! 💕', 'success');
    } catch (err) {
      console.error('Erro ao definir foto de perfil:', err);
      showToast('Erro ao atualizar foto de perfil.', 'error');
    } finally {
      setIsSettingAvatar(false);
    }
  };

  const visiblePhotos = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const list = photos.filter((p) => (p.name || '').toLowerCase().includes(term));
    if (sortMode === 'old') list.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    else if (sortMode === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true }));
    else list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    return list;
  }, [photos, searchTerm, sortMode]);

  const total = visiblePhotos.length;
  const currentPhoto = viewerIndex !== null ? visiblePhotos[viewerIndex] : null;

  const openViewer = (idx) => {
    setViewerIndex(idx);
    setChromeVisible(true);
    setZoomed(false);
  };
  const closeViewer = useCallback(() => {
    setViewerIndex(null);
    setZoomed(false);
  }, []);

  const goPrev = useCallback(() => {
    setZoomed(false);
    setViewerIndex((i) => (i === null || total === 0 ? i : (i > 0 ? i - 1 : total - 1)));
  }, [total]);

  const goNext = useCallback(() => {
    setZoomed(false);
    setViewerIndex((i) => (i === null || total === 0 ? i : (i < total - 1 ? i + 1 : 0)));
  }, [total]);

  // Se a lista encolher (busca/remoção) com o visualizador aberto, mantém o índice válido
  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= total) {
      setViewerIndex(total > 0 ? total - 1 : null);
    }
  }, [total, viewerIndex]);

  // Teclado: Esc fecha o visualizador primeiro, depois o álbum
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (viewerIndex !== null) closeViewer();
        else onClose();
      } else if (viewerIndex !== null) {
        if (e.key === 'ArrowLeft') goPrev();
        if (e.key === 'ArrowRight') goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, viewerIndex, closeViewer, goPrev, goNext, onClose]);

  // Pré-carrega as fotos vizinhas para navegação instantânea
  useEffect(() => {
    if (viewerIndex === null || total < 2) return;
    [viewerIndex - 1, viewerIndex + 1].forEach((i) => {
      const p = visiblePhotos[(i + total) % total];
      if (p) {
        const img = new Image();
        img.src = apiService.getPhotoUrl(p.name);
      }
    });
  }, [viewerIndex, total, visiblePhotos]);

  // Gestos no visualizador: deslizar lateral = trocar, deslizar p/ baixo = fechar, toque = mostrar/ocultar barras, toque duplo = zoom
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current.x = t.clientX;
    touchRef.current.y = t.clientY;
    touchRef.current.t = Date.now();
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10;

    if (isTap) {
      const now = Date.now();
      if (now - touchRef.current.lastTap < DOUBLE_TAP_MS) {
        touchRef.current.lastTap = 0;
        setZoomed((z) => !z);
      } else {
        touchRef.current.lastTap = now;
        setTimeout(() => {
          if (touchRef.current.lastTap && Date.now() - touchRef.current.lastTap >= DOUBLE_TAP_MS - 20) {
            touchRef.current.lastTap = 0;
            setChromeVisible((v) => !v);
          }
        }, DOUBLE_TAP_MS);
      }
      return;
    }
    if (zoomed) return; // com zoom, o gesto é de rolagem/pan
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    } else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      closeViewer();
    }
  };

  if (!isOpen) return null;

  const subtitle = isConfigured
    ? `${folderName ? `${folderName} • ` : ''}${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`
    : 'Memórias e fotos em alta qualidade';

  return (
    <div className="ab-overlay" onClick={onClose}>
      <section
        className="ab-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Álbum do Casal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="ab-header">
          <div className="ab-header-icon"><Images size={20} /></div>
          <div className="ab-header-text">
            <h2>Álbum do Casal</h2>
            <p>{subtitle}</p>
          </div>
          <button
            type="button"
            className="ab-icon-btn"
            onClick={() => fetchPhotos(true)}
            aria-label="Atualizar fotos"
            title="Atualizar fotos"
          >
            <RotateCw size={18} className={isLoading ? 'spin' : ''} />
          </button>
          <button type="button" className="ab-icon-btn" onClick={onClose} aria-label="Fechar álbum" title="Fechar (Esc)">
            <X size={20} />
          </button>
        </header>

        {/* Busca, ordenação e controles do anfitrião */}
        {isConfigured && (
          <div className="ab-toolbar">
            <label className="ab-search">
              <Search size={16} />
              <input
                type="search"
                inputMode="search"
                placeholder="Buscar foto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" className="ab-search-clear" onClick={() => setSearchTerm('')} aria-label="Limpar busca">
                  <X size={14} />
                </button>
              )}
            </label>

            <select
              className="ab-select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              aria-label="Ordenar fotos"
            >
              <option value="recent">Mais recentes</option>
              <option value="old">Mais antigas</option>
              <option value="name">Nome (A–Z)</option>
            </select>

            {isHost && (
              <div className="ab-host-actions">
                <button type="button" className="ab-btn" onClick={handleSelectFolder} title="Trocar pasta compartilhada">
                  <FolderOpen size={16} />
                  <span>Trocar pasta</span>
                </button>
                <button type="button" className="ab-btn danger" onClick={handleClearFolder} title="Desativar compartilhamento">
                  <FolderX size={16} />
                  <span>Desativar</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Corpo */}
        <div className="ab-body">
          {!hasLoadedOnce ? (
            <div className="ab-grid" aria-busy="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="ab-tile ab-skeleton" />
              ))}
            </div>
          ) : !isConfigured ? (
            <div className="ab-empty">
              <div className="ab-empty-icon"><FileImage size={44} /></div>
              <h3>Nenhuma pasta compartilhada</h3>
              <p>
                {isHost
                  ? 'Escolha uma pasta de fotos do seu computador para compartilhar com o seu amor.'
                  : 'O anfitrião ainda não compartilhou uma pasta de fotos. Peça para ele escolher uma pasta no PC dele 💕'}
              </p>
              {isHost && (
                <button type="button" className="ab-btn primary large" onClick={handleSelectFolder}>
                  <FolderOpen size={18} />
                  <span>Selecionar pasta de fotos</span>
                </button>
              )}
            </div>
          ) : total === 0 ? (
            <div className="ab-empty">
              <div className="ab-empty-icon"><FileImage size={44} /></div>
              <h3>Nenhuma foto encontrada</h3>
              <p>
                {searchTerm
                  ? `Nada encontrado para "${searchTerm}".`
                  : 'A pasta não contém imagens compatíveis (.jpg, .png, .webp, .gif).'}
              </p>
            </div>
          ) : (
            <div className="ab-grid">
              {visiblePhotos.map((photo, idx) => (
                <button
                  type="button"
                  key={photo.name}
                  className="ab-tile"
                  onClick={() => openViewer(idx)}
                  aria-label={`Abrir foto ${photo.name}`}
                >
                  <img
                    src={apiService.getPhotoUrl(photo.name)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => e.currentTarget.classList.add('loaded')}
                  />
                  <span className="ab-tile-caption">
                    <span className="ab-tile-name">{photo.name}</span>
                    <span className="ab-tile-size">{formatFileSize(photo.size)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Visualizador de foto */}
        {currentPhoto && (
          <div
            className={`ab-viewer ${chromeVisible ? '' : 'chrome-hidden'}`}
            role="dialog"
            aria-label="Visualizador de foto"
          >
            <div className="ab-viewer-top">
              <button type="button" className="ab-viewer-btn" onClick={closeViewer} aria-label="Voltar para o álbum">
                <ChevronLeft size={22} />
              </button>
              <div className="ab-viewer-title">
                <span className="ab-viewer-name">{currentPhoto.name}</span>
                <span className="ab-viewer-counter">
                  {viewerIndex + 1} de {total}
                  {currentPhoto.size ? ` • ${formatFileSize(currentPhoto.size)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="ab-viewer-btn"
                onClick={() => setZoomed((z) => !z)}
                aria-label={zoomed ? 'Reduzir' : 'Ampliar'}
              >
                {zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
              </button>
            </div>

            <div
              className={`ab-viewer-stage ${zoomed ? 'zoomed' : ''}`}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onClick={(e) => {
                // Mouse: clique no fundo fecha, duplo clique na imagem dá zoom
                if (e.target === e.currentTarget && !('ontouchstart' in window)) closeViewer();
              }}
            >
              <img
                key={currentPhoto.name}
                src={apiService.getPhotoUrl(currentPhoto.name)}
                alt={currentPhoto.name}
                draggable={false}
                onDoubleClick={() => setZoomed((z) => !z)}
              />
            </div>

            {total > 1 && (
              <>
                <button type="button" className="ab-viewer-nav prev" onClick={goPrev} aria-label="Foto anterior">
                  <ChevronLeft size={30} />
                </button>
                <button type="button" className="ab-viewer-nav next" onClick={goNext} aria-label="Próxima foto">
                  <ChevronRight size={30} />
                </button>
              </>
            )}

            <div className="ab-viewer-bottom">
              <button
                type="button"
                className="ab-btn primary"
                onClick={() => handleSetAsAvatar(currentPhoto)}
                disabled={isSettingAvatar}
              >
                <UserCheck size={18} />
                <span>{isSettingAvatar ? 'Atualizando...' : 'Usar como perfil'}</span>
              </button>
              <button type="button" className="ab-btn" onClick={() => handleDownload(currentPhoto)}>
                <Download size={18} />
                <span>Baixar</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
