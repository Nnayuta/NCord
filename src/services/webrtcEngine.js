/**
 * Motor WebRTC de Ultra-Alta Fidelidade para LoveChat
 */

export const STREAM_RESOLUTIONS = {
  '720p': {
    id: '720p',
    label: '720p (HD)',
    desc: 'Leve e ultra rápido, ideal para conexões móveis e celular',
    width: 1280,
    height: 720,
    baseBitrate30: 3_000_000,
    baseBitrate60: 5_000_000
  },
  '1080p': {
    id: '1080p',
    label: '1080p (Full HD)',
    desc: 'Equilíbrio ideal entre nitidez cristalina e performance suave',
    width: 1920,
    height: 1080,
    baseBitrate30: 4_500_000,
    baseBitrate60: 6_000_000
  },
  '1440p': {
    id: '1440p',
    label: '1440p (2K Quad HD)',
    desc: 'Alta definição para monitores amplos e textos minuciosos',
    width: 2560,
    height: 1440,
    baseBitrate30: 10_000_000,
    baseBitrate60: 13_000_000
  },
  'source': {
    id: 'source',
    label: 'Nativo (Original)',
    desc: 'Resolução original da tela sem compressão dimensional',
    width: 3840,
    height: 2160,
    baseBitrate30: 12_000_000,
    baseBitrate60: 16_000_000
  }
};

export const STREAM_FPS_OPTIONS = [
  { id: 30, label: '30 FPS', badge: 'Econômico', desc: 'Menor consumo de CPU e internet' },
  { id: 60, label: '60 FPS', badge: 'Fluidez Máxima', desc: 'Movimentação suave e responsiva sem engasgos' }
];

export function getModularStreamPreset(resolutionKey = '1080p', fps = 60) {
  const res = STREAM_RESOLUTIONS[resolutionKey] || STREAM_RESOLUTIONS['1080p'];
  const actualFps = Number(fps) === 30 ? 30 : 60;
  const bitrate = actualFps === 30 ? res.baseBitrate30 : res.baseBitrate60;
  const bitrateMbps = (bitrate / 1_000_000).toFixed(1);
  const sdpKbps = Math.round(bitrate / 1000);

  return {
    id: `${res.id}-${actualFps}`,
    resolutionKey: res.id,
    fps: actualFps,
    label: `${res.label} • ${actualFps} FPS`,
    badge: `${res.id.toUpperCase()} • ${actualFps} FPS • ${bitrateMbps} Mbps`,
    description: `${res.label} a ${actualFps} FPS com bitrate automático de ${bitrateMbps} Mbps`,
    screenBitrate: bitrate,
    mediaBitrate: 3_000_000,
    degradationPreference: 'maintain-framerate', // Prioriza taxas de quadros fluidas (sem travar)
    contentHint: actualFps === 60 ? 'motion' : 'detail',
    maxFps: actualFps,
    maxWidth: res.width,
    maxHeight: res.height,
    sdpScreenKbps: sdpKbps,
    sdpMediaKbps: 3000
  };
}

export const QUALITY_PRESETS = {
  ultra: getModularStreamPreset('source', 60),
  cinema: getModularStreamPreset('1080p', 60),
  gamer: getModularStreamPreset('1080p', 60),
  balanced: getModularStreamPreset('720p', 30)
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
    params.degradationPreference = preset.degradationPreference || 'maintain-framerate';

    await sender.setParameters(params);
    console.log(`[WebRTC] Parâmetros aplicados no RTCRtpSender: ${(maxBitrate / 1_000_000).toFixed(1)} Mbps (${preset.maxFps || 60} FPS)`);
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
    const bitrateKbps = isScreen ? (preset.sdpScreenKbps || 9000) : (preset.sdpMediaKbps || 3000);

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

      // Otimização do Codec de Áudio Opus para Broadcast Stereo 48kHz (320 kbps VBR para tela / 128 kbps para voz)
      // cbr=0 e usedtx=0 garantem áudio dinâmico e sem compressão abafada nem silêncios cortados
      if (line.startsWith('a=fmtp:')) {
        const ptMatch = line.match(/^a=fmtp:(\d+)/);
        const pt = ptMatch ? ptMatch[1] : null;

        if (pt && opusPayloadTypes.has(pt)) {
          if (!line.includes('stereo=1')) {
            const audioBitrate = isScreen ? 320000 : 128000;
            line += `;stereo=1;sprop-stereo=1;maxaveragebitrate=${audioBitrate};cbr=0;usedtx=0;useinbandfec=1;maxplaybackrate=48000;sprop-maxcapturerate=48000`;
          }
        } else if (pt && (videoPayloadTypes.has(pt) || inVideoSection)) {
          // Apenas adiciona min/start/max bitrate aos codecs de vídeo, nunca misturar com áudio
          if (!line.includes('x-google-min-bitrate')) {
            const minKbps = 400;
            const startKbps = isScreen ? Math.min(2500, Math.round(bitrateKbps * 0.4)) : 800;
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
        const audioKbps = isScreen ? 320 : 128;
        newLines.push(`b=AS:${audioKbps}`);
        newLines.push(`b=TIAS:${audioKbps * 1000}`);
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
