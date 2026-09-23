import React, { useEffect, useRef } from 'react';
import { useWebRTC } from '../../../context/WebRTCContext';
import { StreamControlsOverlay } from './StreamControlsOverlay';

export function ScreenShareCard({
  stream,
  isLocal,
  ownerLabel,
  onOpenMixer,
  onOpenScreenPicker,
  cardId = 'screen-share-card'
}) {
  const {
    activePreset,
    screenFitMode,
    screenVolume,
    isScreenMuted
  } = useWebRTC();

  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = (isLocal || isScreenMuted) ? 0 : screenVolume;
    }
  }, [screenVolume, isScreenMuted, isLocal]);

  if (!stream) return null;

  return (
    <div id={cardId} className="video-card screen-card">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={screenFitMode}
      />

      {/* Áudio dedicado da transmissão remota */}
      {!isLocal && (
        <audio
          ref={(el) => {
            if (el && stream) {
              el.srcObject = stream;
              el.volume = isScreenMuted ? 0 : screenVolume;
              el.play().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
      )}

      {/* Top Bar */}
      <div className="stream-top-bar">
        <div className="stream-live-tag">
          <span className="pulse-dot"></span> AO VIVO
        </div>
        <span className="screen-owner-name">{ownerLabel}</span>
        <span className="screen-quality-badge">{activePreset.badge}</span>
      </div>

      {/* Overlay Controls */}
      <StreamControlsOverlay
        onOpenMixer={onOpenMixer}
        onOpenScreenPicker={onOpenScreenPicker}
        cardElementId={cardId}
        isLocalStream={isLocal}
      />
    </div>
  );
}
