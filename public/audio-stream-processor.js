/**
 * AudioWorkletProcessor para streaming de áudio PCM de processo/janela com fidelidade cristalina.
 * Recebe buffers PCM 16-bit Little-Endian estéreo a 48.000 Hz e alimenta o pipeline Web Audio.
 *
 * Suporta MÚLTIPLAS fontes simultâneas: cada fonte (identificada por `id`) possui seu próprio
 * ring buffer e o resultado final é a soma de todas (mixagem), com limitador simples contra clipping.
 */
const BUFFER_SIZE = 96000; // 2 s por fonte a 48 kHz
const PREBUFFER_TARGET = 960; // 20 ms de pré-buffer inicial para partida suave
const MAX_HEALTHY_BUFFER = 9600; // 200 ms: acima disso descarta excesso para não acumular latência
const IDLE_BLOCKS_BEFORE_REMOVE = 2000; // ~5 s sem dados (128 amostras/bloco) remove a fonte

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
        this.pushPCM(data.id || 'default', data.buffer);
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
      let view;
      if (input instanceof ArrayBuffer) {
        view = new DataView(input);
      } else if (ArrayBuffer.isView(input)) {
        view = new DataView(input.buffer, input.byteOffset, input.byteLength);
      } else if (input.buffer instanceof ArrayBuffer) {
        view = new DataView(
          input.buffer,
          input.byteOffset || 0,
          input.byteLength || input.length || input.buffer.byteLength
        );
      } else {
        return;
      }

      const byteLength = view.byteLength;
      if (byteLength < 4) return;

      const src = this.getSource(id);
      src.idle = 0;

      // Cada frame estéreo possui 4 bytes (2 bytes L + 2 bytes R, 16-bit signed)
      const numFrames = Math.floor(byteLength / 4);

      for (let i = 0; i < numFrames; i++) {
        const offset = i * 4;
        src.left[src.writeIndex] = view.getInt16(offset, true) / 32768.0;
        src.right[src.writeIndex] = view.getInt16(offset + 2, true) / 32768.0;

        src.writeIndex = (src.writeIndex + 1) % BUFFER_SIZE;

        if (src.available < BUFFER_SIZE) {
          src.available++;
        } else {
          // Buffer cheio: avança leitura para manter sincronia
          src.readIndex = (src.readIndex + 1) % BUFFER_SIZE;
        }
      }

      // Prevenção de acúmulo de latência
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
    const blockSize = outLeft.length; // 128 samples

    outLeft.fill(0);
    if (outRight) outRight.fill(0);

    for (const [id, src] of this.sources) {
      // Aguardar pré-buffer inicial somente na primeira inicialização ou após silêncio total
      if (!src.started) {
        if (src.available >= PREBUFFER_TARGET) {
          src.started = true;
        } else {
          src.idle++;
          if (src.idle > IDLE_BLOCKS_BEFORE_REMOVE) this.sources.delete(id);
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

      if (src.available === 0) {
        src.started = false; // silêncio: re-bufferiza antes de voltar a tocar
      }
    }

    // Limitador simples (soma de várias fontes pode ultrapassar 1.0)
    for (let i = 0; i < blockSize; i++) {
      if (outLeft[i] > 1) outLeft[i] = 1;
      else if (outLeft[i] < -1) outLeft[i] = -1;
      if (outRight) {
        if (outRight[i] > 1) outRight[i] = 1;
        else if (outRight[i] < -1) outRight[i] = -1;
      }
    }

    return true;
  }
}

registerProcessor('window-audio-processor', WindowAudioProcessor);
