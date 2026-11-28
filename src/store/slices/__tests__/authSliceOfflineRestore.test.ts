/**
 * WH-298 review findings 2 and 3 on the session restore of an offline start (authSlice `initializeAuth`; contract
 * section 1 and 3.3). The token is expired and cannot be renewed offline; the run is offline-started; a profile is cached.
 *
 * Real: `initializeAuth`, the auth reducer, `offlineStart`, `operatorServer`. Faked: the signed-in state's reads and the
 * server's profile answer (`getStoredToken`, `getCachedUserProfile`, `refreshCustomJWT`, `reloadUserProfile`) and NetInfo.
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 review) =====
 *  - Finding 3: a cached customer profile is not restored offline: `userProfile` stays null.
 *  - Finding 2: OPEN CHOICE, the trigger of the re-fetch is not decided. "The network returns" is driven here as a NetInfo
 *    connected event (every listener added through `NetInfo.addEventListener`). If Development triggers on another edge
 *    (foreground verify, a request that the server answers), change `networkReturns()` only. The observable outcome is
 *    from the contract: `reloadUserProfile` is asked again and the new role reaches the store.
 *    "Before any write" is not asserted here: no write exists in this slice; it belongs to the sync-engine side.
 * ===================================================
 */
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) } }));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearRecentItems: jest.fn() } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  signOut: jest.fn(async () => ({ success: true })),
  getStoredToken: jest.fn(),
  getCachedUserProfile: jest.fn(),
  cacheUserProfile: jest.fn(),
  clearStoredTokens: jest.fn(),
  getSupabaseClient: jest.fn(),
  refreshCustomJWT: jest.fn(),
  initializeSupabase: jest.fn(),
  reloadUserProfile: jest.fn(async () => null),
  ensureValidTokens: jest.fn(async () => true),
}));
jest.mock('@/services/configService', () => ({
  __esModule: true,
  default: {
    clearAuthenticatedCache: jest.fn(async () => {}),
    getFullConfig: jest.fn(async () => ({})),
    refreshPublicConfig: jest.fn(async () => ({ supabaseUrl: 'http://localhost:18000', anonKey: 'anon' })),
  },
}));
jest.mock('@/services/user-service', () => ({ UserService: { deleteAccount: jest.fn(async () => ({ success: true })) } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
const mockNetListeners: Array<(state: unknown) => void> = [];
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((listener: (state: unknown) => void) => {
      mockNetListeners.push(listener);
      return () => { mockNetListeners.splice(mockNetListeners.indexOf(listener), 1); };
    }),
    fetch: jest.fn(async () => ({ type: 'wifi', isConnected: true, isInternetReachable: true, details: null })),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import { getCachedUserProfile, getStoredToken, getSupabaseClient, refreshCustomJWT, reloadUserProfile } from '@/config/supabaseConfig';
import { loadOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { clearOfflineStarted, markOfflineStarted, rememberOfflineStart } from '@/config/offlineStart';
import authReducer, { initializeAuth } from '../authSlice';

const selected = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const keptConfig = { supabaseUrl: selected.origin, anonKey: 'anon', capabilities: { sync: true } } as never;
const staff = { id: 'user-1', auth_user_id: 'auth-1', name: 'Asha Fictional', role: 'staff', assignedCustomerIds: [] };
const customer = { id: 'user-2', auth_user_id: 'auth-2', name: 'Ravi Fictional', role: 'customer', assignedCustomerIds: ['c1'] };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const makeStore = () => configureStore({ reducer: { auth: authReducer } });
// The real trigger (Development, 4d93670a): the first answer of the server after an offline start, which
// operatorBootstrap reports through clearOfflineStarted().
const networkReturns = async () => {
  clearOfflineStarted();
  await flush();
};

/** An offline start: expired token that cannot be renewed with no connection, the kept config, the cached profile. */
async function restoreOffline(cached: unknown) {
  jest.mocked(getSupabaseClient).mockReturnValue({} as never);
  jest.mocked(getStoredToken).mockResolvedValue({ type: 'jwt', isValid: false, authToken: 'header.payload.sig', refreshToken: 'r'.repeat(64), expiresAt: Date.now() - 60_000 } as never);
  jest.mocked(refreshCustomJWT).mockResolvedValue(null as never);
  jest.mocked(getCachedUserProfile).mockResolvedValue(cached as never);
  jest.mocked(reloadUserProfile).mockResolvedValue(null as never); // no answer while offline
  const store = makeStore();
  await store.dispatch(initializeAuth());
  await flush();
  return store;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockNetListeners.length = 0;
  await AsyncStorage.clear();
  await loadOperatorServer();
  await saveOperatorServer(selected);
  await rememberOfflineStart(selected, keptConfig);
  markOfflineStarted();
});
afterEach(() => { clearOfflineStarted(); });

describe('finding 3: a customer account gets no expired-token restore', () => {
  it('baseline: a staff account is restored from its cached profile offline', async () => {
    const store = await restoreOffline(staff);
    expect(store.getState().auth.userProfile).toMatchObject({ id: 'user-1', role: 'staff' });
  });

  it('a customer account is not restored: no profile, nothing to open into', async () => {
    const store = await restoreOffline(customer);
    expect(store.getState().auth.userProfile).toBeNull();
  });
});

describe('finding 2: the role is re-fetched when the network returns after an offline restore', () => {
  it('a demoted account (now customer) shows the new role once the server answers', async () => {
    const store = await restoreOffline(staff);
    expect(store.getState().auth.userProfile?.role).toBe('staff');
    const callsOffline = jest.mocked(reloadUserProfile).mock.calls.length;
    jest.mocked(reloadUserProfile).mockResolvedValue({ ...staff, role: 'customer' } as never);
    await networkReturns();
    expect(jest.mocked(reloadUserProfile).mock.calls.length).toBeGreaterThan(callsOffline);
    expect(store.getState().auth.userProfile?.role).toBe('customer');
  });
});
