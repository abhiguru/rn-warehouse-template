/**
 * Opening a facility commits a new server, which re-runs the bootstrap and
 * dispatches `initializeAuth` again. If that restore reads the secure store
 * BEFORE the exchange has stored the new session and set the profile, and
 * finishes AFTER, its answer ("no session") must not undo the profile: the
 * person would be left on My facilities with a stored session.
 */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { initializeAuth, setUserProfile } from '../slices/authSlice';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';

let releaseRead!: () => void;
const mockGetStoredToken = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }),
  getStoredToken: (...args: unknown[]) => mockGetStoredToken(...args),
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

const profile = { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' } as never;
const makeStore = () => configureStore({ reducer: { auth: authReducer } });

beforeEach(() => {
  mockGetStoredToken.mockReset();
  // The restore's read of the secure store is held until the test releases it;
  // it then reports what it saw at the time it started: no session.
  mockGetStoredToken.mockImplementation(
    () => new Promise(resolve => { releaseRead = () => resolve({ isValid: false }); })
  );
});

it('a restore that read "no session" before the exchange does not clear the profile the exchange set', async () => {
  const store = makeStore();
  const restore = store.dispatch(initializeAuth());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getState().auth.initializeRequest).toBeDefined();

  // Meanwhile the exchange starts a new session generation, stores the facility
  // session and sets the profile (settle() in src/config/openFacility.ts).
  advanceSessionGeneration();
  store.dispatch(setUserProfile(profile));
  expect(store.getState().auth.userProfile).toEqual(profile);

  releaseRead();
  await restore;
  expect(store.getState().auth.userProfile).toEqual(profile);
  expect(store.getState().auth.isLoading).toBe(false);
});

it('the same with the restore started AFTER the new generation, so its generation check cannot help', async () => {
  const store = makeStore();
  advanceSessionGeneration();
  const restore = store.dispatch(initializeAuth());
  await new Promise(resolve => setTimeout(resolve, 0));
  store.dispatch(setUserProfile(profile));
  releaseRead();
  await restore;
  expect(store.getState().auth.userProfile).toEqual(profile);
});

it('without a profile set meanwhile the restore\'s answer is applied as usual', async () => {
  const store = makeStore();
  const restore = store.dispatch(initializeAuth());
  await new Promise(resolve => setTimeout(resolve, 0));
  releaseRead();
  await restore;
  expect(store.getState().auth.userProfile).toBeNull();
  expect(store.getState().auth.isLoading).toBe(false);
});
