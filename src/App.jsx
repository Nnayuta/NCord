import React from 'react';
import { ToastProvider } from './hooks/useToast';
import { ServerProvider } from './context/ServerContext';
import { ProfileProvider } from './context/ProfileContext';
import { NotesProvider } from './context/NotesContext';
import { AudioMixerProvider } from './context/AudioMixerContext';
import { WebRTCProvider, useWebRTC } from './context/WebRTCContext';
import { LoginScreen } from './components/Login/LoginScreen';
import { RoomLayout } from './components/Room/RoomLayout';
import { Toast } from './components/Common/Toast';

function AppContent() {
  const { inCall } = useWebRTC();

  return (
    <>
      <Toast />
      {!inCall ? <LoginScreen /> : <RoomLayout />}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
