const { app, BrowserWindow, session, desktopCapturer, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');
const { setupAutoUpdaterIPC, checkForUpdates } = require('./updater-main');

// Otimizações de rede WebRTC: desativar anonimização mDNS para evitar erros de resolução .local e conectar diretamente em LAN
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

// ==========================================
// CAPTURA EXCLUSIVA DE ÁUDIO POR JANELA (WASAPI PROCESS LOOPBACK)
// ==========================================
let LoopbackCapture = null;
let GetWindowThreadProcessId = null;
let FindWindowEx = null;
let FindWindowW = null;
let OpenProcess = null;
let QueryFullProcessImageNameW = null;
let CloseHandle = null;
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
  GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32 *lpdwProcessId)');
  FindWindowEx = user32.func('intptr_t __stdcall FindWindowExA(intptr_t hWndParent, intptr_t hWndChildAfter, const char *lpszClass, const char *lpszWindow)');
  FindWindowW = user32.func('intptr_t __stdcall FindWindowW(const char16_t *lpClassName, const char16_t *lpWindowName)');

  const kernel32 = koffi.load('kernel32.dll');
  OpenProcess = kernel32.func('intptr_t __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)');
  QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t hProcess, uint32 dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32 *lpdwSize)');
  CloseHandle = kernel32.func('bool __stdcall CloseHandle(intptr_t hObject)');
  console.log('[Electron] Módulo Koffi (Win32 User32/Kernel32 APIs) carregado com sucesso.');
} catch (err) {
  console.warn('[Electron] Aviso: Não foi possível carregar koffi para APIs Win32:', err.message);
}

function getProcessNameByPid(pid) {
  if (!pid || pid <= 0) return '';
  if (OpenProcess && QueryFullProcessImageNameW && CloseHandle) {
    try {
      const hProc = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
      if (hProc && hProc !== 0) {
        const buf = new Uint16Array(1024);
        const size = [1024];
        const ok = QueryFullProcessImageNameW(hProc, 0, buf, size);
        CloseHandle(hProc);
        if (ok && size[0] > 0) {
          const fullPath = Buffer.from(buf.buffer, 0, size[0] * 2).toString('utf16le');
          return path.basename(fullPath).toLowerCase();
        }
      }
    } catch (e) {}
  }
  return '';
}

function getPidFromHwnd(hwndNumber, windowTitle = null) {
  if (hwndNumber === undefined || hwndNumber === null || hwndNumber === '') return 0;
  try {
    let num = typeof hwndNumber === 'string' ? parseInt(hwndNumber, 10) : Number(hwndNumber);
    if (isNaN(num) || num === 0) num = 0;

    if (GetWindowThreadProcessId && num !== 0) {
      // 1. Tentar com o HWND direto (signed intptr_t)
      const pidOut = [0];
      GetWindowThreadProcessId(num, pidOut);
      let pid = pidOut[0];

      // 2. Se o número for negativo (bit 31/63 setado em string vinda do WebRTC/Chromium), tentar unsigned 32-bit
      if ((!pid || pid <= 0) && num < 0) {
        const uNum = (num >>> 0);
        const uPidOut = [0];
        GetWindowThreadProcessId(uNum, uPidOut);
        if (uPidOut[0] > 0) {
          pid = uPidOut[0];
          num = uNum;
        }
      }

      // 3. Se for ApplicationFrameHost (UWP wrapper de apps como Spotify da Store, Netflix, WhatsApp),
      // buscar a janela filha real (Windows.UI.Core.CoreWindow) para obter o PID do processo do aplicativo real
      if (pid > 0 && FindWindowEx) {
        try {
          const coreHwnd = FindWindowEx(num, 0, 'Windows.UI.Core.CoreWindow', null);
          if (coreHwnd && coreHwnd !== 0) {
            const childPidOut = [0];
            GetWindowThreadProcessId(coreHwnd, childPidOut);
            if (childPidOut[0] > 0) {
              pid = childPidOut[0];
            }
          }
        } catch (e) {}
      }

      if (pid > 0) return pid;
    }

    // 4. Fallback: Se o HWND do desktopCapturer não resolveu, tentar encontrar a janela pelo título
    if (windowTitle && typeof windowTitle === 'string' && windowTitle.trim() && FindWindowW && GetWindowThreadProcessId) {
      try {
        const topHwnd = FindWindowW(null, windowTitle.trim());
        if (topHwnd && topHwnd !== 0) {
          const pidOut = [0];
          GetWindowThreadProcessId(topHwnd, pidOut);
          let pid = pidOut[0];

          if (pid > 0 && FindWindowEx) {
            try {
              const coreHwnd = FindWindowEx(topHwnd, 0, 'Windows.UI.Core.CoreWindow', null);
              if (coreHwnd && coreHwnd !== 0) {
                const childPidOut = [0];
                GetWindowThreadProcessId(coreHwnd, childPidOut);
                if (childPidOut[0] > 0) pid = childPidOut[0];
              }
            } catch (e) {}
          }

          if (pid > 0) return pid;
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn(`[Electron] Falha ao resolver PID para HWND ${hwndNumber}:`, err.message);
  }
  return 0;
}

// ==========================================
// CAPTURA DE ÁUDIO "POR EXCLUSÃO" (tela inteira, escolhendo quais apps NÃO enviam áudio)
// O WASAPI só aceita excluir UMA árvore de processos por captura, então fazemos o inverso:
// capturamos individualmente cada app com janela aberta, exceto os excluídos (e o próprio LoveChat),
// e o renderer soma as fontes (cada PID tem seu próprio buffer no AudioWorklet).
// ==========================================
let exclusionTimer = null;
let exclusionToken = 0;
let exclusionBusy = false;
let exclusionLastWinKey = '';
let exclusionProcessTable = new Map();
const exclusionCaptures = new Map(); // pid -> LoopbackCapture

// Processos de shell/host que possuem janelas mas cuja árvore englobaria apps de terceiros
const EXCLUSION_SKIP_NAMES = new Set([
  'explorer.exe',
  'applicationframehost.exe',
  'searchhost.exe',
  'shellexperiencehost.exe',
  'textinputhost.exe',
  'startmenuexperiencehost.exe',
  'dwm.exe'
]);

function getProcessTable() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(new Map());
    exec(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"',
      { maxBuffer: 1024 * 1024 * 16, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(new Map());
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const table = new Map();
          for (const p of list) {
            if (p && p.ProcessId) {
              table.set(p.ProcessId, { ppid: p.ParentProcessId, name: String(p.Name || '') });
            }
          }
          resolve(table);
        } catch (e) {
          resolve(new Map());
        }
      }
    );
  });
}

async function listWindowPids() {
  const pids = new Set();
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 }
    });
    for (const s of sources) {
      if (!s.id.startsWith('window:')) continue;
      const pid = getPidFromHwnd(parseInt(s.id.split(':')[1], 10));
      if (pid > 0) pids.add(pid);
    }
  } catch (e) {
    console.warn('[Electron] Falha ao listar janelas para exclusão de áudio:', e.message);
  }
  return pids;
}

function stopExclusionCaptures() {
  exclusionToken++;
  if (exclusionTimer) {
    clearInterval(exclusionTimer);
    exclusionTimer = null;
  }
  for (const [, capturer] of exclusionCaptures.entries()) {
    try { capturer.stop(); } catch (e) {}
  }
  exclusionCaptures.clear();
  exclusionLastWinKey = '';
  exclusionBusy = false;
}

async function syncExclusionCaptures(excludedNames, token) {
  if (exclusionBusy) return;
  exclusionBusy = true;
  try {
    const winPids = await listWindowPids();
    if (token !== exclusionToken) return;

    // Só reconsulta a tabela de processos quando o conjunto de janelas muda (evita custo de PowerShell a cada ciclo)
    const winKey = [...winPids].sort((a, b) => a - b).join(',');
    if (winKey !== exclusionLastWinKey || exclusionProcessTable.size === 0) {
      const table = await getProcessTable();
      if (token !== exclusionToken) return;
      if (table.size > 0) {
        exclusionProcessTable = table;
        exclusionLastWinKey = winKey;
      }
    }
    const table = exclusionProcessTable;
    if (table.size === 0) return;

    const ownPid = process.pid;
    const hasAncestor = (pid, pred) => {
      let cur = table.get(pid)?.ppid;
      let guard = 0;
      while (cur && guard++ < 32) {
        if (pred(cur)) return true;
        cur = table.get(cur)?.ppid;
      }
      return false;
    };
    const isExcludedPid = (pid) => {
      const e = table.get(pid);
      return !!e && excludedNames.has(e.name.toLowerCase());
    };

    const wanted = new Set();
    for (const pid of winPids) {
      const entry = table.get(pid);
      if (!entry) continue;
      if (pid === ownPid || hasAncestor(pid, (p) => p === ownPid)) continue; // anti-eco: nunca capturar o LoveChat
      if (EXCLUSION_SKIP_NAMES.has(entry.name.toLowerCase())) continue;
      if (isExcludedPid(pid) || hasAncestor(pid, isExcludedPid)) continue;
      wanted.add(pid);
    }
    // Evita captura duplicada: se o pai já está sendo capturado (árvore inclui os filhos), ignora o filho
    const finalPids = new Set([...wanted].filter((pid) => !hasAncestor(pid, (p) => wanted.has(p))));

    for (const [pid, capturer] of [...exclusionCaptures.entries()]) {
      if (!finalPids.has(pid)) {
        try { capturer.stop(); } catch (e) {}
        exclusionCaptures.delete(pid);
      }
    }

    for (const pid of finalPids) {
      if (exclusionCaptures.has(pid)) continue;
      try {
        const capturer = new LoopbackCapture();
        capturer.start(pid, true, (chunk) => {
          if (mainWindow && !mainWindow.isDestroyed() && chunk && chunk.length > 0) {
            mainWindow.webContents.send('process-audio-chunk', { id: `excl:${pid}`, chunk });
          }
        });
        exclusionCaptures.set(pid, capturer);
        console.log(`[Electron] Exclusão de áudio: capturando PID ${pid} (${table.get(pid)?.name}).`);
      } catch (err) {
        console.warn(`[Electron] Exclusão de áudio: falha ao capturar PID ${pid}:`, err.message);
      }
    }
  } finally {
    exclusionBusy = false;
  }
}

/**
 * Inicia a captura por exclusão. Retorna true se conseguiu resolver processos/janelas (módulos nativos disponíveis).
 */
async function startExclusionCapture(excludedList) {
  stopExclusionCaptures();
  const excludedNames = new Set(
    (excludedList || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
  );
  const token = exclusionToken;
  exclusionProcessTable = new Map();
  await syncExclusionCaptures(excludedNames, token);
  if (token !== exclusionToken) return false;
  if (exclusionCaptures.size === 0 && exclusionProcessTable.size === 0) {
    return false; // não foi possível resolver processos: o chamador usa o modo padrão
  }
  // Apps abertos depois do início da live também entram automaticamente
  exclusionTimer = setInterval(() => {
    syncExclusionCaptures(excludedNames, token).catch(() => {});
  }, 4000);
  return true;
}

function stopActiveProcessAudio() {
  stopExclusionCaptures();
  if (activeProcessCapture) {
    try {
      console.log('[Electron] Parando captura de áudio da transmissão...');
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
process.env.LOVECHAT_DATA_DIR = userDataDir;
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

  // Migrar pasta de avatares reais existentes
  const localAvatars = path.join(__dirname, 'avatars');
  const targetAvatars = path.join(userDataDir, 'avatars');
  if (fs.existsSync(localAvatars)) {
    if (!fs.existsSync(targetAvatars)) {
      fs.mkdirSync(targetAvatars, { recursive: true });
    }
    try {
      fs.readdirSync(localAvatars).forEach(f => {
        const src = path.join(localAvatars, f);
        const dest = path.join(targetAvatars, f);
        if (!fs.existsSync(dest) && fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dest);
        }
      });
    } catch (e) {}
  }
} catch (e) {
  console.warn('[Electron] Aviso ao inicializar pasta userData:', e);
}

// ==========================================
// 0. FLAGS DE COMANDO DO CHROMIUM
// ==========================================
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

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

  const hasPortRule = (await checkFirewallRule('LoveChat Port 3000')) || (await checkFirewallRule('NCord Port 3000'));
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
    'netsh advfirewall firewall delete rule name="LoveChat" 2>$null',
    'netsh advfirewall firewall delete rule name="LoveChat Port 3000" 2>$null',
    'netsh advfirewall firewall delete rule name="LoveChat UDP" 2>$null',
    `netsh advfirewall firewall add rule name="LoveChat" dir=in action=allow program="${exePath}" enable=yes`,
    'netsh advfirewall firewall add rule name="LoveChat Port 3000" dir=in action=allow protocol=TCP localport=3000 enable=yes',
    'netsh advfirewall firewall add rule name="LoveChat UDP" dir=in action=allow protocol=UDP localport=1024-65535 enable=yes'
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
          const applied = (await checkFirewallRule('LoveChat Port 3000')) || (await checkFirewallRule('NCord Port 3000'));
          resolve({ success: Boolean(applied) });
        }, 1500);
      }
    });
  });
}

// ==========================================
// 1. GERENCIAMENTO E SONDAGEM DE SERVIDORES
// ==========================================

/**
 * Testa se um servidor HTTP do LoveChat responde no host e porta fornecidos.
 */
function probeHttpServer(host, port = SERVER_PORT, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${host}:${port}/api/my-ip`,
      {
        timeout: timeoutMs,
        headers: {
          'x-lovechat-client': 'desktop'
        }
      },
      (res) => {
        res.resume();
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

function getHostNetworkIps() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let zerotierIp = null;
  let lanIp = null;
  const allIps = [];

  for (const [name, list] of Object.entries(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const lowerName = name.toLowerCase();
        allIps.push({ name, address: iface.address });

        const isZtName = lowerName.includes('zerotier') || lowerName.includes('zt');
        const isZtSubnet = (
          iface.address.startsWith('10.144.') ||
          iface.address.startsWith('10.147.') || 
          iface.address.startsWith('10.244.') ||
          iface.address.startsWith('10.247.') ||
          iface.address.startsWith('192.168.191.') ||
          iface.address.startsWith('192.168.192.') ||
          iface.address.startsWith('192.168.195.') ||
          iface.address.startsWith('172.22.') ||
          iface.address.startsWith('172.28.') ||
          iface.address.startsWith('172.29.')
        );

        if (isZtName || isZtSubnet) {
          zerotierIp = iface.address;
        } else if (!lanIp && !iface.address.startsWith('127.')) {
          lanIp = iface.address;
        }
      }
    }
  }

  // Fallback: se houver 2 interfaces IPv4 válidas e nenhuma marcada como ZeroTier,
  // selecionar a segunda como ZeroTier / VPN
  if (!zerotierIp && allIps.length > 1) {
    const nonLocal = allIps.filter(item => item.address && !item.address.startsWith('127.'));
    if (nonLocal.length > 1) {
      zerotierIp = nonLocal[1].address;
      lanIp = nonLocal[0].address;
    }
  }

  return {
    ip: zerotierIp || lanIp || '127.0.0.1',
    zerotierIp: zerotierIp || lanIp || '127.0.0.1',
    lanIp: lanIp || '127.0.0.1',
    allIps
  };
}

// ==========================================
// AUTO-DESCOBERTA DE SERVIDORES NA REDE (UDP + PROBES HTTP)
// ==========================================
const dgram = require('dgram');
const discoveredNetworkServers = new Map(); // ip -> { ip, port, hostName, lastSeen }
let electronUdpSocket = null;

function setupElectronUdpDiscovery() {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    electronUdpSocket = socket;

    socket.on('error', (err) => {
      console.warn('[Electron Discovery] Erro no socket UDP:', err.message);
    });

    socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString('utf-8'));
        if (data && data.app === 'lovechat') {
          const remoteIp = rinfo.address;
          const { zerotierIp, lanIp } = getHostNetworkIps();
          if (remoteIp !== '127.0.0.1' && remoteIp !== zerotierIp && remoteIp !== lanIp) {
            discoveredNetworkServers.set(remoteIp, {
              ip: remoteIp,
              port: data.port || 3000,
              hostName: data.hostName || 'Amor',
              lastSeen: Date.now()
            });
            console.log(`[Electron Discovery] Servidor LoveChat descoberto via UDP: ${remoteIp} (${data.hostName || 'Amor'})`);
          }
        }
      } catch (e) {}
    });

    socket.bind(3001, () => {
      try {
        socket.setBroadcast(true);
      } catch (e) {}
    });
  } catch (err) {
    console.warn('[Electron Discovery] Falha ao inicializar UDP discovery:', err.message);
  }
}

setupElectronUdpDiscovery();

const server = require('./server');
const tunnelManager = require('./tunnelManager');
tunnelManager.init(userDataDir);

async function startLocalServer() {
  try {
    const isAlive = await probeHttpServer('127.0.0.1', SERVER_PORT, 600);
    if (isAlive) {
      console.log(`[Electron] Servidor LoveChat já está ativo na porta ${SERVER_PORT}`);
      return true;
    }

    console.log('[Electron] 🚀 Iniciando servidor Express/PeerJS embutido no processo na porta 3000...');
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
    tunnelManager.stopTunnel();
    server.stopServer();
  } catch (err) {
    console.error('[Electron] Erro ao parar servidor local:', err);
  }
}

// ==========================================
// 2. CRIAÇÃO DA JANELA PRINCIPAL
// ==========================================
async function createWindow() {
  const iconPath = path.join(__dirname, 'public', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 620,
    title: 'LoveChat',
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

  // Carregar o arquivo index.html LOCALMENTE (dist-client se compilado React/Vite, ou public)
  const distIndexPath = path.join(__dirname, 'dist-client', 'index.html');
  const fallbackIndexPath = path.join(__dirname, 'public', 'index.html');
  const indexPath = fs.existsSync(distIndexPath) ? distIndexPath : fallbackIndexPath;

  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[Electron] Erro crítico ao carregar index.html:', err);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // ==========================================
  // INICIALIZAÇÃO DO AUTO-UPDATER
  // ==========================================
  setupAutoUpdaterIPC(mainWindow);

  // Verificação de atualização obrigatória na inicialização e periódica
  const triggerUpdateCheck = async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const updateInfo = await checkForUpdates();
        if (updateInfo && updateInfo.updateAvailable) {
          mainWindow.webContents.send('updater:update-available', updateInfo);
        }
      }
    } catch (e) {
      console.warn('[AutoUpdater] Aviso na checagem automática:', e.message);
    }
  };

  setTimeout(triggerUpdateCheck, 2000);
  setInterval(triggerUpdateCheck, 5 * 60 * 1000);

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

  // Iniciar servidor local em segundo plano para que /api e PeerJS fiquem imediatamente disponíveis
  startLocalServer().catch((e) => console.warn('[Server] Falha inicialização local:', e));

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
        pid = getPidFromHwnd(hwnd, source.name);
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

ipcMain.handle('select-desktop-source', async (event, { sourceId, withAudio, sourceName, excludeApps }) => {
  const cb = pendingDisplayMediaCallback;
  pendingDisplayMediaCallback = null;

  try {
    const isWindow = typeof sourceId === 'string' && sourceId.startsWith('window:');
    const isScreen = typeof sourceId === 'string' && sourceId.startsWith('screen:');
    const targetHwnd = isWindow ? sourceId.split(':')[1] : null;

    let chosen = null;

    // 1. Tentar encontrar diretamente no cache original das fontes listadas no modal
    if (cachedRawDesktopSources && cachedRawDesktopSources.length > 0) {
      chosen = cachedRawDesktopSources.find((s) => s.id === sourceId);

      if (!chosen && isWindow && targetHwnd) {
        chosen = cachedRawDesktopSources.find((s) => s.id.startsWith('window:') && s.id.split(':')[1] === targetHwnd);
      }

      if (!chosen && sourceName) {
        const cleanName = sourceName.trim().toLowerCase();
        chosen = cachedRawDesktopSources.find((s) => {
          const sameType = isWindow ? s.id.startsWith('window:') : s.id.startsWith('screen:');
          return sameType && (s.name || '').trim().toLowerCase() === cleanName;
        });
      }
    }

    // 2. Se não estiver no cache, buscar fontes frescas
    if (!chosen) {
      const freshSources = await desktopCapturer.getSources({
        types: isWindow ? ['window'] : ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      });

      chosen = freshSources.find((s) => s.id === sourceId);

      if (!chosen && isWindow && targetHwnd) {
        chosen = freshSources.find((s) => s.id.startsWith('window:') && s.id.split(':')[1] === targetHwnd);
      }
    }

    if (!chosen && isScreen) {
      chosen = (cachedRawDesktopSources && cachedRawDesktopSources.find((s) => s.id.startsWith('screen:'))) || null;
    }

    if (chosen) {
      stopActiveProcessAudio();

      const isWindowChoice = chosen.id.startsWith('window:');
      const streamOptions = { video: chosen };
      let hasProcessAudio = false;
      let exclusionApplied = false;

      if (withAudio && LoopbackCapture) {
        if (isWindowChoice) {
          const rawHwnd = chosen.id.split(':')[1];
          const hwndNum = parseInt(rawHwnd, 10);
          const targetPid = getPidFromHwnd(hwndNum, chosen.name || sourceName);

          if (targetPid > 0) {
            const exeName = getProcessNameByPid(targetPid);
            // explorer.exe e hosts de sistema NÃO podem ter includeProcessTree=true,
            // pois no Windows quase todos os programas do usuário são filhos do explorer.exe!
            const isShellHost = EXCLUSION_SKIP_NAMES.has(exeName) || exeName === 'explorer.exe';
            const includeProcessTree = !isShellHost;

            console.log(`[Electron] Iniciando captura exclusiva de áudio WASAPI para PID ${targetPid} (${exeName || 'app'}, HWND ${hwndNum}, árvore: ${includeProcessTree}, "${chosen.name}")...`);
            try {
              activeProcessCapture = new LoopbackCapture();
              activeProcessCapture.start(targetPid, includeProcessTree, (chunk) => {
                if (mainWindow && !mainWindow.isDestroyed() && chunk && chunk.length > 0) {
                  mainWindow.webContents.send('process-audio-chunk', chunk);
                }
              });
              hasProcessAudio = true;
              console.log(`[Electron] Captura exclusiva de áudio de processo ativa com sucesso para PID ${targetPid} (${exeName})!`);
            } catch (captureErr) {
              console.error('[Electron] Falha ao iniciar LoopbackCapture no PID alvo:', captureErr);
              activeProcessCapture = null;
              hasProcessAudio = false;
            }
          } else {
            // SEGURANÇA E PRIVACIDADE: Se o PID da janela específica não puder ser identificado,
            // NUNCA fazer fallback para capturar o áudio do computador todo!
            // O usuário escolheu transmitir apenas ESTA janela, logo nenhuma outra janela deve vazar.
            console.warn(`[Electron] PID exclusivo não identificado para a janela ${chosen.id} (HWND: ${hwndNum}, "${chosen.name}"). Áudio exclusivo desativado para garantir que nenhuma outra janela seja transmitida.`);
            hasProcessAudio = false;
          }
        } else if (Array.isArray(excludeApps) && excludeApps.length > 0 && await startExclusionCapture(excludeApps)) {
          // Tela inteira com apps excluídos: captura todos os apps, menos os escolhidos (e o próprio LoveChat)
          hasProcessAudio = true;
          exclusionApplied = true;
          console.log(`[Electron] Áudio de tela cheia por exclusão ativo. Apps silenciados: ${excludeApps.join(', ')}`);
        } else {
          // Captura de tela inteira padrão: capturar todo o áudio do computador EXCLUINDO o próprio LoveChat (anti-eco nativo do WASAPI)
          console.log('[Electron] Iniciando captura de áudio de tela cheia anti-eco (excluindo processo LoveChat)...');
          try {
            activeProcessCapture = new LoopbackCapture();
            const currentPid = process.pid;
            activeProcessCapture.start(currentPid, false, (chunk) => {
              if (mainWindow && !mainWindow.isDestroyed() && chunk && chunk.length > 0) {
                mainWindow.webContents.send('process-audio-chunk', chunk);
              }
            });
            hasProcessAudio = true;
            exclusionApplied = true;
            console.log(`[Electron] Captura de áudio de tela cheia anti-eco ativa com sucesso via WASAPI exclude (PID ${currentPid})!`);
          } catch (exclErr) {
            console.warn('[Electron] Falha ao iniciar WASAPI exclude direto, tentando startExclusionCapture:', exclErr.message);
            if (await startExclusionCapture([])) {
              hasProcessAudio = true;
              exclusionApplied = true;
              console.log('[Electron] Captura de tela cheia ativa via sincronização de exclusão por janela.');
            } else {
              console.warn('[Electron] Falha nas rotinas de exclusão, tentando startSystemAudio como último recurso:', exclErr.message);
              try {
                activeProcessCapture = new LoopbackCapture();
                activeProcessCapture.startSystemAudio((chunk) => {
                  if (mainWindow && !mainWindow.isDestroyed() && chunk && chunk.length > 0) {
                    mainWindow.webContents.send('process-audio-chunk', chunk);
                  }
                });
                hasProcessAudio = true;
                console.log('[Electron] Captura de áudio de tela cheia ativa via fallback startSystemAudio.');
              } catch (fallbackErr) {
                console.error('[Electron] Falha total ao iniciar captura de áudio para tela cheia:', fallbackErr.message);
                activeProcessCapture = null;
                streamOptions.audio = 'loopback';
              }
            }
          }
        }
      }

      console.log(`[Electron] Fonte confirmada para transmissão: [${chosen.id}] "${chosen.name}" (tipo: ${isWindowChoice ? 'JANELA' : 'TELA'}, áudio: ${hasProcessAudio ? 'EXCLUSIVO-PROCESSO (WASAPI)' : (streamOptions.audio ? 'LOOPBACK-SISTEMA' : 'DESATIVADO')})`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('process-audio-selected', {
          success: true,
          isWindow: isWindowChoice,
          hasProcessAudio,
          exclusionApplied,
          sourceId: chosen.id,
          sourceName: chosen.name
        });
      }
      if (cb) {
        cb(streamOptions);
      }
      return {
        success: true,
        isWindow: isWindowChoice,
        hasProcessAudio,
        exclusionApplied,
        sourceId: chosen.id,
        sourceName: chosen.name
      };
    } else {
      console.warn('[Electron] Nenhuma fonte correspondente encontrada.');
      if (cb) cb(null);
      return { success: false, reason: 'Fonte não encontrada' };
    }
  } catch (e) {
    console.error('[Electron] Erro ao selecionar tela/janela:', e);
    if (cb) {
      try { cb(null); } catch (err) {}
    }
    return { success: false, error: e.message };
  }
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

// ==========================================
// CANAIS IPC DE EXCLUSÃO DE ÁUDIO DE TELA CHEIA
// ==========================================
ipcMain.handle('get-excludable-audio-apps', async () => {
  try {
    const [winPids, table] = await Promise.all([listWindowPids(), getProcessTable()]);
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: true
    });
    const ownPid = process.pid;
    const byName = new Map(); // exeName(lowercase) -> app
    for (const s of sources) {
      if (!s.id.startsWith('window:')) continue;
      const pid = getPidFromHwnd(parseInt(s.id.split(':')[1], 10));
      const entry = table.get(pid);
      if (!pid || !entry) continue;
      if (pid === ownPid) continue;
      const exeName = entry.name.toLowerCase();
      if (EXCLUSION_SKIP_NAMES.has(exeName)) continue;
      if (!byName.has(exeName)) {
        byName.set(exeName, {
          exeName,
          displayName: entry.name.replace(/\.exe$/i, ''),
          windowTitle: s.name,
          appIcon: s.appIcon ? s.appIcon.toDataURL() : null
        });
      }
    }
    return { success: true, apps: [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)) };
  } catch (err) {
    console.error('[Electron] Erro ao listar apps para exclusão de áudio:', err);
    return { success: false, apps: [], error: err.message };
  }
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
      error: `Não foi possível alcançar o servidor em ${cleanIp}.\nVerifique se o parceiro está com o LoveChat aberto e se o ZeroTier está conectado!`
    };
  }

  // Se o servidor local estiver ativo, desliga para operar como cliente puro
  stopLocalServer();

  // Grava o IP no arquivo de configurações para fácil preenchimento
  writeSettings({ targetIp: cleanIp });

  console.log(`[Electron] IP do parceiro validado com sucesso (${cleanIp}).`);
  return { success: true, targetIp: cleanIp };
});

// Obter IPs locais e do ZeroTier sem precisar do servidor HTTP ativo
ipcMain.handle('get-my-ip', async () => {
  return getHostNetworkIps();
});

// Descobrir servidores ativos na rede ZeroTier e LAN via probes diretos
ipcMain.handle('discover-servers', async () => {
  const { zerotierIp, lanIp, allIps } = getHostNetworkIps();
  const foundServers = [];
  const now = Date.now();
  const seenIps = new Set();

  for (const [ip, s] of discoveredNetworkServers.entries()) {
    if (now - s.lastSeen < 20000) {
      foundServers.push(s);
      seenIps.add(s.ip);
    }
  }

  const probePromises = [];

  // 1. Probar com prioridade o IP do parceiro salvo anteriormente nas configurações
  const savedSettings = readSettings();
  if (savedSettings && savedSettings.targetIp && !seenIps.has(savedSettings.targetIp)) {
    const tip = savedSettings.targetIp;
    if (tip !== zerotierIp && tip !== lanIp) {
      probePromises.push(
        new Promise((resolve) => {
          const reqProbe = http.get(
            `http://${tip}:${SERVER_PORT}/api/my-ip`,
            { timeout: 1500, headers: { 'x-lovechat-client': 'desktop' } },
            (resProbe) => {
              if (resProbe.statusCode >= 200 && resProbe.statusCode < 400) {
                let body = '';
                resProbe.on('data', (d) => (body += d));
                resProbe.on('end', () => {
                  try {
                    const parsed = JSON.parse(body);
                    resolve({ ip: tip, port: SERVER_PORT, hostName: parsed.hostName || 'Amor', ...(parsed || {}) });
                  } catch (e) {
                    resolve({ ip: tip, port: SERVER_PORT, hostName: 'Amor' });
                  }
                });
              } else {
                resProbe.resume();
                resolve(null);
              }
            }
          );
          reqProbe.on('error', () => resolve(null));
          reqProbe.on('timeout', () => {
            reqProbe.destroy();
            resolve(null);
          });
        })
      );
    }
  }

  // 2. Varrer sub-redes ativas (ZeroTier e LAN)
  const candidateSubnets = new Set();
  if (allIps && Array.isArray(allIps)) {
    for (const item of allIps) {
      if (item && item.address && !item.address.startsWith('127.')) {
        const parts = item.address.split('.');
        if (parts.length === 4) {
          candidateSubnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }
  }

  for (const baseSubnet of candidateSubnets) {
    for (let i = 1; i <= 254; i++) {
      const targetIp = `${baseSubnet}.${i}`;
      if (targetIp === zerotierIp || targetIp === lanIp || seenIps.has(targetIp)) continue;

      probePromises.push(
        new Promise((resolve) => {
          const reqProbe = http.get(
            `http://${targetIp}:${SERVER_PORT}/api/my-ip`,
            { timeout: 1200, headers: { 'x-lovechat-client': 'desktop' } },
            (resProbe) => {
              if (resProbe.statusCode >= 200 && resProbe.statusCode < 400) {
                let body = '';
                resProbe.on('data', (d) => (body += d));
                resProbe.on('end', () => {
                  try {
                    const parsed = JSON.parse(body);
                    resolve({
                      ip: targetIp,
                      port: SERVER_PORT,
                      hostName: parsed.hostName || 'Amor',
                      ...(parsed || {})
                    });
                  } catch (e) {
                    resolve({ ip: targetIp, port: SERVER_PORT, hostName: 'Amor' });
                  }
                });
              } else {
                resProbe.resume();
                resolve(null);
              }
            }
          );
          reqProbe.on('error', () => resolve(null));
          reqProbe.on('timeout', () => {
            reqProbe.destroy();
            resolve(null);
          });
        })
      );
    }
  }

  const results = await Promise.all(probePromises);
  for (const r of results) {
    if (r && r.ip && !seenIps.has(r.ip)) {
      seenIps.add(r.ip);
      foundServers.push(r);
    }
  }

  return {
    success: true,
    servers: foundServers
  };
});

// Alternar para hospedar no próprio computador (inicia o servidor local sob demanda)
ipcMain.handle('host-local-server', async () => {
  writeSettings({ targetIp: null });
  console.log('[Electron] Modo Anfitrião selecionado. Iniciando servidor local na porta 3000...');
  const ok = await startLocalServer();
  return { success: ok };
});

// Parar servidor local explicitamente (ao clicar em Trocar Servidor)
ipcMain.handle('stop-local-server', async () => {
  console.log('[Electron] Encerrando servidor local a pedido do usuário (Trocar Servidor)...');
  stopLocalServer();
  return { success: true };
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
  const ok = (await checkFirewallRule('LoveChat Port 3000')) || (await checkFirewallRule('NCord Port 3000'));
  return { applied: Boolean(ok) };
});

// ==========================================
// TÚNEL WEB SEGURO (ACESSO DO PAR VIA BROWSER)
// ==========================================
ipcMain.handle('start-web-tunnel', async () => {
  try {
    const serverRunning = await startLocalServer();
    if (!serverRunning) {
      return { success: false, error: 'Não foi possível iniciar o servidor local na porta 3000.' };
    }

    const tunnelRes = await tunnelManager.startTunnel(SERVER_PORT);
    if (!tunnelRes.success) {
      return { success: false, error: tunnelRes.error || 'Falha ao iniciar o túnel da Cloudflare.' };
    }

    if (server && typeof server.setWebAccessEnabled === 'function') {
      server.setWebAccessEnabled(true);
    }

    const token = server.getOrCreateRoomToken();
    const networkInfo = getHostNetworkIps();

    return {
      success: true,
      url: tunnelRes.url,
      token,
      lanIp: networkInfo.lanIp,
      zerotierIp: networkInfo.zerotierIp,
      port: SERVER_PORT
    };
  } catch (err) {
    console.error('[Electron] Erro ao iniciar web tunnel:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-web-tunnel', async () => {
  tunnelManager.stopTunnel();
  if (server && typeof server.setWebAccessEnabled === 'function') {
    server.setWebAccessEnabled(false);
  }
  return { success: true };
});

ipcMain.handle('get-web-tunnel-status', async () => {
  const status = tunnelManager.getStatus();
  if (server && typeof server.setWebAccessEnabled === 'function') {
    server.setWebAccessEnabled(Boolean(status?.isOnline));
  }
  const token = server.getOrCreateRoomToken();
  const networkInfo = getHostNetworkIps();
  return {
    ...status,
    token,
    lanIp: networkInfo.lanIp,
    zerotierIp: networkInfo.zerotierIp,
    port: SERVER_PORT
  };
});

ipcMain.handle('regenerate-room-token', async () => {
  const token = server.regenerateRoomToken();
  return { success: true, token };
});

// ==========================================
// ÁLBUM DE FOTOS COMPARTILHADO (HOST FOLDER)
// ==========================================
ipcMain.handle('select-album-folder', async () => {
  if (!mainWindow) return { canceled: true };
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecione a Pasta de Fotos para Compartilhar no Álbum',
      properties: ['openDirectory', 'dontAddToRecent']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const folderPath = result.filePaths[0];
    writeSettings({ sharedAlbumFolder: folderPath });

    // Notificar o servidor local sobre a pasta escolhida
    if (server && typeof server.setSharedAlbumFolder === 'function') {
      server.setSharedAlbumFolder(folderPath);
    }

    return { canceled: false, folderPath };
  } catch (err) {
    console.error('[Electron] Erro ao selecionar pasta do álbum:', err);
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('get-album-folder', () => {
  const settings = readSettings();
  return { folderPath: settings.sharedAlbumFolder || null };
});

ipcMain.handle('clear-album-folder', () => {
  writeSettings({ sharedAlbumFolder: null });
  if (server && typeof server.setSharedAlbumFolder === 'function') {
    server.setSharedAlbumFolder(null);
  }
  return { success: true };
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
