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

    if (res.statusCode === 403) {
      console.warn('[AutoUpdater] Limite de requisições temporário da API do GitHub atingido.');
      return {
        updateAvailable: false,
        currentVersion,
        error: 'Limite de requisições do GitHub atingido temporariamente. Tente novamente em alguns minutos.'
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
        fileStream.close((err) => {
          if (err) {
            console.warn('[AutoUpdater] Aviso ao fechar stream de arquivo:', err);
          }
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

  // No electron-builder com target "portable", o executável real do usuário (na Área de Trabalho ou Downloads)
  // fica em process.env.PORTABLE_EXECUTABLE_FILE. Se não existir, usa process.execPath.
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

  // Windows: Utiliza PowerShell com Splash Screen nativa (WPF) em segundo plano e retry seguro
  const tempDir = app.getPath('temp');
  const ps1Path = path.join(tempDir, 'lovechat_updater.ps1');
  const newVerText = latestReleaseInfo?.latestVersion ? `(v${latestReleaseInfo.latestVersion})` : '';

  const ps1Content = `param(
  [Parameter(Mandatory=$true)][string]$TargetExe,
  [Parameter(Mandatory=$true)][string]$NewExe,
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [Parameter(Mandatory=$false)][string]$NewVersion = ""
)

$ErrorActionPreference = 'Continue'
$logFile = Join-Path $env:TEMP "lovechat_updater.log"

function Write-Log($msg) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$timestamp] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Write-Log "=================================================="
Write-Log "LoveChat Auto-Updater iniciado."
Write-Log "Alvo (TargetExe): $TargetExe"
Write-Log "Novo Executavel (NewExe): $NewExe"
Write-Log "PID a encerrar: $TargetPid"
Write-Log "Versao: $NewVersion"

# Exibicao da Splash Screen WPF Nativa
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase -ErrorAction SilentlyContinue

$subTitleText = if ($NewVersion -ne "") { "Aplicando atualizacao $NewVersion e reiniciando..." } else { "Substituindo executavel e reiniciando..." }

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="LoveChat Update" Height="175" Width="390"
        WindowStartupLocation="CenterScreen" WindowStyle="None"
        AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="False">
    <Border CornerRadius="16" Background="#140c1a" BorderBrush="#ec4899" BorderThickness="1.5" Padding="22">
        <Border.Effect>
            <DropShadowEffect Color="#ec4899" BlurRadius="26" ShadowDepth="0" Opacity="0.45"/>
        </Border.Effect>
        <Grid>
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>
            
            <StackPanel Grid.Row="0" Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,0,0,8">
                <TextBlock Text="🚀" FontSize="20" Margin="0,0,10,0" VerticalAlignment="Center"/>
                <TextBlock Text="Atualizando o LoveChat" FontSize="17" FontWeight="Bold" Foreground="#fdf2f8" VerticalAlignment="Center"/>
            </StackPanel>
            
            <TextBlock Grid.Row="1" Text="$subTitleText" FontSize="12.5" Foreground="#cbd5e1" HorizontalAlignment="Center" Margin="0,0,0,14"/>
            
            <ProgressBar Grid.Row="2" Height="6" IsIndeterminate="True" Foreground="#ec4899" Background="#281636" BorderThickness="0" Margin="0,0,0,8"/>
            
            <TextBlock Grid.Row="3" Text="Por favor, aguarde alguns instantes ✨" FontSize="11" Foreground="#94a3b8" HorizontalAlignment="Center"/>
        </Grid>
    </Border>
</Window>
"@

$window = $null
try {
  $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
  $window = [System.Windows.Markup.XamlReader]::Load($reader)
  $window.Show()
} catch {
  Write-Log "Aviso ao carregar interface Splash: $($_.Exception.Message)"
}

function Refresh-Splash {
  if ($window) {
    try {
      $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
    } catch {}
  }
}

# 1. Aguardar o encerramento do processo pai do LoveChat
if ($TargetPid -gt 0) {
  Write-Log "Aguardando encerramento do processo PID $TargetPid..."
  for ($i = 0; $i -lt 40; $i++) {
    Refresh-Splash
    $proc = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
    if (-not $proc) {
      Write-Log "Processo PID $TargetPid encerrado com sucesso."
      break
    }
    Start-Sleep -Milliseconds 200
  }
}

Refresh-Splash
Start-Sleep -Milliseconds 500
Refresh-Splash

# 2. Substituir o executavel antigo pelo novo com loop de tentativas (retry)
$replaced = $false
for ($i = 1; $i -le 30; $i++) {
  Refresh-Splash
  try {
    Write-Log "Tentativa $i de 30 para substituir '$TargetExe' com '$NewExe'..."
    Copy-Item -Path $NewExe -Destination $TargetExe -Force -ErrorAction Stop
    $replaced = $true
    Write-Log "Executavel unico substituido com sucesso!"
    break
  } catch {
    Write-Log "Aviso na tentativa $i : $($_.Exception.Message)"
    Start-Sleep -Milliseconds 400
  }
}

# 3. Reiniciar o aplicativo atualizado
if ($replaced) {
  try {
    Write-Log "Iniciando nova versao atualizada: $TargetExe"
    $targetDir = Split-Path -Parent $TargetExe
    Start-Process -FilePath $TargetExe -WorkingDirectory $targetDir
    Write-Log "Aplicativo reiniciado com sucesso."
  } catch {
    Write-Log "Erro ao reiniciar executavel: $($_.Exception.Message)"
  }

  # Pausa visual suave antes de fechar a Splash
  Refresh-Splash
  Start-Sleep -Milliseconds 800
  if ($window) {
    try { $window.Close() } catch {}
  }

  # Limpar arquivo temporario baixado
  try {
    if (Test-Path $NewExe) {
      Remove-Item -Path $NewExe -Force -ErrorAction SilentlyContinue
    }
  } catch {}
} else {
  if ($window) {
    try { $window.Close() } catch {}
  }
  Write-Log "ERRO CRITICO: Nao foi possivel substituir o executavel apos 30 tentativas."
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    $msg = "Nao foi possivel atualizar o LoveChat automaticamente devido a bloqueio de arquivo no Windows.\`n\`nO novo executavel foi salvo em sua pasta temporaria."
    [System.Windows.MessageBox]::Show($msg, "LoveChat - Atualizacao", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning) | Out-Null
    Start-Process explorer.exe -ArgumentList ("/select," + '"' + $NewExe + '"')
  } catch {}
}

# 4. Auto-remocao do script de atualizacao
try {
  $currentScript = $MyInvocation.MyCommand.Path
  if ($currentScript -and (Test-Path $currentScript)) {
    Remove-Item -Path $currentScript -Force -ErrorAction SilentlyContinue
  }
} catch {}
`;

  try {
    fs.writeFileSync(ps1Path, ps1Content, 'utf-8');

    // Executa PowerShell em modo STA com janela de console oculta
    const child = spawn('powershell.exe', [
      '-STA',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', ps1Path,
      '-TargetExe', targetExe,
      '-NewExe', downloadedFilePath,
      '-TargetPid', currentPid.toString(),
      '-NewVersion', newVerText
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();

    console.log('[AutoUpdater] Script de atualização PowerShell disparado com sucesso com Splash Screen. Encerrando app...');
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
