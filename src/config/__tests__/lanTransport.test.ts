import {
  LAN_STICK_MS,
  PROBE_BACKOFF_MS,
  PROBE_TIMEOUT_MS,
  PUBLIC_HEADERS_TIMEOUT_MS,
  PUBLIC_PROBE_INTERVAL_MS,
  answeredPath,
  getConnectionPath,
  getLanStatus,
  noteNativeReadFailed,
  notePublicUnreachable,
  probeLan,
  resetLanTransport,
  setLanContext,
  subscribeLanStatus,
  toCanonicalUrl,
  transportFetch,
  viaCurrentPath,
} from '../lanTransport';

const PUBLIC = 'https://warehouse.example.test';
const LAN = 'http://192.168.1.20:8080';
const INSTANCE = 'instance-0001';
const originalFetch = global.fetch;

type PublicState = 'up' | 'down' | '530' | 'hang' | 'slow-up';
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
    expect(calls.filter(call => call.startsWith(`GET ${LAN}`)).every(call => /hello|get-public-config/.test(call))).toBe(true);
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
  });

  it('moves the NEXT request to the LAN path but never sends a WRITE again', async () => {
    net.public = 'hang';
    let outcome: string | undefined;
    const pending = transportFetch(rest('rpc/save_grn'), { method: 'POST' }, WRITE).then(
      () => (outcome = 'answered'),
      () => (outcome = 'failed')
    );
    await jest.advanceTimersByTimeAsync(PUBLIC_HEADERS_TIMEOUT_MS + PROBE_TIMEOUT_MS);
    expect(getConnectionPath()).toBe('lan');
    expect(signals[rest('rpc/save_grn')]?.aborted).toBeFalsy();
    expect(outcome).toBeUndefined();
    expect(calls.filter(call => call.includes('save_grn'))).toEqual([`POST ${rest('rpc/save_grn')}`]);
    // The caller's own limit ends it (gatedFetch aborts the request).
    pending.catch(() => {});
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
    // The reachability probe was the public check: the public hello is not asked again.
    expect(calls).not.toContain(`GET ${PUBLIC}/functions/v1/hello`);
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
