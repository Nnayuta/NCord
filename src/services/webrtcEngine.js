/**
 * Motor WebRTC de Ultra-Alta Fidelidade para LoveChat
 */

export const QUALITY_PRESETS = {
  ultra: {
    id: 'ultra',
    label: 'Ultra HD (Sem Limites)',
    badge: '35 Mbps • Ultra HD',
    description: '35 Mbps • Até 4K 60 FPS • Zero compressão ou blocos',
    screenBitrate: 35_000_000,    // 35 Mbps
    screenMinBitrate: 15_000_000, // 15 Mbps piso
    mediaBitrate: 8_000_000,      // 8 Mbps para webcam
    mediaMinBitrate: 3_000_000,
    degradationPreference: 'maintain-resolution',
    contentHint: 'detail',
    maxFps: 60,
    sdpScreenKbps: 35000,
    sdpMediaKbps: 8000
  },
  cinema: {
    id: 'cinema',
    label: 'Modo Cinema (Nitidez Máxima)',
    badge: '20 Mbps • Cinema HD',
    description: '20 Mbps • 1080p • Foco em detalhes finos para filmes e animes',
    screenBitrate: 20_000_000,
    screenMinBitrate: 10_000_000,
    mediaBitrate: 6_000_000,
    mediaMinBitrate: 2_500_000,
    degradationPreference: 'maintain-resolution',
    contentHint: 'detail',
    maxFps: 60,
    sdpScreenKbps: 20000,
    sdpMediaKbps: 6000
  },
  gamer: {
    id: 'gamer',
    label: 'Modo Gamer (60 FPS Fluido)',
    badge: '25 Mbps • 60 FPS',
    description: '25 Mbps • 60 FPS • Prioriza movimentação rápida e responsiva',
    screenBitrate: 25_000_000,
    screenMinBitrate: 12_000_000,
    mediaBitrate: 6_000_000,
    mediaMinBitrate: 2_500_000,
    degradationPreference: 'maintain-resolution',
    contentHint: 'motion',
    maxFps: 60,
    sdpScreenKbps: 25000,
    sdpMediaKbps: 6000
  },
  balanced: {
    id: 'balanced',
    label: 'Modo Equilibrado',
    badge: '8 Mbps • 1080p',
    description: '8 Mbps • 1080p 30 FPS • Mais leve se a conexão oscilar',
    screenBitrate: 8_000_000,
    screenMinBitrate: 3_000_000,
    mediaBitrate: 3_000_000,
    mediaMinBitrate: 1_000_000,
    degradationPreference: 'balanced',
    contentHint: 'detail',
    maxFps: 30,
    sdpScreenKbps: 8000,
    sdpMediaKbps: 3000
  }
};

export const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

/**
 * Cria uma track de vídeo silenciosa (preta) para manter o canal WebRTC ativo sem usar câmera
 */
export function createDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#120b18';
    ctx.fillRect(0, 0, 16, 16);
  }
  const stream = canvas.captureStream(1);
  const track = stream.getVideoTracks()[0];
  if (track) {
    track.enabled = true;
  }
  return track;
}

/**
 * Cria uma track de áudio silenciosa para manter o canal WebRTC ativo sem capturar microfone
 */
export function createDummyAudioTrack() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    const dest = audioCtx.createMediaStreamDestination();
    gain.connect(dest);
    osc.start();
    const track = dest.stream.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
    }
    return track;
  } catch (e) {
    console.warn('[WebRTC] Falha ao criar dummy audio track:', e);
    return null;
  }
}

/**
 * Aplica parâmetros de bitrate e resolução ao RTCRtpSender
 */
export async function applySenderParameters(sender, preset, isScreen = false) {
  if (!sender || !sender.setParameters) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const maxBitrate = isScreen ? preset.screenBitrate : preset.mediaBitrate;

    for (const encoding of params.encodings) {
      encoding.maxBitrate = maxBitrate;
      encoding.maxFramerate = preset.maxFps || 60;
      encoding.scaleResolutionDownBy = 1.0;
      encoding.priority = 'high';
      encoding.networkPriority = 'high';
    }
    params.degradationPreference = preset.degradationPreference || 'maintain-resolution';

    await sender.setParameters(params);
    console.log(`[WebRTC] Parâmetros aplicados no RTCRtpSender: ${(maxBitrate / 1_000_000).toFixed(1)} Mbps, ${preset.maxFps || 60} FPS, maintain-resolution`);
  } catch (err) {
    console.warn('[WebRTC] Aviso ao aplicar parâmetros no RTCRtpSender:', err);
  }
}

/**
 * Modifica o SDP de oferta/resposta para injetar taxas b=AS e b=TIAS
 */
export function enhanceSDPBitrate(sdp, bitrateKbps) {
  if (!sdp || !bitrateKbps) return sdp;
  try {
    let lines = sdp.split('\r\n');
    let mVideoFound = false;
    let newLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      newLines.push(line);

      if (line.startsWith('m=video')) {
        mVideoFound = true;
        // Inserir modificadores de taxa
        newLines.push(`b=AS:${bitrateKbps}`);
        newLines.push(`b=TIAS:${bitrateKbps * 1000}`);
      }
    }
    return newLines.join('\r\n');
  } catch (e) {
    return sdp;
  }
}

/**
 * Monitora nível de volume de uma MediaStreamTrack de áudio para indicador de voz ativa
 */
export function createAudioLevelDetector(track, onLevel) {
  if (!track || track.kind !== 'audio') return { stop: () => {} };

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let isRunning = true;

    const checkLevel = () => {
      if (!isRunning) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      // Normalizar 0 a 100
      const isSpeaking = avg > 12; // threshold de voz
      onLevel({ level: avg, isSpeaking });

      if (isRunning) {
        requestAnimationFrame(checkLevel);
      }
    };

    checkLevel();

    return {
      stop: () => {
        isRunning = false;
        try {
          source.disconnect();
          analyser.disconnect();
          if (audioCtx.state !== 'closed') audioCtx.close();
        } catch (e) {}
      }
    };
  } catch (err) {
    console.warn('[AudioDetector] Não foi possível inicializar detector de voz:', err);
    return { stop: () => {} };
  }
}
