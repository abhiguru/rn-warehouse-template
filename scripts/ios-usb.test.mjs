import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { createRequire } from 'node:module';
import { selectUsbAddress, rewriteConfig, parseOptions, createApiRelay } from './ios-usb.mjs';

test('USB relay carries Realtime upgrades and both directions of socket data', { timeout: 3000 }, async t => {
  const sockets = new Set();
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const track = socket => { sockets.add(socket); socket.once('close', () => {
    sockets.delete(socket);
    if (!sockets.size) resolveClosed();
  }); };
  const upstream = http.createServer();
  upstream.on('connection', track);
  upstream.on('upgrade', (request, socket, head) => {
    assert.equal(request.url, '/realtime/v1/websocket?apikey=fictional&vsn=1.0.0');
    assert.equal(request.headers.authorization, 'Bearer fictional');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    if (head.length) socket.write(head);
    socket.pipe(socket);
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const relay = createApiRelay({ apiPort: upstream.address().port, publicOrigin: 'http://169.254.43.183:28000' });
  relay.on('connection', track);
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const socket of sockets) socket.destroy(); relay.close(); upstream.close(); });
  const client = net.connect(relay.address().port, '127.0.0.1');
  track(client);
  const received = [];
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime WebSocket upgrade did not cross USB relay')), 1000);
    client.on('error', error => { clearTimeout(timeout); reject(error); });
    client.on('data', chunk => {
      received.push(chunk);
      const text = Buffer.concat(received).toString();
      if (text.includes('early-frame') && !text.includes('later-frame')) client.write('later-frame');
      if (text.includes('later-frame')) { clearTimeout(timeout); resolve(text); }
    });
  });
  client.write('GET /realtime/v1/websocket?apikey=fictional&vsn=1.0.0 HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nAuthorization: Bearer fictional\r\n\r\nearly-frame');
  assert.match(await response, /^HTTP\/1\.1 101 /);
  client.destroy();
  await closed;
  assert.equal(sockets.size, 0, 'disconnect closes both relay and upstream sockets');
});

test('Realtime relay preserves gateway denial and rejects unrelated upgrade paths', { timeout: 3000 }, async t => {
  let requests = 0;
  const upstream = http.createServer((request, response) => { requests++; response.writeHead(401).end(); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const relay = createApiRelay({ apiPort: upstream.address().port, publicOrigin: 'http://169.254.43.183:28000' });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(() => { relay.close(); upstream.close(); });
  const upgrade = path => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: relay.address().port, path,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket' }, timeout: 1000 }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('timeout', () => request.destroy(new Error('Upgrade rejection timed out')));
    request.on('error', reject); request.end();
  });
  assert.equal(await upgrade('/realtime/v1/websocket?apikey=fictional'), 401);
  assert.equal(await upgrade('//example.test/realtime/v1/websocket'), 400);
  assert.equal(await upgrade('/other'), 400);
  assert.equal(requests, 1);
});

test('USB discovery never selects Wi-Fi and rejects ambiguous physical links', () => {
  const entry = address => [{ family: 'IPv4', internal: false, address }];
  const interfaces = { en0: entry('169.254.5.2'), en9: entry('192.168.1.2'), en10: entry('169.254.43.183') };
  assert.deepEqual(selectUsbAddress('"BSD Name" = "en10"', interfaces), { name: 'en10', address: '169.254.43.183' });
  assert.equal(selectUsbAddress('"BSD Name" = "en9"', interfaces), null);
  assert.equal(selectUsbAddress('', interfaces), null);
  assert.throws(() => selectUsbAddress('"BSD Name" = "en0"\n"BSD Name" = "en10"', interfaces), /Multiple/);
});

test('configuration changes exact local origins only, preserving signed paths', () => {
  const input = { a: 'http://localhost:28000/storage/v1/object/sign/demo?a=b', b: ['ws://127.0.0.1:28000/realtime', 'http://localhost:280001/x', 'https://example.test/x'], c: null };
  assert.deepEqual(rewriteConfig(input, 28000, 'http://169.254.43.183:28000'), {
    a: 'http://169.254.43.183:28000/storage/v1/object/sign/demo?a=b',
    b: ['ws://169.254.43.183:28000/realtime', 'http://localhost:280001/x', 'https://example.test/x'], c: null,
  });
});

test('ports must be distinct, unprivileged, and valid', () => {
  assert.equal(parseOptions(['start', '--api-port', '28000']).apiPort, 28000);
  for (const args of [['start', '--api-port', '80'], ['start', '--api-port', '8081'], ['start', '--bad', '9000'], ['bad']]) {
    assert.throws(() => parseOptions(args));
  }
});

test('relay preserves request method/body and document bytes; rewrites only configuration', async t => {
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/functions/v1/get-config' || req.url === '/functions/v1/generate-grn-pdf') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ api: `http://localhost:${upstream.address().port}/storage` }));
      } else { res.setHeader('X-Method', req.method); res.end(Buffer.concat(chunks)); }
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const relay = createApiRelay({ apiPort: upstream.address().port, publicOrigin: 'http://169.254.43.183:28000' });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(() => relay.close());
  const base = `http://127.0.0.1:${relay.address().port}`;
  const config = await fetch(base + '/functions/v1/get-config');
  assert.deepEqual(await config.json(), { api: 'http://169.254.43.183:28000/storage' });
  const pdfLink = await fetch(base + '/functions/v1/generate-grn-pdf', { method: 'POST' });
  assert.deepEqual(await pdfLink.json(), { api: 'http://169.254.43.183:28000/storage' });
  const bytes = Buffer.from([0, 255, 3, 128, 9]);
  const file = await fetch(base + '/private.pdf', { method: 'POST', body: bytes });
  assert.equal(file.headers.get('x-method'), 'POST');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
});

test('USB plugin emits valid debug Swift for explicit and implicit return templates', () => {
  const require = createRequire(import.meta.url);
  const withIosUsb = require('../plugins/with-ios-usb.js');
  const original = process.env.WAREHOUSE_IOS_USB_HOST;
  try {
    process.env.WAREHOUSE_IOS_USB_HOST = '169.254.43.183:8081';
    for (const prefix of ['', 'return ']) {
      const config = withIosUsb({ name: 'Test', slug: 'test' });
      const content = `#if DEBUG\n    ${prefix}RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")\n#else\n    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")\n#endif`;
      assert.ok(config.mods.ios.appDelegate);
      const patched = withIosUsb.patchBundle(content);
      assert.ok(patched.includes('#if DEBUG\n    if let host'));
      assert.ok(!patched.includes('return if let'));
      assert.ok(patched.includes('#else\n    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")'));
      assert.equal(withIosUsb.patchBundle(patched), patched);
    }
    process.env.WAREHOUSE_IOS_USB_HOST = '192.168.1.2:8081';
    assert.throws(() => withIosUsb({ name: 'Test', slug: 'test' }), /USB link-local/);
  } finally {
    if (original === undefined) delete process.env.WAREHOUSE_IOS_USB_HOST;
    else process.env.WAREHOUSE_IOS_USB_HOST = original;
  }
});
