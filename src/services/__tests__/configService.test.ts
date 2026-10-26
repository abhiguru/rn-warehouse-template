import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import ConfigService from '../configService';
import { getAuthToken } from '@/utils/authTokenUtils';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
const server = jest.requireMock('@/config/operatorServer');

jest.mock('@/utils/authTokenUtils', () => ({ getAuthToken: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorOrigin: jest.fn(() => 'http://localhost:18000'),
  recordServerLanAddress: jest.fn(async () => undefined),
}));
const client = {} as SupabaseClient;
const origin = 'http://localhost:18000';
const jwt = (claims: object) =>
  `header.${btoa(JSON.stringify({ exp: 9999999999, ...claims }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}.signature`;
const publicData = (url = origin) => ({
  supabaseUrl: url,
  anonKey: jwt({ role: 'anon' }),
  environment: 'development',
  version: '0.1.0',
  maintenanceMode: false,
  urls: {
    publicConfig: `${url}/functions/v1/get-public-config`,
    fullConfig: `${url}/functions/v1/get-config`,
  },
});
const fullData = () => ({
  apiKeys: { supabase: { url: origin, anonKey: jwt({ role: 'anon' }) } },
  features: {
    testMode: true,
    maintenanceMode: false,
    otpEnabled: true,
    smsProvider: 'demo',
    maxFileUploadSize: 1000,
    allowedFileTypes: ['image/jpeg'],
    enabledFeatures: ['stock'],
  },
  environment: {
    name: 'development',
    version: '0.1.0',
    buildDate: '',
    region: 'local',
  },
  urls: {
    api: `${origin}/rest/v1`,
    storage: `${origin}/storage/v1`,
    auth: `${origin}/rest/v1/rpc`,
  },
  limits: {
    otpHourlyLimit: 5,
    otpDailyLimit: 20,
    sessionTimeout: 3600,
    refreshTokenExpiry: 604800,
    apiRateLimitPerMinute: 100,
    apiRateLimitPerHour: 1000,
  },
  support: { email: '', phone: '', appName: 'Warehouse' },
});
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data }),
});
const authenticate = (session = 'A') =>
  jest
    .mocked(getAuthToken)
    .mockResolvedValue({
      token: jwt({ sub: `user-${session}`, session_id: session }),
      source: 'securestore',
      expiresAt: Date.now() + 3600000,
    });
const oldFetch = global.fetch;
beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await ConfigService.clearCache();
  server.getActiveOperatorOrigin.mockReturnValue(origin);
  global.fetch = jest.fn().mockResolvedValue(response(fullData()));
  authenticate();
});
afterAll(() => {
  global.fetch = oldFetch;
});

it('uses the current secured custom session and never persists its bearer token', async () => {
  expect(await ConfigService.getFullConfig(client)).toEqual(fullData());
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/get-config'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: expect.stringContaining('Bearer '),
      }),
    })
  );
  expect(
    JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()))
  ).not.toContain(jwt({ sub: 'user-A', session_id: 'A' }));
});
it('accepts a full config without urls.realtime, and one that still sends it', async () => {
  expect(fullData().urls).not.toHaveProperty('realtime');
  expect(await ConfigService.getFullConfig(client)).toEqual(fullData());
  await ConfigService.clearCache();
  const withRealtime = {
    ...fullData(),
    urls: { ...fullData().urls, realtime: 'ws://localhost:18000/realtime/v1' },
  };
  jest.mocked(global.fetch).mockResolvedValue(response(withRealtime) as Response);
  expect(await ConfigService.getFullConfig(client)).not.toBeNull();
});
it('does not send an expired token', async () => {
  jest
    .mocked(getAuthToken)
    .mockResolvedValue({
      token: 'expired',
      source: 'securestore',
      expiresAt: 1,
    });
  expect(await ConfigService.getFullConfig(client)).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
});
it('enforces full memory TTL and discards rejected authorization without stale fallback', async () => {
  await ConfigService.getFullConfig(client);
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now + 70000);
  jest
    .mocked(global.fetch)
    .mockResolvedValue({ ok: false, status: 403 } as Response);
  expect(await ConfigService.getFullConfig(client)).toBeNull();
  expect(await ConfigService.getFullConfig(client)).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(
    (await AsyncStorage.getAllKeys()).some(k => k.startsWith('full_config_v2'))
  ).toBe(false);
});
it('does not reuse another account or a legacy unscoped cache', async () => {
  await AsyncStorage.setItem(
    'full_config_cache',
    JSON.stringify({ data: { private: 'legacy' }, timestamp: Date.now() })
  );
  await ConfigService.getFullConfig(client);
  authenticate('B');
  const data = fullData();
  data.features.enabledFeatures = [];
  jest.mocked(global.fetch).mockResolvedValue(response(data) as Response);
  expect(await ConfigService.getFullConfig(client)).toEqual(data);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
it('discards a late response after logout and removes authenticated persistent caches', async () => {
  let resolve!: (value: unknown) => void;
  global.fetch = jest.fn(
    () =>
      new Promise<unknown>(r => {
        resolve = r;
      })
  ) as typeof fetch;
  const pending = ConfigService.getFullConfig(client);
  for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
  advanceSessionGeneration();
  resolve(response(fullData()));
  expect(await pending).toBeNull();
  await ConfigService.clearAuthenticatedCache();
  expect(
    (await AsyncStorage.getAllKeys()).some(k => k.startsWith('full_config'))
  ).toBe(false);
});
it('discards account A response after account B config loads', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(global.fetch).mockImplementationOnce(
    () =>
      new Promise<unknown>(r => {
        resolve = r;
      }) as Promise<Response>
  );
  const pending = ConfigService.getFullConfig(client);
  for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
  authenticate('B');
  const data = fullData();
  data.features.enabledFeatures = [];
  jest.mocked(global.fetch).mockResolvedValue(response(data) as Response);
  expect(await ConfigService.getFullConfig(client)).toEqual(data);
  resolve(response(fullData()));
  expect(await pending).toBeNull();
  expect(await ConfigService.getFullConfig(client)).toEqual(data);
});
it('enforces public memory TTL, scopes origin and rejects legacy caches', async () => {
  await AsyncStorage.setItem(
    'public_config_cache',
    JSON.stringify({
      data: publicData('http://wrong.example'),
      timestamp: Date.now(),
    })
  );
  // A pinned clock: the first answer is stored at exactly `now`, so the next read is exactly
  // 3600001 ms later whatever the machine load (a real clock could tick between the two).
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  jest
    .mocked(global.fetch)
    .mockResolvedValue(response(publicData()) as Response);
  await ConfigService.getPublicConfig();
  clock.mockReturnValue(now + 3600001);
  await ConfigService.getPublicConfig();
  server.getActiveOperatorOrigin.mockReturnValue('http://localhost:28000');
  jest
    .mocked(global.fetch)
    .mockResolvedValue(
      response(publicData('http://localhost:28000')) as Response
    );
  expect((await ConfigService.getPublicConfig()).supabaseUrl).toBe(
    'http://localhost:28000'
  );
  expect(global.fetch).toHaveBeenCalledTimes(3);
});
it('rejects future and wrong-origin persistent cache entries, and refetches an expired one', async () => {
  for (const entry of [
    { timestamp: Date.now() + 10000, scope: origin },
    { timestamp: Date.now(), scope: 'http://other.example' },
  ]) {
    await ConfigService.clearCache();
    await AsyncStorage.setItem(
      `public_config_v2:${origin}`,
      JSON.stringify({ ...entry, data: publicData() })
    );
    jest.mocked(global.fetch).mockRejectedValue(new Error('Offline'));
    await expect(ConfigService.getPublicConfig()).rejects.toThrow();
  }
  // An expired copy is not served while the facility answers: the answer replaces it.
  await ConfigService.clearCache();
  await AsyncStorage.setItem(
    `public_config_v2:${origin}`,
    JSON.stringify({ timestamp: 1, scope: origin, data: publicData() })
  );
  const newer = { ...publicData(), version: '9.9.9' };
  jest.mocked(global.fetch).mockResolvedValue(response(newer) as Response);
  expect((await ConfigService.getPublicConfig()).version).toBe('9.9.9');
});
it('serves an expired public configuration when neither the public address nor the warehouse network answers', async () => {
  await AsyncStorage.setItem(
    `public_config_v2:${origin}`,
    JSON.stringify({ timestamp: 1, scope: origin, data: publicData() })
  );
  jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
  expect(await ConfigService.getPublicConfig()).toEqual(publicData());
  // Cloudflare's 530 is a path failure as well; any other status is the facility's own answer and stands.
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 530 } as Response);
  expect(await ConfigService.getPublicConfig()).toEqual(publicData());
  jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
  await expect(ConfigService.getPublicConfig()).rejects.toThrow();
});
it('serves no stale configuration when there is no earlier copy, or the copy is damaged', async () => {
  jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
  await expect(ConfigService.getPublicConfig()).rejects.toThrow();
  await AsyncStorage.setItem(
    `public_config_v2:${origin}`,
    JSON.stringify({ timestamp: 1, scope: origin, data: { ...publicData(), anonKey: 'not-a-key' } })
  );
  await expect(ConfigService.getPublicConfig()).rejects.toThrow();
});
it('bounds a stalled configuration response including body decoding', async () => {
  jest.useFakeTimers();
  jest
    .mocked(global.fetch)
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    } as Response);
  const pending = ConfigService.getPublicConfig();
  const assertion = expect(pending).rejects.toThrow('timed out');
  await jest.advanceTimersByTimeAsync(15001);
  await assertion;
  jest.useRealTimers();
});
it('a late account A rejection cannot evict account B configuration', async () => {
  let reject!: (reason: Error) => void;
  jest.mocked(global.fetch).mockImplementationOnce(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      })
  );
  const pending = ConfigService.getFullConfig(client);
  for (let i = 0; i < 20 && !reject; i++) await Promise.resolve();
  authenticate('B');
  const data = fullData();
  data.features.enabledFeatures = [];
  jest.mocked(global.fetch).mockResolvedValue(response(data) as Response);
  expect(await ConfigService.getFullConfig(client)).toEqual(data);
  reject(new Error('Old authorization rejected'));
  expect(await pending).toBeNull();
  expect(await ConfigService.getFullConfig(client)).toEqual(data);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
it('routes get-config through the identity gate while get-public-config stays raw', async () => {
  const { operatorResumeGate } = jest.requireActual('@/config/operatorResume');
  let release!: (value: boolean) => void;
  const remove = operatorResumeGate.installVerifier(
    () => new Promise<boolean>(resolve => { release = resolve; })
  );
  operatorResumeGate.suspend();
  const pending = ConfigService.getFullConfig(client);
  for (let i = 0; i < 25; i++) await Promise.resolve();
  expect(global.fetch).not.toHaveBeenCalled();
  jest.mocked(global.fetch).mockResolvedValueOnce(response(publicData()) as Response);
  expect((await ConfigService.getPublicConfig()).supabaseUrl).toBe(origin);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.mocked(global.fetch).mock.calls[0][0]).toContain('/get-public-config');
  release(true);
  expect(await pending).toEqual(fullData());
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(jest.mocked(global.fetch).mock.calls[1][0]).toContain('/get-config');
  remove();
});

// The warehouse network address (WS-L): `urls.lan` of the authenticated answer.
describe('urls.lan of the authenticated configuration', () => {
  const lan = 'http://192.168.1.20:8080';
  const withLan = () => ({ ...fullData(), urls: { ...fullData().urls, lan } });
  const answerFrom = (path: 'lan' | 'public', data: unknown) => ({
    ...response(data),
    headers: { get: (name: string) => (name.toLowerCase() === 'x-warehouse-path' ? path : null) },
  });
  const record = () => jest.mocked(server.recordServerLanAddress);
  beforeEach(() => {
    record().mockReset();
    record().mockResolvedValue(undefined);
  });

  it('is handed to the saved server after an answer of the public path, also when it is absent', async () => {
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('public', withLan()) as unknown as Response);
    expect((await ConfigService.getFullConfig(client))?.urls.lan).toBe(lan);
    expect(record()).toHaveBeenCalledWith(origin, lan);
    await ConfigService.clearCache();
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('public', fullData()) as unknown as Response);
    await ConfigService.getFullConfig(client);
    expect(record()).toHaveBeenLastCalledWith(origin, undefined);
  });

  it('counts an answer without the path header as the public path (a server without the fallback)', async () => {
    jest.mocked(global.fetch).mockResolvedValue(response(withLan()) as unknown as Response);
    await ConfigService.getFullConfig(client);
    expect(record()).toHaveBeenCalledWith(origin, lan);
  });

  it('is left alone by an answer that came over the warehouse network', async () => {
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('lan', fullData()) as unknown as Response);
    expect(await ConfigService.getFullConfig(client)).not.toBeNull();
    expect(record()).not.toHaveBeenCalled();
  });

  it('is not asked again for a copy kept in the one-minute cache', async () => {
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('public', withLan()) as unknown as Response);
    await ConfigService.getFullConfig(client);
    await ConfigService.getFullConfig(client);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(record()).toHaveBeenCalledTimes(1);
  });

  it('never fails the configuration when the address cannot be kept', async () => {
    record().mockRejectedValueOnce(new Error('storage full'));
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('public', withLan()) as unknown as Response);
    expect(await ConfigService.getFullConfig(client)).not.toBeNull();
  });

  it('is not in the public configuration', async () => {
    jest.mocked(global.fetch).mockResolvedValue(answerFrom('public', publicData()) as unknown as Response);
    expect(await ConfigService.getPublicConfig()).toEqual(publicData());
    expect(record()).not.toHaveBeenCalled();
  });
});
