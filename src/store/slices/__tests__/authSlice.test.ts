/**
 * Auth Slice Tests
 *
 * Tests for authentication state management
 */

jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) },
}));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) },
}));
jest.mock('@/services/recent-items-service', () => ({
  RecentItemsService: { clearRecentItems: jest.fn() },
}));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}));
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
    refreshPublicConfig: jest.fn(async () => ({ supabaseUrl: 'http://localhost:18000', anonKey: 'anon' })),
  },
}));
jest.mock('@/services/user-service', () => ({
  UserService: { deleteAccount: jest.fn(async () => ({ success: true })) },
}));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => {}),
}));

import { configureStore } from '@reduxjs/toolkit';
import {
  signOut,
  initializeSupabase,
  ensureValidTokens,
  getCachedUserProfile,
  getStoredToken,
  getSupabaseClient,
  reloadUserProfile,
} from '@/config/supabaseConfig';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import authReducer, {
  setPhoneNumber,
  setOtpSent,
  setAuthenticating,
  setVerifyingOTP,
  clearSignOutReason,
  setUserProfile,
  deleteAccount,
  forceLogoutOnInvalidToken,
  logout,
  checkTokenExpiry,
  initializeAuth,
} from '../authSlice';

describe('authSlice', () => {
  const initialState = {
    isLoading: false,
    isAuthenticating: false,
    isVerifyingOTP: false,
    session: null,
    user: null,
    userProfile: null,
    phoneNumber: '',
    otpSent: false,
    error: null,
    signOutReason: null,
  };

  describe('reducers', () => {
    it('should return the initial state', () => {
      expect(authReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });

    it('should handle setPhoneNumber', () => {
      const actual = authReducer(initialState, setPhoneNumber('9876543210'));
      expect(actual.phoneNumber).toBe('9876543210');
    });

    it('should handle setOtpSent', () => {
      const actual = authReducer(initialState, setOtpSent(true));
      expect(actual.otpSent).toBe(true);
    });

    it('should handle setAuthenticating', () => {
      const actual = authReducer(initialState, setAuthenticating(true));
      expect(actual.isAuthenticating).toBe(true);
    });

    it('should handle setVerifyingOTP', () => {
      const actual = authReducer(initialState, setVerifyingOTP(true));
      expect(actual.isVerifyingOTP).toBe(true);
    });

    it('keeps the reason of a forced sign-out until it is dismissed or a profile is set', () => {
      let state = authReducer(initialState, { type: 'auth/forceLogoutOnInvalidToken/pending', meta: { requestId: 'a' } });
      state = authReducer(state, { type: 'auth/forceLogoutOnInvalidToken/fulfilled', meta: { requestId: 'a' }, payload: { reason: 'Keys changed' } });
      expect(state.signOutReason).toBe('Keys changed');
      expect(authReducer(state, clearSignOutReason()).signOutReason).toBeNull();
      expect(authReducer(state, setUserProfile({ id: 'u' } as never)).signOutReason).toBeNull();
    });

    it('keeps the reason through the leave-facility cleanup (its logout), so My facilities can show it', () => {
      let state = authReducer(initialState, { type: 'auth/forceLogoutOnInvalidToken/pending', meta: { requestId: 'a' } });
      state = authReducer(state, { type: 'auth/forceLogoutOnInvalidToken/fulfilled', meta: { requestId: 'a' }, payload: { reason: 'Keys changed' } });
      // leaveFacility dispatches logout(), then clears the session-scoped state; neither touches the reason.
      state = authReducer(state, { type: 'auth/logout/pending', meta: { requestId: 'b' } });
      expect(state.signOutReason).toBe('Keys changed');
      state = authReducer(state, { type: 'auth/logout/fulfilled', meta: { requestId: 'b' }, payload: { localCleared: true } });
      expect(state.signOutReason).toBe('Keys changed');
      state = authReducer(state, { type: 'auth/logout/rejected', meta: { requestId: 'c' } });
      expect(state.signOutReason).toBe('Keys changed');
    });

    it('also keeps the reason when the teardown failed', () => {
      let state = authReducer(initialState, { type: 'auth/forceLogoutOnInvalidToken/pending', meta: { requestId: 'a' } });
      state = authReducer(state, { type: 'auth/forceLogoutOnInvalidToken/rejected', meta: { requestId: 'a', arg: 'Session ended' } });
      expect(state.signOutReason).toBe('Session ended');
    });
  });

  describe('state transitions', () => {
    it('should handle multiple actions in sequence', () => {
      let state = authReducer(initialState, setPhoneNumber('9876543210'));
      state = authReducer(state, setOtpSent(true));
      state = authReducer(state, setVerifyingOTP(true));

      expect(state.phoneNumber).toBe('9876543210');
      expect(state.otpSent).toBe(true);
      expect(state.isVerifyingOTP).toBe(true);
    });
  });
});

test.each([
  'auth/logout',
  'auth/deleteAccount',
  'auth/forceLogoutOnInvalidToken',
])('late %s completion cannot clear a newly signed-in profile', type => {
  let state = authReducer(undefined, {
    type: `${type}/pending`,
    meta: { requestId: 'old' },
  });
  state = authReducer(state, {
    type: 'auth/setUserProfile',
    payload: { id: 'new-user', role: 'customer' },
  });
  state = authReducer(state, {
    type: `${type}/fulfilled`,
    meta: { requestId: 'old' },
    payload: { reason: 'old' },
  });
  expect(state.userProfile?.id).toBe('new-user');
  expect(state.isLoading).toBe(false);
});

test.each(['auth/initialize', 'auth/refreshToken', 'auth/fetchUserProfile'])(
  'logout discards a late %s result',
  type => {
    let state = authReducer(undefined, {
      type: `${type}/pending`,
      meta: { requestId: 'old' },
    });
    state = authReducer(state, {
      type: 'auth/logout/pending',
      meta: { requestId: 'logout' },
    });
    state = authReducer(state, {
      type: `${type}/fulfilled`,
      meta: { requestId: 'old' },
      payload: {
        id: 'old',
        user: { id: 'old' },
        session: {},
        userProfile: { id: 'old' },
      },
    });
    expect(state.userProfile).toBeNull();
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
  }
);

describe('session teardown thunks', () => {
  const makeStore = () => configureStore({ reducer: { auth: authReducer } });
  beforeEach(() => { jest.clearAllMocks(); });

  it('refuses a forced logout while a logout is in flight', async () => {
    const store = makeStore();
    store.dispatch({ type: 'auth/logout/pending', meta: { requestId: 'logout-1' } });
    const refused = await store.dispatch(forceLogoutOnInvalidToken('Session rejected'));
    expect(refused.meta.requestStatus).toBe('rejected');
    expect((refused.meta as { condition?: boolean }).condition).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    expect(clearSessionScopedState).not.toHaveBeenCalled();
    expect(store.getState().auth.forceLogoutRequest).toBeUndefined();
  });

  it('runs one forced logout at a time and accepts a new one after it settles', async () => {
    const store = makeStore();
    const first = store.dispatch(forceLogoutOnInvalidToken('first'));
    const second = await store.dispatch(forceLogoutOnInvalidToken('second'));
    expect((second.meta as { condition?: boolean }).condition).toBe(true);
    expect((await first).meta.requestStatus).toBe('fulfilled');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearSessionScopedState).toHaveBeenCalledTimes(1);
    expect(initializeSupabase).toHaveBeenCalledWith('http://localhost:18000', 'anon');
    expect(store.getState().auth).toMatchObject({ userProfile: null, session: null, user: null, error: 'first', forceLogoutRequest: undefined });
    const third = await store.dispatch(forceLogoutOnInvalidToken('third'));
    expect(third.meta.requestStatus).toBe('fulfilled');
    expect(clearSessionScopedState).toHaveBeenCalledTimes(2);
  });

  it('a failed forced logout releases the guard for the next one', async () => {
    const store = makeStore();
    jest.mocked(signOut).mockRejectedValueOnce(new Error('teardown failed'));
    const failed = await store.dispatch(forceLogoutOnInvalidToken('first'));
    expect(failed.meta.requestStatus).toBe('rejected');
    expect(store.getState().auth.forceLogoutRequest).toBeUndefined();
    expect(store.getState().auth.userProfile).toBeNull();
    const next = await store.dispatch(forceLogoutOnInvalidToken('second'));
    expect(next.meta.requestStatus).toBe('fulfilled');
    expect(clearSessionScopedState).toHaveBeenCalledTimes(2);
  });

  it('logout clears the session-scoped state through the shared teardown', async () => {
    const store = makeStore();
    await store.dispatch(logout()).unwrap();
    expect(signOut).toHaveBeenCalledWith(undefined);
    expect(clearSessionScopedState).toHaveBeenCalledTimes(1);
    expect(store.getState().auth).toMatchObject({ userProfile: null, logoutRequest: undefined, isLoading: false });
  });

  it('account deletion tears the session down through logout', async () => {
    const store = makeStore();
    await store.dispatch(deleteAccount()).unwrap();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearSessionScopedState).toHaveBeenCalledTimes(1);
  });
});

// Review 2026-10-10, M1-7 and M1-11
describe('the stored custom session', () => {
  const makeStore = () => configureStore({ reducer: { auth: authReducer } });
  const stored = (expiresAt: number) =>
    ({ type: 'jwt', isValid: expiresAt > Date.now(), authToken: 'access', refreshToken: 'r'.repeat(64), expiresAt }) as Awaited<ReturnType<typeof getStoredToken>>;
  beforeEach(() => { jest.clearAllMocks(); });

  it('renews an access token that expires within five minutes, and one that has expired', async () => {
    const store = makeStore();
    for (const expiresAt of [Date.now() + 2 * 60 * 1000, Date.now() - 60 * 1000]) {
      jest.mocked(getStoredToken).mockResolvedValueOnce(stored(expiresAt));
      const result = await store.dispatch(checkTokenExpiry()).unwrap();
      expect(result).toEqual({ warning: false, expired: false, refreshAttempted: true });
    }
    expect(ensureValidTokens).toHaveBeenCalledTimes(2);
  });

  it('leaves a token with more than five minutes left, and a signed-out device, alone', async () => {
    const store = makeStore();
    jest.mocked(getStoredToken).mockResolvedValueOnce(stored(Date.now() + 30 * 60 * 1000));
    expect((await store.dispatch(checkTokenExpiry()).unwrap()).refreshAttempted).toBe(false);
    jest.mocked(getStoredToken).mockResolvedValueOnce({ isValid: false });
    expect((await store.dispatch(checkTokenExpiry()).unwrap()).refreshAttempted).toBe(false);
    expect(ensureValidTokens).not.toHaveBeenCalled();
  });

  // RM-8: with a fixed five minutes, a token of a facility whose access_seconds
  // is 300 was renewed on every check, from the moment it was issued.
  it('leaves a 300 second token alone until its last 30 seconds', async () => {
    const store = makeStore();
    const issued = Math.floor(Date.now() / 1000);
    const shortLived = `${btoa('{}')}.${btoa(JSON.stringify({ iat: issued, exp: issued + 300 }))}.signature`;
    jest.mocked(getStoredToken).mockResolvedValueOnce({ ...stored(Date.now() + 290 * 1000), authToken: shortLived });
    expect((await store.dispatch(checkTokenExpiry()).unwrap()).refreshAttempted).toBe(false);
    expect(ensureValidTokens).not.toHaveBeenCalled();
    jest.mocked(getStoredToken).mockResolvedValueOnce({ ...stored(Date.now() + 20 * 1000), authToken: shortLived });
    expect((await store.dispatch(checkTokenExpiry()).unwrap()).refreshAttempted).toBe(true);
    expect(ensureValidTokens).toHaveBeenCalledTimes(1);
  });

  const cached = { id: 'user-1', auth_user_id: 'auth-1', name: 'Asha Example', role: 'supervisor', assignedCustomerIds: ['c1'] };
  const start = async (fresh: unknown) => {
    jest.mocked(getSupabaseClient).mockReturnValue({} as unknown as ReturnType<typeof getSupabaseClient>);
    jest.mocked(getStoredToken).mockResolvedValue(stored(Date.now() + 30 * 60 * 1000));
    jest.mocked(getCachedUserProfile).mockResolvedValue(cached);
    jest.mocked(reloadUserProfile).mockResolvedValue(fresh as never);
    const store = makeStore();
    await store.dispatch(initializeAuth());
    for (let i = 0; i < 20; i++) await Promise.resolve();
    return store;
  };

  it('a start from the cached profile shows the role the server has now', async () => {
    const store = await start({ ...cached, role: 'customer', assignedCustomerIds: ['c2'] });
    expect(reloadUserProfile).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.userProfile).toMatchObject({ role: 'customer', assignedCustomerIds: ['c2'] });
  });

  it('a start offline keeps the cached profile', async () => {
    const store = await start(null);
    expect(store.getState().auth.userProfile).toMatchObject(cached);
  });
});
