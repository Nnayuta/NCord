import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar/Sidebar';
import { StreamArea } from './StreamArea/StreamArea';
import { AudioMixerModal } from '../Modals/AudioMixerModal';
import { QualityPresetsModal } from '../Modals/QualityPresetsModal';
import { ScreenPickerModal } from '../Modals/ScreenPickerModal';
import { PhotoAlbumModal } from '../Modals/PhotoAlbumModal';
import { CameraSettingsModal } from '../Modals/CameraSettingsModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useWebRTC } from '../../context/WebRTCContext';

export function RoomLayout() {
  const { isTheaterMode, setIsTheaterMode } = useWebRTC();
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isQualityOpen, setIsQualityOpen] = useState(false);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState(false);
  const [isAlbumOpen, setIsAlbumOpen] = useState(false);
  const [isCameraSettingsOpen, setIsCameraSettingsOpen] = useState(false);

  const closeAllModals = useCallback(() => {
    setIsMixerOpen(false);
    setIsQualityOpen(false);
    setIsScreenPickerOpen(false);
    setIsAlbumOpen(false);
    setIsCameraSettingsOpen(false);
  }, []);

  const handleOpenMixer = useCallback(() => setIsMixerOpen(true), []);
  const handleCloseMixer = useCallback(() => setIsMixerOpen(false), []);

  const handleOpenQuality = useCallback(() => setIsQualityOpen(true), []);
  const handleCloseQuality = useCallback(() => setIsQualityOpen(false), []);

  const handleOpenScreenPicker = useCallback(() => setIsScreenPickerOpen(true), []);
  const handleCloseScreenPicker = useCallback(() => setIsScreenPickerOpen(false), []);

  const handleOpenAlbum = useCallback(() => setIsAlbumOpen(true), []);
  const handleCloseAlbum = useCallback(() => setIsAlbumOpen(false), []);

  const handleOpenCamSettings = useCallback(() => setIsCameraSettingsOpen(true), []);
  const handleCloseCamSettings = useCallback(() => setIsCameraSettingsOpen(false), []);

  useKeyboardShortcuts({ closeAllModals });

  // Ouvir requisição de captura de tela disparada pelo Electron
  useEffect(() => {
    if (!isElectron) return;
    electronBridge.onOpenScreenPicker(() => {
      setIsScreenPickerOpen(true);
    });
  }, []);

  return (
    <div className="room-layout">
      {/* Backdrop para fechar barra lateral no mobile quando aberta */}
      {!isTheaterMode && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setIsTheaterMode(true)}
          aria-label="Fechar barra lateral"
        />
      )}
      <Sidebar onOpenAlbum={handleOpenAlbum} />
      <StreamArea
        onOpenMixer={handleOpenMixer}
        onOpenQuality={handleOpenQuality}
        onOpenScreenPicker={handleOpenScreenPicker}
        onOpenAlbum={handleOpenAlbum}
        onOpenCamSettings={handleOpenCamSettings}
      />

      {/* Modais */}
      <AudioMixerModal
        isOpen={isMixerOpen}
        onClose={handleCloseMixer}
      />
      <QualityPresetsModal
        isOpen={isQualityOpen}
        onClose={handleCloseQuality}
      />
      <ScreenPickerModal
        isOpen={isScreenPickerOpen}
        onClose={handleCloseScreenPicker}
      />
      <PhotoAlbumModal
        isOpen={isAlbumOpen}
        onClose={handleCloseAlbum}
      />
      <CameraSettingsModal
        isOpen={isCameraSettingsOpen}
        onClose={handleCloseCamSettings}
      />
    </div>
  );
}

