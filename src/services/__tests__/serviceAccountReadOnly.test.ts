/**
 * Backend migration 78: users carry `is_service_account`, and role, status and delete
 * changes on a service account are refused with SERVICE_ACCOUNT_READ_ONLY.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage, t } from '@/i18n';
import { UserService } from '../user-service';
import { adminUserService } from '../admin-user-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const USER = '11111111-2222-4333-8444-555555555555';
const rpc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

it('getUsersList maps is_service_account and defaults a missing value to false', async () => {
  rpc.mockResolvedValue({
    data: {
      success: true,
      users: [
        { id: 'a', role: 'staff', is_service_account: true },
        { id: 'b', role: 'staff' },
        { id: 'c', role: 'staff', is_service_account: null },
      ],
    },
    error: null,
  });
  const result = await adminUserService.getUsersList({} as never, 20, 0);
  expect(result.data?.users.map(u => u.is_service_account)).toEqual([true, false, false]);
});

it('getUserDetails maps is_service_account and defaults a missing value to false', async () => {
  rpc.mockResolvedValue({ data: { user: { id: 'a', role: 'staff', is_service_account: true }, assigned_customers: [] }, error: null });
  expect((await adminUserService.getUserDetails('a')).data?.is_service_account).toBe(true);
  rpc.mockResolvedValue({ data: { user: { id: 'b', role: 'staff' }, assigned_customers: [] }, error: null });
  expect((await adminUserService.getUserDetails('b')).data?.is_service_account).toBe(false);
});

describe.each(['en', 'gu'] as const)('SERVICE_ACCOUNT_READ_ONLY in %s', language => {
  beforeEach(() => setLanguage(language));
  const sentence = () => t('users.edit.serviceAccountReadOnly', undefined, language);

  it('update_user_role refusal shows the translated sentence, never the code', async () => {
    rpc.mockResolvedValue({ data: { success: false, error: 'Service accounts are read-only', error_code: 'SERVICE_ACCOUNT_READ_ONLY' }, error: null });
    const result = await adminUserService.updateUserRole(USER, 'staff');
    expect(result).toMatchObject({ success: false, error: sentence() });
    expect(result.error).not.toMatch(/SERVICE_ACCOUNT|read-only/);
  });

  it('update_user_status refusal shows the translated sentence', async () => {
    rpc.mockResolvedValue({ data: { success: false, error: 'SERVICE_ACCOUNT_READ_ONLY' }, error: null });
    expect(await adminUserService.updateUserStatus(USER, false)).toMatchObject({ success: false, error: sentence() });
  });

  it('delete_user_account refusal shows the translated sentence', async () => {
    rpc.mockResolvedValue({ data: { success: false, code: 'SERVICE_ACCOUNT_READ_ONLY', error: 'x' }, error: null });
    const result = await UserService.deleteAccount();
    expect(result).toMatchObject({ success: false, error: sentence(), message: sentence(), outcome: 'refused' });
  });
});

it('the sentence exists in Gujarati and differs from English', () => {
  const gu = t('users.edit.serviceAccountReadOnly', undefined, 'gu');
  expect(gu).toMatch(/[઀-૿]/);
  expect(gu).not.toBe(t('users.edit.serviceAccountReadOnly', undefined, 'en'));
});
