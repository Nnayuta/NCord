const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareSemver,
  parseReleaseRedirect,
  formatBytes,
  checkForUpdates
} = require('../updater-main');

test('Auto-Updater: compareSemver compara rigorosamente versões semver e edge cases', () => {
  // 1. Versões mais recentes (espera 1)
  assert.strictEqual(compareSemver('1.2.2', '1.2.1'), 1, 'Patch mais recente');
  assert.strictEqual(compareSemver('1.3.0', '1.2.1'), 1, 'Minor mais recente');
  assert.strictEqual(compareSemver('2.0.0', '1.2.1'), 1, 'Major mais recente');
  assert.strictEqual(compareSemver('1.10.0', '1.9.0'), 1, 'Multi-dígito (10 > 9)');
  assert.strictEqual(compareSemver('v1.2.2', '1.2.1'), 1, 'Com prefixo v no primeiro');
  assert.strictEqual(compareSemver('1.2.2', 'v1.2.1'), 1, 'Com prefixo v no segundo');
  assert.strictEqual(compareSemver('V1.2.2', 'V1.2.1'), 1, 'Prefixo v maiúsculo');
  assert.strictEqual(compareSemver('1.2.1', '1.2'), 1, '3 dígitos vs 2 dígitos');

  // 2. Versões idênticas (espera 0)
  assert.strictEqual(compareSemver('1.2.1', '1.2.1'), 0, 'Versões idênticas');
  assert.strictEqual(compareSemver('v1.2.1', '1.2.1'), 0, 'Versões idênticas com v');
  assert.strictEqual(compareSemver('1.2.0', '1.2'), 0, '1.2.0 equivalente a 1.2');

  // 3. Versões mais antigas (espera -1)
  assert.strictEqual(compareSemver('1.2.0', '1.2.1'), -1, 'Versão anterior');
  assert.strictEqual(compareSemver('1.1.9', '1.2.1'), -1, 'Minor anterior');
  assert.strictEqual(compareSemver('0.9.0', '1.2.1'), -1, 'Major anterior');
  assert.strictEqual(compareSemver('1.9.0', '1.10.0'), -1, 'Multi-dígito inferior');

  // 4. Entradas inválidas / nulas não devem lançar exceção
  assert.strictEqual(compareSemver(null, '1.0.0'), 0);
  assert.strictEqual(compareSemver('1.0.0', null), 0);
  assert.strictEqual(compareSemver('', ''), 0);
});

test('Auto-Updater: parseReleaseRedirect extrai metadados reais da URL de redirecionamento', () => {
  // Redirecionamento padrão do GitHub Releases
  const loc1 = 'https://github.com/Nnayuta/NCord/releases/tag/v1.3.0';
  const res1 = parseReleaseRedirect(loc1);
  assert.ok(res1, 'Deve extrair objeto com sucesso');
  assert.strictEqual(res1.latestVersion, '1.3.0');
  assert.strictEqual(res1.rawTag, 'v1.3.0');
  assert.strictEqual(
    res1.downloadUrl,
    'https://github.com/Nnayuta/NCord/releases/download/v1.3.0/LoveChat.exe'
  );

  // Redirecionamento sem prefixo 'v'
  const loc2 = 'https://github.com/Nnayuta/NCord/releases/tag/2.0.1';
  const res2 = parseReleaseRedirect(loc2);
  assert.strictEqual(res2.latestVersion, '2.0.1');
  assert.strictEqual(res2.rawTag, '2.0.1');

  // URL inválida ou sem tag
  assert.strictEqual(parseReleaseRedirect('https://github.com/Nnayuta/NCord/releases'), null);
  assert.strictEqual(parseReleaseRedirect(''), null);
  assert.strictEqual(parseReleaseRedirect(null), null);
});

test('Auto-Updater: formatBytes formata tamanhos de arquivo legíveis', () => {
  assert.strictEqual(formatBytes(0), '0 MB');
  assert.strictEqual(formatBytes(-100), '0 MB');
  assert.strictEqual(formatBytes(null), '0 MB');
  assert.strictEqual(formatBytes(1024 * 1024), '1.0 MB');
  assert.strictEqual(formatBytes(52428800), '50.0 MB');
  assert.strictEqual(formatBytes(104857600), '100.0 MB');
});

test('Auto-Updater: checkForUpdates identifica nova versão obrigatória via HEAD redirect', async () => {
  // Simular fetch com mock real que retorna cabeçalho Location de versão mais recente
  const mockFetch = async (url, opts) => {
    if (opts && opts.method === 'HEAD') {
      return {
        headers: {
          get: (name) => {
            if (name.toLowerCase() === 'location') {
              return 'https://github.com/Nnayuta/NCord/releases/tag/v1.3.0';
            }
            return null;
          }
        }
      };
    }
    // Simular API retornando 403 Rate Limit para forçar o caminho do HEAD
    return { ok: false, status: 403 };
  };

  const info = await checkForUpdates({
    currentVersion: '1.2.1',
    fetchFn: mockFetch
  });

  assert.strictEqual(info.updateAvailable, true, 'Deve indicar atualização disponível');
  assert.strictEqual(info.isMandatory, true, 'Atualização deve ser obrigatória');
  assert.strictEqual(info.currentVersion, '1.2.1');
  assert.strictEqual(info.latestVersion, '1.3.0');
  assert.strictEqual(info.tagName, 'v1.3.0');
  assert.strictEqual(
    info.downloadUrl,
    'https://github.com/Nnayuta/NCord/releases/download/v1.3.0/LoveChat.exe'
  );
});

test('Auto-Updater: checkForUpdates não solicita update quando versão atual é igual ou superior', async () => {
  const mockFetch = async () => ({
    headers: {
      get: () => 'https://github.com/Nnayuta/NCord/releases/tag/v1.2.1'
    }
  });

  const infoSame = await checkForUpdates({
    currentVersion: '1.2.1',
    fetchFn: mockFetch
  });
  assert.strictEqual(infoSame.updateAvailable, false, 'Mesma versão não deve atualizar');
  assert.strictEqual(infoSame.isMandatory, false);

  const infoSuperior = await checkForUpdates({
    currentVersion: '1.2.5',
    fetchFn: mockFetch
  });
  assert.strictEqual(infoSuperior.updateAvailable, false, 'Versão superior local não deve atualizar');
});

test('Auto-Updater: checkForUpdates extrai changelog e assets ricos da API do GitHub', async () => {
  const mockFetch = async (url) => {
    if (url.includes('api.github.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v1.4.0',
          name: 'LoveChat v1.4.0 - Performance Release',
          body: '- Áudio com 200% de volume nativo\n- Conexão direta mais rápida',
          html_url: 'https://github.com/Nnayuta/NCord/releases/tag/v1.4.0',
          assets: [
            {
              name: 'LoveChat.exe',
              size: 55000000,
              browser_download_url: 'https://github.com/Nnayuta/NCord/releases/download/v1.4.0/LoveChat.exe'
            }
          ]
        })
      };
    }
    return { headers: { get: () => 'https://github.com/Nnayuta/NCord/releases/tag/v1.4.0' } };
  };

  const info = await checkForUpdates({
    currentVersion: '1.2.1',
    fetchFn: mockFetch
  });

  assert.strictEqual(info.updateAvailable, true);
  assert.strictEqual(info.latestVersion, '1.4.0');
  assert.strictEqual(info.releaseName, 'LoveChat v1.4.0 - Performance Release');
  assert.ok(info.releaseNotes.includes('Áudio com 200%'), 'Deve conter notas de versão');
  assert.strictEqual(info.assetSize, 55000000);
});

test('Auto-Updater: Falha total de rede não quebra o sistema e retorna erro amigável', async () => {
  const mockFailingFetch = async () => {
    throw new Error('ENOTFOUND github.com');
  };

  const info = await checkForUpdates({
    currentVersion: '1.2.1',
    fetchFn: mockFailingFetch
  });

  assert.strictEqual(info.updateAvailable, false);
  assert.ok(info.error, 'Deve conter mensagem de erro sem lançar exceção fatal');
});
