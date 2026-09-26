import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  compareVersions,
  discoverOperator,
  getActiveOperatorServer,
  loadOperatorServer,
  parseOperatorOrigin,
  saveOperatorServer,
} from '../operatorServer';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const origin = 'https://warehouse.example.test';
const anonKey = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const config = (instanceId = 'instance-0001') => ({
  success: true,
  data: {
    supabaseUrl: origin, anonKey, environment: 'production', version: '1.0.0',
    maintenanceMode: false, instanceId, displayName: 'Warehouse One',
    companyName: 'Example Operator', canonicalOrigin: origin,
    supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: {},
    urls: { publicConfig: `${origin}/functions/v1/get-public-config`, fullConfig: `${origin}/functions/v1/get-config` },
  },
});
const originalFetch = global.fetch;
beforeEach(async () => { await AsyncStorage.clear(); global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

it('accepts only a bare HTTPS origin from manual input or QR', () => {
  expect(parseOperatorOrigin(` ${origin} `)).toBe(origin);
  for (const value of ['http://warehouse.example.test', `${origin}/join`, `${origin}?token=x`, 'https://user:pass@warehouse.example.test'])
    expect(() => parseOperatorOrigin(value)).toThrow();
});

it('discovers a compatible server and persists only its public identity', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => config() } as Response);
  const result = await discoverOperator(origin);
  expect(result.server).toEqual({ origin, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' });
  await saveOperatorServer(result.server);
  expect(await loadOperatorServer()).toEqual(result.server);
  expect(getActiveOperatorServer()).toEqual(result.server);
  expect(await AsyncStorage.getItem('operator_server_v1')).not.toContain(anonKey);
});

it('rejects a substituted origin, unsupported API, or too-new minimum client', async () => {
  for (const change of [
    { canonicalOrigin: 'https://other.example.test' },
    { supportedApiVersions: ['2'] },
    { minimumClientVersion: '0.2.0' },
  ]) {
    jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ...config(), data: { ...config().data, ...change } }) } as Response);
    await expect(discoverOperator(origin)).rejects.toThrow();
  }
  expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
});
