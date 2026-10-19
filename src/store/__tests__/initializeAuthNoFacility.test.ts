/**
 * The facility session restore (`initializeAuth`) at a start with no facility
 * selected.
 *
 * With central login the app shell renders without a facility (app/_layout.tsx),
 * so the restore runs before any facility backend is known. There is no client
 * and no facility session then: that is the normal start of such a build, not a
 * failure. Phone report 2026-10-12: every such start logged
 * "[AuthSlice] Initialize auth error: Configuration must be loaded first." and
 * left that text in `auth.error`.
 *
 * Without central login nothing changes: the shell is not rendered until a
 * server is chosen, and a restore without a client still fails loudly.
 */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { initializeAuth } from '../slices/authSlice';

let mockCentralOn = true;
let mockServer: unknown = null;
let mockClient: unknown;
const mockGetSupabaseClient = jest.fn(() => {
  // As getSupabaseClient in src/config/supabaseConfig.ts when nothing was initialised.
  if (!mockClient) throw new Error('Configuration must be loaded first.');
  return mockClient;
});
const mockGetStoredToken = jest.fn(async () => ({ isValid: false }));

jest.mock('@/config/envConfig', () => ({
  ...jest.requireActual('@/config/envConfig'),
  isCentralLoginConfigured: () => mockCentralOn,
}));
jest.mock('@/config/operatorServer', () => ({
  ...jest.requireActual('@/config/operatorServer'),
  getActiveOperatorServer: () => mockServer,
}));
jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  getStoredToken: () => mockGetStoredToken(),
  getCachedUserProfile: jest.fn(async () => null),
  reloadUserProfile: jest.fn(async () => null),
  ensureValidTokens: jest.fn(async () => true),
  cacheUserProfile: jest.fn(async () => {}),
  clearStoredTokens: jest.fn(async () => {}),
  refreshCustomJWT: jest.fn(async () => null),
  initializeSupabase: jest.fn(),
  signOut: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearAuthenticatedCache: jest.fn(), refreshPublicConfig: jest.fn() } }));
jest.mock('@/services/user-core-service', () => ({ getUserByIdDirect: jest.fn() }));
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn() } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn() } }));
jest.mock('@/services/user-service', () => ({ UserService: { deleteAccount: jest.fn() } }));
jest.mock('@/utils/otpRateLimiter', () => ({ clearAllRateLimits: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ extendSessionMarker: jest.fn(async () => {}) }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('../sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));

const FACILITY = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const CLIENT = {};
const makeStore = () => configureStore({ reducer: { auth: authReducer } });

let errorLog: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockCentralOn = true;
  mockServer = null;
  mockClient = undefined;
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('central login on', () => {
  it('no facility selected: the restore ends quietly as "no facility session", with no error logged or stored', async () => {
    const store = makeStore();
    const action = await store.dispatch(initializeAuth());

    expect(action.type).toBe('auth/initialize/fulfilled');
    expect(action.payload).toEqual({ session: null, user: null, userProfile: null });
    // No facility backend is asked for anything, and none is needed.
    expect(mockGetSupabaseClient).not.toHaveBeenCalled();
    expect(mockGetStoredToken).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    const auth = store.getState().auth;
    expect(auth.error).toBeNull();
    expect(auth.isLoading).toBe(false);
    expect(auth.initializeRequest).toBeUndefined();
    expect(auth.userProfile).toBeNull();
    expect(auth.session).toBeNull();
    expect(auth.user).toBeNull();
  });

  it('a facility selected: the stored facility session is looked for as before', async () => {
    mockServer = FACILITY;
    mockClient = CLIENT;
    const store = makeStore();
    const action = await store.dispatch(initializeAuth());

    expect(action.type).toBe('auth/initialize/fulfilled');
    expect(mockGetSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mockGetStoredToken).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.error).toBeNull();
  });

  it('a facility selected but no client (a broken start): still a logged failure, not hidden', async () => {
    mockServer = FACILITY;
    const store = makeStore();
    const action = await store.dispatch(initializeAuth());

    expect(action.type).toBe('auth/initialize/rejected');
    // Written through the redacting logger (src/utils/logger.ts): its line, then the error as text.
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/ERROR \[AuthSlice\] Initialize auth error:$/), expect.stringContaining('Error: '));
    expect(store.getState().auth.error).toBe('Configuration must be loaded first.');
  });
});

describe('central login off', () => {
  it('a restore without a client fails and is logged exactly as before', async () => {
    mockCentralOn = false;
    const store = makeStore();
    const action = await store.dispatch(initializeAuth());

    expect(action.type).toBe('auth/initialize/rejected');
    expect(action.payload).toBe('Configuration must be loaded first.');
    expect(mockGetSupabaseClient).toHaveBeenCalledTimes(1);
    // Written through the redacting logger (src/utils/logger.ts): its line, then the error as text.
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/ERROR \[AuthSlice\] Initialize auth error:$/), expect.stringContaining('Error: '));
    const auth = store.getState().auth;
    expect(auth.error).toBe('Configuration must be loaded first.');
    expect(auth.isLoading).toBe(false);
    expect(auth.initializeRequest).toBeUndefined();
  });

  it('a selected facility restores as before', async () => {
    mockCentralOn = false;
    mockServer = FACILITY;
    mockClient = CLIENT;
    const store = makeStore();
    const action = await store.dispatch(initializeAuth());

    expect(action.type).toBe('auth/initialize/fulfilled');
    expect(mockGetSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mockGetStoredToken).toHaveBeenCalledTimes(1);
  });
});
