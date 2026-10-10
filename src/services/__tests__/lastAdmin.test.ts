/**
 * Backend migration 44: a warehouse keeps one administrator who can sign in.
 * The three RPCs that could remove the last one refuse with LAST_ADMIN; each
 * refusal has its own sentence in the app's language.
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

describe.each(['en', 'gu'] as const)('LAST_ADMIN in %s', language => {
  beforeEach(() => setLanguage(language));

  it('delete_user_account: the only administrator cannot delete the account', async () => {
    rpc.mockResolvedValue({
      data: {
        success: false,
        code: 'LAST_ADMIN',
        error: 'The only administrator cannot delete this account. Make another user an administrator first.',
        message: 'The only administrator cannot delete this account. Make another user an administrator first.',
      },
      error: null,
    });
    const result = await UserService.deleteAccount();
    expect(result.success).toBe(false);
    expect(result.error).toBe(t('errors.user.lastAdminDelete', undefined, language));
    expect(result.message).toBe(t('errors.user.lastAdminDelete', undefined, language));
  });

  it('update_user_status: the last active administrator cannot be deactivated', async () => {
    rpc.mockResolvedValue({
      data: { success: false, error: 'LAST_ADMIN', message: 'The last active administrator cannot be deactivated' },
      error: null,
    });
    const result = await adminUserService.updateUserStatus(USER, false);
    expect(result).toMatchObject({ success: false, error: t('errors.user.lastAdminDeactivate', undefined, language) });
  });

  it('update_user_role: the last active administrator cannot be given another role', async () => {
    rpc.mockResolvedValue({
      data: { success: false, error: 'LAST_ADMIN', message: 'The last active administrator cannot be given another role' },
      error: null,
    });
    const result = await adminUserService.updateUserRole(USER, 'staff');
    expect(result).toMatchObject({ success: false, error: t('errors.user.lastAdminRole', undefined, language) });
  });
});

it('the three sentences differ and never show the code', () => {
  for (const language of ['en', 'gu'] as const) {
    const sentences = (['lastAdminDelete', 'lastAdminDeactivate', 'lastAdminRole'] as const).map(key => t(`errors.user.${key}`, undefined, language));
    expect(new Set(sentences).size).toBe(3);
    for (const sentence of sentences) expect(sentence).not.toMatch(/LAST_ADMIN|errors\./);
  }
  expect(t('errors.user.lastAdminDelete', undefined, 'gu')).toMatch(/[઀-૿]/);
});

it('another refusal of update_user_role keeps its own text', async () => {
  rpc.mockResolvedValue({ data: { success: false, error: 'User not found' }, error: null });
  expect(await adminUserService.updateUserRole(USER, 'staff')).toMatchObject({ success: false, error: 'User not found' });
});
