import { ensureValidTokens, getStoredToken } from '@/config/supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken, getRefreshToken } from '../authTokenUtils';

jest.mock('@/config/supabaseConfig', () => ({
  ensureValidTokens: jest.fn(),
  getStoredToken: jest.fn(),
}));

it('renews the custom session before returning its access token', async () => {
  jest.mocked(ensureValidTokens).mockResolvedValue(true);
  jest.mocked(getStoredToken).mockResolvedValue({
    isValid: true,
    authToken: 'new.access.jwt',
    expiresAt: 123,
  });
  expect(await getAuthToken()).toEqual({
    token: 'new.access.jwt',
    expiresAt: 123,
    source: 'securestore',
  });
});

it('does not return an expired token when renewal fails', async () => {
  jest.mocked(ensureValidTokens).mockResolvedValue(false);
  expect(await getAuthToken()).toEqual({ token: null, source: 'none' });
});

it('does not bypass secure migration by reading a legacy refresh token directly', async () => {
  await AsyncStorage.setItem('refresh_token', 'legacy-test-refresh');
  jest.mocked(getStoredToken).mockResolvedValue({ isValid: false });
  expect(await getRefreshToken()).toBeNull();
});

it('allows a securely stored refresh token when the access token has expired', async () => {
  jest.mocked(getStoredToken).mockResolvedValue({
    isValid: false,
    refreshToken: 'secure-test-refresh',
    type: 'jwt',
  });
  expect(await getRefreshToken()).toBe('secure-test-refresh');
});
