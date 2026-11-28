/**
 * WH-298 phone finding S3: with aeroplane mode on, force-stop then launch, a facility with a copy showed "Couldn't load
 * app settings" (the config fetch failed with `fetch failed: java.net.UnknownHostException ...`, Expo's error, which the
 * offline start did not know as "no answer") and never reached the copy. A start whose facility check gets no answer
 * opens from the config kept the last time the app adopted that facility's config (`offline_start_v1`).
 *
 * Real: `verifySelectedOperator` (the start), `discoverOperator`, `transportFetch`, `openFacility` (the sign-in that must
 * keep the record), `offlineStart`, `operatorServer` (saved selection), the server-switch sequence. Faked: only the network
 * (`fetch`), the async-storage mock, the central token and the facility's exchange answer, the two reads of the signed-in
 * state (`getStoredToken`, `getCachedUserProfile`), and what the switch cleanup calls (as in openFacility.test.ts).
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 phone S3) =====
 *  - The record is written by the sign-in itself: (a) and (e) sign in through `openFacility` and write nothing by hand.
 *    `rememberOfflineStart` is used only where a sign-in cannot be driven: (c), another facility's record.
 *  - Observable: `verifySelectedOperator` answers `{ kind: 'offline', config }`, or throws the fetch's own error as today.
 *  - The error is Expo's `new Error('fetch failed: java.net.UnknownHostException ...')`, as seen on the phone.
 * =====================================================
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySelectedOperator } from '../operatorBootstrap';
import { openFacility } from '../openFacility';
import { saveOperatorServer, loadOperatorServer } from '../operatorServer';
import { addMyFacility } from '../centralFacilities';
import { resetCentralStateForTests, setCentralState } from '../centralState';
import { requestFacilityToken } from '../centralSession';
import { exchangeCentralIdentity } from '../supabaseConfig';
import { clearAppTooOld } from '../appTooOld';
import { resetUpgradeNotice } from '../upgradeNotice';
import { resetFacilityCapabilities } from '../facilityCapabilities';
import { clearOfflineStarted, rememberOfflineStart } from '../offlineStart';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
const ISSUER = 'https://identity.example.test';
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: ISSUER, issuer: ISSUER }),
  isCentralLoginConfigured: () => true,
}));
jest.mock('../centralSession', () => ({ requestFacilityToken: jest.fn() }));
jest.mock('../operatorServer', () => {
  const actual = jest.requireActual('../operatorServer');
  return {
    ...actual,
    stageOperatorServer: jest.fn(async () => {}),
    commitStagedOperatorServer: jest.fn(async (server: never) => { await actual.saveOperatorServer(server, false); }),
    clearOperatorServer: jest.fn(async () => {}),
  };
});
let mockProfile: { id: string; role: string; name: string } | null = null;
jest.mock('../supabaseConfig', () => ({
  getStoredToken: jest.fn(async () => ({ authToken: 'header.payload.sig', isValid: false })),
  getCachedUserProfile: jest.fn(async () => mockProfile),
  RequestTimeoutError: class RequestTimeoutError extends Error {},
  initializeSupabase: jest.fn(),
  beginOperatorSwitch: jest.fn(() => true),
  endOperatorSwitch: jest.fn(),
  getPendingEnrollmentToken: jest.fn(async () => null),
  isOperatorSwitchFree: jest.fn(() => true),
  clearPendingEnrollment: jest.fn(),
  signOutPendingEnrollment: jest.fn(),
  exchangeCentralIdentity: jest.fn(),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/store', () => ({
  store: {
    getState: () => ({ auth: {} }),
    dispatch: jest.fn((action: { type: string }) => (action.type === 'test/logout' ? { unwrap: async () => undefined } : action)),
  },
}));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  setUserProfile: jest.fn((profile: unknown) => ({ type: 'auth/setUserProfile', payload: profile })),
}));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: jest.fn(() => 0) } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const A = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const B = { origin: 'https://other-cold.example.test', instanceId: 'instance-other', displayName: 'Other', companyName: 'Other Cold Store' };
const previous = { origin: 'https://south-cold.example.test', instanceId: 'instance-south', displayName: 'South', companyName: 'South Cold Store' };
const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '' };
const anon = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
type Facility = typeof A;
const publicConfig = (facility: Facility, displayName = facility.displayName) => ({
  supabaseUrl: facility.origin, anonKey: anon, environment: 'production', version: '0.1.0', maintenanceMode: false,
  instanceId: facility.instanceId, displayName, companyName: facility.companyName, canonicalOrigin: facility.origin,
  supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: { sync: true },
  centralLogin: { issuer: ISSUER },
  urls: { publicConfig: `${facility.origin}/functions/v1/get-public-config`, fullConfig: `${facility.origin}/functions/v1/get-config` },
});
const answer = (facility: Facility, displayName?: string) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data: publicConfig(facility, displayName) }) }) as Response;
const refusal = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;
const expoFailure = (cause = 'java.net.UnknownHostException: Unable to resolve host "north-cold.example.test": No address associated with hostname') =>
  new Error(`fetch failed: ${cause}`);
const noAnswer = (error = expoFailure()) => jest.mocked(global.fetch).mockRejectedValue(error);
const never = () => { throw new Error('no cleanup expected here'); };
const oldFetch = global.fetch;

/** The person signs in to facility A through My facilities: the facility answers its discovery and the exchange. */
async function signInThroughMyFacilities(facility: Facility = A, displayName?: string) {
  jest.mocked(global.fetch).mockResolvedValue(answer(facility, displayName));
  await addMyFacility('asha', { origin: facility.origin, name: facility.companyName, city: 'Rajkot' });
  expect(await openFacility(facility.origin, facility.companyName)).toEqual({ kind: 'login' });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  clearAppTooOld(); resetUpgradeNotice(); resetFacilityCapabilities(); clearOfflineStarted();
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER });
  await loadOperatorServer();
  await saveOperatorServer(previous, false);
  global.fetch = jest.fn();
  mockProfile = { id: 'profile-1', role: 'staff', name: 'Asha Fictional' };
  jest.mocked(requestFacilityToken).mockResolvedValue({ ok: true, identityToken: 'identity-token-1' } as never);
  jest.mocked(exchangeCentralIdentity).mockResolvedValue({
    success: true, data: { action: 'login', session: null, user: null, userProfile: { id: 'profile-1', role: 'staff', name: 'Asha Fictional' }, customAuth: true },
  } as never);
});
afterAll(() => { global.fetch = oldFetch; });

describe('a start with no answer from the facility', () => {
  it('(a) after a sign-in through My facilities, the app opens offline with the kept config, not "Couldn\'t load app settings"', async () => {
    await signInThroughMyFacilities(A, 'Name One');
    noAnswer();
    const result = await verifySelectedOperator(() => true, never);
    expect(result.kind).toBe('offline');
    if (result.kind !== 'offline') return;
    expect(result.server).toMatchObject({ origin: A.origin, instanceId: A.instanceId });
    expect(result.config).toMatchObject({ supabaseUrl: A.origin, displayName: 'Name One', capabilities: { sync: true } });
  });

  it('(a2) a TLS-style failure also opens offline from the copy, and nothing goes out with the token', async () => {
    await signInThroughMyFacilities();
    noAnswer(expoFailure('javax.net.ssl.SSLHandshakeException: Chain validation failed'));
    jest.mocked(global.fetch).mockClear();
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
    const sent = jest.mocked(global.fetch).mock.calls;
    expect(sent.length).toBeGreaterThan(0);
    for (const [, init] of sent) {
      expect(JSON.stringify((init as RequestInit | undefined)?.headers ?? {}).toLowerCase()).not.toContain('authorization');
      expect(String((init as RequestInit | undefined)?.body ?? '')).not.toContain('header.payload.sig');
    }
  });

  it('(b) nothing kept for this facility: today\'s error stays', async () => {
    noAnswer();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow('UnknownHostException');
  });

  it('(c) the kept config of another facility is never used', async () => {
    await rememberOfflineStart(B, publicConfig(B) as never);
    await saveOperatorServer(A, false);
    noAnswer();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow('UnknownHostException');
  });

  it.each([403, 500, 503])('(d) a refusal (HTTP %s) is an answer: it never falls back to the kept config', async status => {
    await signInThroughMyFacilities();
    jest.mocked(global.fetch).mockResolvedValue(refusal(status));
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('(e) after the first server answer the kept config is replaced: a later no-answer start opens with the newer one', async () => {
    await signInThroughMyFacilities(A, 'Name One');
    jest.mocked(global.fetch).mockResolvedValue(answer(A, 'Name Two'));
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('verified');
    noAnswer();
    const later = await verifySelectedOperator(() => true, never);
    expect(later.kind).toBe('offline');
    if (later.kind === 'offline') expect(later.config.displayName).toBe('Name Two');
  });
});
