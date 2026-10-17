/**
 * The facility session restore (`initializeAuth`) for a facility listed as stale
 * (src/config/staleFacilitySession.ts; ops review 2026-10-17, M08).
 *
 * An exchange that finished after the central person changed may have left that
 * facility selected, with the previous person's session stored. If the app is closed
 * before the cleanup has run, the next start must not restore that session for
 * whoever opens the app: the restore answers "no facility session", without reading
 * the stored session, and the root's start-up cleanup ends it (app/_layout.tsx).
 */
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authReducer, { initializeAuth } from '../slices/authSlice';
import { markStaleFacility } from '@/config/staleFacilitySession';

let mockCentralOn = true;
let mockServer: unknown = null;
const PROFILE = { id: 'profile-asha', auth_user_id: 'user-asha', name: 'Asha Fictional', role: 'customer' };
const mockGetStoredToken = jest.fn(async () => ({
  isValid: true,
  type: 'jwt',
  authToken: 'stored-access-token',
  refreshToken: 'stored-refresh-token',
  expiresAt: Date.now() + 60 * 60 * 1000,
}));
const mockGetCachedUserProfile = jest.fn(async () => PROFILE);

jest.mock('@/config/envConfig', () => ({
  ...jest.requireActual('@/config/envConfig'),
  isCentralLoginConfigured: () => mockCentralOn,
}));
jest.mock('@/config/operatorServer', () => ({
  ...jest.requireActual('@/config/operatorServer'),
  getActiveOperatorServer: () => mockServer,
}));
jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }),
  getStoredToken: () => mockGetStoredToken(),
  getCachedUserProfile: () => mockGetCachedUserProfile(),
  reloadUserProfile: jest.fn(async () => null),
  ensureValidTokens: jest.fn(async () => true),
  cacheUserProfile: jest.fn(async () => {}),
  clearStoredTokens: jest.fn(async () => {}),
  refreshCustomJWT: jest.fn(async () => null),
  initializeSupabase: jest.fn(),
  signOut: jest.fn(async () => ({ success: true })),
}));
jest.mock('../slices/configSlice', () => {
  const { createAsyncThunk } = jest.requireActual('@reduxjs/toolkit');
  return { fetchFullConfig: createAsyncThunk('config/fetchFull', async () => ({})), clearFullConfig: () => ({ type: 'config/clear' }) };
});
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearAuthenticatedCache: jest.fn(), refreshPublicConfig: jest.fn() } }));
jest.mock('@/services/user-core-service', () => ({ getUserByIdDirect: jest.fn() }));
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn() } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn() } }));
jest.mock('@/services/user-service', () => ({ UserService: { deleteAccount: jest.fn() } }));
jest.mock('@/utils/otpRateLimiter', () => ({ clearAllRateLimits: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ extendSessionMarker: jest.fn(async () => {}) }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('../sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));

const NORTH = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const makeStore = () => configureStore({ reducer: { auth: authReducer } });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockCentralOn = true;
  mockServer = NORTH;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('control: with nothing listed, the stored session of the selected facility is restored', async () => {
  const store = makeStore();
  const action = await store.dispatch(initializeAuth());
  expect(action.type).toBe('auth/initialize/fulfilled');
  expect(store.getState().auth.userProfile).toEqual(PROFILE);
});

it('the selected facility is listed as stale: nothing is restored and the stored session is not even read', async () => {
  await markStaleFacility({ origin: NORTH.origin, instanceId: NORTH.instanceId });
  const store = makeStore();
  const action = await store.dispatch(initializeAuth());
  expect(action.type).toBe('auth/initialize/fulfilled');
  expect(action.payload).toEqual({ session: null, user: null, userProfile: null });
  expect(store.getState().auth.userProfile).toBeNull();
  expect(mockGetStoredToken).not.toHaveBeenCalled();
  expect(mockGetCachedUserProfile).not.toHaveBeenCalled();
});

it('another instance at the same address is listed: the selected one restores as before', async () => {
  await markStaleFacility({ origin: NORTH.origin, instanceId: 'instance-north-old' });
  const store = makeStore();
  await store.dispatch(initializeAuth());
  expect(store.getState().auth.userProfile).toEqual(PROFILE);
});

it('central login off: the list plays no part (it is only written with central login)', async () => {
  mockCentralOn = false;
  await markStaleFacility({ origin: NORTH.origin, instanceId: NORTH.instanceId });
  const store = makeStore();
  await store.dispatch(initializeAuth());
  expect(store.getState().auth.userProfile).toEqual(PROFILE);
});
