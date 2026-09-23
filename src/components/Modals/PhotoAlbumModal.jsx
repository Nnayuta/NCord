import React, { useState, useEffect, useCallback } from 'react';
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
  Maximize2,
  Sparkles,
  FileImage
} from 'lucide-react';
import { apiService } from '../../services/apiService';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useServer } from '../../context/ServerContext';
import { useProfiles } from '../../context/ProfileContext';
import { useToast } from '../../hooks/useToast';

export function PhotoAlbumModal({ isOpen, onClose }) {
  const { mode } = useServer();
  const { activeProfileId, updateProfileAvatar } = useProfiles();
  const { showToast } = useToast();

  const isHost = mode === 'host';
  const [photos, setPhotos] = useState([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const [isSettingAvatar, setIsSettingAvatar] = useState(false);

  const fetchPhotos = useCallback(async (showNotification = false) => {
    setIsLoading(true);
    try {
      const res = await apiService.getAlbumPhotos();
      if (res) {
        setIsConfigured(!!res.isConfigured);
        setFolderName(res.folderName || '');
        setPhotos(Array.isArray(res.photos) ? res.photos : []);
        if (showNotification) {
          showToast(`Álbum atualizado! ${res.photos?.length || 0} fotos encontradas. 📸`, 'info');
        }
      }
    } catch (err) {
      console.warn('[PhotoAlbumModal] Erro ao carregar fotos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen) {
      fetchPhotos();
      const interval = setInterval(() => {
        fetchPhotos();
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setSelectedPhotoIndex(null);
      setSearchTerm('');
    }
  }, [isOpen, fetchPhotos]);

  // Ação de Selecionar Pasta Local (Apenas Anfitrião no Desktop)
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

  // Ação de Desativar Pasta Compartilhada
  const handleClearFolder = async () => {
    try {
      if (isElectron) {
        await electronBridge.clearAlbumFolder();
      }
      await apiService.clearAlbumFolder();
      setIsConfigured(false);
      setFolderName('');
      setPhotos([]);
      showToast('Compartilhamento de fotos desativado.', 'info');
    } catch (e) {
      showToast('Erro ao desativar compartilhamento.', 'error');
    }
  };

  // Baixar Imagem para o Computador
  const handleDownload = async (e, photo) => {
    if (e) e.stopPropagation();
    try {
      showToast('Iniciando download...', 'info');
      const photoUrl = apiService.getPhotoUrl(photo.name);
      const response = await fetch(photoUrl);
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

  // Definir Imagem como Foto de Perfil
  const handleSetAsAvatar = async (e, photo) => {
    if (e) e.stopPropagation();
    setIsSettingAvatar(true);
    try {
      const photoUrl = apiService.getPhotoUrl(photo.name);
      const response = await fetch(photoUrl);
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

  // Filtrar fotos por termo de busca
  const filteredPhotos = photos.filter((p) =>
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Navegação no Lightbox
  const handlePrev = useCallback((e) => {
    if (e) e.stopPropagation();
    setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : filteredPhotos.length - 1));
  }, [filteredPhotos.length]);

  const handleNext = useCallback((e) => {
    if (e) e.stopPropagation();
    setSelectedPhotoIndex((prev) => (prev < filteredPhotos.length - 1 ? prev + 1 : 0));
  }, [filteredPhotos.length]);

  // Teclado no Lightbox
  useEffect(() => {
    if (selectedPhotoIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setSelectedPhotoIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex, handlePrev, handleNext]);

  if (!isOpen) return null;

  const currentPhoto = selectedPhotoIndex !== null ? filteredPhotos[selectedPhotoIndex] : null;

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog album-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="modal-header album-modal-header">
          <div className="album-title-box">
            <div className="album-icon-circle">
              <Images size={20} color="#f43f8e" />
            </div>
            <div>
              <h3>Álbum do Casal 📸</h3>
              <p className="album-subtitle">
                {isConfigured
                  ? `Pasta: "${folderName}" • ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`
                  : 'Compartilhe memórias e fotos especiais em alta qualidade'}
              </p>
            </div>
          </div>
          <div className="album-header-actions">
            <button
              type="button"
              className="btn-album-refresh"
              onClick={() => fetchPhotos(true)}
              title="Atualizar lista de fotos"
            >
              <RotateCw size={16} className={isLoading ? 'spin' : ''} />
            </button>
            <button type="button" className="btn-modal-close" onClick={onClose} title="Fechar Álbum">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Barra de Ferramentas / Controles de Pasta do Host */}
        <div className="album-toolbar">
          <div className="album-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar foto por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearchTerm('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Botões do Anfitrião */}
          {isHost && (
            <div className="album-host-controls">
              <button
                type="button"
                className="btn-album-folder-action primary"
                onClick={handleSelectFolder}
                title="Escolher pasta no computador para compartilhar no álbum"
              >
                <FolderOpen size={16} />
                <span>{isConfigured ? 'Trocar Pasta' : 'Selecionar Pasta de Fotos'}</span>
              </button>

              {isConfigured && (
                <button
                  type="button"
                  className="btn-album-folder-action danger"
                  onClick={handleClearFolder}
                  title="Remover pasta compartilhada"
                >
                  <FolderX size={16} />
                  <span>Desativar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Corpo / Grade de Fotos */}
        <div className="album-modal-body">
          {!isConfigured ? (
            <div className="album-empty-state">
              <div className="album-empty-icon">
                <FileImage size={48} />
              </div>
              <h4>Nenhuma pasta compartilhada no momento</h4>
              <p>
                {isHost
                  ? 'Você é o anfitrião! Clique no botão abaixo para escolher uma pasta de fotos do seu computador e compartilhar com o seu amor.'
                  : 'O Anfitrião ainda não compartilhou uma pasta de fotos. Peça para ele selecionar uma pasta do PC dele! 💕'}
              </p>
              {isHost && (
                <button
                  type="button"
                  className="btn-album-select-empty"
                  onClick={handleSelectFolder}
                >
                  <FolderOpen size={18} />
                  <span>Selecionar Pasta de Fotos Agora</span>
                </button>
              )}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="album-empty-state">
              <h4>Nenhuma foto encontrada</h4>
              <p>
                {searchTerm
                  ? `Nenhuma imagem encontrada com o termo "${searchTerm}".`
                  : 'A pasta selecionada não contém arquivos de imagem compatíveis (.jpg, .png, .webp, .gif).'}
              </p>
            </div>
          ) : (
            <div className="album-grid">
              {filteredPhotos.map((photo, idx) => (
                <div
                  key={photo.name}
                  className="album-card"
                  onClick={() => setSelectedPhotoIndex(idx)}
                >
                  <div className="album-card-thumb-wrapper">
                    <img
                      src={apiService.getPhotoUrl(photo.name)}
                      alt={photo.name}
                      className="album-card-img"
                      loading="lazy"
                    />
                    <div className="album-card-overlay">
                      <div className="album-overlay-actions">
                        <button
                          type="button"
                          className="btn-album-action"
                          onClick={(e) => handleSetAsAvatar(e, photo)}
                          title="Definir como minha Foto de Perfil"
                        >
                          <Sparkles size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-album-action"
                          onClick={(e) => handleDownload(e, photo)}
                          title="Baixar foto para o PC"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-album-action"
                          onClick={() => setSelectedPhotoIndex(idx)}
                          title="Ver em Tela Cheia"
                        >
                          <Maximize2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="album-card-info">
                    <span className="album-card-name" title={photo.name}>
                      {photo.name}
                    </span>
                    <span className="album-card-meta">
                      {formatFileSize(photo.size)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Lightbox em Tela Cheia */}
        {currentPhoto && (
          <div className="album-lightbox-overlay" onClick={() => setSelectedPhotoIndex(null)}>
            <div className="album-lightbox-content" onClick={(e) => e.stopPropagation()}>
              {/* Barra Superior do Lightbox */}
              <div className="lightbox-topbar">
                <div className="lightbox-info">
                  <span className="lightbox-filename">{currentPhoto.name}</span>
                  <span className="lightbox-counter">
                    {selectedPhotoIndex + 1} de {filteredPhotos.length}
                  </span>
                </div>
                <div className="lightbox-actions">
                  <button
                    type="button"
                    className="btn-lightbox-action primary"
                    onClick={(e) => handleSetAsAvatar(e, currentPhoto)}
                    disabled={isSettingAvatar}
                    title="Usar como foto de perfil"
                  >
                    <UserCheck size={16} />
                    <span>{isSettingAvatar ? 'Atualizando...' : 'Definir como Perfil'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-lightbox-action"
                    onClick={(e) => handleDownload(e, currentPhoto)}
                    title="Salvar no computador"
                  >
                    <Download size={16} />
                    <span>Baixar</span>
                  </button>
                  <button
                    type="button"
                    className="btn-lightbox-close"
                    onClick={() => setSelectedPhotoIndex(null)}
                    title="Fechar Visualizador (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Imagem Principal */}
              <div className="lightbox-image-wrapper">
                <img
                  src={apiService.getPhotoUrl(currentPhoto.name)}
                  alt={currentPhoto.name}
                  className="lightbox-main-img"
                />

                {/* Botões de Navegação Anterior / Próximo */}
                {filteredPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="lightbox-nav-btn prev"
                      onClick={handlePrev}
                      title="Foto Anterior (Seta Esquerda)"
                    >
                      <ChevronLeft size={32} />
                    </button>
                    <button
                      type="button"
                      className="lightbox-nav-btn next"
                      onClick={handleNext}
                      title="Próxima Foto (Seta Direita)"
                    >
                      <ChevronRight size={32} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
