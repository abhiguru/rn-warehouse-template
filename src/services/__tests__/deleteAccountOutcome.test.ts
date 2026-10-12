/**
 * What `UserService.deleteAccount` says about a failure: `refused` only when
 * the database itself answered, `unknown` for everything else. The central
 * login's facility deletion decides on it (src/store/centralSignOut.ts), so a
 * committed deletion must never be classed as refused.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { UserService } from '../user-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rpc = jest.fn();
/** A PostgREST error as postgrest-js builds it. */
const postgrest = (code: string, message: string) => ({ message, details: '', hint: '', code });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('refused: the database answered and kept the account', () => {
  it.each([
    ['a SQL error with its SQLSTATE', postgrest('42501', 'permission denied for function delete_user_account')],
    ['a raised exception', postgrest('P0001', 'Session expired or revoked')],
    ['a PostgREST error', postgrest('PGRST202', 'Could not find the function')],
  ])('%s', async (_name, error) => {
    rpc.mockResolvedValue({ data: null, error });
    const result = await UserService.deleteAccount();
    expect(result).toMatchObject({ success: false, outcome: 'refused', message: t('errors.user.deleteAccountFailed') });
  });

  it('the RPC answered success:false', async () => {
    rpc.mockResolvedValue({ data: { success: false, error: 'Account has open invoices' }, error: null });
    expect(await UserService.deleteAccount()).toMatchObject({ success: false, outcome: 'refused', message: 'Account has open invoices' });
  });

  it('the last administrator', async () => {
    rpc.mockResolvedValue({ data: { success: false, code: 'LAST_ADMIN', error: 'x', message: 'x' }, error: null });
    expect(await UserService.deleteAccount()).toMatchObject({ success: false, outcome: 'refused', message: t('errors.user.lastAdminDelete') });
  });
});

describe('unknown: nothing says what the server did', () => {
  it.each([
    ['no connection', postgrest('', 'TypeError: Network request failed')],
    ['the app gave up waiting', postgrest('', 'TimeoutError: Request timeout')],
    ["the fetch gate's \"Session changed\" after the answer arrived", postgrest('', 'Error: Session changed')],
    ["a gateway's HTML error page", postgrest('', '<html><body><h1>502 Bad Gateway</h1></body></html>')],
    ["a gateway's JSON without a database code", { message: 'An invalid response was received from the upstream server' }],
    ['a code that is not a database code', { message: 'aborted', code: 'ABORT_ERR' }],
  ])('%s', async (_name, error) => {
    rpc.mockResolvedValue({ data: null, error });
    const result = await UserService.deleteAccount();
    expect(result).toMatchObject({ success: false, outcome: 'unknown', message: t('errors.user.deleteAccountFailed') });
  });

  it.each([
    ['an empty body', null],
    ['an empty object', {}],
    ['JSON without a success field', { foo: 1 }],
  ])('a 2xx answer that is not the RPC\'s own: %s', async (_name, data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect(await UserService.deleteAccount()).toMatchObject({ success: false, outcome: 'unknown', message: t('errors.user.deleteAccountFailed') });
  });

  it('an exception before or during the call', async () => {
    rpc.mockRejectedValue(new Error('Session changed'));
    expect(await UserService.deleteAccount()).toMatchObject({ success: false, outcome: 'unknown', message: t('errors.user.deleteAccountUnexpected') });
    jest.mocked(getAuthenticatedClient).mockRejectedValue(new Error('Sign in required'));
    expect(await UserService.deleteAccount()).toMatchObject({ success: false, outcome: 'unknown' });
  });
});

it('a success carries no outcome', async () => {
  rpc.mockResolvedValue({ data: { success: true, message: 'Account deleted' }, error: null });
  const result = await UserService.deleteAccount();
  expect(result.success).toBe(true);
  expect(result.outcome).toBeUndefined();
});
