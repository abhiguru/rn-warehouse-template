import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { resetRpcSupport, rpcSupport } from '@/config/facilityRpcSupport';
import { listUserSessions, revokeSession } from '../session-devices-service';

jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => undefined,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

let rpc: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  resetRpcSupport();
  rpc = jest.fn();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});

describe('listUserSessions', () => {
  it('asks for the person and reads the sessions, keeping the masked address as sent', async () => {
    rpc.mockResolvedValue({
      data: { success: true, data: { sessions: [
        { id: 's1', user_agent: 'WarehouseApp/1.2 (Android 15)', created_ip: '203.0.113.0/24', created_at: '2026-11-01T10:00:00+00:00', last_refreshed_at: '2026-11-01T10:30:00+00:00', expires_at: '2026-12-01T10:30:00+00:00', is_current: true },
        { id: 's2', user_agent: null, created_ip: null, is_current: false },
        { nonsense: true },
      ] } },
      error: null,
    });
    const result = await listUserSessions('u1');
    expect(rpc).toHaveBeenCalledWith('list_user_sessions', { p_user_id: 'u1' });
    expect(result.success && result.sessions.map(s => [s.id, s.is_current, s.created_ip])).toEqual([['s1', true, '203.0.113.0/24'], ['s2', false, null]]);
    expect(rpcSupport('userSessions')).toBe(true);
  });

  it('records an older backend (PGRST202) as unsupported', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.list_user_sessions' } });
    const result = await listUserSessions('u1');
    expect(result).toMatchObject({ success: false, unsupported: true });
    expect(rpcSupport('userSessions')).toBe(false);
  });

  it.each([
    ['PERMISSION_DENIED', 'You are not allowed to do this.'],
    ['NOT_FOUND', 'That device is not signed in any more.'],
  ])('words the refusal %s in the app\'s language', async (code, message) => {
    rpc.mockResolvedValue({ data: { success: false, error: code, message: 'server english' }, error: null });
    const result = await listUserSessions('u1');
    expect(result).toMatchObject({ success: false, code, message });
  });

  it('passes the 42501 of a person without the role on', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Administrator required' } });
    expect(await listUserSessions('u1')).toMatchObject({ success: false, code: '42501', message: 'You are not allowed to do this.' });
  });
});

describe('revokeSession', () => {
  it('reads revoked_current from the answer', async () => {
    rpc.mockResolvedValue({ data: { success: true, revoked_current: true }, error: null });
    expect(await revokeSession('s1')).toEqual({ success: true, revokedCurrent: true });
    expect(rpc).toHaveBeenCalledWith('revoke_session', { p_session_id: 's1' });
    rpc.mockResolvedValue({ data: { success: true, revoked_current: false }, error: null });
    expect(await revokeSession('s2')).toEqual({ success: true, revokedCurrent: false });
  });

  it('does not take a missing revoked_current for true', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    expect(await revokeSession('s2')).toEqual({ success: true, revokedCurrent: false });
  });

  it('tells NOT_FOUND (an administrator\'s unknown id) by its code', async () => {
    rpc.mockResolvedValue({ data: { success: false, error: 'NOT_FOUND', message: 'x' }, error: null });
    expect(await revokeSession('s9')).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});
