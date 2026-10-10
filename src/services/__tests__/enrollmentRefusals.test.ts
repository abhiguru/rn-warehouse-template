/**
 * Backend migration 47: enrollment review is an administrator's decision.
 * `update_user_status` and `update_user_role` refuse a supervisor on a profile
 * whose access is not approved (ENROLLMENT_NOT_APPROVED), and `update_user_role`
 * refuses everyone on a pending request (ENROLLMENT_PENDING). Each refusal is a
 * code; the app shows its own sentence for it.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage, t } from '@/i18n';
import { adminUserService } from '../admin-user-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));

const USER = '11111111-2222-4333-8444-555555555555';
const rpc = jest.fn();
const refusal = (error: string, message: string) => ({ data: { success: false, error, message }, error: null });
const NOT_APPROVED = refusal('ENROLLMENT_NOT_APPROVED', 'Only an administrator can change a user whose access is not approved');
const PENDING = refusal('ENROLLMENT_PENDING', 'Review the access request before changing the role');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe.each(['en', 'gu'] as const)('enrollment refusals in %s', language => {
  beforeEach(() => setLanguage(language));

  it('update_user_status: a supervisor cannot give access back', async () => {
    rpc.mockResolvedValue(NOT_APPROVED);
    const result = await adminUserService.updateUserStatus(USER, true);
    expect(result).toEqual({ success: false, error: t('errors.user.enrollmentNotApproved', undefined, language) });
  });

  it('update_user_role: a supervisor cannot change a user whose access is not approved', async () => {
    rpc.mockResolvedValue(NOT_APPROVED);
    const result = await adminUserService.updateUserRole(USER, 'staff');
    expect(result).toEqual({ success: false, error: t('errors.user.enrollmentNotApproved', undefined, language) });
  });

  it('update_user_role: a pending access request is reviewed first', async () => {
    rpc.mockResolvedValue(PENDING);
    const result = await adminUserService.updateUserRole(USER, 'staff');
    expect(result).toEqual({ success: false, error: t('errors.user.enrollmentPending', undefined, language) });
  });
});

it('both sentences exist in both languages, differ, and never show the code', () => {
  for (const language of ['en', 'gu'] as const) {
    const sentences = (['enrollmentNotApproved', 'enrollmentPending'] as const).map(key => t(`errors.user.${key}`, undefined, language));
    expect(new Set(sentences).size).toBe(2);
    for (const sentence of sentences) expect(sentence).not.toMatch(/ENROLLMENT|errors\./);
  }
  expect(t('errors.user.enrollmentNotApproved', undefined, 'gu')).not.toBe(t('errors.user.enrollmentNotApproved', undefined, 'en'));
  expect(t('errors.user.enrollmentPending', undefined, 'gu')).not.toBe(t('errors.user.enrollmentPending', undefined, 'en'));
});
