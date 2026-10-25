const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, getOrCreateRoomToken, setWebAccessEnabled } = require('../server.js');

let server;
let baseUrl;
let validToken;

test.before(async () => {
  validToken = getOrCreateRoomToken();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

test('1. X-Forwarded-For: 127.0.0.1 não concede privilégios locais para obter token', async () => {
  // Simulando cliente externo que enviou X-Forwarded-For forjado via túnel
  const res = await fetch(`${baseUrl}/api/auth/token`, {
    headers: {
      'X-Forwarded-For': '127.0.0.1'
    }
  });

  assert.strictEqual(res.status, 401, 'Deve rejeitar com 401 Unauthorized');
  const data = await res.json();
  assert.strictEqual(data.error, 'unauthorized');
});

test('2. Cabeçalhos de proxy reverso (cf-ray / cf-connecting-ip) são tratados estritamente como remotos', async () => {
  const res = await fetch(`${baseUrl}/api/auth/token`, {
    headers: {
      'cf-ray': '8f1234567890abcd',
      'cf-connecting-ip': '203.0.113.195'
    }
  });

  assert.strictEqual(res.status, 401, 'Deve ser bloqueado mesmo se conectado via loopback pelo tunnel');
});

test('3. Endpoints administrativos (regenerate, set-folder) rejeitam clientes remotos com 403', async () => {
  // Tentativa de regenerar token via túnel
  const resRegen = await fetch(`${baseUrl}/api/auth/regenerate`, {
    method: 'POST',
    headers: {
      'X-Forwarded-For': '203.0.113.50',
      'x-room-token': validToken
    }
  });
  assert.strictEqual(resRegen.status, 403, 'Apenas o host local pode regenerar o token');

  // Tentativa de alterar pasta do álbum no host via túnel
  const resAlbum = await fetch(`${baseUrl}/api/album/set-folder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.50',
      'x-room-token': validToken
    },
    body: JSON.stringify({ folderPath: 'C:\\Windows\\System32' })
  });
  assert.strictEqual(resAlbum.status, 403, 'Cliente remoto não pode definir pasta do host');
});

test('4. Endpoints de dados (/api/db, /api/album) rejeitam requisições sem token válido', async () => {
  const resDbBad = await fetch(`${baseUrl}/api/db`, {
    headers: {
      'X-Forwarded-For': '203.0.113.10',
      'x-room-token': 'token-falso-invalido'
    }
  });
  assert.strictEqual(resDbBad.status, 401, 'Deve rejeitar acesso ao banco sem token');

  const resDbGood = await fetch(`${baseUrl}/api/db`, {
    headers: {
      'X-Forwarded-For': '203.0.113.10',
      'x-room-token': validToken
    }
  });
  assert.strictEqual(resDbGood.status, 200, 'Deve liberar acesso ao banco com token legítimo');
  const dbData = await resDbGood.json();
  assert.ok(dbData.profiles, 'Deve retornar profiles');
});

test('5. /api/my-ip não expõe endereços internos a clientes remotos não autorizados', async () => {
  const resNoAuth = await fetch(`${baseUrl}/api/my-ip`, {
    headers: {
      'X-Forwarded-For': '203.0.113.88'
    }
  });
  assert.strictEqual(resNoAuth.status, 401, '/api/my-ip deve exigir autenticação quando remoto');

  const resAuth = await fetch(`${baseUrl}/api/my-ip`, {
    headers: {
      'X-Forwarded-For': '203.0.113.88',
      'x-room-token': validToken
    }
  });
  assert.strictEqual(resAuth.status, 200, '/api/my-ip deve responder para parceiro autenticado');
  const ipData = await resAuth.json();
  assert.ok(ipData.ip, 'Deve retornar IP para parceiro autenticado');
});

test('6. Quando a Conexão Web está desativada, requisições remotas são bloqueadas e /api/auth/web-status indica enabled: false', async () => {
  setWebAccessEnabled(false);
  try {
    const resStatus = await fetch(`${baseUrl}/api/auth/web-status`);
    const statusData = await resStatus.json();
    assert.strictEqual(statusData.enabled, false, 'Deve indicar que o acesso web está desativado');

    const resRemote = await fetch(`${baseUrl}/api/db`, {
      headers: {
        'X-Forwarded-For': '203.0.113.99',
        'x-room-token': validToken
      }
    });
    assert.strictEqual(resRemote.status, 403, 'Deve barrar cliente remoto com 403 quando web desativada');
    const remoteData = await resRemote.json();
    assert.strictEqual(remoteData.error, 'web_access_disabled');
  } finally {
    setWebAccessEnabled(true);
  }
});

test('7. App Desktop (x-lovechat-client: desktop) conecta e obtém token mesmo se acesso web público estiver desativado', async () => {
  setWebAccessEnabled(false);
  try {
    const resToken = await fetch(`${baseUrl}/api/auth/token`, {
      headers: {
        'x-lovechat-client': 'desktop'
      }
    });
    assert.strictEqual(resToken.status, 200, 'App desktop deve obter o token com sucesso');
    const tokenData = await resToken.json();
    assert.ok(tokenData.token, 'Deve conter o token da sala');

    const resDb = await fetch(`${baseUrl}/api/db`, {
      headers: {
        'x-lovechat-client': 'desktop'
      }
    });
    assert.strictEqual(resDb.status, 200, 'App desktop deve acessar API sem bloqueio de web_access_disabled');
  } finally {
    setWebAccessEnabled(true);
  }
});

test('8. /api/my-ip responde com sucesso para clientes na rede privada / ZeroTier / Localhost', async () => {
  const res = await fetch(`${baseUrl}/api/my-ip`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.ip, 'Deve retornar IP');
  assert.ok(data.hostName, 'Deve retornar hostName para descoberta');
});

test('9. isPrivateIp valida corretamente faixas ZeroTier, VPN, LAN e rejeita IPs públicos', () => {
  const { isPrivateIp } = require('../server.js');

  // Localhost & Loopback
  assert.strictEqual(isPrivateIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('::1'), true);
  assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('localhost'), true);

  // ZeroTier & VPN (10.x.x.x, 28.x.x.x)
  assert.strictEqual(isPrivateIp('10.147.20.5'), true);
  assert.strictEqual(isPrivateIp('10.244.1.100'), true);
  assert.strictEqual(isPrivateIp('28.10.20.30'), true);

  // Redes locais LAN (192.168.x.x, 172.16-31.x.x)
  assert.strictEqual(isPrivateIp('192.168.0.1'), true);
  assert.strictEqual(isPrivateIp('192.168.191.50'), true);
  assert.strictEqual(isPrivateIp('172.16.0.1'), true);
  assert.strictEqual(isPrivateIp('172.22.1.1'), true);
  assert.strictEqual(isPrivateIp('172.31.255.254'), true);

  // Tailscale CGNAT (100.64.0.0/10)
  assert.strictEqual(isPrivateIp('100.64.0.1'), true);
  assert.strictEqual(isPrivateIp('100.127.255.255'), true);

  // Link-Local (169.254.x.x, IPv6 fe80)
  assert.strictEqual(isPrivateIp('169.254.10.20'), true);
  assert.strictEqual(isPrivateIp('fe80::1ff:fe23:4567:890a'), true);

  // IPs Públicos da Internet (Devem ser estritamente bloqueados)
  assert.strictEqual(isPrivateIp('8.8.8.8'), false, 'Google DNS é público');
  assert.strictEqual(isPrivateIp('1.1.1.1'), false, 'Cloudflare DNS é público');
  assert.strictEqual(isPrivateIp('203.0.113.195'), false, 'TEST-NET público');
  assert.strictEqual(isPrivateIp('172.32.0.1'), false, 'Fora da faixa privada 172.16-31');
  assert.strictEqual(isPrivateIp('100.128.0.1'), false, 'Fora da faixa CGNAT 100.64-127');
  assert.strictEqual(isPrivateIp(null), false);
  assert.strictEqual(isPrivateIp(''), false);
});

test('10. /api/db rejeita atualizações de perfil sem token e aplica profileUpdate com token válido', async () => {
  // 1. Sem token
  const resNoAuth = await fetch(`${baseUrl}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.99'
    },
    body: JSON.stringify({ profileUpdate: { id: 'user1', name: 'Hacker' } })
  });
  assert.strictEqual(resNoAuth.status, 401, 'Deve exigir token');

  // 2. Atualização válida com token
  const resGood = await fetch(`${baseUrl}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-room-token': validToken
    },
    body: JSON.stringify({ profileUpdate: { id: 'user1', name: 'Usuário Teste' } })
  });
  assert.strictEqual(resGood.status, 200, 'Deve atualizar com sucesso');
  const data = await resGood.json();
  assert.strictEqual(data.profiles.user1.name, 'Usuário Teste');
});

test('11. /api/db protege notas contra clientes sem token e persiste atualizações', async () => {
  const resNoAuth = await fetch(`${baseUrl}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.99'
    },
    body: JSON.stringify({ notes: 'Segredo' })
  });
  assert.strictEqual(resNoAuth.status, 401, 'Notas exigem token');

  const resGood = await fetch(`${baseUrl}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-room-token': validToken
    },
    body: JSON.stringify({ notes: 'Nota de amor salva com segurança ❤️' })
  });
  assert.strictEqual(resGood.status, 200);
  const data = await resGood.json();
  assert.strictEqual(data.notes, 'Nota de amor salva com segurança ❤️');
});
