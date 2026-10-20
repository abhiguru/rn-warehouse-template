/**
 * What `deleteAccount` says when it rejects: above all whether the server
 * deleted the account, which src/store/centralSignOut.ts decides on. The text
 * shown is the one the screens showed before the payload existed.
 */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { deleteAccount, isDeleteAccountRejection, setUserProfile } from '../slices/authSlice';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { UserService } from '@/services/user-service';
import { signOut } from '@/config/supabaseConfig';

jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: jest.fn(),
  getStoredToken: jest.fn(async () => ({ isValid: false })),
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
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) } }));
jest.mock('@/services/user-service', () => ({ UserService: { deleteAccount: jest.fn() } }));
jest.mock('@/utils/otpRateLimiter', () => ({ clearAllRateLimits: jest.fn(async () => {}) }));
jest.mock('@/utils/secureSessionMarker', () => ({ extendSessionMarker: jest.fn(async () => {}) }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('../sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));

const profile = { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' } as never;
const makeStore = () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  store.dispatch(setUserProfile(profile));
  return store;
};
const deletion = jest.mocked(UserService.deleteAccount);
const run = async (store: ReturnType<typeof makeStore>) => {
  try {
    await store.dispatch(deleteAccount()).unwrap();
    return 'fulfilled';
  } catch (error) {
    return error;
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(signOut).mockResolvedValue({ success: true });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('the server refused: REFUSED, not deleted, the server\'s text', async () => {
  deletion.mockResolvedValue({ success: false, message: 'x', error: 'Only the last administrator', outcome: 'refused' });
  const store = makeStore();
  const result = await run(store);
  expect(isDeleteAccountRejection(result)).toBe(true);
  expect(result).toEqual({ code: 'REFUSED', serverDeleted: false, message: 'Only the last administrator' });
  expect(store.getState().auth.userProfile).toEqual(profile);
  expect(store.getState().auth.error).toBe('Only the last administrator');
});

it('an auth refusal that forced a sign-out during the call: still REFUSED, not deleted, with the session-changed text as before', async () => {
  deletion.mockImplementation(async () => {
    // handleGlobalAuthError dispatched forceLogoutOnInvalidToken: the generation moved.
    advanceSessionGeneration();
    return { success: false, message: 'x', error: 'JWT expired', outcome: 'refused' };
  });
  expect(await run(makeStore())).toEqual({ code: 'REFUSED', serverDeleted: false, message: 'Session changed' });
});

it('no answer from the server: UNKNOWN, deletion not known', async () => {
  deletion.mockResolvedValue({ success: false, message: 'x', error: 'Network request failed', outcome: 'unknown' });
  expect(await run(makeStore())).toEqual({ code: 'UNKNOWN', serverDeleted: null, message: 'Check your connection and try again.' });
});

it('deleted, then the session generation moved: SESSION_CHANGED, deleted', async () => {
  deletion.mockImplementation(async () => {
    advanceSessionGeneration();
    return { success: true, message: 'Account deleted' };
  });
  expect(await run(makeStore())).toEqual({ code: 'SESSION_CHANGED', serverDeleted: true, message: 'Session changed' });
  expect(signOut).not.toHaveBeenCalled();
});

it('deleted, then its own sign-out failed: SESSION_CHANGED, deleted', async () => {
  deletion.mockResolvedValue({ success: true, message: 'Account deleted' });
  jest.mocked(signOut).mockRejectedValue(new Error('storage unavailable'));
  expect(await run(makeStore())).toEqual({ code: 'SESSION_CHANGED', serverDeleted: true, message: 'Session changed' });
});

it('deleted and signed out: fulfilled, the store emptied', async () => {
  deletion.mockResolvedValue({ success: true, message: 'Account deleted' });
  const store = makeStore();
  expect(await run(store)).toBe('fulfilled');
  expect(store.getState().auth.userProfile).toBeNull();
});
