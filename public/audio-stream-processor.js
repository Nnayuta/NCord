/**
 * AudioWorkletProcessor para streaming de áudio PCM de processo/janela com fidelidade cristalina.
 * Recebe buffers PCM 16-bit Little-Endian estéreo a 48.000 Hz e alimenta o pipeline Web Audio.
 */
class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Capacidade do ring buffer: 96000 samples por canal (2 segundos de buffer circular a 48kHz)
    this.bufferSize = 96000;
    this.bufferLeft = new Float32Array(this.bufferSize);
    this.bufferRight = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesAvailable = 0;
    this.hasStartedPlayback = false;
    this.prebufferTarget = 960; // 20ms de pré-buffer inicial para partida suave

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
   * Converte PCM 16-bit estéreo Little-Endian (L, R, L, R...) para Float32 e insere no ring buffer
   */
  pushPCM(input) {
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

      // Cada frame estéreo possui 4 bytes (2 bytes L + 2 bytes R, 16-bit signed)
      const numFrames = Math.floor(byteLength / 4);

      for (let i = 0; i < numFrames; i++) {
        const offset = i * 4;
        // Leitura explícita Little-Endian e normalização para -1.0 a 1.0
        const leftSample = view.getInt16(offset, true) / 32768.0;
        const rightSample = view.getInt16(offset + 2, true) / 32768.0;

        this.bufferLeft[this.writeIndex] = leftSample;
        this.bufferRight[this.writeIndex] = rightSample;

        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

        if (this.samplesAvailable < this.bufferSize) {
          this.samplesAvailable++;
        } else {
          // Buffer cheio: avança leitura para manter sincronia
          this.readIndex = (this.readIndex + 1) % this.bufferSize;
        }
      }

      // Prevenção de acúmulo de latência: se o buffer ultrapassar 200ms (~9600 amostras), descarta excesso
      const maxHealthyBuffer = 9600;
      if (this.samplesAvailable > maxHealthyBuffer) {
        const discard = this.samplesAvailable - maxHealthyBuffer;
        this.readIndex = (this.readIndex + discard) % this.bufferSize;
        this.samplesAvailable = maxHealthyBuffer;
      }
    } catch (e) {
      // Previne qualquer interrupção na thread de áudio
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const numChannels = output.length;
    const outLeft = output[0];
    const outRight = numChannels > 1 ? output[1] : null;
    const blockSize = outLeft.length; // 128 samples

    // Aguardar pré-buffer inicial somente na primeira inicialização ou após silêncio total
    if (!this.hasStartedPlayback) {
      if (this.samplesAvailable >= this.prebufferTarget) {
        this.hasStartedPlayback = true;
      } else {
        outLeft.fill(0);
        if (outRight) outRight.fill(0);
        return true;
      }
    }

    // Se temos amostras suficientes para o bloco completo de 128
    if (this.samplesAvailable >= blockSize) {
      for (let i = 0; i < blockSize; i++) {
        const l = this.bufferLeft[this.readIndex];
        const r = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;

        if (outRight) {
          outLeft[i] = l;
          outRight[i] = r;
        } else {
          outLeft[i] = (l + r) * 0.5;
        }
      }
      this.samplesAvailable -= blockSize;
    } else if (this.samplesAvailable > 0) {
      // Drenar as amostras parciais restantes sem cortar bruscamente o som
      const count = this.samplesAvailable;
      for (let i = 0; i < count; i++) {
        const l = this.bufferLeft[this.readIndex];
        const r = this.bufferRight[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;

        if (outRight) {
          outLeft[i] = l;
          outRight[i] = r;
        } else {
          outLeft[i] = (l + r) * 0.5;
        }
      }
      for (let i = count; i < blockSize; i++) {
        outLeft[i] = 0;
        if (outRight) outRight[i] = 0;
      }
      this.samplesAvailable = 0;
    } else {
      // Silêncio
      outLeft.fill(0);
      if (outRight) outRight.fill(0);
      this.hasStartedPlayback = false;
    }

    return true;
  }
}

registerProcessor('window-audio-processor', WindowAudioProcessor);
