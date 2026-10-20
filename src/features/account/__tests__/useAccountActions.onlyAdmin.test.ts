/**
 * G-47: the only administrator is told before the two delete steps, not after typing
 * the mobile number. A lookup that fails opens the warning as before.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { useAccountActions } from '../useAccountActions';
import { adminUserService } from '@/services/admin-user-service';
import { resetCentralStateForTests } from '@/config/centralState';
import { setLanguage } from '@/i18n';
import { showAlert } from '@/utils/alert';

let mockRole = 'admin';
const mockDispatch = jest.fn((action: unknown) => ({ unwrap: async () => action }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { id: 'p1', name: 'Asha Fictional', role: mockRole, mobile: '919000000001' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));

type Hook = ReturnType<typeof useAccountActions>;
let hook: Hook;
let tree: ReactTestRenderer | undefined;
function Probe() {
  hook = useAccountActions();
  return null;
}
async function render() {
  await act(async () => {
    tree = create(createElement(Probe));
  });
}
const lookup = (total: number, service = 0) =>
  jest.mocked(adminUserService.getUsersList).mockResolvedValue({
    success: true,
    data: {
      users: [
        ...Array.from({ length: total }, (_, index) => ({ id: `h${index}`, is_service_account: false })),
        ...Array.from({ length: service }, (_, index) => ({ id: `s${index}`, is_service_account: true })),
      ] as never,
      pagination: { total_count: total + service, limit: 100, offset: 0, has_more: false },
    },
  });

beforeEach(() => {
  setLanguage('en');
  resetCentralStateForTests();
  mockRole = 'admin';
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

describe('deleting your account as an administrator', () => {
  it('the only administrator gets an alert and the warning stays hidden', async () => {
    lookup(1);
    await render();
    await act(async () => hook.deletion.open());
    expect(adminUserService.getUsersList).toHaveBeenCalledWith({ roles: ['admin'], active: true }, 100, 0);
    expect(showAlert).toHaveBeenCalledWith(
      "You're the only administrator",
      'Make another person an administrator in Users first, then delete your account.',
      expect.arrayContaining([expect.objectContaining({ text: 'Open Users' })])
    );
    expect(hook.deletion.dialog.visible).toBe(false);
    const buttons = jest.mocked(showAlert).mock.calls[0][2]!;
    buttons.find(button => button.text === 'Open Users')!.onPress!();
    expect(router.push).toHaveBeenCalledWith('/users');
  });

  it('CR-10: one person plus an administrator service account is still the only administrator', async () => {
    lookup(1, 1);
    await render();
    await act(async () => hook.deletion.open());
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(hook.deletion.dialog.visible).toBe(false);
  });

  it('with two administrators the warning opens', async () => {
    lookup(2);
    await render();
    await act(async () => hook.deletion.open());
    expect(showAlert).not.toHaveBeenCalled();
    expect(hook.deletion.dialog.visible).toBe(true);
  });

  it('when the lookup fails the warning opens as before', async () => {
    jest.mocked(adminUserService.getUsersList).mockRejectedValue(new Error('offline'));
    await render();
    await act(async () => hook.deletion.open());
    expect(showAlert).not.toHaveBeenCalled();
    expect(hook.deletion.dialog.visible).toBe(true);
  });

  it('a lookup that reports failure opens the warning too', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue({ success: false, error: 'x' });
    await render();
    await act(async () => hook.deletion.open());
    expect(hook.deletion.dialog.visible).toBe(true);
  });

  it('other roles are not looked up', async () => {
    mockRole = 'staff';
    await render();
    await act(async () => hook.deletion.open());
    expect(adminUserService.getUsersList).not.toHaveBeenCalled();
    expect(hook.deletion.dialog.visible).toBe(true);
  });
});
