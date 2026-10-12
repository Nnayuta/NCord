/**
 * Motor WebRTC de Ultra-Alta Fidelidade para LoveChat
 */

export const QUALITY_PRESETS = {
  ultra: {
    id: 'ultra',
    label: 'Ultra HD (Sem Limites)',
    badge: '14 Mbps • 60 FPS',
    description: '14 Mbps • Até 4K 60 FPS • Alta fidelidade sem bloqueios',
    screenBitrate: 14_000_000,
    mediaBitrate: 3_500_000,
    degradationPreference: 'balanced',
    contentHint: 'detail',
    maxFps: 60,
    sdpScreenKbps: 14000,
    sdpMediaKbps: 3500
  },
  cinema: {
    id: 'cinema',
    label: 'Modo Cinema (Nitidez Máxima)',
    badge: '10 Mbps • Cinema HD',
    description: '10 Mbps • 1080p • Foco em detalhes finos para filmes e animes',
    screenBitrate: 10_000_000,
    mediaBitrate: 2_500_000,
    degradationPreference: 'balanced',
    contentHint: 'detail',
    maxFps: 60,
    sdpScreenKbps: 10000,
    sdpMediaKbps: 2500
  },
  gamer: {
    id: 'gamer',
    label: 'Modo Gamer (60 FPS Fluido)',
    badge: '12 Mbps • 60 FPS',
    description: '12 Mbps • 60 FPS • Prioriza movimentação rápida e responsiva',
    screenBitrate: 12_000_000,
    mediaBitrate: 2_500_000,
    degradationPreference: 'balanced',
    contentHint: 'motion',
    maxFps: 60,
    sdpScreenKbps: 12000,
    sdpMediaKbps: 2500
  },
  balanced: {
    id: 'balanced',
    label: 'Modo Equilibrado',
    badge: '6 Mbps • 1080p',
    description: '6 Mbps • 1080p 30 FPS • Mais leve se a conexão oscilar',
    screenBitrate: 6_000_000,
    mediaBitrate: 1_500_000,
    degradationPreference: 'balanced',
    contentHint: 'detail',
    maxFps: 30,
    sdpScreenKbps: 6000,
    sdpMediaKbps: 1500
  }
};

export const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 2
};

/**
 * Otimização de candidatos ICE / mDNS:
 * Evita o erro interno do Chromium [services\network\p2p\socket_manager.cc:145] errorcode: -105.
 * Dispositivos remotos (como celulares e navegadores) geram hostnames mDNS ofuscados (<uuid>.local)
 * que não são resolvíveis fora da mesma rede física ou por VPN/túnel, poluindo o terminal
 * com erros desnecessários de DNS antes de conectar pelos IPs e STUN/TURN válidos.
 */
if (typeof window !== 'undefined' && window.RTCPeerConnection) {
  const origAddIceCandidate = window.RTCPeerConnection.prototype.addIceCandidate;
  window.RTCPeerConnection.prototype.addIceCandidate = function (candidate, ...args) {
    if (candidate) {
      const candStr = typeof candidate === 'string' ? candidate : candidate.candidate;
      if (typeof candStr === 'string' && candStr.includes('.local')) {
        return Promise.resolve();
      }
    }
    return origAddIceCandidate.apply(this, [candidate, ...args]);
  };

  const origSetRemoteDescription = window.RTCPeerConnection.prototype.setRemoteDescription;
  window.RTCPeerConnection.prototype.setRemoteDescription = function (description, ...args) {
    if (description && typeof description.sdp === 'string' && description.sdp.includes('.local')) {
      const cleanedSdp = description.sdp
        .split('\r\n')
        .filter((line) => !(line.startsWith('a=candidate:') && line.includes('.local')))
        .join('\r\n');
      
      const newDesc = typeof RTCSessionDescription !== 'undefined'
        ? new RTCSessionDescription({ type: description.type, sdp: cleanedSdp })
        : { type: description.type, sdp: cleanedSdp };
        
      return origSetRemoteDescription.apply(this, [newDesc, ...args]);
    }
    return origSetRemoteDescription.apply(this, [description, ...args]);
  };
}

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
 * Aplica parâmetros de bitrate, FPS e adaptação ao RTCRtpSender
 */
export async function applySenderParameters(sender, preset = QUALITY_PRESETS.ultra, isScreen = false) {
  if (!sender || !sender.setParameters || !sender.getParameters) return;
  try {
    if (sender.track && sender.track.kind !== 'video') return;
    const params = sender.getParameters();
    if (!params || !params.encodings || params.encodings.length === 0) {
      return; // Nunca mutar array se o browser ainda não negociou os encodings
    }
    const maxBitrate = isScreen ? preset.screenBitrate : preset.mediaBitrate;

    for (const encoding of params.encodings) {
      encoding.maxBitrate = maxBitrate;
      if (preset.maxFps) encoding.maxFramerate = preset.maxFps;
    }
    if (preset.degradationPreference) {
      params.degradationPreference = preset.degradationPreference;
    }

    await sender.setParameters(params);
    console.log(`[WebRTC] Parâmetros aplicados no RTCRtpSender: ${(maxBitrate / 1_000_000).toFixed(1)} Mbps`);
  } catch (err) {
    console.debug('[WebRTC] Aviso não-bloqueante ao aplicar parâmetros:', err.message);
  }
}

/**
 * Transforma o SDP WebRTC para áudio estéreo broadcast e vídeo de alta fidelidade com bitrate adaptativo
 */
export function transformSDP(sdp, isScreen = false, preset = QUALITY_PRESETS.ultra) {
  if (!sdp) return sdp;
  try {
    const lines = sdp.split('\r\n');
    const newLines = [];
    const bitrateKbps = isScreen ? (preset.sdpScreenKbps || 14000) : (preset.sdpMediaKbps || 3500);

    // Identificar dinamicamente os payload types de Opus (áudio)
    const opusPayloadTypes = new Set();
    for (const l of lines) {
      const match = l.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
      if (match) opusPayloadTypes.add(match[1]);
    }
    if (opusPayloadTypes.size === 0) {
      opusPayloadTypes.add('111');
    }

    // Identificar dinamicamente os payload types de Vídeo (H264, VP8, VP9, AV1)
    const videoPayloadTypes = new Set();
    for (const l of lines) {
      const match = l.match(/^a=rtpmap:(\d+)\s+(H264|VP8|VP9|AV1)\/90000/i);
      if (match) videoPayloadTypes.add(match[1]);
    }

    let inVideoSection = false;
    let inAudioSection = false;
    let videoBandwidthInserted = false;
    let audioBandwidthInserted = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      if (line.startsWith('m=video')) {
        inVideoSection = true;
        inAudioSection = false;
        videoBandwidthInserted = false;
      } else if (line.startsWith('m=audio')) {
        inAudioSection = true;
        inVideoSection = false;
        audioBandwidthInserted = false;
      } else if (line.startsWith('m=')) {
        inVideoSection = false;
        inAudioSection = false;
      }

      // Otimização do Codec de Áudio Opus para Broadcast Stereo 48kHz / 128 kbps estável
      if (line.startsWith('a=fmtp:')) {
        const ptMatch = line.match(/^a=fmtp:(\d+)/);
        const pt = ptMatch ? ptMatch[1] : null;

        if (pt && opusPayloadTypes.has(pt)) {
          if (!line.includes('stereo=1')) {
            line += ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=1;useinbandfec=1';
          }
        } else if (pt && (videoPayloadTypes.has(pt) || inVideoSection)) {
          // Apenas adiciona min/start/max bitrate aos codecs de vídeo, nunca misturar com áudio
          if (!line.includes('x-google-min-bitrate')) {
            const minKbps = 300;
            const startKbps = isScreen ? 1500 : 800;
            const maxKbps = bitrateKbps;
            line += `;x-google-min-bitrate=${minKbps};x-google-start-bitrate=${startKbps};x-google-max-bitrate=${maxKbps}`;
          }
        }
      }

      newLines.push(line);

      // Injetar banda RFC 4566 após c= do bloco m=video
      if (inVideoSection && !videoBandwidthInserted && line.startsWith('c=')) {
        newLines.push(`b=AS:${bitrateKbps}`);
        newLines.push(`b=TIAS:${bitrateKbps * 1000}`);
        videoBandwidthInserted = true;
      }

      // Injetar banda de áudio após c= do bloco m=audio
      if (inAudioSection && !audioBandwidthInserted && line.startsWith('c=')) {
        newLines.push(`b=AS:128`);
        newLines.push(`b=TIAS:128000`);
        audioBandwidthInserted = true;
      }
    }

    return newLines.join('\r\n');
  } catch (err) {
    console.warn('[WebRTC] Erro no transformSDP:', err);
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
