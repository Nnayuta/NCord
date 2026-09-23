import React from 'react';
import { ToastProvider } from './hooks/useToast';
import { ServerProvider } from './context/ServerContext';
import { ProfileProvider } from './context/ProfileContext';
import { NotesProvider } from './context/NotesContext';
import { AudioMixerProvider } from './context/AudioMixerContext';
import { WebRTCProvider, useWebRTC } from './context/WebRTCContext';
import { UpdateProvider } from './context/UpdateContext';
import { LoginScreen } from './components/Login/LoginScreen';
import { RoomLayout } from './components/Room/RoomLayout';
import { Toast } from './components/Common/Toast';
import { UpdateModal } from './components/Modals/UpdateModal';

function AppContent() {
  const { inCall } = useWebRTC();

  return (
    <>
      <Toast />
      <UpdateModal />
      {!inCall ? <LoginScreen /> : <RoomLayout />}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <UpdateProvider>
        <ServerProvider>
          <ProfileProvider>
            <NotesProvider>
              <AudioMixerProvider>
                <WebRTCProvider>
                  <AppContent />
                </WebRTCProvider>
              </AudioMixerProvider>
            </NotesProvider>
          </ProfileProvider>
        </ServerProvider>
      </UpdateProvider>
    </ToastProvider>
  );
}

