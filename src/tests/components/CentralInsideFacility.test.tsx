/**
 * Inside a facility with central login on: "Leave this facility" and "Sign out
 * of this phone" in Settings and in Profile (the same actions, SR-01), deletion
 * at this facility, the facility line of the facility's own sign-in screen, and
 * the waiting screen. With central login off each of them is as it was.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import SettingsScreen from '../../../app/settings';
import ProfileScreen from '../../../app/profile';
import LoginScreen from '../../../app/login';
import PendingEnrollmentScreen from '../../../app/pending-enrollment';
import { leaveFacility } from '@/store/operatorSwitch';
import { deleteFacilityAccount, signOutEverywhere } from '@/store/centralSignOut';
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
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() } }));
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
// A facility whose public config turns sensors on: the Settings row of every role is shown.
jest.mock('@/hooks/useCapability', () => ({
  useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }),
}));
jest.mock('@/config/supabaseConfig', () => ({
  getPendingEnrollmentToken: jest.fn(async () => 'enrollment-secret'),
  getEnrollmentStatus: jest.fn(async () => ({ success: true, status: 'approved' })),
  signOutPendingEnrollment: jest.fn(async () => {}),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('@/store/centralSignOut', () => ({
  deleteFacilityAccount: jest.fn(async () => 'left'),
  signOutEverywhere: jest.fn(async () => ({ ok: true })),
}));
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

/** The confirming button of the open dialog: the last one with that name. */
const confirmButton = (label: string) =>
  tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
const LEAVE_ROW = 'Leave this facility, Leave North Cold Store and return to My facilities. You stay signed in to the association.';
const PHONE_ROW = 'Sign out of this phone, Ends your association sign-in and this facility on this phone.';
const SIGN_OUT_ROW = 'Sign out, Sign out of this facility on this phone.';
const DELETE_ROW =
  'Delete my account at North Cold Store, Removes your profile and sign-in here. Records, your association sign-in and other facilities stay.';

/** Opens the deletion, passes the warning and types the number. */
async function deleteWith(row: string, number: string) {
  await press(row);
  await act(async () => { await confirmButton('Continue').props.onPress(); });
  const field = tree!.root.find(node => typeof node.props.onChangeText === 'function' && node.props.placeholder === '10-digit mobile number');
  await act(async () => { field.props.onChangeText(number); });
  await act(async () => { await confirmButton('Delete account').props.onPress(); });
}

describe.each([
  ['Settings', () => <SettingsScreen />],
  ['Profile', () => <ProfileScreen />],
])('%s with central login on', (_screen, element) => {
  it('offers "Leave this facility" with the facility and "Sign out of this phone", not a plain "Sign out"', async () => {
    await render(element());
    expect(texts()).toContain('Leave this facility');
    expect(texts()).toContain('Leave North Cold Store and return to My facilities. You stay signed in to the association.');
    expect(texts()).toContain('Sign out of this phone');
    expect(texts()).not.toContain('Change warehouse server');
    expect(texts()).not.toContain('Sign out of this facility on this phone.');
  });

  it('"Leave this facility" asks first, then leaves through the shared cleanup; the association sign-in stays', async () => {
    await render(element());
    await press(LEAVE_ROW);
    expect(texts()).toContain('Leave North Cold Store?');
    expect(texts()).toContain(
      'Unsaved forms are discarded. You stay signed in to the association and can open this facility again from My facilities.'
    );
    expect(leaveFacility).not.toHaveBeenCalled();
    await act(async () => { await confirmButton('Leave').props.onPress(); });
    expect(leaveFacility).toHaveBeenCalledTimes(1);
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(signOutEverywhere).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    // The route guard leads to My facilities; nothing sends the person to a sign-in screen.
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(getCentralState().status).toBe('signedIn');
  });

  it('says when a write in flight holds the leaving back', async () => {
    jest.mocked(leaveFacility).mockResolvedValue('busy');
    await render(element());
    await press(LEAVE_ROW);
    await act(async () => { await confirmButton('Leave').props.onPress(); });
    expect(alerts()[0]).toEqual(['Operation in progress', 'Finish the current operation before switching facilities.']);
  });

  it('"Sign out of this phone" ends the association sign-in too, with the wording that says so', async () => {
    await render(element());
    await press(PHONE_ROW);
    expect(texts()).toContain('Sign out of this phone?');
    expect(texts()).toContain(
      "You'll be signed out of the association and of the cold storage you have open. You'll need your mobile number and a one-time code to sign in again."
    );
    await act(async () => { await confirmButton('Sign out').props.onPress(); });
    expect(signOutEverywhere).toHaveBeenCalledWith(mockDispatch);
    expect(logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('facility SMS access without the association sign-in: one "Sign out" through the facility cleanup', async () => {
    setCentralState({ status: 'signedOut', user: null });
    await render(element());
    expect(texts()).not.toContain('Sign out of this phone');
    await press(SIGN_OUT_ROW);
    expect(texts()).toContain("You'll need your mobile number and a one-time code to sign in again.");
    await act(async () => { await confirmButton('Sign out').props.onPress(); });
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(logout).not.toHaveBeenCalled();
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });
});

describe('deletion in Settings with central login on', () => {
  it('names the facility in the row and in both steps, and says the association sign-in stays', async () => {
    await render(<SettingsScreen />);
    await press(DELETE_ROW);
    expect(texts()).toContain('Delete your account at North Cold Store?');
    expect(texts().some(text => text.includes('Your association sign-in and your other facilities stay'))).toBe(true);
    await act(async () => { await confirmButton('Continue').props.onPress(); });
    expect(texts()).toContain('Confirm deletion at North Cold Store');
    expect(texts()).toContain(
      'Enter the mobile number on your account to delete your account at North Cold Store. Your association sign-in stays.'
    );
  });

  it('deletes the profile at this facility through the central-mode helper and does not open a sign-in screen', async () => {
    await render(<SettingsScreen />);
    await deleteWith(DELETE_ROW, '9000000001');
    expect(deleteFacilityAccount).toHaveBeenCalledWith(mockDispatch);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
  });

  it('a wrong number keeps the field, the error and both buttons', async () => {
    await render(<SettingsScreen />);
    await deleteWith(DELETE_ROW, '9000000002');
    expect(deleteFacilityAccount).not.toHaveBeenCalled();
    expect(texts()).toContain("This number doesn't match your account. Check it and try again.");
    expect(confirmButton('Delete account').props.disabled).toBe(false);
    expect(confirmButton('Cancel').props.disabled).toBe(false);
  });

  it('says so when the final cleanup after the deletion was held back by a write in flight', async () => {
    jest.mocked(deleteFacilityAccount).mockResolvedValue('busy');
    await render(<SettingsScreen />);
    await deleteWith(DELETE_ROW, '9000000001');
    expect(alerts()[0]).toEqual(['Operation in progress', 'Finish the current operation before switching facilities.']);
  });
});

describe.each([
  ['Settings', () => <SettingsScreen />],
  ['Profile', () => <ProfileScreen />],
])('%s with central login off', (screen, element) => {
  beforeEach(() => { mockCentralOn = false; });

  it('keeps the sign-out that leads to the sign-in screen', async () => {
    await render(element());
    expect(texts()).not.toContain('Leave this facility');
    expect(texts()).not.toContain('Sign out of this phone');
    if (screen === 'Settings') {
      expect(texts()).toContain('Change warehouse server');
      await press('Change warehouse server');
      expect(router.push).toHaveBeenCalledWith('/operator-server');
    }

    await press(SIGN_OUT_ROW);
    expect(texts()).toContain("You'll need your mobile number and a one-time code to sign in again.");
    await act(async () => { await confirmButton('Sign out').props.onPress(); });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(leaveFacility).not.toHaveBeenCalled();
    expect(signOutEverywhere).not.toHaveBeenCalled();
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
    // Back to the My facilities under this screen when there is one; never a second one on top.
    expect(router.dismissTo).toHaveBeenCalledWith('/facilities');
    expect(router.replace).not.toHaveBeenCalled();
    // Otherwise the guard would turn My facilities back into that facility's sign-in.
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  });

  it('central login off: the facility asks for a new code', async () => {
    mockCentralOn = false;
    await render(<PendingEnrollmentScreen />);
    expect(texts()).toContain('North Cold Store approved your access. Sign in again with a new code to continue.');
    expect(texts()).toContain('Sign in');
  });

  it('central login off: "Sign in" replaces the waiting screen with the facility sign-in, as before', async () => {
    mockCentralOn = false;
    await render(<PendingEnrollmentScreen />);
    await press('Sign in');
    expect(signOutPendingEnrollment).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
