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
    this.totalPCMBytes = 0;
    this.totalPCMChunks = 0;
    this.lastPCMAt = 0;
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

      // Carregar módulo AudioWorklet via Blob URL inline para garantir funcionamento
      // 100% confiável sob protocolo file:// no Electron, empacotamento Vite e navegador Web
      const WORKLET_PROCESSOR_CODE = `
        const BUFFER_SIZE = 96000;
        const PREBUFFER_TARGET = 960;
        const MAX_HEALTHY_BUFFER = 4800;
        const IDLE_BLOCKS_BEFORE_REMOVE = 12000;

        class WindowAudioProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.sources = new Map();
            this.port.onmessage = (event) => {
              const data = event.data;
              if (!data) return;
              if (data.type === 'clear') {
                this.sources.clear();
                return;
              }
              if (data.type === 'pcm' && data.buffer) {
                this.pushPCM(data.id || 'main', data.buffer);
              }
            };
          }

          getSource(id) {
            let src = this.sources.get(id);
            if (!src) {
              src = {
                left: new Float32Array(BUFFER_SIZE),
                right: new Float32Array(BUFFER_SIZE),
                writeIndex: 0,
                readIndex: 0,
                available: 0,
                started: false,
                starveCount: 0,
                idle: 0
              };
              this.sources.set(id, src);
            }
            return src;
          }

          pushPCM(id, input) {
            if (!input) return;
            try {
              let byteOffset = 0;
              let byteLength = 0;
              let arrayBuffer = null;

              if (input instanceof ArrayBuffer) {
                arrayBuffer = input;
                byteOffset = 0;
                byteLength = input.byteLength;
              } else if (ArrayBuffer.isView(input)) {
                arrayBuffer = input.buffer;
                byteOffset = input.byteOffset;
                byteLength = input.byteLength;
              } else if (input && input.buffer instanceof ArrayBuffer) {
                arrayBuffer = input.buffer;
                byteOffset = input.byteOffset || 0;
                byteLength = input.byteLength || input.length || input.buffer.byteLength;
              } else {
                return;
              }

              if (byteLength < 4 || !arrayBuffer) return;
              const numFrames = Math.floor(byteLength / 4);
              const src = this.getSource(id);
              src.idle = 0;

              if (byteOffset % 2 === 0) {
                const int16 = new Int16Array(arrayBuffer, byteOffset, numFrames * 2);
                for (let i = 0; i < numFrames; i++) {
                  const l = int16[i * 2] / 32768.0;
                  const r = int16[i * 2 + 1] / 32768.0;
                  src.left[src.writeIndex] = l;
                  src.right[src.writeIndex] = r;
                  src.writeIndex = (src.writeIndex + 1) % BUFFER_SIZE;
                  if (src.available < BUFFER_SIZE) {
                    src.available++;
                  } else {
                    src.readIndex = (src.readIndex + 1) % BUFFER_SIZE;
                  }
                }
              } else {
                const view = new DataView(arrayBuffer, byteOffset, byteLength);
                for (let i = 0; i < numFrames; i++) {
                  const offset = i * 4;
                  const l = view.getInt16(offset, true) / 32768.0;
                  const r = view.getInt16(offset + 2, true) / 32768.0;
                  src.left[src.writeIndex] = l;
                  src.right[src.writeIndex] = r;
                  src.writeIndex = (src.writeIndex + 1) % BUFFER_SIZE;
                  if (src.available < BUFFER_SIZE) {
                    src.available++;
                  } else {
                    src.readIndex = (src.readIndex + 1) % BUFFER_SIZE;
                  }
                }
              }

              if (src.available > MAX_HEALTHY_BUFFER) {
                const discard = src.available - MAX_HEALTHY_BUFFER;
                src.readIndex = (src.readIndex + discard) % BUFFER_SIZE;
                src.available = MAX_HEALTHY_BUFFER;
              }
            } catch (e) {}
          }

          process(inputs, outputs) {
            const output = outputs[0];
            if (!output || output.length === 0) return true;
            const outLeft = output[0];
            const outRight = output.length > 1 ? output[1] : null;
            const blockSize = outLeft.length;

            outLeft.fill(0);
            if (outRight) outRight.fill(0);

            for (const [id, src] of this.sources) {
              if (!src.started) {
                if (src.available >= PREBUFFER_TARGET) {
                  src.started = true;
                  src.starveCount = 0;
                } else {
                  src.idle++;
                  if (id !== 'main' && src.idle > IDLE_BLOCKS_BEFORE_REMOVE) {
                    this.sources.delete(id);
                  }
                  continue;
                }
              }

              const count = Math.min(blockSize, src.available);
              for (let i = 0; i < count; i++) {
                const l = src.left[src.readIndex];
                const r = src.right[src.readIndex];
                src.readIndex = (src.readIndex + 1) % BUFFER_SIZE;
                if (outRight) {
                  outLeft[i] += l;
                  outRight[i] += r;
                } else {
                  outLeft[i] += (l + r) * 0.5;
                }
              }
              src.available -= count;

              if (count < blockSize) {
                if (src.available === 0) {
                  src.starveCount++;
                  if (src.starveCount >= 2) {
                    src.started = false;
                  }
                }
              } else {
                src.starveCount = 0;
              }
            }

            const softLimit = (x) => {
              if (x > -0.85 && x < 0.85) return x;
              if (x >= 0.85) {
                return 0.85 + 0.15 * Math.tanh((x - 0.85) / 0.15);
              }
              return -0.85 + 0.15 * Math.tanh((x + 0.85) / 0.15);
            };

            for (let i = 0; i < blockSize; i++) {
              outLeft[i] = softLimit(outLeft[i]);
              if (outRight) {
                outRight[i] = softLimit(outRight[i]);
              }
            }
            return true;
          }
        }

        registerProcessor('window-audio-processor', WindowAudioProcessor);
      `;

      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await this.audioCtx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
      } catch (blobErr) {
        console.warn('[AudioWorkletManager] Blob addModule falhou, tentando caminhos relativos:', blobErr);
        try {
          await this.audioCtx.audioWorklet.addModule('audio-stream-processor.js');
        } catch (err) {
          console.warn('[AudioWorkletManager] Tentando fallback para /audio-stream-processor.js:', err);
          await this.audioCtx.audioWorklet.addModule('/audio-stream-processor.js');
        }
      }

      this.workletNode = new AudioWorkletNode(this.audioCtx, 'window-audio-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.25; // Ganho calibrado para loudness de broadcast (+2 dB) sem clipping

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

  hasActiveAudio() {
    return this.totalPCMChunks > 0 && (Date.now() - this.lastPCMAt < 4000);
  }

  // sourceId identifica a fonte (PID); fontes diferentes são somadas no worklet em vez de intercaladas
  feedPCM(arrayBuffer, sourceId = 'main') {
    if (!this.workletNode || !arrayBuffer) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    try {
      const byteLength = arrayBuffer?.byteLength || arrayBuffer?.length || 0;
      this.totalPCMBytes += byteLength;
      this.totalPCMChunks += 1;
      this.lastPCMAt = Date.now();

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

  getPCMStats() {
    return {
      totalBytes: this.totalPCMBytes,
      totalChunks: this.totalPCMChunks,
      lastPCMAt: this.lastPCMAt
    };
  }

  setMasterVolume(value) {
    if (this.masterGain && this.audioCtx) {
      const vol = Math.max(0, Math.min(2.0, Number(value) || 0));
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
        if ('contentHint' in track) {
          track.contentHint = 'music';
        }
      }
      return track;
    }
    return null;
  }

  isMixedAudioTrack(track) {
    if (!track || !this.destination?.stream) return false;
    return this.destination.stream.getAudioTracks().includes(track);
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
