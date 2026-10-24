const { app, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const GITHUB_REPO = 'Nnayuta/NCord';
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
 * Formata bytes em string amigável (ex: "45.2 MB")
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Verifica atualizações no GitHub Releases com sistema híbrido à prova de falhas:
 * 1. HEAD request na URL web de releases (sem limite de requisições / 403 da API)
 * 2. API oficial do GitHub para changelog detalhado e assets diretos (se disponível)
 */
async function checkForUpdates() {
  const currentVersion = app.getVersion();
  console.log(`[AutoUpdater] Verificando atualizações no GitHub (${GITHUB_REPO}). Versão atual: v${currentVersion}`);

  let latestVersion = null;
  let rawTag = null;
  let htmlUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
  let downloadUrl = null;
  let releaseNotes = 'Melhorias de desempenho, qualidade e correções de estabilidade.';
  let releaseName = null;
  let assetSize = 0;
  let assetName = 'LoveChat.exe';

  // 1. Método ultra-rápido sem limite de taxa (HEAD request na URL pública)
  try {
    const headRes = await fetch(`https://github.com/${GITHUB_REPO}/releases/latest`, {
      method: 'HEAD',
      redirect: 'manual'
    });
    const loc = headRes.headers.get('location') || '';
    const match = loc.match(/\/tag\/v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      latestVersion = match[1];
      rawTag = loc.split('/tag/')[1] || `v${latestVersion}`;
      htmlUrl = loc;
      downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${rawTag}/LoveChat.exe`;
    }
  } catch (headErr) {
    console.warn('[AutoUpdater] Aviso ao consultar redirecionamento web:', headErr.message);
  }

  // 2. Consulta API oficial do GitHub para metadados ricos (changelog, tamanho)
  try {
    const apiRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'User-Agent': 'LoveChat-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (apiRes.ok) {
      const release = await apiRes.json();
      if (release.tag_name) {
        rawTag = release.tag_name;
        latestVersion = rawTag.replace(/^v/i, '').trim();
      }
      if (release.html_url) htmlUrl = release.html_url;
      if (release.name) releaseName = release.name;
      if (release.body) releaseNotes = release.body;

      if (release.assets && Array.isArray(release.assets)) {
        const exeAsset = release.assets.find((a) => a.name && a.name.toLowerCase().endsWith('.exe')) || release.assets[0];
        if (exeAsset) {
          downloadUrl = exeAsset.browser_download_url;
          assetName = exeAsset.name;
          assetSize = exeAsset.size;
        }
      }
    } else if (apiRes.status === 403) {
      console.warn('[AutoUpdater] API do GitHub limitada por taxa, utilizando fallback direto.');
    }
  } catch (apiErr) {
    console.debug('[AutoUpdater] API GitHub não consultada:', apiErr.message);
  }

  // Se não foi possível resolver versão de nenhuma forma
  if (!latestVersion) {
    console.warn('[AutoUpdater] Não foi possível obter versão remota do GitHub.');
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      error: 'Não foi possível verificar atualizações no momento.'
    };
  }

  const isNewer = compareSemver(latestVersion, currentVersion) > 0;

  if (!downloadUrl && rawTag) {
    downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${rawTag}/LoveChat.exe`;
  }

  latestReleaseInfo = {
    updateAvailable: isNewer,
    currentVersion,
    latestVersion,
    tagName: rawTag || `v${latestVersion}`,
    releaseName: releaseName || `LoveChat v${latestVersion}`,
    releaseNotes,
    htmlUrl,
    downloadUrl,
    assetName,
    assetSize,
    isMandatory: isNewer // Atualizações são obrigatórias
  };

  console.log(`[AutoUpdater] Checagem: Atual=v${currentVersion}, Remota=v${latestVersion}, Disponível=${isNewer}`);
  return latestReleaseInfo;
}

/**
 * Faz download do executável da atualização com streaming moderno e relatório de progresso
 */
async function downloadUpdate(downloadUrl, windowRef) {
  const url = downloadUrl || latestReleaseInfo?.downloadUrl;
  if (!url) {
    throw new Error('URL de download inválida');
  }

  const tempDir = app.getPath('temp');
  const fileName = `LoveChat-Update-v${latestReleaseInfo?.latestVersion || 'latest'}.exe`;
  const targetPath = path.join(tempDir, fileName);

  console.log(`[AutoUpdater] Iniciando download de ${url} para ${targetPath}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha no download da atualização (HTTP ${res.status})`);
  }

  const totalBytes = parseInt(res.headers.get('content-length') || '0', 10) || (latestReleaseInfo?.assetSize || 0);
  let downloadedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;
  let currentSpeed = 0;

  const fileStream = fs.createWriteStream(targetPath);
  const reader = res.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    downloadedBytes += value.length;
    fileStream.write(value);

    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 0.25) {
      const bytesDiff = downloadedBytes - lastBytes;
      currentSpeed = bytesDiff / timeDiff;
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
  }

  await new Promise((resolve, reject) => {
    fileStream.end((err) => (err ? reject(err) : resolve()));
  });

  downloadedFilePath = targetPath;
  console.log(`[AutoUpdater] Download concluído com sucesso: ${targetPath}`);

  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send('updater:download-complete', {
      filePath: targetPath,
      version: latestReleaseInfo?.latestVersion
    });
  }

  return { success: true, filePath: targetPath };
}

/**
 * Instala a atualização substituindo o executável antigo por meio de script .bat nativo
 * Imune a restrições de ExecutionPolicy do PowerShell e livre de bloqueios de arquivo.
 */
function installUpdateAndRestart() {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    console.warn('[AutoUpdater] Arquivo de atualização não encontrado para instalação.');
    return { success: false, error: 'Arquivo de atualização não encontrado.' };
  }

  const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const currentPid = process.pid;
  const isPackaged = app.isPackaged;

  console.log(`[AutoUpdater] Preparando instalação.`);
  console.log(`[AutoUpdater] Executável Alvo: ${targetExe}`);
  console.log(`[AutoUpdater] Executável Baixado: ${downloadedFilePath}`);
  console.log(`[AutoUpdater] PID: ${currentPid} | Packaged: ${isPackaged}`);

  if (!isPackaged) {
    console.log('[AutoUpdater] Ambiente de desenvolvimento detectado. Abrindo o executável baixado...');
    shell.showItemInFolder(downloadedFilePath);
    return { success: true, isDev: true };
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(downloadedFilePath, '755');
      shell.showItemInFolder(downloadedFilePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  const tempDir = app.getPath('temp');
  const batPath = path.join(tempDir, 'lovechat_updater.bat');
  const targetDir = path.dirname(targetExe);
  const targetName = path.basename(targetExe);

  // Script .bat nativo para substituição com renomeação de contingência
  const batContent = `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "TARGET_EXE=${targetExe}"
set "NEW_EXE=${downloadedFilePath}"
set "TARGET_DIR=${targetDir}"
set "OLD_BACKUP=${targetExe}.old"
set "TARGET_PID=${currentPid}"

:: 1. Aguarda o encerramento do processo e fecha possíveis instâncias
timeout /t 1 /nobreak >nul
taskkill /F /PID %TARGET_PID% >nul 2>&1
taskkill /F /IM LoveChat.exe >nul 2>&1
taskkill /F /IM lovechat.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if exist "%OLD_BACKUP%" del /f /q "%OLD_BACKUP%" >nul 2>&1

:: 2. Loop de substituição com renomeação prévia para contornar locks do Windows
set "SUCCESS=0"
for /L %%i in (1,1,25) do (
  if "!SUCCESS!"=="0" (
    ren "%TARGET_EXE%" "${targetName}.old" >nul 2>&1
    if not errorlevel 1 (
      copy /y "%NEW_EXE%" "%TARGET_EXE%" >nul 2>&1
      if not errorlevel 1 (
        set "SUCCESS=1"
      )
    ) else (
      copy /y "%NEW_EXE%" "%TARGET_EXE%" >nul 2>&1
      if not errorlevel 1 (
        set "SUCCESS=1"
      )
    )
    if "!SUCCESS!"=="0" (
      timeout /t 1 /nobreak >nul
    )
  )
)

:: 3. Inicia o aplicativo atualizado
cd /d "%TARGET_DIR%"
start "" "%TARGET_EXE%"

:: 4. Limpeza de resíduos
timeout /t 3 /nobreak >nul
if exist "%OLD_BACKUP%" del /f /q "%OLD_BACKUP%" >nul 2>&1
if exist "%NEW_EXE%" del /f /q "%NEW_EXE%" >nul 2>&1
(goto) 2>nul & del "%~f0"
`;

  try {
    fs.writeFileSync(batPath, batContent, 'utf-8');

    const child = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();

    console.log('[AutoUpdater] Script de atualização disparado. Encerrando LoveChat...');
    setTimeout(() => {
      app.exit(0);
    }, 400);

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
      return await downloadUpdate(downloadUrl, mainWindow);
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
