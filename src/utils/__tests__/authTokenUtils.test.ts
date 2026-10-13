import { acquireValidSession, getStoredToken } from '@/config/supabaseConfig';
import { advanceSessionGeneration, getSessionGeneration } from '@/config/sessionLifecycle';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken, getRefreshToken } from '../authTokenUtils';

jest.mock('@/config/supabaseConfig', () => ({
  acquireValidSession: jest.fn(),
  getStoredToken: jest.fn(),
}));

it('renews the custom session before returning its access token', async () => {
  jest.mocked(acquireValidSession).mockResolvedValue({
    authToken: 'new.access.jwt',
    refreshToken: 'refresh-test',
    expiresAt: 123,
    generation: getSessionGeneration(),
  });
  expect(await getAuthToken()).toEqual({
    token: 'new.access.jwt',
    expiresAt: 123,
    source: 'securestore',
  });
  // The validated session is used as it is: the store is not read a second time.
  expect(getStoredToken).not.toHaveBeenCalled();
});

it('does not return a token whose session ended while it was being validated', async () => {
  let finish!: (value: Awaited<ReturnType<typeof acquireValidSession>>) => void;
  jest.mocked(acquireValidSession).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = getAuthToken();
  const before = getSessionGeneration();
  advanceSessionGeneration();
  finish({ authToken: 'old.access.jwt', refreshToken: 'refresh-test', expiresAt: 123, generation: before });
  expect(await pending).toEqual({ token: null, source: 'none' });
});

it('does not return an expired token when renewal fails', async () => {
  jest.mocked(acquireValidSession).mockResolvedValue(null);
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
