import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import ConfigService from '../configService';
import { getAuthToken } from '@/utils/authTokenUtils';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
const env = jest.requireMock('@/config/envConfig');

jest.mock('@/utils/authTokenUtils', () => ({ getAuthToken: jest.fn() }));
jest.mock('@/config/envConfig', () => ({
  CONFIG_API_BASE_URL: 'http://localhost:18000',
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
    realtime: 'ws://localhost:18000/realtime/v1',
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
  Object.assign(env, { CONFIG_API_BASE_URL: origin });
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
      new Promise(r => {
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
      new Promise(r => {
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
  const now = Date.now();
  jest
    .mocked(global.fetch)
    .mockResolvedValue(response(publicData()) as Response);
  await ConfigService.getPublicConfig();
  jest.spyOn(Date, 'now').mockReturnValue(now + 3600001);
  await ConfigService.getPublicConfig();
  Object.assign(env, { CONFIG_API_BASE_URL: 'http://localhost:28000' });
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
it('rejects future, expired and wrong-origin persistent cache entries', async () => {
  for (const entry of [
    { timestamp: Date.now() + 10000, scope: origin },
    { timestamp: 1, scope: origin },
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
