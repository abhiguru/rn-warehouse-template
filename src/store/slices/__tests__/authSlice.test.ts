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
import { signOut, initializeSupabase } from '@/config/supabaseConfig';
import { clearSessionScopedState } from '@/store/sessionScopedState';
import authReducer, {
  setPhoneNumber,
  setOtpSent,
  setAuthenticating,
  setVerifyingOTP,
  setTokenExpiryWarning,
  setTokenExpired,
  clearTokenExpiryStates,
  deleteAccount,
  forceLogoutOnInvalidToken,
  logout,
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
    tokenExpiryWarning: false,
    tokenExpired: false,
    configFetchFailed: false,
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

    it('should handle setTokenExpiryWarning', () => {
      const actual = authReducer(initialState, setTokenExpiryWarning(true));
      expect(actual.tokenExpiryWarning).toBe(true);
    });

    it('should handle setTokenExpired', () => {
      const actual = authReducer(initialState, setTokenExpired(true));
      expect(actual.tokenExpired).toBe(true);
    });

    it('should handle clearTokenExpiryStates', () => {
      const stateWithExpiry = {
        ...initialState,
        tokenExpiryWarning: true,
        tokenExpired: true,
      };
      const actual = authReducer(stateWithExpiry, clearTokenExpiryStates());
      expect(actual.tokenExpiryWarning).toBe(false);
      expect(actual.tokenExpired).toBe(false);
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

    it('should handle token expiry flow', () => {
      let state = authReducer(initialState, setTokenExpiryWarning(true));
      expect(state.tokenExpiryWarning).toBe(true);
      expect(state.tokenExpired).toBe(false);

      state = authReducer(state, setTokenExpired(true));
      expect(state.tokenExpiryWarning).toBe(true);
      expect(state.tokenExpired).toBe(true);

      state = authReducer(state, clearTokenExpiryStates());
      expect(state.tokenExpiryWarning).toBe(false);
      expect(state.tokenExpired).toBe(false);
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
