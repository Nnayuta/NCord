import React from 'react';
import { Heart } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { ServerConnectPanel } from './ServerConnectPanel';
import { ProfileSelectorPanel } from './ProfileSelectorPanel';
import { UpdateBadge } from '../Common/UpdateBadge';

export function LoginScreen() {
  const { isServerConfigured } = useServer();

  return (
    <section className="login-container">
      <div className="login-update-badge-wrapper">
        <UpdateBadge variant="button" />
      </div>

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
