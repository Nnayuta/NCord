import React from 'react';
import { Heart } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { ServerConnectPanel } from './ServerConnectPanel';
import { ProfileSelectorPanel } from './ProfileSelectorPanel';
import { WebGuestLanding } from './WebGuestLanding';
import { UpdateBadge } from '../Common/UpdateBadge';
import { isElectron } from '../../services/electronBridge';

export function LoginScreen() {
  const { isServerConfigured } = useServer();

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const hasGuestParams = urlParams?.get('role') === 'guest' || urlParams?.has('token');

  const isWebGuest =
    !isElectron &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'file:' &&
    (window.location.port !== '5173' || hasGuestParams);

  return (
    <main className="login-screen-wrapper">
      <section className="login-container">
        {isElectron && (
          <div className="login-update-badge-wrapper">
            <UpdateBadge variant="button" />
          </div>
        )}

        <div className="brand-header">
          <div className="logo-container">
            <Heart size={32} />
          </div>
          <h1>LoveChat</h1>
          <p>Nosso cantinho privado de áudio, vídeo e tela 💕</p>
        </div>

        {isWebGuest ? (
          <WebGuestLanding />
        ) : !isServerConfigured ? (
          <ServerConnectPanel />
        ) : (
          <ProfileSelectorPanel />
        )}
      </section>
    </main>
  );
}
