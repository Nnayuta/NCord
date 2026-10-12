import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar/Sidebar';
import { StreamArea } from './StreamArea/StreamArea';
import { SettingsModal } from '../Modals/SettingsModal';
import { ScreenPickerModal } from '../Modals/ScreenPickerModal';
import { PhotoAlbumModal } from '../Modals/PhotoAlbumModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { electronBridge, isElectron } from '../../services/electronBridge';
import { useWebRTC } from '../../context/WebRTCContext';

export function RoomLayout() {
  const { isTheaterMode, setIsTheaterMode } = useWebRTC();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState(false);
  const [isAlbumOpen, setIsAlbumOpen] = useState(false);

  const closeAllModals = useCallback(() => {
    setIsSettingsOpen(false);
    setIsScreenPickerOpen(false);
    setIsAlbumOpen(false);
  }, []);

  const handleOpenSettings = useCallback((tab = 'profile') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);

  const handleOpenScreenPicker = useCallback(() => setIsScreenPickerOpen(true), []);
  const handleCloseScreenPicker = useCallback(() => setIsScreenPickerOpen(false), []);

  const handleOpenAlbum = useCallback(() => setIsAlbumOpen(true), []);
  const handleCloseAlbum = useCallback(() => setIsAlbumOpen(false), []);

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

      {/* Nova Sidebar Redesenhada com Doca de Voz e Barra de Usuário */}
      <Sidebar
        onOpenAlbum={handleOpenAlbum}
        onOpenScreenPicker={handleOpenScreenPicker}
        onOpenSettings={handleOpenSettings}
      />

      {/* Área de Transmissão 100% Imersiva */}
      <StreamArea
        onOpenScreenPicker={handleOpenScreenPicker}
        onOpenSettings={handleOpenSettings}
      />

      {/* Central Unificada de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        initialTab={settingsTab}
      />

      {/* Modal de Escolha de Tela / Janela */}
      <ScreenPickerModal
        isOpen={isScreenPickerOpen}
        onClose={handleCloseScreenPicker}
      />

      {/* Modal do Álbum de Fotos */}
      <PhotoAlbumModal
        isOpen={isAlbumOpen}
        onClose={handleCloseAlbum}
      />
    </div>
  );
}
