import { useEffect } from 'react';
import { useWebRTC } from '../context/WebRTCContext';

export function useKeyboardShortcuts({ closeAllModals }) {
  const { inCall, toggleMic, toggleVideo, setIsTheaterMode, spotlightTarget, setSpotlightTarget } = useWebRTC();

  useEffect(() => {
    function handleKeyDown(e) {
      // Ignorar se estiver digitando em um input ou textarea
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Escape') {
        if (closeAllModals) closeAllModals();
        if (spotlightTarget && setSpotlightTarget) {
          setSpotlightTarget(null);
        }
      }

      if (!inCall) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMic();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        toggleVideo();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setIsTheaterMode((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inCall, toggleMic, toggleVideo, setIsTheaterMode, closeAllModals, spotlightTarget, setSpotlightTarget]);
}
