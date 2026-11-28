/**
 * WH-298 review finding 3 (Low; contract section 1, "Feature on": the role is admin, supervisor or staff): a customer
 * account gets no offline start. With the same stored token and cached profile that open a staff account offline, a
 * customer's profile makes the start fail as it does today (the error is thrown), never `{ kind: 'offline' }`.
 *
 * Real: `verifySelectedOperator`, `offlineStart`, `operatorServer`, discovery. Faked: the network (`fetch`), the async-storage
 * mock, and the two reads of the signed-in state (`getStoredToken`, `getCachedUserProfile`), as in offlineStart.test.ts.
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 review) =====
 *  - The bootstrap decides on the role of the cached profile it already reads with `getCachedUserProfile({ allowExpired: true })`;
 *    the observable is only the result kind / the thrown error. Which module checks the role is open.
 * ===================================================
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySelectedOperator } from '../operatorBootstrap';
import { loadOperatorServer, saveOperatorServer } from '../operatorServer';
import { clearAppTooOld } from '../appTooOld';
import { resetUpgradeNotice } from '../upgradeNotice';
import { resetFacilityCapabilities } from '../facilityCapabilities';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
let mockProfile: { id: string; role: string; name: string } | null = null;
jest.mock('@/config/supabaseConfig', () => ({
  getStoredToken: jest.fn(async () => ({ authToken: 'header.payload.sig', isValid: false })),
  getCachedUserProfile: jest.fn(async () => mockProfile),
  RequestTimeoutError: class RequestTimeoutError extends Error {},
  initializeSupabase: jest.fn(),
}));

const selected = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const anon = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const answer = () => ({
  ok: true, status: 200,
  json: async () => ({ success: true, data: {
    supabaseUrl: selected.origin, anonKey: anon, environment: 'production', version: '0.1.0', maintenanceMode: false,
    instanceId: selected.instanceId, displayName: selected.displayName, companyName: selected.companyName, canonicalOrigin: selected.origin,
    supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: { sync: true },
    urls: { publicConfig: `${selected.origin}/functions/v1/get-public-config`, fullConfig: `${selected.origin}/functions/v1/get-config` },
  } }),
}) as Response;
const never = () => { throw new Error('no cleanup expected here'); };
const oldFetch = global.fetch;

beforeEach(async () => {
  await AsyncStorage.clear();
  clearAppTooOld(); resetUpgradeNotice(); resetFacilityCapabilities();
  await loadOperatorServer();
  await saveOperatorServer(selected);
  global.fetch = jest.fn().mockResolvedValue(answer());
  mockProfile = { id: 'profile-1', role: 'staff', name: 'Asha Fictional' };
  expect((await verifySelectedOperator(() => true, never)).kind).toBe('verified'); // one online start keeps the settings
  jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
});
afterAll(() => { global.fetch = oldFetch; });

describe('the offline start and the role', () => {
  it.each(['admin', 'supervisor', 'staff'])('baseline: a %s account opens offline', async role => {
    mockProfile = { id: 'profile-1', role, name: 'Asha Fictional' };
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
  });

  it('a customer account gets no offline start: with no connection the error is thrown as today', async () => {
    mockProfile = { id: 'profile-2', role: 'customer', name: 'Ravi Fictional' };
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow('Network request failed');
  });
});
