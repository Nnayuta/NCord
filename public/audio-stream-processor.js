/**
 * AudioWorkletProcessor para streaming de áudio PCM de processo/janela com fidelidade cristalina.
 * Recebe buffers PCM 16-bit Little-Endian estéreo a 48.000 Hz e alimenta o pipeline Web Audio.
 *
 * Suporta múltiplas fontes simultâneas (mixagem por id), ring buffer resiliente a jitter
 * sem interrupção de playback por underrun momentâneo, e limitador suave contra clipping.
 */
const BUFFER_SIZE = 96000; // 2 segundos de buffer por fonte a 48 kHz
const PREBUFFER_TARGET = 960; // ~20 ms (7.5 blocos de 128) - absorve jitter IPC sem latência perceptível
const MAX_HEALTHY_BUFFER = 4800; // 100 ms: descarta excesso para evitar acúmulo de latência
const IDLE_BLOCKS_BEFORE_REMOVE = 12000; // ~32 segundos de inatividade para liberar fontes secundárias

class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sources = new Map(); // id -> estado do ring buffer

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

  /**
   * Converte PCM 16-bit estéreo Little-Endian (L, R, L, R...) para Float32 e insere no ring buffer da fonte
   */
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

      // Leitura otimizada: se alinhado a 2 bytes (caso padrão), usa Int16Array direto
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

      // Prevenção de acúmulo de latência: se o buffer ultrapassar 200ms, descarta excesso antigo
      if (src.available > MAX_HEALTHY_BUFFER) {
        const discard = src.available - MAX_HEALTHY_BUFFER;
        src.readIndex = (src.readIndex + discard) % BUFFER_SIZE;
        src.available = MAX_HEALTHY_BUFFER;
      }
    } catch (e) {
      // Previne qualquer interrupção na thread de áudio
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outLeft = output[0];
    const outRight = output.length > 1 ? output[1] : null;
    const blockSize = outLeft.length; // Usualmente 128 samples

    outLeft.fill(0);
    if (outRight) outRight.fill(0);

    for (const [id, src] of this.sources) {
      // Se a fonte ainda não acumulou o pré-buffer inicial (ex: 256 amostras ~5ms)
      if (!src.started) {
        if (src.available >= PREBUFFER_TARGET) {
          src.started = true;
          src.starveCount = 0;
        } else {
          src.idle++;
          // Fontes secundárias fechadas há muito tempo (>30s) podem ser removidas
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
        // Starvation momentânea: o resto do bloco permanece zero (silêncio suave)
        if (src.available === 0) {
          src.starveCount++;
          // Se zerou por mais de 2 blocos (~5.3ms), volta para re-buffer limpo
          // para não ficar tocando blocos parciais picotados (que causam efeito comb filter / som abafado)
          if (src.starveCount >= 2) {
            src.started = false;
          }
        }
      } else {
        src.starveCount = 0;
      }
    }

    // Limitador com saturação suave (soft knee) para prevenir distorção harmônica e clipping digital
    // Linear (100% transparente) em |x| <= 0.85; compressão suave via tanh em picos extremos |x| > 0.85
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
