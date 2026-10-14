const test = require('node:test');
const assert = require('node:assert/strict');

// Algoritmo extraído de public/audio-stream-processor.js
const softLimit = (x) => {
  if (x > -0.85 && x < 0.85) return x;
  if (x >= 0.85) {
    return 0.85 + 0.15 * Math.tanh((x - 0.85) / 0.15);
  }
  return -0.85 + 0.15 * Math.tanh((x + 0.85) / 0.15);
};

test('1. Sinais dentro da faixa normal (|x| <= 0.85) são 100% transparentes e inalterados', () => {
  const normalSamples = [0, 0.1, -0.1, 0.5, -0.5, 0.84, -0.84];
  for (const s of normalSamples) {
    assert.strictEqual(softLimit(s), s, `Amostra normal ${s} deve permanecer inalterada`);
  }
});

test('2. Sinais acima de 0.85 sofrem compressão analógica suave com continuidade', () => {
  // Testando transição no joelho (knee)
  const valAtKnee = softLimit(0.85);
  assert.strictEqual(valAtKnee, 0.85);

  const valJustAbove = softLimit(0.9);
  assert.ok(valJustAbove > 0.85 && valJustAbove < 0.9, 'Deve comprimir suavemente');

  const valAt1 = softLimit(1.0);
  assert.ok(valAt1 > 0.95 && valAt1 < 1.0, 'Valores em 1.0 devem ser ligeiramente atenuados abaixo do teto');
});

test('3. Picos extremos nunca excedem o intervalo [-1.0, 1.0]', () => {
  const extremeSamples = [1.5, 2.0, 5.0, 10.0, 100.0, -1.5, -2.0, -5.0, -10.0, -100.0];
  for (const s of extremeSamples) {
    const limited = softLimit(s);
    assert.ok(limited <= 1.0, `Pico positivo ${s} não deve exceder 1.0 (obteve ${limited})`);
    assert.ok(limited >= -1.0, `Pico negativo ${s} não deve ser menor que -1.0 (obteve ${limited})`);
  }
});
