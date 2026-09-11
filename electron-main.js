const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');

// ==========================================
// CAPTURA EXCLUSIVA DE ÁUDIO POR JANELA (WASAPI PROCESS LOOPBACK)
// ==========================================
let LoopbackCapture = null;
let GetWindowThreadProcessId = null;
let activeProcessCapture = null;

try {
  const loopbackModule = require('loopback-capture');
  LoopbackCapture = loopbackModule.LoopbackCapture;
  console.log('[Electron] Módulo WASAPI LoopbackCapture carregado com sucesso.');
} catch (err) {
  console.warn('[Electron] Aviso: Não foi possível carregar loopback-capture:', err.message);
}

try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)');
  console.log('[Electron] Módulo Koffi (GetWindowThreadProcessId) carregado com sucesso.');
} catch (err) {
  console.warn('[Electron] Aviso: Não foi possível carregar koffi para resolução de PID:', err.message);
}

function getPidFromHwnd(hwndNumber) {
  if (!GetWindowThreadProcessId || !hwndNumber) return 0;
  try {
    const koffi = require('koffi');
    const hwndPtr = koffi.as(BigInt(hwndNumber), 'void *');
    const pidOut = [0];
    GetWindowThreadProcessId(hwndPtr, pidOut);
    return pidOut[0] || 0;
  } catch (err) {
    console.warn(`[Electron] Falha ao resolver PID para HWND ${hwndNumber}:`, err.message);
    return 0;
  }
}

function stopActiveProcessAudio() {
  if (activeProcessCapture) {
    try {
      console.log('[Electron] Parando captura exclusiva de áudio de processo ativa...');
      activeProcessCapture.stop();
    } catch (err) {
      console.warn('[Electron] Erro ao interromper LoopbackCapture:', err);
    }
    activeProcessCapture = null;
  }
}


// ==========================================
// CONFIGURAÇÃO DE DIRETÓRIO GRAVÁVEL (PARA .EXE)
// ==========================================
const userDataDir = app.getPath('userData');
process.env.NCORD_DATA_DIR = userDataDir;

try {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Migrar ou sincronizar database.json existente
  const localDb = path.join(__dirname, 'database.json');
  const targetDb = path.join(userDataDir, 'database.json');
  if (fs.existsSync(localDb) && !fs.existsSync(targetDb)) {
    fs.copyFileSync(localDb, targetDb);
  } else if (fs.existsSync(targetDb)) {
    try {
      const targetContent = JSON.parse(fs.readFileSync(targetDb, 'utf-8'));
      const candidates = [
        path.join(__dirname, 'database.json'),
        path.join(process.cwd(), 'database.json')
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand) && cand !== targetDb) {
          const candContent = JSON.parse(fs.readFileSync(cand, 'utf-8'));
          if (candContent && candContent.profiles) {
            let updated = false;
            if (!targetContent.profiles) targetContent.profiles = {};
            ['user1', 'user2'].forEach((u) => {
              if (candContent.profiles[u] && candContent.profiles[u].avatar && (!targetContent.profiles[u] || !targetContent.profiles[u].avatar)) {
                targetContent.profiles[u] = { ...(targetContent.profiles[u] || {}), ...candContent.profiles[u] };
                updated = true;
              }
              if (candContent.profiles[u] && candContent.profiles[u].name && (!targetContent.profiles[u] || targetContent.profiles[u].name === 'Usuário 1' || targetContent.profiles[u].name === 'Usuário 2')) {
                targetContent.profiles[u].name = candContent.profiles[u].name;
                updated = true;
              }
            });
            if (updated) {
              fs.writeFileSync(targetDb, JSON.stringify(targetContent, null, 2), 'utf-8');
              console.log('[Electron] Dados de perfis sincronizados com sucesso para userData/database.json');
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Electron] Aviso ao sincronizar dados de perfil:', e);
    }
  }

  // Migrar certificados existentes
  const localCerts = path.join(__dirname, 'certs');
  const targetCerts = path.join(userDataDir, 'certs');
  if (fs.existsSync(localCerts) && !fs.existsSync(targetCerts)) {
    fs.mkdirSync(targetCerts, { recursive: true });
    ['cert.pem', 'key.pem'].forEach(f => {
      const src = path.join(localCerts, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(targetCerts, f));
    });
  }
} catch (e) {
  console.warn('[Electron] Aviso ao inicializar pasta userData:', e);
}

// ==========================================
// 0. FLAGS DE COMANDO DO CHROMIUM
// ==========================================
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

let mainWindow = null;
let pendingDisplayMediaCallback = null;
let cachedRawDesktopSources = [];

const SERVER_PORT = 3000;
const SETTINGS_FILE = path.join(userDataDir, 'settings.json');

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { targetIp: null, activeProfileId: 'user1' };
}

function writeSettings(data) {
  try {
    const current = readSettings();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...current, ...data }, null, 2), 'utf-8');
  } catch (e) {}
}

// ==========================================
// LIBERAÇÃO AUTOMÁTICA NO FIREWALL DO WINDOWS
// ==========================================
function checkFirewallRule(ruleName) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(true);
    exec(`netsh advfirewall firewall show rule name="${ruleName}"`, (err) => {
      resolve(!err);
    });
  });
}

async function requestFirewallPermissions(force = false) {
  if (process.platform !== 'win32') return { success: true };

  const hasPortRule = await checkFirewallRule('NCord Port 3000');
  if (hasPortRule && !force) {
    console.log('[Firewall] Regras do Firewall do Windows já configuradas.');
    return { success: true, alreadyExists: true };
  }

  console.log('[Firewall] Solicitando liberação automática no Firewall do Windows...');
  const exePath = process.execPath;

  const innerCommands = [
    'netsh advfirewall firewall delete rule name="NCord" 2>$null',
    'netsh advfirewall firewall delete rule name="NCord Port 3000" 2>$null',
    'netsh advfirewall firewall delete rule name="NCord Port 3443" 2>$null',
    'netsh advfirewall firewall delete rule name="NCord UDP" 2>$null',
    `netsh advfirewall firewall add rule name="NCord" dir=in action=allow program="${exePath}" enable=yes`,
    'netsh advfirewall firewall add rule name="NCord Port 3000" dir=in action=allow protocol=TCP localport=3000 enable=yes',
    'netsh advfirewall firewall add rule name="NCord UDP" dir=in action=allow protocol=UDP localport=1024-65535 enable=yes'
  ].join('; ');

  const encoded = Buffer.from(innerCommands, 'utf16le').toString('base64');
  const elevateScript = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -EncodedCommand ${encoded}'`;

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${elevateScript}"`, (err) => {
      if (err) {
        console.warn('[Firewall] Aviso ao solicitar elevação de firewall:', err.message);
        resolve({ success: false, error: err.message });
      } else {
        console.log('[Firewall] Solicitação de liberação do Firewall enviada com sucesso.');
        setTimeout(async () => {
          const applied = await checkFirewallRule('NCord Port 3000');
          resolve({ success: applied });
        }, 1500);
      }
    });
  });
}

// ==========================================
// 1. GERENCIAMENTO E SONDAGEM DE SERVIDORES
// ==========================================

/**
 * Testa se um servidor HTTP do NCord responde no host e porta fornecidos.
 */
function probeHttpServer(host, port = SERVER_PORT, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${host}:${port}/api/my-ip`,
      { timeout: timeoutMs },
      (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Aguarda o servidor local iniciar com tentativas consecutivas.
 */
async function waitForLocalServer(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const alive = await probeHttpServer('127.0.0.1', SERVER_PORT, 600);
    if (alive) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const server = require('./server');

async function startLocalServer() {
  try {
    const isAlive = await probeHttpServer('127.0.0.1', SERVER_PORT, 600);
    if (isAlive) {
      console.log(`[Electron] Servidor NCord já está ativo na porta ${SERVER_PORT}`);
      return true;
    }

    console.log('[Electron] Iniciando servidor Express/PeerJS embutido no processo...');
    await server.startServer();
    console.log('[Electron] Servidor local inicializado com sucesso!');
    return true;
  } catch (err) {
    console.error('[Electron] Erro ao inicializar servidor local:', err);
    return false;
  }
}

function stopLocalServer() {
  try {
    server.stopServer();
  } catch (err) {
    console.error('[Electron] Erro ao parar servidor local:', err);
  }
}

// ==========================================
// 2. CRIAÇÃO DA JANELA PRINCIPAL
// ==========================================
async function createWindow() {
  console.log('[Electron] 🚀 Iniciando servidor local do NCord na porta 3000...');
  await startLocalServer();

  const iconPath = path.join(__dirname, 'public', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 620,
    title: 'NCord',
    icon: iconPath,
    backgroundColor: '#120b18',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Permite que a UI local (file://) faça chamadas HTTP e WebSockets sem restrições
      backgroundThrottling: false
    }
  });

  // Carregar o arquivo index.html LOCALMENTE (100% nativo)
  const indexPath = path.join(__dirname, 'public', 'index.html');
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[Electron] Erro crítico ao carregar index.html:', err);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // ==========================================
  // ATALHOS NATIVOS DE TECLADO (CTRL+R, F5, F12)
  // ==========================================
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F5 ou Ctrl+R para recarregar
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
    // F12 ou Ctrl+Shift+I para abrir o DevTools
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    stopActiveProcessAudio();
    mainWindow = null;
  });
}

app.on('will-quit', () => {
  stopActiveProcessAudio();
});


// ==========================================
// 3. PERMISSÕES E SEGURANÇA
// ==========================================
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

app.whenReady().then(() => {
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(0); // Aceitar conexões locais e privadas sem bloqueios
  });

  // Conceder permissões de mídia e captura de tela
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'notifications', 'display-capture', 'mediaKeySystem', 'clipboard-read'];
    callback(allowed.includes(permission) || true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  // Manipulador de captura de tela nativo
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    stopActiveProcessAudio();
    if (pendingDisplayMediaCallback) {
      try { pendingDisplayMediaCallback(null); } catch (e) {}
    }
    pendingDisplayMediaCallback = callback;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-native-screen-picker');
    }
  });

  // Solicitar liberação automática no Firewall do Windows em segundo plano
  requestFirewallPermissions().catch((e) => console.warn('[Firewall] Erro não-bloqueante:', e));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ==========================================
// 4. CANAIS IPC
// ==========================================
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    cachedRawDesktopSources = sources;

    return sources.map((source) => {
      const isWindow = source.id.startsWith('window:');
      let pid = 0;
      if (isWindow) {
        const hwnd = parseInt(source.id.split(':')[1], 10);
        pid = getPidFromHwnd(hwnd);
      }
      return {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
        isScreen: source.id.startsWith('screen:'),
        pid
      };
    });
  } catch (err) {
    console.error('[Electron] Erro ao listar fontes de desktop:', err);
    return [];
  }
});

ipcMain.handle('select-desktop-source', async (event, { sourceId, withAudio, sourceName }) => {
  if (pendingDisplayMediaCallback) {
    const cb = pendingDisplayMediaCallback;
    pendingDisplayMediaCallback = null;

    try {
      const isWindow = typeof sourceId === 'string' && sourceId.startsWith('window:');
      const isScreen = typeof sourceId === 'string' && sourceId.startsWith('screen:');
      const targetHwnd = isWindow ? sourceId.split(':')[1] : null;

      let chosen = null;

      // 1. Tentar encontrar diretamente no cache original das fontes listadas no modal
      if (cachedRawDesktopSources && cachedRawDesktopSources.length > 0) {
        // Busca exata por ID
        chosen = cachedRawDesktopSources.find((s) => s.id === sourceId);

        // Se for janela, buscar por HWND caso o índice de display tenha variado
        if (!chosen && isWindow && targetHwnd) {
          chosen = cachedRawDesktopSources.find((s) => s.id.startsWith('window:') && s.id.split(':')[1] === targetHwnd);
        }

        // Se ainda não achou, buscar pelo título exato da janela/tela
        if (!chosen && sourceName) {
          const cleanName = sourceName.trim().toLowerCase();
          chosen = cachedRawDesktopSources.find((s) => {
            const sameType = isWindow ? s.id.startsWith('window:') : s.id.startsWith('screen:');
            return sameType && (s.name || '').trim().toLowerCase() === cleanName;
          });
        }

        // Busca aproximada por título para janelas
        if (!chosen && isWindow && sourceName) {
          const cleanName = sourceName.trim().toLowerCase();
          chosen = cachedRawDesktopSources.find((s) => {
            if (!s.id.startsWith('window:')) return false;
            const itemTitle = (s.name || '').trim().toLowerCase();
            return itemTitle && (itemTitle.includes(cleanName) || cleanName.includes(itemTitle));
          });
        }
      }

      // 2. Se não estiver no cache (ou lista foi perdida), buscar fontes frescas com as mesmas opções
      if (!chosen) {
        console.log('[Electron] Fonte não encontrada no cache, re-enumerando fontes do capturador...');
        const freshSources = await desktopCapturer.getSources({
          types: isWindow ? ['window'] : ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true
        });

        chosen = freshSources.find((s) => s.id === sourceId);

        if (!chosen && isWindow && targetHwnd) {
          chosen = freshSources.find((s) => s.id.startsWith('window:') && s.id.split(':')[1] === targetHwnd);
        }

        if (!chosen && sourceName) {
          const cleanName = sourceName.trim().toLowerCase();
          chosen = freshSources.find((s) => {
            const sameType = isWindow ? s.id.startsWith('window:') : s.id.startsWith('screen:');
            return sameType && (s.name || '').trim().toLowerCase() === cleanName;
          });
        }

        if (!chosen && isWindow && sourceName) {
          const cleanName = sourceName.trim().toLowerCase();
          chosen = freshSources.find((s) => {
            if (!s.id.startsWith('window:')) return false;
            const itemTitle = (s.name || '').trim().toLowerCase();
            return itemTitle && (itemTitle.includes(cleanName) || cleanName.includes(itemTitle));
          });
        }
      }

      // 3. REGRA CRÍTICA DE SEGURANÇA:
      // Se o usuário selecionou uma JANELA e ela não foi encontrada, JAMAIS transmitir a tela inteira (sources[0])!
      if (!chosen && isWindow) {
        console.warn(`[Electron] Janela "${sourceName}" (${sourceId}) não foi encontrada. Cancelando captura para evitar transmitir a tela inteira por engano.`);
        cb(null);
        return { success: false, reason: 'Janela não encontrada' };
      }

      // Se o usuário selecionou tela e ela não foi encontrada especificamente, usar a primeira tela disponível
      if (!chosen && isScreen) {
        chosen = (cachedRawDesktopSources && cachedRawDesktopSources.find((s) => s.id.startsWith('screen:'))) || null;
      }

      if (chosen) {
        stopActiveProcessAudio();

        const isWindowChoice = chosen.id.startsWith('window:');
        const streamOptions = { video: chosen };
        let hasProcessAudio = false;

        if (withAudio) {
          if (isWindowChoice && LoopbackCapture) {
            const rawHwnd = chosen.id.split(':')[1];
            const hwndNum = parseInt(rawHwnd, 10);
            const targetPid = getPidFromHwnd(hwndNum);

            if (targetPid > 0) {
              console.log(`[Electron] Iniciando captura exclusiva de áudio WASAPI para PID ${targetPid} (HWND ${hwndNum}, "${chosen.name}")...`);
              try {
                activeProcessCapture = new LoopbackCapture();
                activeProcessCapture.start(targetPid, true, (chunk) => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('process-audio-chunk', chunk);
                  }
                });
                hasProcessAudio = true;
                console.log(`[Electron] Captura de áudio de processo ativa com sucesso para o PID ${targetPid}!`);
              } catch (captureErr) {
                console.error('[Electron] Falha ao iniciar LoopbackCapture no PID alvo, usando fallback geral:', captureErr);
                activeProcessCapture = null;
                streamOptions.audio = 'loopback';
              }
            } else {
              console.warn(`[Electron] PID não identificado para a janela ${chosen.id} (HWND: ${hwndNum}). Usando fallback loopback.`);
              streamOptions.audio = 'loopback';
            }
          } else {
            // Telas inteiras capturam áudio do sistema todo
            streamOptions.audio = 'loopback';
          }
        }

        console.log(`[Electron] Fonte confirmada para transmissão: [${chosen.id}] "${chosen.name}" (tipo: ${isWindowChoice ? 'JANELA' : 'TELA'}, áudio: ${hasProcessAudio ? 'EXCLUSIVO-PROCESSO (WASAPI)' : (streamOptions.audio ? 'LOOPBACK-SISTEMA' : 'DESATIVADO')})`);
        cb(streamOptions);
        return {
          success: true,
          isWindow: isWindowChoice,
          hasProcessAudio
        };
      } else {
        console.warn('[Electron] Nenhuma fonte correspondente encontrada. Cancelando.');
        cb(null);
        return { success: false, reason: 'Fonte não encontrada' };
      }
    } catch (e) {
      console.error('[Electron] Erro ao selecionar tela/janela:', e);
      try { cb(null); } catch (err) {}
      return { success: false, error: e.message };
    }
  }
  return { success: false, reason: 'Nenhuma captura pendente' };
});

ipcMain.handle('cancel-desktop-source', () => {
  stopActiveProcessAudio();
  if (pendingDisplayMediaCallback) {
    const cb = pendingDisplayMediaCallback;
    pendingDisplayMediaCallback = null;
    try { cb(null); } catch (e) {}
  }
  return { success: true };
});

ipcMain.handle('stop-process-audio', () => {
  stopActiveProcessAudio();
  return { success: true };
});

// Alternar para servidor remoto (IP do parceiro)
ipcMain.handle('connect-to-server', async (event, targetIp) => {
  const cleanIp = (targetIp || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

  if (!cleanIp) {
    return { success: false, error: 'Digite um endereço IP válido.' };
  }

  console.log(`[Electron] Testando conectividade com o servidor em http://${cleanIp}:${SERVER_PORT}...`);
  const isAlive = await probeHttpServer(cleanIp, SERVER_PORT, 6000);

  if (!isAlive) {
    console.warn(`[Electron] Não foi possível alcançar ${cleanIp}:${SERVER_PORT}.`);
    return {
      success: false,
      error: `Não foi possível alcançar o servidor em ${cleanIp}.\nVerifique se o parceiro está com o NCord aberto e se o ZeroTier está conectado!`
    };
  }

  // Grava o IP no arquivo de configurações para fácil preenchimento
  writeSettings({ targetIp: cleanIp });

  // Mantém o servidor local sempre ligado para que qualquer um possa conectar
  console.log(`[Electron] IP do parceiro validado com sucesso (${cleanIp}).`);
  return { success: true, targetIp: cleanIp };
});

// Alternar para hospedar no próprio computador
ipcMain.handle('host-local-server', async () => {
  writeSettings({ targetIp: null });
  console.log('[Electron] Modo Anfitrião restaurado. Verificando servidor local...');
  const ok = await startLocalServer();
  return { success: ok };
});

// Status em tempo real do servidor local
ipcMain.handle('get-server-status', async () => {
  const isAlive = await probeHttpServer('127.0.0.1', SERVER_PORT, 1200);
  return { running: isAlive, port: SERVER_PORT };
});

ipcMain.handle('get-saved-settings', () => {
  return readSettings();
});

ipcMain.handle('save-user-profile', (event, profileId) => {
  writeSettings({ activeProfileId: profileId });
  return { success: true };
});

ipcMain.handle('request-firewall', async () => {
  return await requestFirewallPermissions(true);
});

ipcMain.handle('check-firewall', async () => {
  return await checkFirewallRule('NCord Port 3000');
});

// Controles de janela
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-reload', () => {
  if (mainWindow) mainWindow.webContents.reload();
});

ipcMain.on('window-devtools', () => {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
});

// ==========================================
// 5. ENCERRAMENTO LIMPO
// ==========================================
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopLocalServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopLocalServer();
});
