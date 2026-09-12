import { ensureValidTokens, getStoredToken } from '@/config/supabaseConfig';
import { getAuthToken } from '../authTokenUtils';

jest.mock('@/config/supabaseConfig', () => ({
  ensureValidTokens: jest.fn(),
  getStoredToken: jest.fn(),
}));

it('renews the custom session before returning its access token', async () => {
  jest.mocked(ensureValidTokens).mockResolvedValue(true);
  jest
    .mocked(getStoredToken)
    .mockResolvedValue({
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
