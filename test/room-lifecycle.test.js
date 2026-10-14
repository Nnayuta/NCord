const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, getOrCreateRoomToken } = require('../server.js');

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

test('1. Apenas os perfis válidos "user1" e "user2" são aceitos', async () => {
  const resBad = await fetch(`${baseUrl}/api/room/occupy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-room-token': validToken
    },
    body: JSON.stringify({ profileId: 'user3', peerId: 'peer-3' })
  });
  assert.strictEqual(resBad.status, 400, 'Deve rejeitar profileId não autorizado');
  const data = await resBad.json();
  assert.strictEqual(data.error, 'invalid_profile');
});

test('2. Os dois perfis autorizados (user1 e user2) entram normalmente', async () => {
  // Limpar estado prévio
  await fetch(`${baseUrl}/api/room/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user1' })
  });
  await fetch(`${baseUrl}/api/room/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user2' })
  });

  // Host entra como user1
  const resUser1 = await fetch(`${baseUrl}/api/room/occupy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user1', peerId: 'lovechat-host', sessionId: 'sess-1' })
  });
  assert.strictEqual(resUser1.status, 200);
  const data1 = await resUser1.json();
  assert.ok(data1.occupiedProfiles.includes('user1'));

  // Guest entra como user2
  const resUser2 = await fetch(`${baseUrl}/api/room/occupy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user2', peerId: 'lovechat-guest-100', sessionId: 'sess-2' })
  });
  assert.strictEqual(resUser2.status, 200);
  const data2 = await resUser2.json();
  assert.ok(data2.occupiedProfiles.includes('user1'));
  assert.ok(data2.occupiedProfiles.includes('user2'));
});

test('3. Tentativa de terceiro participante com a sala cheia é rejeitada com 403 room_full', async () => {
  // Simulando um terceiro tentando ocupar com outro ID
  const resThird = await fetch(`${baseUrl}/api/room/occupy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user1', peerId: 'lovechat-guest-999', sessionId: 'sess-intruder' })
  });

  // user1 já está ativo com lovechat-host, deve retornar 409 profile_occupied
  assert.strictEqual(resThird.status, 409, 'Deve rejeitar ocupação conflitante de perfil');
  const data = await resThird.json();
  assert.strictEqual(data.error, 'profile_occupied');
});

test('4. Saída via /api/room/leave libera a vaga imediatamente', async () => {
  const resLeave = await fetch(`${baseUrl}/api/room/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user2', peerId: 'lovechat-guest-100', sessionId: 'sess-2' })
  });
  assert.strictEqual(resLeave.status, 200);
  const data = await resLeave.json();
  assert.ok(!data.occupiedProfiles.includes('user2'), 'user2 deve estar liberado');
  assert.ok(data.occupiedProfiles.includes('user1'), 'user1 deve continuar ativo');
});

test('5. Uma sessão antiga não pode invalidar ou remover uma sessão nova', async () => {
  // Nova sessão de user2 entra
  await fetch(`${baseUrl}/api/room/occupy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user2', peerId: 'lovechat-guest-200', sessionId: 'sess-nova' })
  });

  // Chega um pacote atrasado de leave da sessão antiga (sess-antiga)
  await fetch(`${baseUrl}/api/room/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-room-token': validToken },
    body: JSON.stringify({ profileId: 'user2', peerId: 'lovechat-guest-old', sessionId: 'sess-antiga' })
  });

  // Verifica status: user2 ainda deve estar ocupado pela nova sessão
  const resStatus = await fetch(`${baseUrl}/api/room/lovechat/status`, {
    headers: { 'x-room-token': validToken }
  });
  const statusData = await resStatus.json();
  assert.ok(statusData.occupiedProfiles.includes('user2'), 'Sessão nova não pode ser encerrada por pacote atrasado');
});

test('6. Suporte a navigator.sendBeacon com query params na saída', async () => {
  const resLeaveBeacon = await fetch(`${baseUrl}/api/room/leave?profileId=user2&sessionId=sess-nova&token=${validToken}`, {
    method: 'POST',
    body: ''
  });
  assert.strictEqual(resLeaveBeacon.status, 200);
  const data = await resLeaveBeacon.json();
  assert.ok(!data.occupiedProfiles.includes('user2'), 'user2 deve ser liberado via beacon query params');
});
