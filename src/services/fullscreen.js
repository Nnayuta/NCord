// Utilitário de Tela Cheia cross-browser (Chrome/Firefox/Safari desktop + iOS Safari)
// com trava de orientação para paisagem quando disponível.

export function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) {
    // Não suportado (ex.: iOS) — o usuário ainda pode girar manualmente
  }
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch (e) {}
}

/**
 * Alterna tela cheia no elemento informado.
 * No iPhone (sem Fullscreen API para div) usa o player nativo do <video> interno.
 */
export async function toggleFullscreen(el) {
  if (!el) return;

  if (getFullscreenElement()) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
    unlockOrientation();
    return;
  }

  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      lockLandscape();
      return;
    }
    if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      lockLandscape();
      return;
    }
  } catch (e) {}

  // Fallback iOS Safari: tela cheia nativa do vídeo
  const video = el.tagName === 'VIDEO' ? el : el.querySelector('video');
  if (video && video.webkitEnterFullscreen) {
    try {
      video.webkitEnterFullscreen();
    } catch (e) {}
  }
}
