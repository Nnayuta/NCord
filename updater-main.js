const { app, ipcMain, shell } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const GITHUB_REPO = 'Nnayuta/NCord';
let activeDownloadRequest = null;
let downloadedFilePath = null;
let latestReleaseInfo = null;

/**
 * Compara duas versões no formato semver (ex: "1.0.1" vs "1.0.0")
 * Retorna: 1 se v1 > v2, -1 se v1 < v2, 0 se iguais
 */
function compareSemver(v1, v2) {
  if (!v1 || !v2) return 0;
  const clean1 = String(v1).replace(/^v/i, '').trim();
  const clean2 = String(v2).replace(/^v/i, '').trim();

  const parts1 = clean1.split('.').map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Realiza requisição HTTPS seguindo redirecionamentos (301/302)
 */
function fetchWithRedirect(url, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Muitos redirecionamentos'));
    }

    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.origin}${redirectUrl}`;
        }
        return resolve(fetchWithRedirect(redirectUrl, options, maxRedirects - 1));
      }
      resolve(res);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de conexão ao verificar atualização'));
    });
  });
}

/**
 * Verifica se há uma nova versão disponível no GitHub Releases
 */
async function checkForUpdates() {
  const currentVersion = app.getVersion();
  console.log(`[AutoUpdater] Verificando atualizações no GitHub (${GITHUB_REPO}). Versão atual: v${currentVersion}`);

  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    const res = await fetchWithRedirect(apiUrl, {
      headers: {
        'User-Agent': 'LoveChat-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 10000
    });

    if (res.statusCode === 404) {
      console.log('[AutoUpdater] Nenhuma release encontrada no GitHub ainda.');
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        message: 'Nenhuma release publicada ainda no GitHub.'
      };
    }

    if (res.statusCode !== 200) {
      throw new Error(`GitHub API retornou status ${res.statusCode}`);
    }

    let data = '';
    for await (const chunk of res) {
      data += chunk;
    }

    const release = JSON.parse(data);
    const rawTag = release.tag_name || '';
    const latestVersion = rawTag.replace(/^v/i, '').trim();
    const isNewer = compareSemver(latestVersion, currentVersion) > 0;

    // Localizar executável .exe nos assets
    let exeAsset = null;
    if (release.assets && Array.isArray(release.assets)) {
      exeAsset = release.assets.find((a) => a.name && a.name.toLowerCase().endsWith('.exe'));
      if (!exeAsset && release.assets.length > 0) {
        exeAsset = release.assets[0];
      }
    }

    latestReleaseInfo = {
      updateAvailable: isNewer,
      currentVersion,
      latestVersion,
      tagName: rawTag,
      releaseName: release.name || rawTag,
      releaseNotes: release.body || 'Melhorias de desempenho, qualidade e correções de estabilidade.',
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      downloadUrl: exeAsset ? exeAsset.browser_download_url : release.html_url,
      assetName: exeAsset ? exeAsset.name : 'LoveChat.exe',
      assetSize: exeAsset ? exeAsset.size : 0,
      hasDirectAsset: !!exeAsset
    };

    console.log(`[AutoUpdater] Checagem concluída. Mais recente: v${latestVersion}, Disponível para update: ${isNewer}`);
    return latestReleaseInfo;
  } catch (err) {
    console.warn('[AutoUpdater] Falha ao verificar atualizações no GitHub:', err.message);
    return {
      updateAvailable: false,
      currentVersion,
      error: err.message
    };
  }
}

/**
 * Faz download do executável da atualização com relatório de progresso
 */
function downloadUpdate(downloadUrl, windowRef) {
  return new Promise(async (resolve, reject) => {
    if (!downloadUrl) {
      return reject(new Error('URL de download inválida'));
    }

    try {
      const tempDir = app.getPath('temp');
      const fileName = `LoveChat-Update-v${latestReleaseInfo?.latestVersion || 'latest'}.exe`;
      const targetPath = path.join(tempDir, fileName);

      console.log(`[AutoUpdater] Iniciando download de ${downloadUrl} para ${targetPath}`);

      const res = await fetchWithRedirect(downloadUrl, {
        headers: {
          'User-Agent': 'LoveChat-AutoUpdater',
          'Accept': 'application/octet-stream'
        }
      });

      if (res.statusCode !== 200) {
        throw new Error(`Falha no download. Status HTTP ${res.statusCode}`);
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || (latestReleaseInfo?.assetSize || 0);
      let downloadedBytes = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let currentSpeed = 0;

      const fileStream = fs.createWriteStream(targetPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;

        if (timeDiff >= 0.25) {
          const bytesDiff = downloadedBytes - lastBytes;
          currentSpeed = bytesDiff / timeDiff; // bytes/sec
          lastTime = now;
          lastBytes = downloadedBytes;

          const percent = totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0;

          if (windowRef && !windowRef.isDestroyed()) {
            windowRef.webContents.send('updater:download-progress', {
              percent: Math.round(percent * 10) / 10,
              downloadedBytes,
              totalBytes,
              speed: currentSpeed,
              speedFormatted: formatBytes(currentSpeed) + '/s',
              downloadedFormatted: formatBytes(downloadedBytes),
              totalFormatted: formatBytes(totalBytes)
            });
          }
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        downloadedFilePath = targetPath;
        console.log(`[AutoUpdater] Download concluído com sucesso: ${targetPath}`);

        if (windowRef && !windowRef.isDestroyed()) {
          windowRef.webContents.send('updater:download-complete', {
            filePath: targetPath,
            version: latestReleaseInfo?.latestVersion
          });
        }
        resolve({ success: true, filePath: targetPath });
      });

      fileStream.on('error', (err) => {
        fs.unlink(targetPath, () => {});
        reject(err);
      });
    } catch (err) {
      console.error('[AutoUpdater] Erro durante o download da atualização:', err);
      reject(err);
    }
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Aplica a atualização substituindo o executável antigo e reiniciando a aplicação
 */
function installUpdateAndRestart() {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    console.warn('[AutoUpdater] Arquivo de atualização não encontrado para instalação.');
    return { success: false, error: 'Arquivo de atualização não encontrado.' };
  }

  const currentExe = process.execPath;
  const currentPid = process.pid;
  const isPackaged = app.isPackaged;

  console.log(`[AutoUpdater] Preparando instalação. Executável atual: ${currentExe} (PID: ${currentPid}, Packaged: ${isPackaged})`);

  if (!isPackaged) {
    console.log('[AutoUpdater] Ambiente de desenvolvimento detectado. Abrindo o executável baixado ou pasta de download...');
    shell.showItemInFolder(downloadedFilePath);
    return { success: true, isDev: true };
  }

  // No Windows executável portátil/instalado:
  const tempDir = app.getPath('temp');
  const batPath = path.join(tempDir, 'lovechat_updater.bat');

  const batContent = `@echo off
chcp 65001 >nul
echo Aguardando o encerramento do LoveChat (PID: ${currentPid})...
timeout /t 1 /nobreak >nul

:wait_loop
tasklist /fi "PID eq ${currentPid}" | findstr "${currentPid}" >nul
if %ERRORLEVEL% == 0 (
  timeout /t 1 /nobreak >nul
  goto wait_loop
)

echo Substituindo executavel antigo pelo novo...
copy /y "${downloadedFilePath}" "${currentExe}" >nul

echo Reiniciando LoveChat atualizado...
start "" "${currentExe}"

del "${downloadedFilePath}" >nul 2>&1
(goto) 2>nul & del "%~f0"
`;

  try {
    fs.writeFileSync(batPath, batContent, 'utf-8');

    // Executa o script BAT em processo completamente desanexado
    const child = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();

    console.log('[AutoUpdater] Script de atualização acionado com sucesso. Encerrando app para substituição...');
    setTimeout(() => {
      app.exit(0);
    }, 300);

    return { success: true };
  } catch (err) {
    console.error('[AutoUpdater] Erro ao disparar script de instalação:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registra os canais IPC do Auto-Updater
 */
function setupAutoUpdaterIPC(mainWindow) {
  ipcMain.handle('updater:check', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('updater:download', async (event, downloadUrl) => {
    try {
      const url = downloadUrl || latestReleaseInfo?.downloadUrl;
      return await downloadUpdate(url, mainWindow);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', async () => {
    return installUpdateAndRestart();
  });

  ipcMain.handle('updater:get-version', () => {
    return { version: app.getVersion() };
  });

  ipcMain.handle('updater:open-releases-page', () => {
    const url = latestReleaseInfo?.htmlUrl || `https://github.com/${GITHUB_REPO}/releases`;
    shell.openExternal(url);
    return { success: true };
  });
}

module.exports = {
  setupAutoUpdaterIPC,
  checkForUpdates,
  downloadUpdate,
  installUpdateAndRestart,
  compareSemver
};
