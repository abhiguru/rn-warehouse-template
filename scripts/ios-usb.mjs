import http from 'node:http';
import net from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { networkInterfaces } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isMain } from './is-main.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export const isLinkLocal = address => net.isIPv4(address) && address.startsWith('169.254.') &&
  !['0', '255'].includes(address.split('.')[2]);

export function selectUsbAddress(registry, interfaces) {
  const names = [...registry.matchAll(/"BSD Name"\s*=\s*"(en\d+)"/g)].map(match => match[1]);
  const candidates = names.flatMap(name => (interfaces[name] || [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal && isLinkLocal(entry.address))
    .map(entry => ({ name, address: entry.address })));
  if (candidates.length > 1) throw new Error('Multiple USB IPv4 links found; connect only the test iPhone.');
  return candidates[0] || null;
}

function discover() {
  if (process.platform !== 'darwin') throw new Error('USB iPhone development requires macOS.');
  // Restrict discovery to Apple's USB NCM driver, never a Wi-Fi/LAN interface
  // that happens to have a self-assigned address. No device IDs are logged.
  return selectUsbAddress(execFileSync('/usr/sbin/ioreg', ['-r', '-c', 'AppleUSBNCMData', '-l'], {
    encoding: 'utf8', timeout: 5000,
  }), networkInterfaces());
}

export function rewriteConfig(value, apiPort, publicOrigin) {
  if (typeof value === 'string') {
    for (const host of ['localhost', '127.0.0.1']) {
      for (const scheme of ['http', 'ws']) {
        const origin = `${scheme}://${host}:${apiPort}`;
        if (value === origin || value.startsWith(origin + '/')) {
          return publicOrigin.replace(/^http/, scheme) + value.slice(origin.length);
        }
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(item => rewriteConfig(item, apiPort, publicOrigin));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, rewriteConfig(item, apiPort, publicOrigin)]));
  return value;
}

export function createApiRelay({ apiPort, publicOrigin }) {
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
      response.writeHead(400).end(); return;
    }
    const pathname = request.url.split('?')[0];
    const configuration = ['get-public-config', 'get-config', 'generate-grn-pdf',
      'generate-dispatch-pdf', 'generate-invoice-pdf', 'generate-customer-stock-pdf']
      .some(name => pathname === `/functions/v1/${name}`);
    const upstream = http.request({
      hostname: '127.0.0.1', port: apiPort, path: request.url, method: request.method,
      headers: { ...request.headers, host: `localhost:${apiPort}`, 'accept-encoding': 'identity' },
      timeout: 60000,
    }, incoming => {
      if (!configuration) {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response); return;
      }
      const chunks = [];
      let size = 0;
      incoming.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) { incoming.destroy(); response.destroy(); return; }
        chunks.push(chunk);
      });
      incoming.on('error', () => response.destroy());
      incoming.on('end', () => {
        try {
          const body = Buffer.from(JSON.stringify(rewriteConfig(
            JSON.parse(Buffer.concat(chunks).toString()), apiPort, publicOrigin
          )));
          const headers = { ...incoming.headers, 'content-length': String(body.length), 'cache-control': 'no-store' };
          delete headers['transfer-encoding']; delete headers['content-encoding'];
          response.writeHead(incoming.statusCode, headers).end(body);
        } catch { response.writeHead(502).end('Invalid configuration response'); }
      });
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502).end('Local demo unavailable');
      else response.destroy();
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    // Keep the destination fixed to this checkout's gateway. Authentication is
    // still enforced there; forward its original headers and query unchanged.
    if (request.method !== 'GET' || request.url?.split('?')[0] !== '/realtime/v1/websocket' ||
        request.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    let peer;
    const upstream = http.request({ hostname: '127.0.0.1', port: apiPort,
      path: request.url, method: 'GET',
      headers: { ...request.headers, host: `localhost:${apiPort}` }, timeout: 10000,
    });
    socket.on('error', () => { upstream.destroy(); peer?.destroy(); });
    socket.once('close', () => { upstream.destroy(); peer?.destroy(); });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    upstream.on('response', response => {
      socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      response.resume();
    });
    upstream.on('upgrade', (response, upgraded, upstreamHead) => {
      peer = upgraded;
      if (socket.destroyed) { upgraded.destroy(); return; }
      upstream.setTimeout(0);
      upgraded.setTimeout(0);
      upgraded.on('error', () => socket.destroy());
      upgraded.once('close', () => socket.destroy());
      const headers = response.rawHeaders;
      let reply = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`;
      for (let index = 0; index < headers.length; index += 2) reply += `${headers[index]}: ${headers[index + 1]}\r\n`;
      socket.write(reply + '\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upgraded.write(head);
      socket.pipe(upgraded).pipe(socket);
    });
    upstream.end();
  });
  return server;
}

const listen = (server, host, port) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
});

export function parseOptions(args) {
  const command = args.shift() || 'status';
  if (!['start', 'prepare', 'status'].includes(command)) throw new Error('Use start, prepare or status.');
  const options = { command, apiPort: 18000, metroPort: 8081, internalMetroPort: 8082 };
  const names = { '--api-port': 'apiPort', '--metro-port': 'metroPort', '--internal-metro-port': 'internalMetroPort' };
  while (args.length) {
    const key = names[args.shift()];
    const raw = args.shift();
    if (!key || !/^\d+$/.test(raw || '') || +raw < 1024 || +raw > 65535) throw new Error('Expected a port from 1024 to 65535.');
    options[key] = +raw;
  }
  if (new Set([options.apiPort, options.metroPort, options.internalMetroPort]).size !== 3) throw new Error('Ports must be distinct.');
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let selected = discover();
  if (options.command !== 'start') {
    if (!selected) throw new Error('No USB link-local IPv4 address. Connect, unlock and trust the iPhone.');
    console.log(`USB interface ${selected.name}; API http://${selected.address}:${options.apiPort}; Metro http://${selected.address}:${options.metroPort}`);
    if (options.command === 'prepare') {
      execFileSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'ios', '--no-install'], {
        cwd: root, stdio: 'inherit', env: { ...process.env, WAREHOUSE_IOS_USB_HOST: `${selected.address}:${options.metroPort}` },
      });
    }
    return;
  }
  mkdirSync(join(root, '.expo'), { recursive: true });
  const lock = join(root, '.expo/ios-usb.lock');
  const token = randomUUID();
  try {
    const previous = JSON.parse(readFileSync(lock, 'utf8'));
    if (!Number.isInteger(previous.pid) || previous.pid < 1) throw new Error('Invalid USB lock; inspect it manually.');
    try { process.kill(previous.pid, 0); throw new Error('USB helper may already be running. Stop it in its terminal; no process was killed.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    unlinkSync(lock);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
  const servers = [];
  const sockets = new Set();
  let metro;
  let shuttingDown = false;
  let timer;
  let generation = '';
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); };
  async function stopGeneration() {
    const child = metro;
    metro = undefined;
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => { clearTimeout(killTimer); resolve(); });
        child.kill('SIGTERM');
      });
    }
  }
  async function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true; clearTimeout(timer);
    await stopGeneration();
    if (JSON.parse(readFileSync(lock, 'utf8')).token === token) unlinkSync(lock);
    process.exitCode = code;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void shutdown(0));
  async function reconcile() {
    if (shuttingDown) return;
    try {
      selected = discover();
      const next = selected ? `${selected.name}/${selected.address}` : '';
      if (next !== generation) {
        await stopGeneration();
        if (shuttingDown) return;
        generation = next;
        if (!selected) console.log('USB disconnected: owned relays and Metro stopped. Waiting for reconnect.');
        else {
          const origin = `http://${selected.address}:${options.apiPort}`;
          const api = createApiRelay({ apiPort: options.apiPort, publicOrigin: origin });
          api.on('connection', track); servers.push(api);
          await listen(api, selected.address, options.apiPort);
          const proxy = net.createServer(socket => {
            track(socket);
            const upstream = net.connect(options.internalMetroPort, '127.0.0.1');
            track(upstream);
            socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
            socket.once('close', () => upstream.destroy()); upstream.once('close', () => socket.destroy());
            socket.pipe(upstream).pipe(socket);
          });
          servers.push(proxy); await listen(proxy, selected.address, options.metroPort);
          metro = spawn(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'start', '--localhost', '--port', String(options.internalMetroPort), '--max-workers', '2'], {
            cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1',
              EXPO_PUBLIC_CONFIG_API_URL: origin, WAREHOUSE_NO_WATCHMAN: '1', WAREHOUSE_USB_METRO: '1' },
          });
          metro.on('error', () => { console.error('Metro could not start.'); void shutdown(1); });
          metro.on('exit', () => { if (!shuttingDown && generation === next && metro) {
            console.error('Metro exited; stop/restart the helper after resolving its error.'); void shutdown(1);
          } });
          console.log(`USB ready on ${selected.name}. API ${origin}; Metro http://${selected.address}:${options.metroPort}.`);
          console.log('After first connection or address change, run the prepare command again and rebuild/install Debug in Xcode. The app fails closed until its origin is updated.');
        }
      }
    } catch (error) { console.error(error.message); await shutdown(1); return; }
    if (!shuttingDown) timer = setTimeout(reconcile, 1500);
  }
  // Force the first connected address to start its listeners.
  generation = '';
  console.log('USB helper owns only its listeners and Metro child. Ctrl-C stops them. Waiting for USB if absent.');
  await reconcile();
}

if (isMain(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
