const test = require('node:test');
const assert = require('node:assert/strict');

test('WebRTC Engine: getModularStreamPreset calcula bitrates e resoluções com precisão', async () => {
  const { getModularStreamPreset, STREAM_RESOLUTIONS } = await import('../src/services/webrtcEngine.js');

  const p1080_60 = getModularStreamPreset('1080p', 60);
  assert.strictEqual(p1080_60.resolutionKey, '1080p');
  assert.strictEqual(p1080_60.fps, 60);
  assert.strictEqual(p1080_60.maxWidth, 1920);
  assert.strictEqual(p1080_60.maxHeight, 1080);
  assert.strictEqual(p1080_60.sdpScreenKbps, 6000);

  const p720_30 = getModularStreamPreset('720p', 30);
  assert.strictEqual(p720_30.resolutionKey, '720p');
  assert.strictEqual(p720_30.fps, 30);
  assert.strictEqual(p720_30.maxWidth, 1280);
  assert.strictEqual(p720_30.maxHeight, 720);
  assert.strictEqual(p720_30.sdpScreenKbps, 3000);

  const p1440_60 = getModularStreamPreset('1440p', 60);
  assert.strictEqual(p1440_60.maxWidth, 2560);
  assert.strictEqual(p1440_60.maxHeight, 1440);
  assert.strictEqual(p1440_60.sdpScreenKbps, 13000);

  // Fallback para preset desconhecido
  const fallback = getModularStreamPreset('invalido', 45);
  assert.strictEqual(fallback.resolutionKey, '1080p');
  assert.strictEqual(fallback.fps, 60);
});

test('WebRTC Engine: transformSDP otimiza áudio da transmissão de tela em 320 kbps estéreo 48kHz', async () => {
  const { transformSDP, getModularStreamPreset } = await import('../src/services/webrtcEngine.js');

  // SDP de exemplo simulando oferta nativa de navegador com m=audio e m=video
  const rawSdp = [
    'v=0',
    'o=- 123456789 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:96 H264/90000',
    'a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1'
  ].join('\r\n');

  const preset = getModularStreamPreset('1080p', 60);
  const transformed = transformSDP(rawSdp, true, preset);

  // 1. Verificação do Bloco de Áudio:
  // Deve conter stereo=1, sprop-stereo=1, maxaveragebitrate=320000 e 48000Hz para transmissão de alta fidelidade
  assert.ok(transformed.includes('stereo=1'), 'Deve habilitar estéreo no Opus');
  assert.ok(transformed.includes('sprop-stereo=1'), 'Deve sinalizar sprop-stereo');
  assert.ok(transformed.includes('maxaveragebitrate=320000'), 'Áudio de tela deve ter 320 kbps');
  assert.ok(transformed.includes('maxplaybackrate=48000'), 'Deve definir 48 kHz');

  // Banda explícita RFC 4566 para áudio de tela (320 kbps)
  assert.ok(transformed.includes('b=AS:320'), 'Deve injetar b=AS:320 no áudio de tela');
  assert.ok(transformed.includes('b=TIAS:320000'), 'Deve injetar b=TIAS:320000 no áudio');

  // 2. Verificação do Bloco de Vídeo:
  // Deve injetar banda do preset de vídeo (6000 kbps para 1080p60)
  assert.ok(transformed.includes('b=AS:6000'), 'Deve injetar b=AS:6000 no vídeo');
  assert.ok(transformed.includes('b=TIAS:6000000'), 'Deve injetar b=TIAS:6000000 no vídeo');
  assert.ok(transformed.includes('x-google-max-bitrate=6000'), 'Deve configurar max-bitrate do codec de vídeo');

  // 3. Integridade do SDP:
  // Quebras de linha RFC devem ser CRLF (\r\n)
  assert.ok(transformed.includes('\r\n'), 'SDP deve manter formato RFC CRLF');
  assert.ok(!transformed.includes('NaN'), 'Não deve conter valores NaN');
});

test('WebRTC Engine: transformSDP configura chamada de voz comum com 128 kbps econômico', async () => {
  const { transformSDP } = await import('../src/services/webrtcEngine.js');

  const rawVoiceSdp = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10'
  ].join('\r\n');

  // isScreen = false (chamada normal de microfone)
  const transformed = transformSDP(rawVoiceSdp, false, null);

  assert.ok(transformed.includes('maxaveragebitrate=128000'), 'Microfone deve usar 128 kbps');
  assert.ok(transformed.includes('b=AS:128'), 'Deve usar b=AS:128');
  assert.ok(transformed.includes('b=TIAS:128000'), 'Deve usar b=TIAS:128000');
  assert.ok(!transformed.includes('320000'), 'Microfone não deve ser inflado para 320 kbps de tela');
});

test('WebRTC Engine: transformSDP resiste a SDPs vazios ou malformados sem lançar exceção', async () => {
  const { transformSDP } = await import('../src/services/webrtcEngine.js');

  assert.strictEqual(transformSDP('', false), '');
  assert.strictEqual(transformSDP(null, false), null);
  assert.strictEqual(transformSDP('sdp invalido sem blocos', false), 'sdp invalido sem blocos');
});
