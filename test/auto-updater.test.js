const test = require('node:test');
const assert = require('node:assert');
const { compareSemver } = require('../updater-main');

test('Auto-Updater: compareSemver compara versões semver corretamente', () => {
  // Versão mais recente
  assert.strictEqual(compareSemver('1.2.2', '1.2.1'), 1, 'Patch mais recente');
  assert.strictEqual(compareSemver('1.3.0', '1.2.1'), 1, 'Minor mais recente');
  assert.strictEqual(compareSemver('2.0.0', '1.2.1'), 1, 'Major mais recente');
  assert.strictEqual(compareSemver('v1.2.2', '1.2.1'), 1, 'Com prefixo v');
  assert.strictEqual(compareSemver('1.2.2', 'v1.2.1'), 1, 'Com prefixo v no segundo');

  // Mesma versão
  assert.strictEqual(compareSemver('1.2.1', '1.2.1'), 0, 'Versões idênticas');
  assert.strictEqual(compareSemver('v1.2.1', '1.2.1'), 0, 'Versões idênticas com v');

  // Versão mais antiga
  assert.strictEqual(compareSemver('1.2.0', '1.2.1'), -1, 'Versão anterior');
  assert.strictEqual(compareSemver('1.1.9', '1.2.1'), -1, 'Minor anterior');
  assert.strictEqual(compareSemver('0.9.0', '1.2.1'), -1, 'Major anterior');
});

test('Auto-Updater: Extração de tag via redirecionamento de release (sem rate-limit)', () => {
  const sampleLocation = 'https://github.com/Nnayuta/NCord/releases/tag/v1.2.5';
  const match = sampleLocation.match(/\/tag\/v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  assert.ok(match, 'Deve encontrar a versão na URL de redirecionamento');
  assert.strictEqual(match[1], '1.2.5', 'Deve extrair 1.2.5 corretamente');

  const rawTag = sampleLocation.split('/tag/')[1];
  assert.strictEqual(rawTag, 'v1.2.5', 'Tag bruta correta');

  const downloadUrl = `https://github.com/Nnayuta/NCord/releases/download/${rawTag}/LoveChat.exe`;
  assert.strictEqual(
    downloadUrl,
    'https://github.com/Nnayuta/NCord/releases/download/v1.2.5/LoveChat.exe',
    'URL de download direto gerada com sucesso'
  );
});

test('Auto-Updater: Lógica de obrigatoriedade ativa para novas versões', () => {
  const currentVersion = '1.2.1';
  const latestVersion = '1.2.2';
  const isNewer = compareSemver(latestVersion, currentVersion) > 0;
  assert.strictEqual(isNewer, true, 'Deve identificar update obrigatório');

  const sameVersion = '1.2.1';
  const isSame = compareSemver(sameVersion, currentVersion) > 0;
  assert.strictEqual(isSame, false, 'Não deve solicitar update se versão for a mesma');
});
