import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar/Sidebar';
import { StreamArea } from './StreamArea/StreamArea';
import { AudioMixerModal } from '../Modals/AudioMixerModal';
import { QualityPresetsModal } from '../Modals/QualityPresetsModal';
import { ScreenPickerModal } from '../Modals/ScreenPickerModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { electronBridge, isElectron } from '../../services/electronBridge';

export function RoomLayout() {
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isQualityOpen, setIsQualityOpen] = useState(false);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState(false);

  const closeAllModals = () => {
    setIsMixerOpen(false);
    setIsQualityOpen(false);
    setIsScreenPickerOpen(false);
  };

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
      <Sidebar />
      <StreamArea
        onOpenMixer={() => setIsMixerOpen(true)}
        onOpenQuality={() => setIsQualityOpen(true)}
        onOpenScreenPicker={() => setIsScreenPickerOpen(true)}
      />

      {/* Modais */}
      <AudioMixerModal
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
      />
      <QualityPresetsModal
        isOpen={isQualityOpen}
        onClose={() => setIsQualityOpen(false)}
      />
      <ScreenPickerModal
        isOpen={isScreenPickerOpen}
        onClose={() => setIsScreenPickerOpen(false)}
      />
    </div>
  );
}
