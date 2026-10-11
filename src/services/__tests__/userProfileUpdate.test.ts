// Review 2026-10-10, M2-2 / X2-1 / X3-8 / X2-2: the own-profile name edit.
// The server grants UPDATE on user_profiles for (name, display_name) only.
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { UserService } from '../user-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn((reason: string) => ({ type: 'forced', reason })) }));
import { store } from '@/store';

const GRANTED = ['display_name', 'name'];
const USER = '11111111-2222-4333-8444-555555555555';

type Answer = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

/** A client that records each UPDATE on user_profiles and answers them in order. */
function clientAnswering(...answers: Answer[]) {
  const updates: { payload: Record<string, unknown>; column: string; value: string; selected: string }[] = [];
  const from = jest.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => ({
      eq: (column: string, value: string) => ({
        select: async (selected: string) => {
          updates.push({ payload, column, value, selected });
          return answers[updates.length - 1] ?? { data: [], error: null };
        },
      }),
    }),
    // getUserById after a successful update
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: USER, name: 'Asha Example', role: 'staff', table }, error: null }) }) }),
  }));
  const rpc = jest.fn(async () => ({ data: [], error: null }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ from, rpc });
  return { updates, from };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('the update sends the name and no column outside the server grant', async () => {
  const { updates } = clientAnswering({ data: [{ id: USER }], error: null });
  const result = await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(result.success).toBe(true);
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({ payload: { name: 'Asha Example' }, column: 'id', value: USER, selected: 'id' });
  expect(Object.keys(updates[0].payload).every(column => GRANTED.includes(column))).toBe(true);
  expect(updates[0].payload).not.toHaveProperty('updated_at');
});

test('an id that matches no row is tried as auth_user_id', async () => {
  const { updates } = clientAnswering({ data: [], error: null }, { data: [{ id: 'profile-1' }], error: null });
  const result = await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(result.success).toBe(true);
  expect(updates.map(update => update.column)).toEqual(['id', 'auth_user_id']);
  expect(updates[1].payload).toEqual({ name: 'Asha Example' });
});

test('an update that changes no row is reported, not called a success (X2-2)', async () => {
  const { updates } = clientAnswering({ data: [], error: null }, { data: [], error: null });
  const result = await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(updates).toHaveLength(2);
  expect(result.success).toBe(false);
  expect(result.message).toBe('Failed to update user profile');
});

test('a server refusal is reported and the second update is not tried', async () => {
  const { updates } = clientAnswering({ data: null, error: { code: '42501', message: 'permission denied for table user_profiles' } });
  const result = await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(result).toMatchObject({ success: false, error: 'permission denied for table user_profiles' });
  expect(updates).toHaveLength(1);
});

test('a revoked session found by the profile update ends the session (M2-9)', async () => {
  clientAnswering({ data: null, error: { code: '42501', message: 'Session expired or revoked' } });
  await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(store.dispatch).toHaveBeenCalledTimes(1);
});

test('the name being saved is not written to the device log (M2-7)', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  clientAnswering({ data: [{ id: USER }], error: null });
  await UserService.updateUser(USER, { name: 'Asha Example' } as never);
  expect(JSON.stringify(log.mock.calls)).not.toContain('Asha Example');
});
