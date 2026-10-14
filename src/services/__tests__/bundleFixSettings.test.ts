// Bundle fix W4: F32 (accessible customers in chunks), F35 (customer existence check),
// F42 (p_role only when needed), F43 (timeouts are not refusals).
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { UserService } from '../user-service';
import { hasEnrollmentCustomers, reviewEnrollment } from '../enrollmentReviewService';
import { appendNew } from '@/utils/appendNew';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/utils/serviceErrorHandler', () => ({
  ...jest.requireActual('@/utils/serviceErrorHandler'),
  handleGlobalAuthError: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('F32: 250 accessible customers are read in several short requests', async () => {
  const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
  const sizes: number[] = [];
  const client = {
    rpc: jest.fn(async () => ({ data: ids, error: null })),
    from: jest.fn(() => ({
      select: () => ({
        in: async (_c: string, chunk: string[]) => {
          sizes.push(chunk.length);
          return { data: chunk.map(id => ({ id, name: id, mobile: '', city: '', active: true })), error: null };
        },
      }),
    })),
  };
  const result = await UserService.getAccessibleCustomers(client as never);
  expect(result.status).toBe('loaded');
  expect(result.customers).toHaveLength(250);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  expect(sizes.length).toBeGreaterThan(1);
});

test('F32: a failing chunk makes the whole read failed', async () => {
  const inFn = jest.fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '' } });
  const client = {
    rpc: jest.fn(async () => ({ data: Array.from({ length: 150 }, (_, i) => `c${i}`), error: null })),
    from: jest.fn(() => ({ select: () => ({ in: inFn }) })),
  };
  expect((await UserService.getAccessibleCustomers(client as never)).status).toBe('failed');
});

test('F35: the existence check reads one row, not every customer', async () => {
  const limit = jest.fn(async () => ({ data: [{ id: 'c1' }], error: null }));
  const client = { from: jest.fn(() => ({ select: () => ({ eq: () => ({ limit }) }) })) };
  jest.mocked(getAuthenticatedClient).mockResolvedValue(client as never);
  expect(await hasEnrollmentCustomers()).toBe(true);
  expect(limit).toHaveBeenCalledWith(1);
});

function withRpc(result: unknown) {
  const rpc = jest.fn(async () => result);
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  return rpc;
}
const OK = { data: { success: true, data: { status: 'approved' } }, error: null };

test('F42: a customer approval and a rejection leave p_role out; staff sends it', async () => {
  const rpc = withRpc(OK);
  await reviewEnrollment('u1', 'approved', ['c1'], 'customer');
  expect((rpc.mock.calls as unknown[][])[0][1]).not.toHaveProperty('p_role');
  await reviewEnrollment('u1', 'approved', [], 'staff');
  expect((rpc.mock.calls as unknown[][])[1][1]).toMatchObject({ p_role: 'staff' });
});

test('F42: a missing function for a staff approval says the server needs an update', async () => {
  withRpc({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.operator_review_enrollment(p_role)' } });
  await expect(reviewEnrollment('u1', 'approved', [], 'staff')).rejects.toThrow(/needs an update/);
});

test('F43: a timeout is not a refusal; a database answer still is', async () => {
  withRpc({ data: null, error: { code: 'ABORT_ERR', message: 'TimeoutError: Request timeout' } });
  const failure = await reviewEnrollment('u1', 'approved', [], 'staff').catch(e => e);
  expect((failure as { code?: string }).code).not.toBe('REFUSED');
  expect(String((failure as Error).message)).toContain('Request timeout');
  withRpc({ data: null, error: { code: 'P0001', message: 'unknown_user' } });
  const refused = await reviewEnrollment('u1', 'approved', [], 'staff').catch(e => e);
  expect((refused as { code?: string }).code).toBe('REFUSED');
});

test('F37: a row that comes back on two pages is listed once', () => {
  const held = [{ id: 'a' }, { id: 'b' }];
  expect(appendNew(held, [{ id: 'b' }, { id: 'c' }])).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('F31: a decision on a request already handled says so', async () => {
  withRpc({ data: { success: false, code: 'unknown_user' }, error: null });
  await expect(reviewEnrollment('u1', 'approved', [], 'staff')).rejects.toThrow('already handled');
});
