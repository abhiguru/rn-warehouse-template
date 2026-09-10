/**
 * Auth Slice Tests
 *
 * Tests for authentication state management
 */

jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { clearRecentCustomers: jest.fn() },
}));
jest.mock('@/services/session-recent-items-service', () => ({
  SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn() },
}));
jest.mock('@/services/recent-items-service', () => ({
  RecentItemsService: { clearRecentItems: jest.fn() },
}));
jest.mock('@/config/sentryConfig', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}));

import authReducer, {
  setPhoneNumber,
  setOtpSent,
  setAuthenticating,
  setVerifyingOTP,
  setTokenExpiryWarning,
  setTokenExpired,
  clearTokenExpiryStates,
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
