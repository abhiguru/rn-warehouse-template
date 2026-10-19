/**
 * Review 2026-10-13 R2: `auth.initializeStatus` tells the tabs layout whether
 * the session restore (initializeAuth) has already run for the current session
 * generation, so a start of the app restores once (at the root), not twice.
 */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { initializeAuth, logout, setUserProfile } from '../slices/authSlice';
import { advanceSessionGeneration, getSessionGeneration } from '@/config/sessionLifecycle';

let releaseRead: (() => void) | undefined;
const mockGetStoredToken = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: () => ({}),
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
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearAuthenticatedCache: jest.fn(), refreshPublicConfig: jest.fn(), clearCache: jest.fn() } }));
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
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  mockGetStoredToken.mockReset();
  releaseRead = undefined;
  mockGetStoredToken.mockImplementation(
    () => new Promise(resolve => { releaseRead = () => resolve({ isValid: false }); })
  );
});

it('starts idle, is pending for the generation it began in, and settles when the restore ends', async () => {
  const store = makeStore();
  expect(store.getState().auth.initializeStatus ?? 'idle').toBe('idle');
  const generation = getSessionGeneration();
  const restore = store.dispatch(initializeAuth());
  expect(store.getState().auth.initializeStatus).toBe('pending');
  expect(store.getState().auth.initializeGeneration).toBe(generation);
  await tick();
  releaseRead!();
  await restore;
  expect(store.getState().auth.initializeStatus).toBe('settled');
  expect(store.getState().auth.initializeGeneration).toBe(generation);
});

it('a restore that ends after the session changed settles for the old generation only', async () => {
  const store = makeStore();
  const generation = getSessionGeneration();
  const restore = store.dispatch(initializeAuth());
  await tick();
  advanceSessionGeneration();
  releaseRead!();
  await restore;
  expect(store.getState().auth.initializeStatus).toBe('settled');
  expect(store.getState().auth.initializeGeneration).toBe(generation);
  expect(getSessionGeneration()).not.toBe(generation);
});

it('a sign-in that sets the profile while a restore runs leaves the status idle, not pending', async () => {
  const store = makeStore();
  const restore = store.dispatch(initializeAuth());
  await tick();
  advanceSessionGeneration();
  store.dispatch(setUserProfile(profile));
  expect(store.getState().auth.initializeStatus).toBe('idle');
  releaseRead!();
  await restore;
  // The superseded restore's answer is ignored, and does not mark anything settled.
  expect(store.getState().auth.initializeStatus).toBe('idle');
  expect(store.getState().auth.userProfile).toEqual(profile);
});

it('a profile update with no restore running keeps the settled status', async () => {
  const store = makeStore();
  const restore = store.dispatch(initializeAuth());
  await tick();
  releaseRead!();
  await restore;
  store.dispatch(setUserProfile(profile));
  expect(store.getState().auth.initializeStatus).toBe('settled');
});

it('a sign-out returns the status to idle', async () => {
  const store = makeStore();
  const restore = store.dispatch(initializeAuth());
  await tick();
  releaseRead!();
  await restore;
  mockGetStoredToken.mockResolvedValue({ isValid: false });
  await store.dispatch(logout({ localOnly: true }));
  expect(store.getState().auth.initializeStatus).toBe('idle');
});
