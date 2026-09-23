const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { ExpressPeerServer } = require('peer');

const app = express();

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.LOVECHAT_DATA_DIR || process.env.NCORD_DATA_DIR || __dirname;
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {}

const DB_FILE = path.join(DATA_DIR, 'database.json');

const cors = require('cors');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ==========================================
// PROTEÇÃO CONTRA ABUSO E BRUTE-FORCE (RATE LIMITING)
// ==========================================
const ipRequestCounts = new Map();
const BANNED_IPS = new Set();

// Limpar contadores de IP a cada 1 minuto
setInterval(() => {
  ipRequestCounts.clear();
}, 60000);

// Middleware para validar requisições e aplicar limites por IP (com isenção de assets estáticos e peerjs)
function rateLimiter(req, res, next) {
  // Isentar arquivos estáticos, service workers e rotas de sinalização do PeerJS e status da sala
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/peerjs') ||
    p.startsWith('/api/room') ||
    p.startsWith('/api/my-ip') ||
    p.endsWith('.js') ||
    p.endsWith('.css') ||
    p.endsWith('.png') ||
    p.endsWith('.svg') ||
    p.endsWith('.ico') ||
    p.endsWith('.json') ||
    p === '/'
  ) {
    return next();
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (BANNED_IPS.has(ip)) {
    return res.status(403).send('🚫 Acesso bloqueado temporariamente por excesso de requisições.');
  }

  const currentCount = ipRequestCounts.get(ip) || 0;
  
  // Limite tolerante de 600 requisições por minuto por IP para APIs de estado/db
  if (currentCount > 600) {
    console.warn(`⚠️ IP com excesso de requisições bloqueado temporariamente: ${ip}`);
    BANNED_IPS.add(ip);
    
    // Desbanir após 1 minuto
    setTimeout(() => {
      BANNED_IPS.delete(ip);
    }, 60000);
    
    return res.status(429).send('🚫 Muitas requisições. Aguarde um instante.');
  }

  ipRequestCounts.set(ip, currentCount + 1);
  next();
}

app.use(rateLimiter);

// Servir arquivos estáticos (dist-client se compilado com React/Vite, ou public)
const distPath = path.join(__dirname, 'dist-client');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(path.join(__dirname, 'public')));

// Helper para ler banco JSON local
function readDB() {
  const initialData = {
    profiles: {
      user1: {
        id: "user1",
        name: "Usuário 1",
        avatar: null
      },
      user2: {
        id: "user2",
        name: "Usuário 2",
        avatar: null
      }
    },
    hostName: "Usuário 1",
    guestName: "Usuário 2",
    notes: [
      { id: 1, text: "Bem-vindo ao LoveChat! Adicione notas e recados aqui ✨", category: "cozy" },
      { id: 2, text: "Clique para riscar ou adicione novos planos no botão acima 📝", category: "soft" }
    ]
  };

  if (!fs.existsSync(DB_FILE)) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      console.log(`[DB] database.json criado com sucesso em: ${DB_FILE}`);
    } catch (err) {
      console.warn('[DB] Não foi possível salvar o arquivo inicial:', err);
    }
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    let changed = false;

    if (!data.profiles) {
      data.profiles = {
        user1: {
          id: "user1",
          name: data.hostName || "Usuário 1",
          avatar: data.hostAvatar || null
        },
        user2: {
          id: "user2",
          name: data.guestName || "Usuário 2",
          avatar: data.guestAvatar || null
        }
      };
      changed = true;
    } else {
      if (!data.profiles.user1) {
        data.profiles.user1 = { id: "user1", name: data.hostName || "Usuário 1", avatar: data.hostAvatar || null };
        changed = true;
      }
      if (!data.profiles.user2) {
        data.profiles.user2 = { id: "user2", name: data.guestName || "Usuário 2", avatar: data.guestAvatar || null };
        changed = true;
      }
    }

    if (changed) {
      writeDB(data);
    }
    return data;
  } catch (e) {
    return initialData;
  }
}

// Helper para escrever no banco JSON local
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Endpoints da API para o casal
app.get('/api/db', (req, res) => {
  res.json(readDB());
});

// Helper para detectar o IP da interface do ZeroTier e da rede local
function getHostNetworkIps() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let zerotierIp = null;
  let lanIp = null;
  const allIps = [];

  for (const [name, list] of Object.entries(ifaces)) {
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const lowerName = name.toLowerCase();
        allIps.push({ name, address: iface.address });
        if (
          lowerName.includes('zerotier') || 
          lowerName.includes('zt') || 
          iface.address.startsWith('10.147.') || 
          iface.address.startsWith('10.244.') ||
          iface.address.startsWith('192.168.192.') ||
          iface.address.startsWith('192.168.195.')
        ) {
          zerotierIp = iface.address;
        } else if (!lanIp && !iface.address.startsWith('127.')) {
          lanIp = iface.address;
        }
      }
    }
  }

  return {
    zerotierIp: zerotierIp || lanIp || '127.0.0.1',
    lanIp: lanIp || '127.0.0.1',
    allIps
  };
}

app.get('/api/my-ip', (req, res) => {
  const { zerotierIp, lanIp, allIps } = getHostNetworkIps();
  res.json({
    ip: zerotierIp,
    zerotierIp,
    lanIp,
    allIps
  });
});

// ==========================================
// AUTO-DESCOBERTA DE SERVIDORES NA REDE (UDP + PROBE HTTP)
// ==========================================
const dgram = require('dgram');
const discoveredNetworkServers = new Map(); // ip -> { ip, hostName, lastSeen }
let udpDiscoverySocket = null;

function setupUdpDiscovery() {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udpDiscoverySocket = socket;

    socket.on('error', (err) => {
      console.warn('[Discovery] Erro no socket UDP:', err.message);
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
          }
        }
      } catch (e) {}
    });

    socket.bind(3001, () => {
      try {
        socket.setBroadcast(true);
      } catch (e) {}
    });

    setInterval(() => {
      if (!udpDiscoverySocket) return;
      try {
        const { zerotierIp, lanIp } = getHostNetworkIps();
        const db = readDB();
        const payload = Buffer.from(JSON.stringify({
          app: 'lovechat',
          port: PORT,
          ip: zerotierIp || lanIp,
          hostName: db.hostName || db.profiles?.user1?.name || 'Amor'
        }));

        socket.send(payload, 0, payload.length, 3001, '255.255.255.255');
      } catch (e) {}
    }, 3000);
  } catch (err) {
    console.warn('[Discovery] Falha ao configurar UDP discovery:', err.message);
  }
}
setupUdpDiscovery();

// Endpoint para descobrir servidores na rede ativa (ZeroTier e LAN)
app.get('/api/discover-servers', async (req, res) => {
  const { zerotierIp, lanIp } = getHostNetworkIps();
  const foundServers = [];
  const now = Date.now();

  for (const [ip, s] of discoveredNetworkServers.entries()) {
    if (now - s.lastSeen < 15000) {
      foundServers.push(s);
    }
  }

  // Se nenhuma descoberta passiva recente, varrer rapidamente sub-rede ZeroTier
  if (foundServers.length === 0 && zerotierIp && zerotierIp !== '127.0.0.1') {
    const parts = zerotierIp.split('.');
    if (parts.length === 4) {
      const baseSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
      const myLastOctet = parseInt(parts[3], 10);
      const probePromises = [];

      for (let i = 1; i <= 254; i++) {
        if (i === myLastOctet) continue;
        const targetIp = `${baseSubnet}.${i}`;
        probePromises.push(
          new Promise((resolve) => {
            const reqProbe = http.get(`http://${targetIp}:${PORT}/api/my-ip`, { timeout: 450 }, (resProbe) => {
              if (resProbe.statusCode >= 200 && resProbe.statusCode < 400) {
                let body = '';
                resProbe.on('data', (d) => (body += d));
                resProbe.on('end', () => {
                  try {
                    const parsed = JSON.parse(body);
                    resolve({ ip: targetIp, port: PORT, isZeroTier: true, ...(parsed || {}) });
                  } catch (e) {
                    resolve({ ip: targetIp, port: PORT, isZeroTier: true });
                  }
                });
              } else {
                resolve(null);
              }
            });
            reqProbe.on('error', () => resolve(null));
            reqProbe.on('timeout', () => {
              reqProbe.destroy();
              resolve(null);
            });
          })
        );
      }

      const results = await Promise.all(probePromises);
      for (const r of results) {
        if (r && r.ip) {
          foundServers.push(r);
        }
      }
    }
  }

  res.json({
    success: true,
    servers: foundServers
  });
});

app.post('/api/db', (req, res) => {
  const current = readDB();
  const incoming = req.body || {};

  // Atualização específica de perfil
  if (incoming.profileUpdate) {
    const { id, name, avatar } = incoming.profileUpdate;
    if (id && current.profiles && current.profiles[id]) {
      if (name !== undefined) current.profiles[id].name = name;
      if (avatar !== undefined) current.profiles[id].avatar = avatar;

      // Mantém compatibilidade com campos legados
      if (id === 'user1') {
        if (name !== undefined) current.hostName = name;
        if (avatar !== undefined) current.hostAvatar = avatar;
      } else if (id === 'user2') {
        if (name !== undefined) current.guestName = name;
        if (avatar !== undefined) current.guestAvatar = avatar;
      }
    }
  }

  // Atualização direta do objeto profiles
  if (incoming.profiles) {
    current.profiles = {
      ...(current.profiles || {}),
      ...incoming.profiles
    };
    if (incoming.profiles.user1) {
      if (incoming.profiles.user1.name) current.hostName = incoming.profiles.user1.name;
      if (incoming.profiles.user1.avatar) current.hostAvatar = incoming.profiles.user1.avatar;
    }
    if (incoming.profiles.user2) {
      if (incoming.profiles.user2.name) current.guestName = incoming.profiles.user2.name;
      if (incoming.profiles.user2.avatar) current.guestAvatar = incoming.profiles.user2.avatar;
    }
  }

  // Atualização de notas
  if (incoming.notes) {
    current.notes = incoming.notes;
  }

  // Compatibilidade com campos diretos legados
  if (incoming.hostName !== undefined) {
    current.hostName = incoming.hostName;
    if (current.profiles && current.profiles.user1) current.profiles.user1.name = incoming.hostName;
  }
  if (incoming.hostAvatar !== undefined) {
    current.hostAvatar = incoming.hostAvatar;
    if (current.profiles && current.profiles.user1) current.profiles.user1.avatar = incoming.hostAvatar;
  }
  if (incoming.guestName !== undefined) {
    current.guestName = incoming.guestName;
    if (current.profiles && current.profiles.user2) current.profiles.user2.name = incoming.guestName;
  }
  if (incoming.guestAvatar !== undefined) {
    current.guestAvatar = incoming.guestAvatar;
    if (current.profiles && current.profiles.user2) current.profiles.user2.avatar = incoming.guestAvatar;
  }

  writeDB(current);
  res.json(current);
});

// ==========================================
// MONITORAMENTO DE PEERS E SALAS ATIVAS
// ==========================================
const activePeers = new Map(); // peerId -> { id, connectedAt, lastSeen }

// Endpoints da sala para coordenação de liderança e troca de dono
app.get('/api/room/:room/status', (req, res) => {
  const rawRoom = (req.params.room || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const prefix = rawRoom.startsWith('lovechat-') ? rawRoom : `lovechat-${rawRoom}`;
  const hostId = `${prefix}-host`;
  
  const isHostOnline = activePeers.has(hostId);
  const peersInRoom = [];
  
  for (const [id, info] of activePeers.entries()) {
    if (id.startsWith(prefix)) {
      peersInRoom.push({
        id,
        isHost: id === hostId,
        connectedAt: info.connectedAt
      });
    }
  }

  res.json({
    room: prefix,
    hostOnline: isHostOnline,
    hostId: isHostOnline ? hostId : null,
    peersCount: peersInRoom.length,
    peers: peersInRoom
  });
});

app.post('/api/room/leave', (req, res) => {
  const { peerId } = req.body || {};
  if (peerId && activePeers.has(peerId)) {
    activePeers.delete(peerId);
    console.log(`[Room] Peer liberado explicitamente via /api/room/leave: ${peerId}`);
  }
  res.json({ success: true });
});

let currentHttpServer = null;

// ==========================================
// INICIAR SERVIDOR HTTP NATIVO (PORTA 3000)
// ==========================================
async function startServer() {
  if (currentHttpServer) {
    console.log('[Server] Servidor já está em execução.');
    return { httpServer: currentHttpServer };
  }

  const httpServer = http.createServer(app);
  currentHttpServer = httpServer;

  const peerServerHttp = ExpressPeerServer(httpServer, {
    debug: false,
    path: '/',
    allow_discovery: true,
    alive_timeout: 10000
  });

  peerServerHttp.on('connection', (client) => {
    const id = client.getId();
    activePeers.set(id, { id, connectedAt: Date.now() });
    console.log(`[PeerServer] Cliente conectado: ${id} (Total ativos: ${activePeers.size})`);
  });

  peerServerHttp.on('disconnect', (client) => {
    const id = client.getId();
    activePeers.delete(id);
    console.log(`[PeerServer] Cliente desconectado: ${id} (Total ativos: ${activePeers.size})`);
  });

  app.use('/peerjs', peerServerHttp);

  return new Promise((resolve, reject) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🌐 Servidor LoveChat ativo na porta ${PORT} (API + PeerJS)`);
      resolve({ httpServer });
    });
    httpServer.on('error', (err) => {
      console.error('[Server] Erro no servidor HTTP:', err);
      reject(err);
    });
  });
}

function stopServer() {
  if (currentHttpServer) {
    currentHttpServer.close();
    currentHttpServer = null;
    console.log('[Server] Servidor HTTP encerrado.');
  }
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Erro fatal ao iniciar servidor:', err);
    process.exit(1);
  });
}

module.exports = { startServer, stopServer, app };
