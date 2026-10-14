/**
 * `readAccessStatus`: the facility's get_my_access_status (backend migration 80).
 * Only a clear answer counts; everything else is null, so an older facility behaves as before.
 */
import { readAccessStatus } from '../ownBusinesses';

let mockGeneration = 1;
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => mockGeneration }));
const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: async () => ({ rpc: mockRpc }) }));

beforeEach(() => {
  mockGeneration = 1;
  mockRpc.mockReset();
});

it.each(['active', 'revoked', 'none'])('hands back %s', async status => {
  mockRpc.mockResolvedValue({ data: status, error: null });
  expect(await readAccessStatus()).toBe(status);
  expect(mockRpc).toHaveBeenCalledWith('get_my_access_status');
});

it.each([
  ['a missing function (older backend)', { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }],
  ['a 404', { data: null, error: { code: '404', message: 'Not Found' } }],
  ['an error', { data: null, error: { code: '08006', message: 'down' } }],
  ['another text', { data: 'banned', error: null }],
  ['no data', { data: null, error: null }],
])('is null for %s', async (_name, answer) => {
  mockRpc.mockResolvedValue(answer);
  expect(await readAccessStatus()).toBeNull();
});

it('is null when the call throws', async () => {
  mockRpc.mockRejectedValue(new Error('Network request failed'));
  expect(await readAccessStatus()).toBeNull();
});

it('refuses to hand an answer to the next session', async () => {
  mockRpc.mockImplementation(async () => {
    mockGeneration += 1;
    return { data: 'revoked', error: null };
  });
  await expect(readAccessStatus()).rejects.toThrow('Session changed');
});
