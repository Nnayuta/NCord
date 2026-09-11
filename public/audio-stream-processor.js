/**
 * AudioWorkletProcessor para streaming de áudio PCM de processo/janela com baixíssima latência.
 * Recebe buffers PCM 16-bit Little-Endian estéreo a 48.000 Hz e alimenta a saída Web Audio.
 */
class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer circular para 2 canais (estéreo)
    // Capacidade: 48000 samples por canal (~1 segundo de áudio para absorver qualquer jitter)
    this.bufferSize = 48000;
    this.bufferLeft = new Float32Array(this.bufferSize);
    this.bufferRight = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesAvailable = 0;
    this.hasStartedPlayback = false;
    this.prebufferSamples = 480; // ~10ms de pré-buffer para início suave

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
  pushPCM(arrayBuffer) {
    const int16View = new Int16Array(arrayBuffer);
    const numFrames = Math.floor(int16View.length / 2);

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
        // Buffer cheio: avança o ponteiro de leitura para descartar os samples mais antigos
        // Isso evita acúmulo de latência (drift) caso a rede ou renderização engasgue
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outLeft = output[0];
    const outRight = output[1];
    const blockSize = outLeft.length; // Usualmente 128 samples

    // Aguardar pré-buffer mínimo antes de iniciar a reprodução
    if (!this.hasStartedPlayback) {
      if (this.samplesAvailable >= this.prebufferSamples) {
        this.hasStartedPlayback = true;
      } else {
        // Silêncio enquanto acumula o pré-buffer
        outLeft.fill(0);
        outRight.fill(0);
        return true;
      }
    }

    // Se houver amostras suficientes, ler do buffer circular
    if (this.samplesAvailable >= blockSize) {
      for (let i = 0; i < blockSize; i++) {
        outLeft[i] = this.bufferLeft[this.readIndex];
        outRight[i] = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
      this.samplesAvailable -= blockSize;
    } else {
      // Underrun momentâneo: esvazia o restante e preenche com zero
      let i = 0;
      while (this.samplesAvailable > 0 && i < blockSize) {
        outLeft[i] = this.bufferLeft[this.readIndex];
        outRight[i] = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
        this.samplesAvailable--;
        i++;
      }
      while (i < blockSize) {
        outLeft[i] = 0;
        outRight[i] = 0;
        i++;
      }
      this.hasStartedPlayback = false; // Requer novo pré-buffer para evitar micro-estalos
    }

    return true;
  }
}

registerProcessor('window-audio-processor', WindowAudioProcessor);
