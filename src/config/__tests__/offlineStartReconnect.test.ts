/**
 * WH-298 phone finding S5: after an offline start (aeroplane on, force-stop, launch) the network comes back, the status bar
 * says "Up to date" in about 8 s, yet GRNService and OrderService calls kept failing for 90 s or more with "Warehouse
 * identity verification required" from `awaitIdentityGate`: the identity gate the offline start opened never verified
 * again once the server answered.
 *
 * Real: `verifySelectedOperator` / `verifyForegroundOperator` (the launch and the gate's verifier, wired as app/_layout.tsx
 * wires them), `operatorResumeGate`, `awaitIdentityGate`, the gated fetch, the real supabase client, `GRNService.getAllGRNItems`,
 * the token store and profile cache (the secure-store map). Faked: only the network (`fetch`) and the native secure store.
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 phone S5) =====
 *  - The launch is driven as _layout.tsx does it: `verifySelectedOperator` answers `offline`, then `operatorResumeGate.suspend()`
 *    (the facility check stays required), with `installVerifier(current => verifyForegroundOperator(...))` in place.
 *  - "Within the app's normal retry": the call is tried up to 3 times (a screen's own retry), with no restart and no new
 *    launch. Which event re-verifies (the next request, a reconnect, a timer) is Development's choice: only the outcome is
 *    asserted, so any wiring that opens the gate once the server answers passes.
 *  - A refusal on reconnect (the server answers that the session or the facility is no longer valid) must still sign out: the
 *    observable is that no GRN call succeeds and the stored session is gone or never used. The exact sign-out route is open;
 *    asserted here only as "the gate does not open for a server that answers with a refusal, and the GRN read fails".
 * =====================================================
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { verifySelectedOperator, verifyForegroundOperator } from '../operatorBootstrap';
import { loadOperatorServer, saveOperatorServer } from '../operatorServer';
import { operatorResumeGate } from '../operatorResume';
import { clearAppTooOld } from '../appTooOld';
import { resetUpgradeNotice } from '../upgradeNotice';
import { resetFacilityCapabilities } from '../facilityCapabilities';
import { clearOfflineStarted } from '../offlineStart';
import { awaitIdentityGate, cacheUserProfile, getSessionIdentity, initializeSupabase, storeTokens } from '../supabaseConfig';
import { getSessionGeneration } from '../sessionLifecycle';
import { getAllGRNItems } from '@/services/grn-service';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn(), getState: () => ({ auth: {} }) } }));

const A = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const anon = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'test-user', session_id: 'test-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.test-signature`;
const secure = new Map<string, string>();
const profile = { id: 'profile-1', auth_user_id: 'test-user', name: 'Asha Fictional', role: 'staff', active: true };
const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, headers: new Headers(), url: '', json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } }) as unknown as Response;
const discovery = () => json({ success: true, data: {
  supabaseUrl: A.origin, anonKey: anon, environment: 'production', version: '0.1.0', maintenanceMode: false,
  instanceId: A.instanceId, displayName: A.displayName, companyName: A.companyName, canonicalOrigin: A.origin,
  supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: { sync: true },
  urls: { publicConfig: `${A.origin}/functions/v1/get-public-config`, fullConfig: `${A.origin}/functions/v1/get-config` },
} });
const grnList = () => json([{ success: true, data: [{ id: 'grn-1' }], pagination: { limit: 20, offset: 0, total_count: 1 } }]);

type Server = 'online' | 'down' | 'refuses';
let server: Server = 'online';
const requests: string[] = [];
const route = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  requests.push(url);
  if (server === 'down') throw new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "warehouse.example.test": No address associated with hostname');
  if (server === 'refuses') return json({ success: false, code: 'session_ended', message: 'Session ended' }, 401);
  if (url.includes('/functions/v1/get-public-config')) return discovery();
  if (url.includes('/rpc/get_all_grn_items')) return grnList();
  return json({});
});
const never = () => { throw new Error('no cleanup expected here'); };
const oldFetch = global.fetch;
let removeVerifier = () => {};

/** The gate's verifier, as app/_layout.tsx installs it. */
const installLayoutVerifier = () => operatorResumeGate.installVerifier(current =>
  verifyForegroundOperator(current, async () => {}, config => initializeSupabase(config.supabaseUrl, config.anonKey)));

/** The app's normal retry of a read: a few tries, no restart. */
async function withRetries<T>(attempt: () => Promise<T>, ok: (value: T) => boolean, tries = 3) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const value = await attempt();
      if (ok(value)) return { ok: true as const, value };
      last = value;
    } catch (error) { last = error; }
  }
  return { ok: false as const, last };
}

beforeEach(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  secure.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  await AsyncStorage.clear();
  clearAppTooOld(); resetUpgradeNotice(); resetFacilityCapabilities(); clearOfflineStarted();
  requests.length = 0;
  server = 'online';
  global.fetch = route as unknown as typeof fetch;
  await loadOperatorServer();
  await saveOperatorServer(A, false);
  initializeSupabase(A.origin, anon);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await cacheUserProfile(profile);
  expect(await getSessionIdentity()).not.toBeNull();
  // An online start first: the app keeps the facility's config for the offline start, and the person is signed in.
  expect((await verifySelectedOperator(() => true, never)).kind).toBe('verified');
  removeVerifier = installLayoutVerifier();
});
afterEach(() => { removeVerifier(); jest.restoreAllMocks(); });
afterAll(() => { global.fetch = oldFetch; });

/** Force-stop and launch with the network off: the start is offline, and the facility check stays required (app/_layout.tsx). */
async function launchOffline() {
  server = 'down';
  const result = await verifySelectedOperator(() => true, never);
  expect(result.kind).toBe('offline');
  operatorResumeGate.suspend();
  await expect(awaitIdentityGate(getSessionGeneration())).rejects.toThrow('Warehouse identity verification required');
}

describe('after an offline start, when the server answers again', () => {
  it('the identity gate opens and a GRN read succeeds, with no restart', async () => {
    await launchOffline();
    server = 'online';
    const gate = await withRetries(() => awaitIdentityGate(getSessionGeneration()).then(() => true), v => v);
    expect(gate.ok).toBe(true);
    const read = await withRetries(() => getAllGRNItems(), result => result.success === true);
    expect(read.ok).toBe(true);
    expect(operatorResumeGate.isVerified()).toBe(true);
  });

  it('a refusal on reconnect still ends the session: the gate stays shut and no GRN read succeeds', async () => {
    await launchOffline();
    server = 'refuses';
    const read = await withRetries(() => getAllGRNItems(), result => result.success === true);
    expect(read.ok).toBe(false);
    expect(operatorResumeGate.isVerified()).toBe(false);
    expect(requests.filter(url => url.includes('/rpc/get_all_grn_items'))).toEqual([]);
  });
});
