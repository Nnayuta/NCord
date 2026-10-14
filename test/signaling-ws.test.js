const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');
const { verifyWebSocketClient, getOrCreateRoomToken } = require('../server.js');

let server;
let wss;
let baseUrl;
let validToken;

test.before(async () => {
  validToken = getOrCreateRoomToken();
  server = http.createServer();
  wss = new WebSocketServer({
    server,
    path: '/peerjs/peerjs',
    verifyClient: verifyWebSocketClient
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `ws://127.0.0.1:${port}`;
});

test.after(async () => {
  if (wss) {
    wss.close();
  }
  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

test('1. Handshake WebSocket do PeerJS sem token válido é rejeitado com 401', async () => {
  const wsUrl = `${baseUrl}/peerjs/peerjs?key=peerjs&id=unauthorized-peer&token=token-invalido`;
  let rejected = false;

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'X-Forwarded-For': '203.0.113.123'
      }
    });

    ws.on('unexpected-response', (req, res) => {
      if (res.statusCode === 401) {
        rejected = true;
      }
      resolve();
    });

    ws.on('open', () => {
      ws.close();
      resolve();
    });

    ws.on('error', () => {
      resolve();
    });
  });

  assert.strictEqual(rejected, true, 'O handshake WebSocket deve ser barrado com HTTP 401');
});

test('2. Handshake WebSocket do PeerJS com token válido é aceito com sucesso', async () => {
  const wsUrl = `${baseUrl}/peerjs/peerjs?key=peerjs&id=authorized-test-peer&token=${validToken}`;
  let connected = false;

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'X-Forwarded-For': '203.0.113.123'
      }
    });

    ws.on('open', () => {
      connected = true;
      ws.close();
      resolve();
    });

    ws.on('unexpected-response', () => {
      resolve();
    });

    ws.on('error', () => {
      resolve();
    });
  });

  assert.strictEqual(connected, true, 'O handshake WebSocket com token legítimo deve conectar');
});

test('3. Handshake WebSocket local legítimo do Electron Host é aceito', async () => {
  const wsUrl = `${baseUrl}/peerjs/peerjs?key=peerjs&id=host-local-peer`;
  let connected = false;

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      connected = true;
      ws.close();
      resolve();
    });

    ws.on('error', () => {
      resolve();
    });
  });

  assert.strictEqual(connected, true, 'O handshake WebSocket local do host deve conectar');
});
