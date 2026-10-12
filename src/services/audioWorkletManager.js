/**
 * Gerenciador de Áudio Web Audio API / AudioWorklet para WASAPI PCM Loopback
 */

class AudioWorkletManager {
  constructor() {
    this.audioCtx = null;
    this.workletNode = null;
    this.masterGain = null;
    this.destination = null;
    this.isInitialized = false;
    this.isAntiEchoEnabled = true;
    this.activePids = new Map(); // pid -> { volume: 1.0, muted: false }
  }

  async init() {
    if (this.isInitialized && this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      return this.destination ? this.destination.stream : null;
    }

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      if (this.audioCtx.state === 'suspended') {
        try {
          await this.audioCtx.resume();
        } catch (e) {
          console.warn('[AudioWorkletManager] AudioContext resume pendente de interação do usuário:', e);
        }
      }

      // Carregar módulo AudioWorklet
      try {
        await this.audioCtx.audioWorklet.addModule('audio-stream-processor.js');
      } catch (err) {
        console.warn('[AudioWorkletManager] Tentando fallback para /audio-stream-processor.js:', err);
        await this.audioCtx.audioWorklet.addModule('/audio-stream-processor.js');
      }

      this.workletNode = new AudioWorkletNode(this.audioCtx, 'window-audio-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      this.destination = this.audioCtx.createMediaStreamDestination();

      this.workletNode.connect(this.masterGain);
      this.masterGain.connect(this.destination);

      this.isInitialized = true;
      console.log('[AudioWorkletManager] Inicializado com sucesso a 48.000 Hz');
      return this.destination.stream;
    } catch (err) {
      console.error('[AudioWorkletManager] Erro fatal ao inicializar AudioWorklet:', err);
      return null;
    }
  }

  // sourceId identifica a fonte (PID); fontes diferentes são somadas no worklet em vez de intercaladas
  feedPCM(arrayBuffer, sourceId = 'main') {
    if (!this.workletNode || !arrayBuffer) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    try {
      this.workletNode.port.postMessage({
        type: 'pcm',
        id: sourceId,
        buffer: arrayBuffer
      });
    } catch (err) {
      console.warn('[AudioWorkletManager] Erro ao enviar PCM para o worklet:', err);
    }
  }

  clearBuffer() {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'clear' });
  }

  setMasterVolume(value) {
    if (this.masterGain && this.audioCtx) {
      const vol = Math.max(0, Math.min(1.5, Number(value) || 0));
      this.masterGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  getMixedAudioTrack() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.destination && this.destination.stream) {
      const track = this.destination.stream.getAudioTracks()[0] || null;
      if (track) {
        track.enabled = true;
      }
      return track;
    }
    return null;
  }

  destroy() {
    try {
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close();
      }
    } catch (e) {}
    this.audioCtx = null;
    this.workletNode = null;
    this.masterGain = null;
    this.destination = null;
    this.isInitialized = false;
  }
}

export const audioWorkletManager = new AudioWorkletManager();
