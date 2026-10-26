import {
  LAN_STICK_MS,
  NETWORK_KNOWN_WAIT_MS,
  PROBE_BACKOFF_MS,
  PROBE_TIMEOUT_MS,
  PUBLIC_HEADERS_TIMEOUT_MS,
  PUBLIC_PROBE_INTERVAL_MS,
  answeredPath,
  getConnectionPath,
  getLanStatus,
  isTunnelFailure,
  lanUsableHere,
  noteNativeReadFailed,
  noteNetworkState,
  notePublicUnreachable,
  probeLan,
  probePublic,
  publicAnswered,
  resetLanTransport,
  setLanContext,
  subscribeLanStatus,
  toCanonicalUrl,
  transportFetch,
  viaCurrentPath,
} from '../lanTransport';
import {
  ETHERNET,
  HOME_WIFI,
  MOBILE_DATA,
  NO_NETWORK,
  OTHER_WIFI_SAME_RANGE,
  WAREHOUSE_WIFI,
  WIFI_UNKNOWN_SUBNET,
  onWarehouseWifi,
} from '@/tests/helpers/lanNetwork';

const PUBLIC = 'https://warehouse.example.test';
const LAN = 'http://192.168.1.20:8080';
const INSTANCE = 'instance-0001';
const originalFetch = global.fetch;

type PublicState = 'up' | 'down' | '530' | 'hang' | 'slow-up' | '429' | '503' | 'cf502';
type LanState = 'up' | 'down' | 'hang' | 'stale-keys' | 'refused' | 'other-device' | 'wrong-instance';
const net: { public: PublicState; lan: LanState } = { public: 'up', lan: 'up' };
let calls: string[];
let signals: Record<string, AbortSignal | undefined>;

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Response => {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => body,
    clone: () => reply(status, body, headers),
    body: null,
  };
  return response as unknown as Response;
};

const hang = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  });

const identity = (instanceId = INSTANCE) => ({ success: true, data: { instanceId } });

function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  calls.push(`${init?.method ?? 'GET'} ${url}`);
  signals[url] = init?.signal ?? undefined;
  if (url.startsWith(PUBLIC)) {
    switch (net.public) {
      case 'down':
        return Promise.reject(new TypeError('Network request failed'));
      case '530':
        return Promise.resolve(reply(530, 'error code: 1033'));
      case '429':
        // The functions limit, shared by every phone behind the facility's address: the gateway answers.
        return Promise.resolve(reply(429, { message: 'Too many requests' }, { 'X-Warehouse-Path': 'public' }));
      case '503':
        return Promise.resolve(reply(503, { message: 'Service unavailable' }, { 'X-Warehouse-Path': 'public' }));
      case 'cf502':
        // Cloudflare's own error page: the tunnel is up, the origin is not. No gateway header.
        return Promise.resolve(reply(502, '<html>Bad gateway</html>'));
      case 'hang':
        return hang(init?.signal);
      case 'slow-up':
        // Answers the probes at once and everything else only after 6 s.
        if (url.endsWith('/hello')) return Promise.resolve(reply(200, 'Hello from Edge Functions!', { 'X-Warehouse-Path': 'public' }));
        return new Promise(resolve => setTimeout(() => resolve(reply(200, { from: 'public' }, { 'X-Warehouse-Path': 'public' })), 6000));
      default:
        return Promise.resolve(reply(200, url.endsWith('/hello') ? 'Hello from Edge Functions!' : { from: 'public' }, { 'X-Warehouse-Path': 'public' }));
    }
  }
  if (url.startsWith(LAN)) {
    const lanHeaders = { 'X-Warehouse-Path': 'lan' };
    switch (net.lan) {
      case 'down':
        return Promise.reject(new TypeError('Network request failed'));
      case 'hang':
        return hang(init?.signal);
      case 'refused':
        return Promise.resolve(reply(403, '<html>403 Forbidden</html>', lanHeaders));
      case 'other-device':
        return Promise.resolve(reply(200, 'Hello from another device'));
      case 'stale-keys':
        if (url.includes('/rest/v1/')) return Promise.resolve(reply(401, { message: 'Unauthorized' }, lanHeaders));
        break;
      case 'wrong-instance':
        if (url.endsWith('/get-public-config')) return Promise.resolve(reply(200, identity('instance-OTHER'), lanHeaders));
        break;
      default:
        break;
    }
    if (url.endsWith('/get-public-config')) return Promise.resolve(reply(200, identity(), lanHeaders));
    if (url.endsWith('/hello')) return Promise.resolve(reply(200, 'Hello from Edge Functions!', lanHeaders));
    return Promise.resolve(reply(200, { from: 'lan' }, lanHeaders));
  }
  if (url.startsWith('https://other.example.test/')) return Promise.resolve(reply(200, {}));
  return Promise.reject(new Error(`unexpected request ${url}`));
}

const READ = { read: true } as const;
const WRITE = { read: false } as const;
const rest = (name = 'items') => `${PUBLIC}/rest/v1/${name}`;
const lanRest = (name = 'items') => `${LAN}/rest/v1/${name}`;
const probesOnly = (list: string[]) => list.filter(call => /\/(hello|get-public-config)$/.test(call));
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-26T10:00:00Z'));
  net.public = 'up';
  net.lan = 'up';
  calls = [];
  signals = {};
  global.fetch = jest.fn(route) as unknown as typeof fetch;
  resetLanTransport();
  setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: INSTANCE });
  onWarehouseWifi();
});

afterEach(() => {
  resetLanTransport();
  jest.useRealTimers();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('with no warehouse network address', () => {
  it('is exactly fetch(input, init), whatever happens', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: INSTANCE });
    const init = { method: 'POST', headers: { a: 'b' } };
    net.public = 'down';
    await expect(transportFetch(rest(), init, WRITE)).rejects.toThrow('Network request failed');
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(global.fetch)).toHaveBeenCalledWith(rest(), init);
    setLanContext(null);
    net.public = 'up';
    await transportFetch(rest(), undefined, READ);
    expect(jest.mocked(global.fetch)).toHaveBeenLastCalledWith(rest(), undefined);
  });

  it('is exactly fetch for an address that is not the facility', async () => {
    await transportFetch('https://other.example.test/x', { method: 'GET' }, READ);
    expect(jest.mocked(global.fetch)).toHaveBeenCalledWith('https://other.example.test/x', { method: 'GET' });
  });
});

describe('while the public path works', () => {
  it('sends one request over it and probes nothing', async () => {
    const response = await transportFetch(rest(), { method: 'GET' }, READ);
    expect(await response.json()).toEqual({ from: 'public' });
    expect(calls).toEqual([`GET ${rest()}`]);
    expect(getConnectionPath()).toBe('public');
  });

  it('does not touch a request the caller aborted', async () => {
    net.public = 'hang';
    const controller = new AbortController();
    const pending = transportFetch(rest(), { signal: controller.signal }, READ);
    const settled = expect(pending).rejects.toThrow('Aborted');
    await flush();
    controller.abort();
    await settled;
    expect(probesOnly(calls)).toEqual([]);
    expect(getConnectionPath()).toBe('public');
  });
});

describe('when the public path fails', () => {
  it('asks the LAN address, switches, and sends the failed READ once more there', async () => {
    net.public = 'down';
    const response = await transportFetch(rest(), { method: 'GET', headers: { apikey: 'k' } }, READ);
    expect(await response.json()).toEqual({ from: 'lan' });
    expect(answeredPath(response)).toBe('lan');
    expect(getConnectionPath()).toBe('lan');
    // The probes carry no credential and no header; the retry carries the request's own.
    const probes = probesOnly(calls);
    expect(probes).toEqual(
      expect.arrayContaining([`GET ${PUBLIC}/functions/v1/hello`, `GET ${LAN}/functions/v1/hello`, `GET ${LAN}/functions/v1/get-public-config`])
    );
    expect(calls.filter(call => call === `GET ${lanRest()}`)).toHaveLength(1);
    expect(calls.filter(call => call === `GET ${rest()}`)).toHaveLength(1);
    const retry = jest.mocked(global.fetch).mock.calls.find(([input]) => input === lanRest());
    expect(retry?.[1]?.headers).toEqual({ apikey: 'k' });
  });

  it('never sends a WRITE again: it fails as it did, and the next request goes over the LAN path', async () => {
    net.public = 'down';
    await expect(transportFetch(rest('rpc/save_grn'), { method: 'POST', body: '{}' }, WRITE)).rejects.toThrow('Network request failed');
    expect(calls.filter(call => call.includes('/rest/v1/rpc/save_grn'))).toEqual([`POST ${rest('rpc/save_grn')}`]);
    expect(getConnectionPath()).toBe('lan');
    // The person re-asks through the lost-answer rule: that request is the first over the LAN path.
    const response = await transportFetch(rest('rpc/save_grn'), { method: 'POST', body: '{}' }, WRITE);
    expect(answeredPath(response)).toBe('lan');
    expect(calls.filter(call => call === 'POST ' + lanRest('rpc/save_grn'))).toHaveLength(1);
    expect(calls.filter(call => call === 'POST ' + rest('rpc/save_grn'))).toHaveLength(1);
  });

  it('treats a Cloudflare 530 as the public path being down', async () => {
    net.public = '530';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
    // 530 proves the path down: its own hello is not asked.
    expect(calls).not.toContain(`GET ${PUBLIC}/functions/v1/hello`);
  });

  it('hands the 530 to the caller when the LAN path is down too (as before the fallback)', async () => {
    net.public = '530';
    net.lan = 'down';
    const response = await transportFetch(rest(), undefined, READ);
    expect(response.status).toBe(530);
    expect(getConnectionPath()).toBe('public');
  });

  it('rethrows the original error when the LAN path is down too', async () => {
    net.public = 'down';
    net.lan = 'down';
    const failure = new TypeError('Network request failed');
    jest.mocked(global.fetch).mockImplementation((input, init) => (String(input).startsWith(PUBLIC) ? Promise.reject(failure) : route(input, init)));
    await expect(transportFetch(rest(), undefined, READ)).rejects.toBe(failure);
    expect(getConnectionPath()).toBe('public');
  });

  it('does not switch when the public path answers its own hello: the request was at fault', async () => {
    let first = true;
    jest.mocked(global.fetch).mockImplementation((input, init) => {
      if (String(input) === rest() && first) {
        first = false;
        return Promise.reject(new TypeError('Network request failed'));
      }
      return route(input, init);
    });
    await expect(transportFetch(rest(), undefined, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
    // Nothing was sent to the LAN address: the public path answered, so the other address was not asked.
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
  });

  it('stays on the public path when the LAN address belongs to another warehouse', async () => {
    net.public = 'down';
    net.lan = 'wrong-instance';
    await expect(transportFetch(rest(), undefined, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
    expect(calls.some(call => call.includes(`${LAN}/rest/`))).toBe(false);
  });

  it('stays on the public path when something else answers at the LAN address', async () => {
    net.public = 'down';
    net.lan = 'other-device';
    await expect(transportFetch(rest(), undefined, READ)).rejects.toThrow('Network request failed');
    expect(calls.some(call => call.includes(`${LAN}/rest/`))).toBe(false);
  });

  it('shares one probe between requests that fail together, and does not probe again for 15 s', async () => {
    net.public = 'down';
    net.lan = 'down';
    await Promise.allSettled([transportFetch(rest('a'), undefined, READ), transportFetch(rest('b'), undefined, READ), transportFetch(rest('c'), undefined, READ)]);
    expect(calls.filter(call => call === `GET ${LAN}/functions/v1/hello`)).toHaveLength(1);
    const before = calls.length;
    await Promise.allSettled([transportFetch(rest('d'), undefined, READ)]);
    expect(calls.slice(before).filter(call => call.includes('/hello'))).toEqual([]);
    jest.advanceTimersByTime(PROBE_BACKOFF_MS + 1);
    net.lan = 'up';
    const response = await transportFetch(rest('e'), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
  });

  it('reports a change of path to those who listen', async () => {
    const seen: string[] = [];
    const stop = subscribeLanStatus(() => seen.push(getLanStatus().path));
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    stop();
    expect(seen).toEqual(['lan']);
  });
});

describe('a request that gets no response headers', () => {
  it('is given PUBLIC_HEADERS_TIMEOUT_MS, then the path is judged; a READ is stopped and sent over the LAN path', async () => {
    net.public = 'hang';
    let result: Response | undefined;
    const pending = transportFetch(rest(), undefined, READ).then(value => (result = value));
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS - 1);
    expect(probesOnly(calls)).toEqual([]);
    expect(result).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    // The public hello hangs as well; the LAN address answers at once.
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await pending;
    expect(answeredPath(result as Response)).toBe('lan');
    expect(signals[rest()]?.aborted).toBe(true);
    expect(getConnectionPath()).toBe('lan');
  });

  it('is waited for to the end when the public path answers its own hello: only the server was slow', async () => {
    net.public = 'slow-up';
    let result: Response | undefined;
    const pending = transportFetch(rest(), undefined, READ).then(value => (result = value));
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS + 100);
    expect(getConnectionPath()).toBe('public');
    expect(signals[rest()]?.aborted).toBeFalsy();
    await jest.advanceTimersByTimeAsync(3000);
    await pending;
    expect(await (result as Response).json()).toEqual({ from: 'public' });
    expect(calls.filter(call => call.includes('/rest/v1/items'))).toHaveLength(1);
    expect(getConnectionPath()).toBe('public');
    // A slow request made the phone ask the public hello, and nothing at all of the LAN address.
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
  });

  it('a slow WRITE starts no path check at all: it waits for its own answer and the next request still goes public', async () => {
    net.public = 'slow-up';
    let result: Response | undefined;
    const pending = transportFetch(rest('rpc/save_grn'), { method: 'POST' }, WRITE).then(value => (result = value));
    // The upload-sized answer takes 6 s; a read would have started a check after 4 s.
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS + 1000);
    expect(probesOnly(calls)).toEqual([]);
    expect(getConnectionPath()).toBe('public');
    expect(result).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1500);
    await pending;
    expect(await (result as Response).json()).toEqual({ from: 'public' });
    expect(probesOnly(calls)).toEqual([]);
    expect(calls.filter(call => call.includes('save_grn'))).toEqual([`POST ${rest('rpc/save_grn')}`]);
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
  });

  it('a slow WRITE on a path that never answers is not sent again and moves nobody', async () => {
    net.public = 'hang';
    const controller = new AbortController();
    const pending = transportFetch(rest('rpc/save_grn'), { method: 'POST', signal: controller.signal }, WRITE);
    const settled = expect(pending).rejects.toThrow('Aborted');
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS + PROBE_TIMEOUT_MS + 1000);
    expect(probesOnly(calls)).toEqual([]);
    expect(getConnectionPath()).toBe('public');
    controller.abort();
    await settled;
    expect(calls.filter(call => call.includes('save_grn'))).toEqual([`POST ${rest('rpc/save_grn')}`]);
  });
});

describe('sticking to the LAN path and returning', () => {
  beforeEach(async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    expect(getConnectionPath()).toBe('lan');
    calls = [];
  });

  it('goes straight to the LAN address, with no public attempt, while the stick lasts', async () => {
    net.public = 'up';
    jest.advanceTimersByTime(LAN_STICK_MS - 1000);
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
    expect(calls).toEqual([`GET ${lanRest()}`]);
  });

  it('asks the public hello once the stick has expired and goes back when it answers', async () => {
    net.public = 'up';
    await jest.advanceTimersByTimeAsync(LAN_STICK_MS + 1);
    await flush();
    expect(calls).toEqual([`GET ${PUBLIC}/functions/v1/hello`]);
    expect(getConnectionPath()).toBe('public');
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('public');
  });

  it('asks the public hello at most once per interval while it does not answer', async () => {
    await jest.advanceTimersByTimeAsync(LAN_STICK_MS + 1);
    await flush();
    expect(calls.filter(call => call === `GET ${PUBLIC}/functions/v1/hello`)).toHaveLength(1);
    // Requests in between do not ask again.
    for (let i = 0; i < 5; i++) await transportFetch(rest(`n${i}`), undefined, READ);
    await jest.advanceTimersByTimeAsync(PUBLIC_PROBE_INTERVAL_MS - 5000);
    await flush();
    expect(calls.filter(call => call === `GET ${PUBLIC}/functions/v1/hello`)).toHaveLength(1);
    expect(getConnectionPath()).toBe('lan');
    net.public = 'up';
    await jest.advanceTimersByTimeAsync(5001);
    await flush();
    expect(calls.filter(call => call === `GET ${PUBLIC}/functions/v1/hello`)).toHaveLength(2);
    expect(getConnectionPath()).toBe('public');
  });

  it('is also driven by a request after the stick (a phone that slept past the timer)', async () => {
    jest.setSystemTime(Date.now() + LAN_STICK_MS + 5000);
    net.public = 'up';
    await transportFetch(rest(), undefined, READ);
    await flush();
    expect(calls).toContain(`GET ${PUBLIC}/functions/v1/hello`);
    expect(getConnectionPath()).toBe('public');
  });

  it('goes back to the public path at once when the LAN path fails and the public path answers', async () => {
    net.public = 'up';
    net.lan = 'down';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('public');
    expect(getConnectionPath()).toBe('public');
  });
});

describe('the gateway key rejection over the LAN path (WS-L review H1)', () => {
  beforeEach(async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ); // onto the LAN path
    calls = [];
  });

  it('is never handed to the caller: the read goes back to the public path when it answers', async () => {
    net.lan = 'stale-keys';
    net.public = 'up';
    const response = await transportFetch(rest('customers'), { headers: { apikey: 'k' } }, READ);
    expect(response.status).toBe(200);
    expect(answeredPath(response)).toBe('public');
    expect(getConnectionPath()).toBe('public');
    expect(calls).toContain(`GET ${lanRest('customers')}`);
  });

  it('is a failure of the LAN path, not an answer, when the public path is down too: "old configuration"', async () => {
    net.lan = 'stale-keys';
    net.public = 'down';
    const error = await transportFetch(rest('customers'), undefined, READ).catch(failure => failure);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe('Network request failed');
    expect(getLanStatus().failure).toBe('old-configuration');
  });

  it('is not handed over for a WRITE either, and the write is not sent again', async () => {
    net.lan = 'stale-keys';
    net.public = 'up';
    await expect(transportFetch(rest('rpc/refresh_jwt_token'), { method: 'POST' }, WRITE)).rejects.toThrow('Network request failed');
    expect(calls.filter(call => call.includes('refresh_jwt_token'))).toEqual([`POST ${lanRest('rpc/refresh_jwt_token')}`]);
    expect(getConnectionPath()).toBe('public');
  });

  it('reads "No API key found in request" the same way', async () => {
    net.public = 'up';
    jest.mocked(global.fetch).mockImplementation((input, init) =>
      String(input) === lanRest('x')
        ? Promise.resolve(reply(401, { message: 'No API key found in request' }, { 'X-Warehouse-Path': 'lan' }))
        : route(input, init)
    );
    const response = await transportFetch(rest('x'), undefined, READ);
    expect(answeredPath(response)).toBe('public');
  });

  it('leaves a PostgREST 401 (an expired access token) to the session code', async () => {
    net.public = 'up';
    const expired = reply(401, { code: 'PGRST301', message: 'JWT expired' }, { 'X-Warehouse-Path': 'lan' });
    jest.mocked(global.fetch).mockImplementation((input, init) => (String(input) === lanRest('x') ? Promise.resolve(expired) : route(input, init)));
    const response = await transportFetch(rest('x'), undefined, READ);
    expect(response).toBe(expired);
    expect(getConnectionPath()).toBe('lan');
    expect(getLanStatus().failure).toBeNull();
  });

  it('clears the problem when a REST call over the LAN path works again', async () => {
    net.lan = 'stale-keys';
    net.public = 'down';
    await transportFetch(rest('a'), undefined, READ).catch(() => undefined);
    expect(getLanStatus().failure).toBe('old-configuration');
    net.lan = 'up';
    net.public = 'down';
    jest.advanceTimersByTime(PROBE_BACKOFF_MS + 1);
    await transportFetch(rest('b'), undefined, READ);
    expect(getLanStatus().failure).toBeNull();
  });
});

describe('other answers of the LAN listener', () => {
  beforeEach(async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    calls = [];
    net.public = 'up';
  });

  it('a 403 of the listener (this phone is outside the allowed range) sends the read back to the public path', async () => {
    net.lan = 'refused';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('public');
    expect(getConnectionPath()).toBe('public');
  });

  it('an answer without the listener header is another device: the read goes back to the public path', async () => {
    net.lan = 'other-device';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('public');
  });

  it('a 429 or 5xx of the listener is the server answering, not a transport failure', async () => {
    for (const status of [429, 500, 502, 503, 504]) {
      const answer = reply(status, { message: 'x' }, { 'X-Warehouse-Path': 'lan' });
      jest.mocked(global.fetch).mockImplementation((input, init) => (String(input) === lanRest('busy') ? Promise.resolve(answer) : route(input, init)));
      expect(await transportFetch(rest('busy'), undefined, READ)).toBe(answer);
      expect(getConnectionPath()).toBe('lan');
    }
  });
});

describe('what never goes over the LAN path', () => {
  it('keeps the association sign-in exchange on the public address', async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ); // onto the LAN path
    calls = [];
    net.public = 'up';
    await transportFetch(`${PUBLIC}/functions/v1/central-exchange`, { method: 'POST' }, WRITE);
    expect(calls).toEqual([`POST ${PUBLIC}/functions/v1/central-exchange`]);
    expect(viaCurrentPath(`${PUBLIC}/functions/v1/central-exchange`)).toBe(`${PUBLIC}/functions/v1/central-exchange`);
  });
});

describe('viaCurrentPath and toCanonicalUrl', () => {
  it('change only the host, and only on the LAN path', async () => {
    const signed = `${PUBLIC}/storage/v1/object/sign/grn-images/a.jpg?token=abc`;
    expect(viaCurrentPath(signed)).toBe(signed);
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    expect(viaCurrentPath(signed)).toBe(`${LAN}/storage/v1/object/sign/grn-images/a.jpg?token=abc`);
    expect(viaCurrentPath(`${LAN}/storage/v1/object/x`)).toBe(`${LAN}/storage/v1/object/x`);
    expect(viaCurrentPath('https://other.example.test/x')).toBe('https://other.example.test/x');
    expect(viaCurrentPath(`${PUBLIC}.evil.test/x`)).toBe(`${PUBLIC}.evil.test/x`);
    expect(toCanonicalUrl(`${LAN}/functions/v1/get-public-config`)).toBe(`${PUBLIC}/functions/v1/get-public-config`);
    expect(toCanonicalUrl(`${PUBLIC}/x`)).toBe(`${PUBLIC}/x`);
    expect(toCanonicalUrl(`${LAN}9/x`)).toBe(`${LAN}9/x`);
  });

  it('leave everything alone when no LAN address is known', () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: INSTANCE });
    expect(viaCurrentPath(`${PUBLIC}/x`)).toBe(`${PUBLIC}/x`);
    expect(toCanonicalUrl(`${LAN}/x`)).toBe(`${LAN}/x`);
  });
});

describe('probeLan', () => {
  it('answers with the time hello took when the address is this warehouse', async () => {
    jest.mocked(global.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/hello')) {
        jest.setSystemTime(Date.now() + 42);
      }
      return route(input, init);
    });
    expect(await probeLan()).toEqual({ ok: true, ms: 42 });
    // No credential and no header go with a probe.
    for (const [, init] of jest.mocked(global.fetch).mock.calls) expect(init?.headers).toBeUndefined();
  });

  it.each([
    ['down', 'unreachable'],
    ['refused', 'refused'],
    ['other-device', 'wrong-server'],
    ['wrong-instance', 'wrong-server'],
  ] as const)('LAN %s is %s', async (state, reason) => {
    net.lan = state;
    expect(await probeLan()).toEqual({ ok: false, reason });
  });

  it('gives up after PROBE_TIMEOUT_MS', async () => {
    net.lan = 'hang';
    const pending = probeLan();
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('says not-set without asking anything when the server offers no address', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: INSTANCE });
    expect(await probeLan()).toEqual({ ok: false, reason: 'not-set' });
    expect(calls).toEqual([]);
  });
});

describe('other triggers and resets', () => {
  it('NetInfo finding the internet unreachable moves to the LAN path when it answers', async () => {
    net.public = 'down';
    notePublicUnreachable();
    await flush();
    await jest.advanceTimersByTimeAsync(0);
    expect(getConnectionPath()).toBe('lan');
    // One probe of NetInfo's may have been lost: the public hello is asked once more before the phone moves.
    expect(calls).toContain(`GET ${PUBLIC}/functions/v1/hello`);
  });

  it('NetInfo finding the internet unreachable does not move the phone when the public hello answers', async () => {
    net.public = 'up';
    notePublicUnreachable();
    await flush();
    await jest.advanceTimersByTimeAsync(0);
    expect(getConnectionPath()).toBe('public');
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
  });

  it('does nothing without a LAN address', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: INSTANCE });
    notePublicUnreachable();
    await flush();
    expect(calls).toEqual([]);
  });

  it('a native download that failed asks the other path once', async () => {
    net.public = 'down';
    expect(await noteNativeReadFailed('public')).toBe(true);
    expect(getConnectionPath()).toBe('lan');
    // Already moved by someone else: the caller may try again at once.
    expect(await noteNativeReadFailed('public')).toBe(true);
  });

  it('a new facility or a new address starts on the public path again', async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    expect(getConnectionPath()).toBe('lan');
    setLanContext({ canonical: PUBLIC, lan: 'http://192.168.1.21:8080', instanceId: INSTANCE });
    expect(getConnectionPath()).toBe('public');
    setLanContext({ canonical: PUBLIC, lan: 'http://192.168.1.21:8080', instanceId: INSTANCE });
    expect(getLanStatus()).toEqual({ path: 'public', failure: null, lan: 'http://192.168.1.21:8080' });
  });

  it('forgets the facility on sign-out of the last one', async () => {
    net.public = 'down';
    await transportFetch(rest(), undefined, READ);
    setLanContext(null);
    expect(getLanStatus()).toEqual({ path: 'public', failure: null, lan: null });
  });
});

// -----------------------------------------------------------------------------
// WS-L review H1: the LAN path survives a change of network and a wrong device
// -----------------------------------------------------------------------------

const lanCalls = () => calls.filter(call => call.includes(LAN));
const lanCredentialed = () => jest.mocked(global.fetch).mock.calls.filter(([input, init]) => String(input).startsWith(LAN) && init?.headers);
const AUTH = { headers: { Authorization: 'Bearer token', apikey: 'k' } };
const moveToLan = async () => {
  net.public = 'down';
  await transportFetch(rest(), undefined, READ);
  expect(getConnectionPath()).toBe('lan');
  calls = [];
  jest.mocked(global.fetch).mockClear();
};

describe('a change of network (review H1)', () => {
  it('puts the phone back on the public path, and nothing credentialed goes to the LAN address before a new identity check', async () => {
    await moveToLan();
    noteNetworkState(OTHER_WIFI_SAME_RANGE);
    expect(getConnectionPath()).toBe('public');
    expect(getLanStatus().path).toBe('public');
    const response = await transportFetch(rest('customers'), AUTH, READ);
    expect(answeredPath(response)).toBe('lan');
    const sent = lanCalls();
    // The identity probes (hello and get-public-config, no headers) come first; the credentialed read last.
    expect(sent.slice(0, 2).sort()).toEqual([`GET ${LAN}/functions/v1/get-public-config`, `GET ${LAN}/functions/v1/hello`]);
    expect(sent[sent.length - 1]).toBe(`GET ${lanRest('customers')}`);
    expect(lanCredentialed()).toHaveLength(1);
  });

  it('refuses another warehouse that holds the same address on the new network: the identity probe fails, no credential goes', async () => {
    await moveToLan();
    noteNetworkState(OTHER_WIFI_SAME_RANGE);
    net.lan = 'wrong-instance';
    await expect(transportFetch(rest('customers'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(lanCredentialed()).toHaveLength(0);
    expect(getConnectionPath()).toBe('public');
  });

  it('refuses a device that is not the server on the new network', async () => {
    await moveToLan();
    noteNetworkState(OTHER_WIFI_SAME_RANGE);
    net.lan = 'other-device';
    await expect(transportFetch(rest('customers'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(lanCredentialed()).toHaveLength(0);
  });

  it('to a network that cannot hold the address: nothing is probed or sent to it at all', async () => {
    for (const network of [HOME_WIFI, MOBILE_DATA, NO_NETWORK, WIFI_UNKNOWN_SUBNET]) {
      await moveToLan();
      noteNetworkState(network);
      expect(getConnectionPath()).toBe('public');
      await expect(transportFetch(rest('customers'), AUTH, READ)).rejects.toThrow('Network request failed');
      expect(lanCalls()).toEqual([]);
      noteNetworkState(WAREHOUSE_WIFI);
      jest.advanceTimersByTime(PROBE_BACKOFF_MS + 1);
    }
  });

  it('repeats of the same network change nothing: the phone stays on the LAN path', async () => {
    await moveToLan();
    noteNetworkState({ ...WAREHOUSE_WIFI });
    noteNetworkState(WAREHOUSE_WIFI);
    expect(getConnectionPath()).toBe('lan');
  });

  it('a probe that was out when the network changed is about the old network and moves nobody', async () => {
    net.public = 'down';
    net.lan = 'hang';
    const pending = transportFetch(rest(), undefined, READ).catch(() => undefined);
    await flush();
    net.lan = 'up';
    noteNetworkState(OTHER_WIFI_SAME_RANGE);
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 100);
    await pending;
    expect(getConnectionPath()).toBe('public');
  });

  it('a network that reports a subnet holding the address works: Ethernet too', async () => {
    noteNetworkState(ETHERNET);
    net.public = 'down';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
  });
});

describe('where the LAN path may be used (review H1)', () => {
  it.each([
    ['the warehouse Wi-Fi', WAREHOUSE_WIFI, true],
    ['Ethernet in the same subnet', ETHERNET, true],
    ['a Wi-Fi in another private range', HOME_WIFI, false],
    ['mobile data', MOBILE_DATA, false],
    ['no connection', NO_NETWORK, false],
    ['Wi-Fi whose address NetInfo could not read', WIFI_UNKNOWN_SUBNET, false],
    ['Wi-Fi with a mask of /32 (what Android reports when it cannot read the prefix)', { ...WAREHOUSE_WIFI, subnet: '255.255.255.255' }, false],
    ['Wi-Fi with a mask of 0.0.0.0 (what iOS reports when it cannot read it)', { ...WAREHOUSE_WIFI, subnet: '0.0.0.0' }, false],
    ['a VPN', { ...WAREHOUSE_WIFI, type: 'vpn' }, false],
    ['a /22 that holds the address', { ...WAREHOUSE_WIFI, ipAddress: '192.168.2.9', subnet: '255.255.252.0' }, true],
    ['a /24 that does not', { ...WAREHOUSE_WIFI, ipAddress: '192.168.2.9', subnet: '255.255.255.0' }, false],
  ])('%s: %s', (_name, network, usable) => {
    noteNetworkState(network);
    expect(lanUsableHere()).toBe(usable);
  });

  it('is false before NetInfo has said anything', () => {
    resetLanTransport();
    setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: INSTANCE });
    expect(lanUsableHere()).toBe(false);
  });

  it('on a network that cannot hold the address a failed request costs no probe: the failure is handed over as it was', async () => {
    noteNetworkState(MOBILE_DATA);
    net.public = 'down';
    await expect(transportFetch(rest(), undefined, READ)).rejects.toThrow('Network request failed');
    expect(calls).toEqual([`GET ${rest()}`]);
    expect(await probeLan()).toEqual({ ok: false, reason: 'other-network' });
    expect(calls).toEqual([`GET ${rest()}`]);
  });

  it.each([
    ['mobile data', MOBILE_DATA, 'other-network'],
    ['no connection', NO_NETWORK, 'other-network'],
    ['a Wi-Fi in another range', HOME_WIFI, 'other-network'],
    ['Wi-Fi whose address could not be read', WIFI_UNKNOWN_SUBNET, 'network-unknown'],
    ['Wi-Fi with a mask of /32', { ...WAREHOUSE_WIFI, subnet: '255.255.255.255' }, 'network-unknown'],
    ['a connection NetInfo has not classified', { ...WAREHOUSE_WIFI, connected: null, type: 'unknown' }, 'network-unknown'],
  ] as const)('probeLan on %s asks nothing and says %s', async (_name, network, reason) => {
    noteNetworkState(network);
    expect(await probeLan()).toEqual({ ok: false, reason });
    expect(calls).toEqual([]);
  });

  it('probeLan before NetInfo has said anything says network-unknown', async () => {
    resetLanTransport();
    setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: INSTANCE });
    expect(await probeLan()).toEqual({ ok: false, reason: 'network-unknown' });
  });
});

describe('before NetInfo has said where the phone is (a cold start in an outage)', () => {
  beforeEach(() => {
    resetLanTransport();
    setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: INSTANCE });
  });

  it('a failed first request waits for the reading, then falls back when the phone is on the warehouse Wi-Fi', async () => {
    net.public = 'down';
    let result: Response | undefined;
    const pending = transportFetch(rest(), undefined, READ).then(value => (result = value));
    await flush();
    expect(lanCalls()).toEqual([]);
    expect(result).toBeUndefined();
    noteNetworkState(WAREHOUSE_WIFI);
    await pending;
    expect(answeredPath(result as Response)).toBe('lan');
    expect(getConnectionPath()).toBe('lan');
  });

  it('the first reading is not a change of network: it does not undo a decision that is waiting for it', async () => {
    net.public = 'down';
    const pending = transportFetch(rest(), undefined, READ);
    await flush();
    noteNetworkState(WAREHOUSE_WIFI);
    expect((await pending).status).toBe(200);
    expect(getConnectionPath()).toBe('lan');
  });

  it('gives up after NETWORK_KNOWN_WAIT_MS with no reading: nothing is sent to the LAN address', async () => {
    net.public = 'down';
    const pending = transportFetch(rest(), undefined, READ).catch(error => error);
    await jest.advanceTimersByTimeAsync(NETWORK_KNOWN_WAIT_MS + 10);
    expect(await pending).toBeInstanceOf(TypeError);
    expect(lanCalls()).toEqual([]);
    expect(getConnectionPath()).toBe('public');
  });

  it('a reading of a network that cannot hold the address ends the wait at once, with nothing sent', async () => {
    net.public = 'down';
    const pending = transportFetch(rest(), undefined, READ).catch(error => error);
    await flush();
    noteNetworkState(MOBILE_DATA);
    expect(await pending).toBeInstanceOf(TypeError);
    expect(lanCalls()).toEqual([]);
  });
});

describe('leaving the LAN path (review H1)', () => {
  it('another device at the address means the public path, whether or not the public path answers', async () => {
    await moveToLan();
    net.lan = 'other-device';
    net.public = 'down';
    await expect(transportFetch(rest('a'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
    // The next request goes public first and sends no credential to the LAN address, now or 15 s later.
    calls = [];
    jest.mocked(global.fetch).mockClear();
    await expect(transportFetch(rest('b'), AUTH, READ)).rejects.toThrow('Network request failed');
    jest.advanceTimersByTime(PROBE_BACKOFF_MS + 1);
    await expect(transportFetch(rest('c'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(lanCredentialed()).toHaveLength(0);
    expect(calls.some(call => call.startsWith(`GET ${LAN}/rest`))).toBe(false);
  });

  it("a 403 of the listener means the public path, even when the public path is down", async () => {
    await moveToLan();
    net.lan = 'refused';
    await expect(transportFetch(rest('a'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
  });

  it('a failed request whose identity probe fails too means the public path', async () => {
    await moveToLan();
    net.lan = 'down';
    await expect(transportFetch(rest('a'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
  });

  it('a failed request whose identity probe passes stays on the LAN path: the request was at fault', async () => {
    await moveToLan();
    let first = true;
    jest.mocked(global.fetch).mockImplementation((input, init) => {
      if (String(input) === lanRest('a') && first) {
        first = false;
        return Promise.reject(new TypeError('Network request failed'));
      }
      return route(input, init);
    });
    await expect(transportFetch(rest('a'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('lan');
  });

  it('the real server with old keys keeps the phone on the LAN path when the public path is down: "old configuration"', async () => {
    await moveToLan();
    net.lan = 'stale-keys';
    net.public = 'down';
    await expect(transportFetch(rest('a'), AUTH, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('lan');
    expect(getLanStatus().failure).toBe('old-configuration');
  });

  it('the old-configuration warning goes away when the phone returns to the public path (review L3)', async () => {
    await moveToLan();
    net.lan = 'stale-keys';
    net.public = 'down';
    await transportFetch(rest('a'), AUTH, READ).catch(() => undefined);
    expect(getLanStatus().failure).toBe('old-configuration');
    net.public = 'up';
    await jest.advanceTimersByTimeAsync(LAN_STICK_MS + 1);
    await flush();
    expect(getConnectionPath()).toBe('public');
    expect(getLanStatus().failure).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// WS-L review M1: false switches to cleartext while the public path works
// -----------------------------------------------------------------------------

describe('what counts as the public path answering (review M1, L2)', () => {
  const helloAnswer = (status: number, header: boolean) => () =>
    Promise.resolve(reply(status, status === 200 ? 'Hello' : { message: 'x' }, header ? { 'X-Warehouse-Path': 'public' } : {}));
  const probeWith = async (status: number, header: boolean) => {
    jest.mocked(global.fetch).mockImplementation(helloAnswer(status, header));
    return probePublic();
  };

  it.each([
    [200, false, true],
    [200, true, true],
    [429, true, true],
    [429, false, true],
    [500, true, true],
    [502, true, true],
    [503, true, true],
    [504, true, true],
    [404, true, true],
    [502, false, false],
    [503, false, false],
    [520, false, false],
    [530, false, false],
    [404, false, false],
    [403, false, false],
  ])('hello answered %i, gateway header %s: public reachable is %s', async (status, header, reachable) => {
    expect(await probeWith(status, header)).toBe(reachable);
    expect(publicAnswered(reply(status, '', header ? { 'X-Warehouse-Path': 'public' } : {}))).toBe(reachable);
  });

  it('a rejected hello and one with no headers in time are down', async () => {
    jest.mocked(global.fetch).mockImplementation(() => Promise.reject(new TypeError('Network request failed')));
    expect(await probePublic()).toBe(false);
    jest.mocked(global.fetch).mockImplementation((_input, init) => hang(init?.signal));
    const pending = probePublic();
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    expect(await pending).toBe(false);
  });

  it('isTunnelFailure is a 530, or a 5xx without the gateway header', () => {
    expect(isTunnelFailure(reply(530, ''))).toBe(true);
    expect(isTunnelFailure(reply(502, ''))).toBe(true);
    expect(isTunnelFailure(reply(502, '', { 'X-Warehouse-Path': 'public' }))).toBe(false);
    expect(isTunnelFailure(reply(429, ''))).toBe(false);
    expect(isTunnelFailure(reply(200, ''))).toBe(false);
  });

  it.each([429, 502, 503])('a request that fails while the public hello answers %i is the request\'s fault: the phone sends nothing to the LAN', async status => {
    let first = true;
    jest.mocked(global.fetch).mockImplementation((input, init) => {
      if (String(input) === rest() && first) {
        first = false;
        return Promise.reject(new TypeError('Network request failed'));
      }
      if (String(input).endsWith('/hello') && String(input).startsWith(PUBLIC))
        return Promise.resolve(reply(status, { message: 'busy' }, { 'X-Warehouse-Path': 'public' }));
      return route(input, init);
    });
    await expect(transportFetch(rest(), undefined, READ)).rejects.toThrow('Network request failed');
    expect(getConnectionPath()).toBe('public');
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
  });

  it('a 429 or a 5xx with the gateway header is handed to the caller as the facility\'s answer', async () => {
    for (const state of ['429', '503'] as const) {
      net.public = state;
      const response = await transportFetch(rest(), undefined, READ);
      expect(response.status).toBe(state === '429' ? 429 : 503);
    }
    expect(calls.some(call => call.startsWith(`GET ${LAN}`))).toBe(false);
    expect(getConnectionPath()).toBe('public');
  });

  it('Cloudflare\'s 502 without the gateway header is the tunnel down: the read goes over the LAN', async () => {
    net.public = 'cf502';
    const response = await transportFetch(rest(), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
    expect(getConnectionPath()).toBe('lan');
  });

  it('the tunnel down and the LAN down: the caller gets Cloudflare\'s 502 as before', async () => {
    net.public = 'cf502';
    net.lan = 'down';
    const response = await transportFetch(rest(), undefined, READ);
    expect(response.status).toBe(502);
  });
});

describe('uploads (review M1)', () => {
  const photo = `${PUBLIC}/storage/v1/object/grn-images/a.jpg`;

  it('while a photo goes out over the public path, a failed probe of NetInfo starts no check; one is made when it is over', async () => {
    net.public = 'hang';
    const controller = new AbortController();
    const upload = transportFetch(photo, { method: 'POST', signal: controller.signal }, WRITE);
    const ended = expect(upload).rejects.toThrow('Aborted');
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS + 500);
    notePublicUnreachable();
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 500);
    expect(probesOnly(calls)).toEqual([]);
    expect(getConnectionPath()).toBe('public');
    // The upload ends: the skipped check is made now (the public hello is asked first).
    controller.abort();
    await ended;
    await flush();
    expect(calls).toContain(`GET ${PUBLIC}/functions/v1/hello`);
  });

  it('while a photo goes out, a rejected READ does not start the public hello probe either', async () => {
    net.public = 'slow-up';
    const upload = transportFetch(photo, { method: 'POST' }, WRITE);
    jest.mocked(global.fetch).mockImplementationOnce(() => Promise.reject(new TypeError('Network request failed')));
    await expect(transportFetch(rest('items'), undefined, READ)).rejects.toThrow('Network request failed');
    expect(probesOnly(calls)).toEqual([]);
    expect(getConnectionPath()).toBe('public');
    await jest.advanceTimersByTimeAsync(7000);
    await upload;
  });

  it('a tunnel failure still moves the phone during an upload: it is the tunnel answering, not a slow probe', async () => {
    net.public = 'hang';
    const controller = new AbortController();
    const upload = transportFetch(photo, { method: 'POST', signal: controller.signal }, WRITE).catch(() => undefined);
    await flush();
    net.public = '530';
    const response = await transportFetch(rest('items'), undefined, READ);
    expect(answeredPath(response)).toBe('lan');
    controller.abort();
    await upload;
  });

  it('an upload that goes out over the LAN path does not hold the public probe back', async () => {
    await moveToLan();
    net.public = 'up';
    const upload = transportFetch(photo, { method: 'POST' }, WRITE);
    await jest.advanceTimersByTimeAsync(LAN_STICK_MS + 1);
    await flush();
    await upload;
    expect(calls).toContain(`GET ${PUBLIC}/functions/v1/hello`);
  });
});
