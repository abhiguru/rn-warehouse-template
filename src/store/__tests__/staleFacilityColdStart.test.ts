/**
 * A cold start with a facility on the stale list (src/config/staleFacilitySession.ts), in the
 * order app/_layout.tsx runs it, with the real session store, operator selection, cleanup and
 * restore (review 2026-10-18 of M08, finding 1b).
 *
 *   1. BootstrapApp's mount effect starts `retryStaleFacilityCleanup` first;
 *   2. then `bootstrapApp()`, whose first step (`verifySelectedOperator`) reads the saved
 *      selection into memory (`loadOperatorServer`);
 *   3. once the bootstrap is ready, ThemedContent restores the facility session (`initializeAuth`).
 *
 * At step 1 the selection in memory is still empty. The cleanup must not take that for "North
 * is not selected", remove the entry and leave the earlier person's session for step 3 to restore.
 */
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import authReducer, { initializeAuth } from '../slices/authSlice';
import { retryStaleFacilityCleanup } from '../operatorSwitch';
import { isStaleFacility, markStaleFacility } from '@/config/staleFacilitySession';
import { clearOperatorServer, getActiveOperatorServer, loadOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { cacheUserProfile, getStoredToken, initializeSupabase, storeTokens } from '@/config/supabaseConfig';

let mockCentralOn = true;
jest.mock('@/config/envConfig', () => ({
  ...jest.requireActual('@/config/envConfig'),
  isCentralLoginConfigured: () => mockCentralOn,
}));
jest.mock('../slices/configSlice', () => {
  const { createAsyncThunk } = jest.requireActual('@reduxjs/toolkit');
  return { fetchFullConfig: createAsyncThunk('config/fetchFull', async () => ({})), clearFullConfig: () => ({ type: 'config/clear' }) };
});
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) },
}));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/services/user-core-service', () => ({ getUserByIdDirect: jest.fn() }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn(), extendSessionMarker: jest.fn(async () => {}) }));
jest.mock('@/utils/otpRateLimiter', () => ({ checkOTPRateLimit: jest.fn(), recordOTPRequest: jest.fn(), clearAllRateLimits: jest.fn(async () => {}) }));

// https: a saved selection is validated when it is read (loadOperatorServer).
const NORTH = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const ASHA = { id: 'profile-asha', auth_user_id: 'asha', name: 'Asha Fictional', role: 'customer', assignedCustomerIds: [] };
const secure = new Map<string, string>();
const rpc = jest.fn();
const originalFetch = global.fetch;
const jwt = () =>
  `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(
    JSON.stringify({ sub: 'asha', session_id: 'stale-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })
  )}.test-signature`;

/** What the phone holds when the app is closed during the stale cleanup: North saved, Asha's session stored, North listed. */
async function closedDuringCleanup() {
  await saveOperatorServer(NORTH, false);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await cacheUserProfile(ASHA);
  await markStaleFacility({ origin: NORTH.origin, instanceId: NORTH.instanceId });
  // The process ends: memory forgets the selection, storage keeps it.
  await clearOperatorServer();
  await AsyncStorage.setItem('operator_server_v1', JSON.stringify(NORTH));
  expect(getActiveOperatorServer()).toBeNull();
}

beforeEach(async () => {
  jest.clearAllMocks();
  secure.clear();
  await AsyncStorage.clear();
  mockCentralOn = true;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  jest.mocked(createClient).mockReturnValue({
    rpc,
    from: jest.fn(),
  } as unknown as ReturnType<typeof createClient>);
  rpc.mockResolvedValue({ data: [], error: null });
  initializeSupabase(NORTH.origin, 'local-test-anon');
  global.fetch = jest.fn() as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { global.fetch = originalFetch; });

it('control: without the entry the same start restores Asha (so the cases below can fail)', async () => {
  await closedDuringCleanup();
  await AsyncStorage.removeItem('central_stale_facility_sessions_v1');
  await loadOperatorServer();
  const store = configureStore({ reducer: { auth: authReducer } });
  await store.dispatch(initializeAuth());
  expect(store.getState().auth.userProfile).toMatchObject({ id: 'profile-asha' });
});

it('the cleanup and the selection read start in the same tick, as BootstrapApp starts them: North is left and nothing is restored', async () => {
  await closedDuringCleanup();
  const store = configureStore({ reducer: { auth: authReducer } });
  await Promise.all([retryStaleFacilityCleanup(store.dispatch), loadOperatorServer()]);
  await store.dispatch(initializeAuth());
  expect(store.getState().auth.userProfile).toBeNull();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(await isStaleFacility(NORTH.origin)).toBe(false);
});

it('the selection is read only after the cleanup has finished: North is still left and nothing is restored', async () => {
  await closedDuringCleanup();
  const store = configureStore({ reducer: { auth: authReducer } });
  await retryStaleFacilityCleanup(store.dispatch);
  await loadOperatorServer();
  await store.dispatch(initializeAuth());
  expect(store.getState().auth.userProfile).toBeNull();
  expect(await getStoredToken()).toEqual({ isValid: false });
  expect(getActiveOperatorServer()).toBeNull();
});
