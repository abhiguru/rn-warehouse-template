/**
 * Inside a facility with central login on: "Switch facility" and "Sign out" in
 * Settings, the facility line of the facility's own sign-in screen, and the
 * waiting screen. With central login off each of them is as it was.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import SettingsScreen from '../../../app/settings';
import LoginScreen from '../../../app/login';
import PendingEnrollmentScreen from '../../../app/pending-enrollment';
import { leaveFacility } from '@/store/operatorSwitch';
import { deleteFacilityAccount } from '@/store/centralSignOut';
import type { LeaveFacilityOutcome } from '@/store/operatorSwitch';
import { deleteAccount, logout } from '@/store/slices/authSlice';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { getEnrollmentStatus, signOutPendingEnrollment } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';

let mockCentralOn = true;
const mockDispatch = jest.fn((action: unknown) => ({ unwrap: async () => action }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      theme: { preference: 'light', brand: 'orange' },
      auth: { userProfile: { id: 'profile-1', name: 'Asha Fictional', role: 'staff', mobile: '919000000001' }, isAuthenticating: false },
    }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
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
jest.mock('@/config/supabaseConfig', () => ({
  getPendingEnrollmentToken: jest.fn(async () => 'enrollment-secret'),
  getEnrollmentStatus: jest.fn(async () => ({ success: true, status: 'approved' })),
  signOutPendingEnrollment: jest.fn(async () => {}),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(async () => 'left') }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: (value: unknown) => typeof value === 'object' && value !== null && 'serverDeleted' in value,

  setAuthenticating: jest.fn(() => ({ type: 'x' })),
  setPhoneNumber: jest.fn(() => ({ type: 'x' })),
  setOtpSent: jest.fn(() => ({ type: 'x' })),
}));
jest.mock('@/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({ language: 'en', preference: 'system', setPreference: jest.fn() }),
}));
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));

let tree: ReactTestRenderer | undefined;
async function render(element: React.ReactElement) {
  await act(async () => { tree = create(element); });
}
const texts = () =>
  tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
/** The outermost pressable with this accessible name. */
const pressable = (label: string) => {
  const found = tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  if (!found.length) throw new Error(`nothing to press named "${label}"`);
  return found[0];
};
const press = async (label: string) => {
  await act(async () => { await pressable(label).props.onPress(); });
};
const alerts = () => jest.mocked(showAlert).mock.calls;

beforeEach(() => {
  jest.clearAllMocks();
  mockCentralOn = true;
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' } });
  jest.mocked(leaveFacility).mockResolvedValue('left');
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

describe('Settings with central login on', () => {
  it('offers "Switch facility" with the name of the facility, in place of "Change warehouse server"', async () => {
    await render(<SettingsScreen />);
    expect(texts()).toContain('Switch facility');
    expect(texts()).toContain('North Cold Store');
    expect(texts()).not.toContain('Change warehouse server');
  });

  it('"Switch facility" asks first, then leaves the facility through the shared cleanup', async () => {
    await render(<SettingsScreen />);
    await press('Switch facility, North Cold Store');
    expect(alerts()[0][0]).toBe('Switch facility?');
    expect(alerts()[0][1]).toBe(
      "You'll leave North Cold Store and unsaved forms are discarded. You can open it again from My facilities."
    );
    expect(leaveFacility).not.toHaveBeenCalled();
    const buttons = alerts()[0][2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map(entry => entry.text)).toEqual(['Cancel', 'Switch facility']);
    await act(async () => { buttons[1].onPress?.(); });
    expect(leaveFacility).toHaveBeenCalledTimes(1);
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    // The route guard leads to My facilities; nothing sends the person to a sign-in screen.
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says when a write in flight holds the switch back', async () => {
    jest.mocked(leaveFacility).mockResolvedValue('busy');
    await render(<SettingsScreen />);
    await press('Switch facility, North Cold Store');
    await act(async () => { (alerts()[0][2] as Array<{ onPress?: () => void }>)[1].onPress?.(); });
    expect(alerts()[1]).toEqual(['Operation in progress', 'Finish the current operation before switching facilities.']);
  });

  it('"Delete account" deletes the profile at this facility through the central-mode helper and does not open a sign-in screen', async () => {
    await render(<SettingsScreen />);
    await press('Delete account, Permanently delete your account and data');
    // Warning step, then the number is asked for.
    const proceed = tree!.root.findAll(node => node.props.accessibilityLabel === 'Continue' && typeof node.props.onPress === 'function').pop();
    if (proceed) await act(async () => { await proceed.props.onPress(); });
    const field = tree!.root.find(node => typeof node.props.onChangeText === 'function' && node.props.placeholder === '10-digit mobile number');
    await act(async () => { field.props.onChangeText('9000000001'); });
    const confirm = tree!.root.findAll(node => node.props.accessibilityLabel === 'Delete account' && typeof node.props.onPress === 'function').pop()!;
    await act(async () => { await confirm.props.onPress(); });
    expect(deleteFacilityAccount).toHaveBeenCalledWith(mockDispatch);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
  });

  it('says so when the final cleanup after the deletion was held back by a write in flight', async () => {
    jest.mocked(deleteFacilityAccount).mockResolvedValue('busy');
    await render(<SettingsScreen />);
    await press('Delete account, Permanently delete your account and data');
    const proceed = tree!.root.findAll(node => node.props.accessibilityLabel === 'Continue' && typeof node.props.onPress === 'function').pop();
    if (proceed) await act(async () => { await proceed.props.onPress(); });
    const field = tree!.root.find(node => typeof node.props.onChangeText === 'function' && node.props.placeholder === '10-digit mobile number');
    await act(async () => { field.props.onChangeText('9000000001'); });
    const confirm = tree!.root.findAll(node => node.props.accessibilityLabel === 'Delete account' && typeof node.props.onPress === 'function').pop()!;
    await act(async () => { await confirm.props.onPress(); });
    expect(alerts()[0]).toEqual(['Operation in progress', 'Finish the current operation before switching facilities.']);
  });

  it('"Sign out" signs out of this facility only and returns to My facilities', async () => {
    await render(<SettingsScreen />);
    await press('Sign out');
    expect(texts()).toContain("You'll leave this cold storage and return to My facilities. You stay signed in to the association.");
    expect(texts()).not.toContain("You'll need your mobile number and a one-time code to sign in again.");
    // The confirming button of the dialog is the last one with that name.
    const confirm = tree!.root.findAll(node => node.props.accessibilityLabel === 'Sign out' && typeof node.props.onPress === 'function').pop()!;
    await act(async () => { await confirm.props.onPress(); });
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(getCentralState().status).toBe('signedIn');
  });
});

describe('Settings with central login off', () => {
  beforeEach(() => { mockCentralOn = false; });

  it('keeps "Change warehouse server" and the sign-out that leads to the sign-in screen', async () => {
    await render(<SettingsScreen />);
    expect(texts()).toContain('Change warehouse server');
    expect(texts()).not.toContain('Switch facility');
    await press('Change warehouse server');
    expect(router.push).toHaveBeenCalledWith('/operator-server');

    await press('Sign out');
    expect(texts()).toContain("You'll need your mobile number and a one-time code to sign in again.");
    const confirm = tree!.root.findAll(node => node.props.accessibilityLabel === 'Sign out' && typeof node.props.onPress === 'function').pop()!;
    await act(async () => { await confirm.props.onPress(); });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(leaveFacility).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe("the facility's own sign-in screen", () => {
  it('central login on: "Change" gives the SMS sign-in up, and the route guard returns to My facilities', async () => {
    setCentralState({ facilitySmsOrigin: 'https://north-cold.example.test' });
    await render(<LoginScreen />);
    expect(texts()).toContain('North Cold Store');
    await press('Switch facility');
    expect(getCentralState().facilitySmsOrigin).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('central login off: "Change" opens the server address screen', async () => {
    mockCentralOn = false;
    await render(<LoginScreen />);
    await press('Change warehouse server');
    expect(router.push).toHaveBeenCalledWith('/operator-server');
  });
});

describe('the waiting screen once the facility has approved', () => {
  it('central login on: no new code is needed; the way on is My facilities', async () => {
    await render(<PendingEnrollmentScreen />);
    expect(getEnrollmentStatus).toHaveBeenCalled();
    expect(texts()).toContain('North Cold Store approved your access. Open it from My facilities.');
    expect(texts()).not.toContain('Sign in');
    // The request came from this facility's own SMS sign-in.
    await act(async () => { setCentralState({ facilitySmsOrigin: 'https://north-cold.example.test' }); });
    await press('My facilities');
    expect(signOutPendingEnrollment).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/facilities');
    expect(router.replace).not.toHaveBeenCalledWith('/login');
    // Otherwise the guard would turn My facilities back into that facility's sign-in.
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  });

  it('central login off: the facility asks for a new code', async () => {
    mockCentralOn = false;
    await render(<PendingEnrollmentScreen />);
    expect(texts()).toContain('North Cold Store approved your access. Sign in again with a new code to continue.');
    expect(texts()).toContain('Sign in');
  });
});
