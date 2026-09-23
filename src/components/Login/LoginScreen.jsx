import React from 'react';
import { Heart } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { ServerConnectPanel } from './ServerConnectPanel';
import { ProfileSelectorPanel } from './ProfileSelectorPanel';

export function LoginScreen() {
  const { isServerConfigured } = useServer();

  return (
    <section className="login-container">
      <div className="brand-header">
        <div className="logo-container">
          <Heart size={32} />
        </div>
        <h1>LoveChat</h1>
        <p>Nosso cantinho privado de áudio, vídeo e tela 💕</p>
      </div>

      {!isServerConfigured ? <ServerConnectPanel /> : <ProfileSelectorPanel />}
    </section>
  );
}
