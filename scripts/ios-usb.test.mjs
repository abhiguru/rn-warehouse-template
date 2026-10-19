import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { selectUsbAddress, rewriteConfig, parseOptions, createApiRelay } from './ios-usb.mjs';

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
