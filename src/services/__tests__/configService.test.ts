import type { SupabaseClient } from '@supabase/supabase-js';
import ConfigService from '../configService';
import { getAuthToken } from '@/utils/authTokenUtils';

jest.mock('@/utils/authTokenUtils', () => ({ getAuthToken: jest.fn() }));

describe('configuration session lookup', () => {
  const oldFetch = global.fetch;
  beforeEach(async () => {
    jest.clearAllMocks();
    await ConfigService.clearCache();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { environment: { name: 'test' } } }) });
  });
  afterAll(() => { global.fetch = oldFetch; });

  it('uses SecureStore/session token instead of the removed legacy AsyncStorage key', async () => {
    jest.mocked(getAuthToken).mockResolvedValue({ token: 'test.jwt.token', source: 'securestore', expiresAt: Date.now() + 60000 });
    expect(await ConfigService.getFullConfig({} as SupabaseClient)).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/functions/v1/get-config'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test.jwt.token' }) }));
  });

  it('does not send an expired token', async () => {
    jest.mocked(getAuthToken).mockResolvedValue({ token: 'expired.jwt.token', source: 'supabase', expiresAt: Date.now() - 1000 });
    expect(await ConfigService.getFullConfig({} as SupabaseClient)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
