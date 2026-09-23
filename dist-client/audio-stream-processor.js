/**
 * AudioWorkletProcessor para streaming de áudio PCM de processo/janela com baixíssima latência.
 * Recebe buffers PCM 16-bit Little-Endian estéreo a 48.000 Hz e alimenta a saída Web Audio.
 */
class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer circular para 2 canais (estéreo)
    // Capacidade: 48000 samples por canal (~1 segundo de áudio a 48kHz)
    this.bufferSize = 48000;
    this.bufferLeft = new Float32Array(this.bufferSize);
    this.bufferRight = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesAvailable = 0;
    this.hasStartedPlayback = false;
    this.prebufferSamples = 480; // ~10ms de pré-buffer para início suave sem estalos

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'clear') {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.samplesAvailable = 0;
        this.hasStartedPlayback = false;
        return;
      }

      if (data.type === 'pcm' && data.buffer) {
        this.pushPCM(data.buffer);
      }
    };
  }

  /**
   * Converte PCM 16-bit estéreo intercalado (L, R, L, R...) para Float32 e adiciona ao ring buffer
   */
  pushPCM(input) {
    if (!input) return;

    try {
      let rawBuffer;
      let byteOffset = 0;
      let byteLength = 0;

      if (input instanceof ArrayBuffer) {
        rawBuffer = input;
        byteOffset = 0;
        byteLength = input.byteLength;
      } else if (ArrayBuffer.isView(input)) {
        rawBuffer = input.buffer;
        byteOffset = input.byteOffset;
        byteLength = input.byteLength;
      } else if (input.buffer instanceof ArrayBuffer) {
        rawBuffer = input.buffer;
        byteOffset = input.byteOffset || 0;
        byteLength = input.byteLength || input.length || rawBuffer.byteLength;
      } else {
        return;
      }

      if (byteLength < 4) return;

      // Garantir alinhamento de 2 bytes para Int16
      const numSamples = Math.floor(byteLength / 2);
      const int16View = new Int16Array(rawBuffer, byteOffset, numSamples);
      const numFrames = Math.floor(numSamples / 2); // 2 canais intercalados (L, R)

      for (let i = 0; i < numFrames; i++) {
        // Normalização de Int16 (-32768 a 32767) para Float32 (-1.0 a 1.0)
        const left = int16View[i * 2] / 32768.0;
        const right = int16View[i * 2 + 1] / 32768.0;

        this.bufferLeft[this.writeIndex] = left;
        this.bufferRight[this.writeIndex] = right;

        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

        if (this.samplesAvailable < this.bufferSize) {
          this.samplesAvailable++;
        } else {
          // Buffer cheio: avança leitura descartando dados antigos para evitar drift de latência
          this.readIndex = (this.readIndex + 1) % this.bufferSize;
        }
      }
    } catch (e) {
      // Evitar quebrar a thread do worklet caso ocorra algum buffer corrompido
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const numChannels = output.length;
    const outLeft = output[0];
    const outRight = numChannels > 1 ? output[1] : null;
    const blockSize = outLeft.length; // Usualmente 128 samples

    // Aguardar pré-buffer mínimo antes de iniciar a reprodução
    if (!this.hasStartedPlayback) {
      if (this.samplesAvailable >= this.prebufferSamples) {
        this.hasStartedPlayback = true;
      } else {
        // Silêncio enquanto acumula o pré-buffer
        outLeft.fill(0);
        if (outRight) outRight.fill(0);
        return true;
      }
    }

    // Se houver amostras suficientes, ler do buffer circular
    if (this.samplesAvailable >= blockSize) {
      for (let i = 0; i < blockSize; i++) {
        const l = this.bufferLeft[this.readIndex];
        const r = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;

        if (outRight) {
          outLeft[i] = l;
          outRight[i] = r;
        } else {
          // Downmix mono se a saída tiver apenas 1 canal
          outLeft[i] = (l + r) * 0.5;
        }
      }
      this.samplesAvailable -= blockSize;
    } else {
      // Underrun momentâneo: drena o restante e preenche com silêncio
      let i = 0;
      while (this.samplesAvailable > 0 && i < blockSize) {
        const l = this.bufferLeft[this.readIndex];
        const r = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
        this.samplesAvailable--;

        if (outRight) {
          outLeft[i] = l;
          outRight[i] = r;
        } else {
          outLeft[i] = (l + r) * 0.5;
        }
        i++;
      }
      while (i < blockSize) {
        outLeft[i] = 0;
        if (outRight) outRight[i] = 0;
        i++;
      }
      this.hasStartedPlayback = false; // Requer novo pré-buffer para evitar micro-estalos
    }

    return true;
  }
}

registerProcessor('window-audio-processor', WindowAudioProcessor);
