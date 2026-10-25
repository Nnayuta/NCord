const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WindowAudioProcessor,
  BUFFER_SIZE,
  PREBUFFER_TARGET,
  MAX_HEALTHY_BUFFER
} = require('../public/audio-stream-processor.js');

test('AudioWorklet: Inicialização e estrutura de ring buffer da fonte', () => {
  const proc = new WindowAudioProcessor();
  assert.ok(proc.sources instanceof Map, 'Deve conter Map de fontes');
  assert.strictEqual(proc.sources.size, 0, 'Inicialmente sem fontes');

  const src = proc.getSource('main');
  assert.strictEqual(src.left.length, BUFFER_SIZE, 'Buffer esquerdo deve ter BUFFER_SIZE');
  assert.strictEqual(src.right.length, BUFFER_SIZE, 'Buffer direito deve ter BUFFER_SIZE');
  assert.strictEqual(src.writeIndex, 0);
  assert.strictEqual(src.readIndex, 0);
  assert.strictEqual(src.available, 0);
  assert.strictEqual(src.started, false);
});

test('AudioWorklet: Conversão exata de PCM 16-bit estéreo Little-Endian para Float32', () => {
  const proc = new WindowAudioProcessor();

  // Criar 4 frames PCM estéreo (16 bytes no total: 4 frames * 2 canais * 2 bytes):
  // Frame 0: L = 16384 (0.5), R = -16384 (-0.5)
  // Frame 1: L = 32767 (~0.9999), R = -32768 (-1.0)
  // Frame 2: L = 0 (0.0), R = 8192 (0.25)
  // Frame 3: L = -8192 (-0.25), R = 0 (0.0)
  const buffer = Buffer.alloc(16);
  buffer.writeInt16LE(16384, 0);
  buffer.writeInt16LE(-16384, 2);
  buffer.writeInt16LE(32767, 4);
  buffer.writeInt16LE(-32768, 6);
  buffer.writeInt16LE(0, 8);
  buffer.writeInt16LE(8192, 10);
  buffer.writeInt16LE(-8192, 12);
  buffer.writeInt16LE(0, 14);

  proc.pushPCM('main', buffer);

  const src = proc.getSource('main');
  assert.strictEqual(src.available, 4, 'Deve conter 4 frames disponíveis');
  assert.strictEqual(src.writeIndex, 4, 'WriteIndex deve avançar 4 frames');

  // Verificar fidelidade dos canais L e R decodificados
  assert.ok(Math.abs(src.left[0] - 0.5) < 0.0001, 'L[0] deve ser 0.5');
  assert.ok(Math.abs(src.right[0] - (-0.5)) < 0.0001, 'R[0] deve ser -0.5');
  assert.ok(Math.abs(src.left[1] - (32767 / 32768.0)) < 0.0001, 'L[1] deve ser ~1.0');
  assert.strictEqual(src.right[1], -1.0, 'R[1] deve ser exatamente -1.0');
  assert.strictEqual(src.left[2], 0.0, 'L[2] deve ser 0.0');
  assert.ok(Math.abs(src.right[2] - 0.25) < 0.0001, 'R[2] deve ser 0.25');
  assert.ok(Math.abs(src.left[3] - (-0.25)) < 0.0001, 'L[3] deve ser -0.25');
  assert.strictEqual(src.right[3], 0.0, 'R[3] deve ser 0.0');
});

test('AudioWorklet: Pré-buffer para absorção de jitter IPC sem corte prematuro', () => {
  const proc = new WindowAudioProcessor();

  // Enviar apenas 256 frames (menos que PREBUFFER_TARGET = 960)
  const smallBuf = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    smallBuf.writeInt16LE(16384, i * 4);
    smallBuf.writeInt16LE(16384, i * 4 + 2);
  }
  proc.pushPCM('main', smallBuf);

  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  const outputs = [[outLeft, outRight]];

  // process() deve manter silêncio enquanto acumula o pré-buffer inicial
  proc.process([], outputs);
  assert.strictEqual(outLeft[0], 0, 'Deve emitir silêncio durante pré-buffer');
  assert.strictEqual(proc.getSource('main').started, false, 'Não deve ter iniciado ainda');

  // Agora envia o restante para ultrapassar PREBUFFER_TARGET
  const restBuf = Buffer.alloc(800 * 4);
  for (let i = 0; i < 800; i++) {
    restBuf.writeInt16LE(16384, i * 4);
    restBuf.writeInt16LE(16384, i * 4 + 2);
  }
  proc.pushPCM('main', restBuf);

  // Agora process() deve iniciar e descarregar áudio real
  proc.process([], outputs);
  assert.strictEqual(proc.getSource('main').started, true, 'Deve ter iniciado após pré-buffer');
  assert.ok(Math.abs(outLeft[0] - 0.5) < 0.001, 'Deve emitir as amostras com áudio real');
  assert.ok(Math.abs(outRight[0] - 0.5) < 0.001, 'Canal direito com áudio real');
});

test('AudioWorklet: Descarte de buffer em excesso previne acúmulo de latência', () => {
  const proc = new WindowAudioProcessor();

  // Enviar 6.000 frames de uma vez (acima de MAX_HEALTHY_BUFFER = 4800, ~100ms)
  const hugeBuf = Buffer.alloc(6000 * 4);
  proc.pushPCM('main', hugeBuf);

  const src = proc.getSource('main');
  assert.strictEqual(src.available, MAX_HEALTHY_BUFFER, 'Buffer deve ser limitado a MAX_HEALTHY_BUFFER para evitar latência');
});

test('AudioWorklet: Mixagem de múltiplas fontes simultâneas (ex: app + jogo)', () => {
  const proc = new WindowAudioProcessor();

  // Fonte A: 1000 frames de valor 0.3 (9830 em 16-bit)
  const bufA = Buffer.alloc(1000 * 4);
  for (let i = 0; i < 1000; i++) {
    bufA.writeInt16LE(9830, i * 4);
    bufA.writeInt16LE(9830, i * 4 + 2);
  }

  // Fonte B: 1000 frames de valor 0.4 (13107 em 16-bit)
  const bufB = Buffer.alloc(1000 * 4);
  for (let i = 0; i < 1000; i++) {
    bufB.writeInt16LE(13107, i * 4);
    bufB.writeInt16LE(13107, i * 4 + 2);
  }

  proc.pushPCM('app1', bufA);
  proc.pushPCM('app2', bufB);

  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  proc.process([], [[outLeft, outRight]]);

  // Ambas as fontes devem estar somadas (0.3 + 0.4 = ~0.7)
  const sample = outLeft[0];
  assert.ok(sample >= 0.68 && sample <= 0.72, `Amostra combinada deve ser ~0.7 (obteve ${sample})`);
});

test('AudioWorklet: Soft limiter analógico contra clipping em sinais extremos', () => {
  const proc = new WindowAudioProcessor();

  // Criar fonte com amplitude altíssima que causaria clipping severo
  const loudBuf = Buffer.alloc(1000 * 4);
  for (let i = 0; i < 1000; i++) {
    loudBuf.writeInt16LE(32767, i * 4); // ~1.0
    loudBuf.writeInt16LE(-32768, i * 4 + 2); // -1.0
  }
  proc.pushPCM('loud1', loudBuf);
  proc.pushPCM('loud2', loudBuf); // Soma daria 2.0 e -2.0 sem limiter

  const outLeft = new Float32Array(128);
  const outRight = new Float32Array(128);
  proc.process([], [[outLeft, outRight]]);

  for (let i = 0; i < 128; i++) {
    assert.ok(outLeft[i] <= 1.0, `Pico positivo não deve exceder 1.0: ${outLeft[i]}`);
    assert.ok(outLeft[i] > 0.85, 'Deve ser comprimido suavemente próximo ao teto');
    assert.ok(outRight[i] >= -1.0, `Pico negativo não deve ser menor que -1.0: ${outRight[i]}`);
    assert.ok(outRight[i] < -0.85, 'Deve ser comprimido suavemente próximo ao chão');
  }
});

test('AudioWorklet: Mensagens IPC no port (type: clear e type: pcm)', () => {
  const proc = new WindowAudioProcessor();
  const testBuf = Buffer.alloc(200 * 4);

  // Testar envio via port.onmessage
  proc.port.onmessage({ data: { type: 'pcm', id: 'source-ipc', buffer: testBuf } });
  assert.ok(proc.sources.has('source-ipc'), 'Fonte deve ser registrada via mensagem pcm');

  // Testar comando clear
  proc.port.onmessage({ data: { type: 'clear' } });
  assert.strictEqual(proc.sources.size, 0, 'Comando clear deve esvaziar todas as fontes');
});
