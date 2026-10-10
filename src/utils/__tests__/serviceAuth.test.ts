import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage } from '@/i18n';
import { AppError, getAppErrorCode } from '../appError';
import { createAuthFailureResponse, requireAuth, withAuth } from '../serviceAuth';

jest.mock('@/config/supabaseConfig', () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }),
  getAuthenticatedClient: jest.fn(),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});
afterEach(() => setLanguage('en'));

describe('service authentication', () => {
  it.each(['en', 'gu'] as const)('answers a missing session by its code (%s)', async language => {
    setLanguage(language);
    const run = jest.fn(async () => 'ran');
    const guarded = withAuth('Test', run);

    const result = await guarded();

    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, errorCode: 'AUTH_REQUIRED' });
    await expect(requireAuth('Test')).rejects.toBeInstanceOf(AppError);
    expect(getAppErrorCode(await requireAuth('Test').catch(error => error))).toBe('AUTH_REQUIRED');
  });

  it('keeps the English wording and translates it for Gujarati', async () => {
    await expect(requireAuth('Test')).rejects.toThrow('Authentication required - no valid session');
    expect(createAuthFailureResponse()).toEqual({
      success: false,
      message: 'Authentication required',
      error: 'No valid session',
      errorCode: 'AUTH_REQUIRED',
    });
    setLanguage('gu');
    expect(createAuthFailureResponse().message).toBe('લૉગિન કરવું જરૂરી છે');
  });

  it('still recognizes the English server text, and leaves other app errors alone', async () => {
    await AsyncStorage.setItem('session_marker', JSON.stringify({ user_id: 'u1', expires_at: Date.now() + 60000 }));
    const fromServer = withAuth('Test', async () => {
      throw new Error('Authentication required');
    });
    expect(await fromServer()).toMatchObject({ success: false, errorCode: 'AUTH_REQUIRED' });

    const offline = withAuth('Test', async () => {
      throw new AppError('NETWORK', 'Authentication required to reach the network');
    });
    await expect(offline()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
