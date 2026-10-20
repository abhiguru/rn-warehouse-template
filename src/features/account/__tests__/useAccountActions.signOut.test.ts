/**
 * G-40: Sign out is an ordinary action, not a dangerous one. The row has no red and
 * the confirm button is the brand-filled one; only Delete account stays dangerous.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useAccountActions } from '../useAccountActions';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { setLanguage, t } from '@/i18n';

let mockCentralOn = false;
const mockDispatch = jest.fn((action: unknown) => ({ unwrap: async () => action }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { userProfile: { id: 'p1', name: 'Asha Fictional', role: 'staff', mobile: '919000000001' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({
    origin: 'https://north-cold.example.test',
    instanceId: 'instance-north',
    displayName: 'North',
    companyName: 'North Cold Store',
  }),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('@/store/centralSignOut', () => ({
  deleteFacilityAccount: jest.fn(async () => 'left'),
  signOutEverywhere: jest.fn(async () => ({ ok: true })),
  whileLeaving: (work: () => Promise<unknown>) => work(),
}));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(() => ({ type: 'test/deleteAccount' })),
  isDeleteAccountRejection: () => false,
}));

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

beforeEach(() => {
  setLanguage('en');
  resetCentralStateForTests();
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

describe('Sign out is not drawn as dangerous', () => {
  it('without central login: the row is not destructive and the dialog is the default variant', async () => {
    mockCentralOn = false;
    await render();
    const signOut = hook.actions[0];
    expect(signOut.id).toBe('signOut');
    expect(signOut.destructive).toBe(false);
    act(() => hook.request('signOut'));
    expect(hook.dialog.variant).toBe('default');
    expect(hook.dialog.icon).toBe('logout');
  });

  it('with central login: Sign out of this phone is not destructive either', async () => {
    mockCentralOn = true;
    setCentralState({ status: 'signedIn', user: { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' } });
    await render();
    const phone = hook.actions.find(action => action.id === 'signOutPhone')!;
    expect(phone.destructive).toBe(false);
    act(() => hook.request('signOutPhone'));
    expect(hook.dialog.variant).toBe('default');
  });

  it('Delete account stays the dangerous one', async () => {
    mockCentralOn = false;
    await render();
    act(() => hook.deletion.open());
    expect(hook.deletion.dialog.variant).toBe('danger');
  });
});

describe('Sign out without central login: the phone could not clear its storage', () => {
  const { showAlert } = jest.requireMock('@/utils/alert') as { showAlert: jest.Mock };
  const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
  const run = async (localCleared: boolean) => {
    mockCentralOn = false;
    mockDispatch.mockImplementationOnce(() => ({ unwrap: async () => ({ localCleared }) }));
    showAlert.mockClear();
    router.replace.mockClear();
    await render();
    act(() => hook.request('signOut'));
    await act(async () => {
      hook.dialog.onConfirm();
    });
  };

  it('localCleared false: shows the notCleared alert and still goes to /login', async () => {
    await run(false);
    expect(showAlert).toHaveBeenCalledWith(t('auth.signOut.couldNotTitle'), t('auth.signOut.notCleared'));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('localCleared true: no alert', async () => {
    await run(true);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
