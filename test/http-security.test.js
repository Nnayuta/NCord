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
