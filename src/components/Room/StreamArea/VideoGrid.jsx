import React from 'react';
import { Minimize2 } from 'lucide-react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { useProfiles } from '../../../context/ProfileContext';
import { ScreenShareCard } from './ScreenShareCard';
import { VideoCard } from './VideoCard';
import { FloatingParticipantAvatars } from './FloatingParticipantAvatars';
import { DualScreenSwitcher } from './DualScreenSwitcher';

export function VideoGrid({ onOpenMixer, onOpenScreenPicker }) {
  const {
    isScreenSharing,
    isLocalScreenSharing,
    isRemoteScreenSharing,
    localScreenStream,
    remoteScreenStream,
    dualScreenViewMode,
    spotlightTarget,
    toggleSpotlight,
    localStream,
    remoteStream,
    isMicMuted,
    isVideoOff,
    isRemoteMicMuted,
    isRemoteVideoOff,
    isLocalSpeaking,
    isRemoteSpeaking
  } = useWebRTC();
  const { myProfile, otherProfile } = useProfiles();

  // 1. PRIORIDADE: Se alguma câmera estiver em modo Destaque / Foco (Spotlight)
  if (spotlightTarget === 'local-camera') {
    return (
      <div className="videos-container spotlight-mode">
        <button
          type="button"
          className="btn-exit-spotlight-floating"
          onClick={() => toggleSpotlight('local-camera')}
          title="Sair do Destaque (ESC)"
        >
          <Minimize2 size={16} />
          <span>Sair do Destaque</span>
        </button>
        <VideoCard
          isLocal={true}
          stream={localStream}
          profile={myProfile}
          isVideoOff={isVideoOff}
          isMicMuted={isMicMuted}
          isSpeaking={isLocalSpeaking}
          targetId="local-camera"
        />
      </div>
    );
  }

  if (spotlightTarget === 'remote-camera') {
    return (
      <div className="videos-container spotlight-mode">
        <button
          type="button"
          className="btn-exit-spotlight-floating"
          onClick={() => toggleSpotlight('remote-camera')}
          title="Sair do Destaque (ESC)"
        >
          <Minimize2 size={16} />
          <span>Sair do Destaque</span>
        </button>
        <VideoCard
          isLocal={false}
          stream={remoteStream}
          profile={otherProfile}
          isVideoOff={isRemoteVideoOff}
          isMicMuted={isRemoteMicMuted}
          isSpeaking={isRemoteSpeaking}
          targetId="remote-camera"
        />
      </div>
    );
  }

  // 2. Quando não há nenhum compartilhamento de tela ativo (Grid normal com 2 participantes)
  if (!isScreenSharing) {
    return (
      <div className="videos-container">
        {/* Câmera / Avatar Local (Você) */}
        <VideoCard
          isLocal={true}
          stream={localStream}
          profile={myProfile}
          isVideoOff={isVideoOff}
          isMicMuted={isMicMuted}
          isSpeaking={isLocalSpeaking}
          targetId="local-camera"
        />

        {/* Câmera / Avatar Remoto (Parceiro) */}
        <VideoCard
          isLocal={false}
          stream={remoteStream}
          profile={otherProfile}
          isVideoOff={isRemoteVideoOff}
          isMicMuted={isRemoteMicMuted}
          isSpeaking={isRemoteSpeaking}
          targetId="remote-camera"
        />
      </div>
    );
  }

  // 3. Quando há compartilhamento de tela ativo (1 ou 2 transmissões)
  const isBothSharing = isLocalScreenSharing && isRemoteScreenSharing;

  return (
    <div className="stream-viewport-wrapper">
      {/* Barra de alternância para tela dupla */}
      {isBothSharing && <DualScreenSwitcher />}

      <div className={`screen-stream-container ${isBothSharing && dualScreenViewMode === 'split' ? 'split-screens' : ''}`}>
        {/* Caso 1: Ambos transmitindo em modo Split (Dividir Tela) */}
        {isBothSharing && dualScreenViewMode === 'split' && (
          <>
            <ScreenShareCard
              stream={remoteScreenStream}
              isLocal={false}
              ownerLabel={`Tela de ${otherProfile.name || 'Parceiro'}`}
              onOpenMixer={onOpenMixer}
              onOpenScreenPicker={onOpenScreenPicker}
              cardId="screen-share-remote"
            />
            <ScreenShareCard
              stream={localScreenStream}
              isLocal={true}
              ownerLabel="Sua Transmissão"
              onOpenMixer={onOpenMixer}
              onOpenScreenPicker={onOpenScreenPicker}
              cardId="screen-share-local"
            />
          </>
        )}

        {/* Caso 2: Visualizar Tela Remota do Parceiro */}
        {((isBothSharing && dualScreenViewMode === 'remote') || (!isBothSharing && isRemoteScreenSharing)) && (
          <ScreenShareCard
            stream={remoteScreenStream}
            isLocal={false}
            ownerLabel={`Tela de ${otherProfile.name || 'Parceiro'}`}
            onOpenMixer={onOpenMixer}
            onOpenScreenPicker={onOpenScreenPicker}
            cardId="screen-share-remote"
          />
        )}

        {/* Caso 3: Visualizar Minha Tela */}
        {((isBothSharing && dualScreenViewMode === 'local') || (!isBothSharing && isLocalScreenSharing)) && (
          <ScreenShareCard
            stream={localScreenStream}
            isLocal={true}
            ownerLabel="Sua Transmissão"
            onOpenMixer={onOpenMixer}
            onOpenScreenPicker={onOpenScreenPicker}
            cardId="screen-share-local"
          />
        )}
      </div>

      {/* Avatares Flutuantes Compactos e Minimizáveis (Não cobrem a transmissão!) */}
      <FloatingParticipantAvatars />
    </div>
  );
}
