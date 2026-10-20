/**
 * SR-01, SR-09, SR-13: the account actions Settings and Profile share.
 *
 * Without central login: one "Sign out" that opens the sign-in screen. With
 * central login and the association sign-in: "Leave this facility" (the
 * association sign-in stays) and "Sign out of this phone" (both end). With
 * central login but no association sign-in: one "Sign out" through the
 * facility cleanup. Deletion names the facility in both steps with central
 * login, and never promises to erase the phone's preferences.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { signOutPhoneWithMessages, useAccountActions } from '../useAccountActions';
import { leaveFacility } from '@/store/operatorSwitch';
import { deleteFacilityAccount, signOutEverywhere } from '@/store/centralSignOut';
import { deleteAccount, logout } from '@/store/slices/authSlice';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { setLanguage } from '@/i18n';
import { showAlert } from '@/utils/alert';

let mockCentralOn = true;
let mockProfile: { id: string; name: string; role: string; mobile?: string } = {
  id: 'profile-1',
  name: 'Asha Fictional',
  role: 'staff',
  mobile: '919000000001',
};
const mockDispatch = jest.fn((action: unknown) => ({ unwrap: async () => action }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
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
}));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(() => ({ type: 'test/deleteAccount' })),
  isDeleteAccountRejection: (value: unknown) => typeof value === 'object' && value !== null && 'serverDeleted' in value,
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
    tree = create(<Probe />);
  });
}
const alerts = () => jest.mocked(showAlert).mock.calls;
const ids = () => hook.actions.map(action => action.id);
async function confirmAction(id: Hook['actions'][number]['id']) {
  act(() => hook.request(id));
  expect(hook.dialog.visible).toBe(true);
  await act(async () => hook.dialog.onConfirm());
}
async function deleteWith(number: string) {
  act(() => hook.deletion.open());
  act(() => hook.deletion.dialog.onConfirm()); // warning → number
  act(() => hook.deletion.dialog.field!.onChangeText(number));
  await act(async () => hook.deletion.dialog.onConfirm());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCentralOn = true;
  mockProfile = { id: 'profile-1', name: 'Asha Fictional', role: 'staff', mobile: '919000000001' };
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' } });
  jest.mocked(leaveFacility).mockResolvedValue('left');
  jest.mocked(signOutEverywhere).mockResolvedValue({ ok: true });
  jest.mocked(deleteFacilityAccount).mockResolvedValue('left');
});
afterEach(() => {
  setLanguage('en');
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

describe('without central login', () => {
  beforeEach(() => {
    mockCentralOn = false;
  });

  it('offers one Sign out that ends the facility session and opens the sign-in screen', async () => {
    await render();
    expect(hook.mode).toBe('legacy');
    expect(ids()).toEqual(['signOut']);
    expect(hook.actions[0]).toMatchObject({ label: 'Sign out', subtitle: 'Sign out of this facility on this phone.', destructive: false });
    act(() => hook.request('signOut'));
    expect(hook.dialog).toMatchObject({
      visible: true,
      title: 'Sign out?',
      message: "You'll need your mobile number and a one-time code to sign in again.",
      confirmText: 'Sign out',
    });
    await act(async () => hook.dialog.onConfirm());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(leaveFacility).not.toHaveBeenCalled();
    expect(signOutEverywhere).not.toHaveBeenCalled();
    expect(hook.dialog.visible).toBe(false);
  });

  it('says so when the sign-out fails, and stays on the screen', async () => {
    mockDispatch.mockImplementationOnce(() => ({ unwrap: async () => { throw new Error('offline'); } }));
    await render();
    await confirmAction('signOut');
    expect(alerts()).toEqual([["Couldn't sign out", 'Check your connection and try again.']]);
    expect(router.replace).not.toHaveBeenCalled();
    expect(hook.dialog.visible).toBe(false);
  });

  it('does not offer the central actions', async () => {
    await render();
    act(() => hook.request('signOutPhone'));
    expect(hook.dialog.visible).toBe(false);
  });
});

describe('central login, signed in to the association', () => {
  it('offers "Leave this facility" with the name and "Sign out of this phone"', async () => {
    await render();
    expect(hook.mode).toBe('central');
    expect(hook.facilityName).toBe('North Cold Store');
    expect(ids()).toEqual(['leaveFacility', 'signOutPhone']);
    expect(hook.actions[0]).toMatchObject({
      label: 'Leave this facility',
      subtitle: 'Leave North Cold Store and return to My facilities. You stay signed in to the association.',
      destructive: false,
    });
    expect(hook.actions[1]).toMatchObject({
      label: 'Sign out of this phone',
      subtitle: 'Ends your association sign-in and this facility on this phone.',
      destructive: false,
    });
  });

  it('"Leave this facility" asks, then leaves through the facility cleanup only; no screen is pushed', async () => {
    await render();
    act(() => hook.request('leaveFacility'));
    expect(hook.dialog).toMatchObject({
      visible: true,
      title: 'Leave North Cold Store?',
      message: 'Unsaved forms are discarded. You stay signed in to the association and can open this facility again from My facilities.',
      confirmText: 'Leave',
    });
    expect(leaveFacility).not.toHaveBeenCalled();
    await act(async () => hook.dialog.onConfirm());
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(signOutEverywhere).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(getCentralState().status).toBe('signedIn');
    expect(alerts()).toHaveLength(0);
  });

  it.each([
    ['busy', ['Operation in progress', 'A save is still being sent. Wait a few seconds, then try again.']],
    ['failed', ['Left North Cold Store', "Some of North Cold Store's data couldn't be removed from this phone. Restart the app before someone else uses it."]],
  ] as const)('says why leaving did not happen (%s)', async (outcome, alert) => {
    jest.mocked(leaveFacility).mockResolvedValue(outcome);
    await render();
    await confirmAction('leaveFacility');
    expect(alerts()).toEqual([alert]);
    expect(hook.dialog.visible).toBe(false);
  });

  it('is busy while the action runs: the dialog cannot be closed, then closes', async () => {
    let finish!: (value: 'left') => void;
    jest.mocked(leaveFacility).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render();
    act(() => hook.request('leaveFacility'));
    expect(hook.dialog.busy).toBe(false);
    act(() => { hook.dialog.onConfirm(); });
    expect(hook.dialog.busy).toBe(true);
    act(() => hook.dialog.onCancel());
    expect(hook.dialog.visible).toBe(true);
    // A second tap while it runs does not start a second leave.
    act(() => { hook.dialog.onConfirm(); });
    expect(leaveFacility).toHaveBeenCalledTimes(1);
    await act(async () => finish('left'));
    expect(hook.dialog.busy).toBe(false);
    expect(hook.dialog.visible).toBe(false);
  });

  it.each([
    ['leaveFacility', () => leaveFacility],
    ['signOutPhone', () => signOutEverywhere],
  ] as const)('two taps on %s before the next draw run it once', async (id, called) => {
    jest.mocked(leaveFacility).mockReturnValue(new Promise(() => {}));
    jest.mocked(signOutEverywhere).mockReturnValue(new Promise(() => {}));
    await render();
    act(() => hook.request(id));
    const confirm = hook.dialog.onConfirm;
    act(() => {
      confirm();
      confirm();
    });
    expect(called()).toHaveBeenCalledTimes(1);
  });

  it('"Sign out of this phone" ends the association sign-in and the facility', async () => {
    await render();
    act(() => hook.request('signOutPhone'));
    expect(hook.dialog).toMatchObject({
      title: 'Sign out of this phone?',
      message:
        "You'll be signed out of the association and of the cold storage you have open. You'll need your mobile number and a one-time code to sign in again.",
      confirmText: 'Sign out',
    });
    await act(async () => hook.dialog.onConfirm());
    expect(signOutEverywhere).toHaveBeenCalledWith(mockDispatch);
    expect(leaveFacility).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
  });

  it.each([
    [{ ok: false, reason: 'local_clear_failed' }, "This phone couldn't remove your association sign-in from its secure storage. Restart the app and check that you're signed out before anyone else uses this phone."],
    [{ ok: false, reason: 'busy' }, 'A save is still being sent. Wait a few seconds, then try again.'],
  ] as const)('tells the person when the phone sign-out did not complete (%j)', async (result, message) => {
    jest.mocked(signOutEverywhere).mockResolvedValue(result);
    await render();
    await confirmAction('signOutPhone');
    expect(alerts()).toEqual([["Couldn't sign out", message]]);
  });

  it('tells the person when the facility cleanup failed although the sign-out finished', async () => {
    jest.mocked(signOutEverywhere).mockResolvedValue({ ok: true, facilityCleanup: 'failed' });
    await render();
    await confirmAction('signOutPhone');
    expect(alerts()).toEqual([['Signed out', "Some of North Cold Store's data couldn't be removed from this phone. Restart the app before someone else uses it."]]);
  });

  it('keeps the same two actions for a facility opened with its own SMS sign-in', async () => {
    setCentralState({ facilitySmsOrigin: 'https://north-cold.example.test' });
    await render();
    expect(ids()).toEqual(['leaveFacility', 'signOutPhone']);
    await confirmAction('leaveFacility');
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });
});

describe('central login without the association sign-in', () => {
  it('offers one Sign out with the code wording, through the facility cleanup', async () => {
    setCentralState({ status: 'signedOut', user: null, facilitySmsOrigin: null });
    await render();
    expect(hook.mode).toBe('centralSignedOut');
    expect(ids()).toEqual(['signOut']);
    act(() => hook.request('signOut'));
    expect(hook.dialog.message).toBe("You'll need your mobile number and a one-time code to sign in again.");
    await act(async () => hook.dialog.onConfirm());
    expect(leaveFacility).toHaveBeenCalledWith(mockDispatch);
    expect(logout).not.toHaveBeenCalled();
    expect(signOutEverywhere).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('signOutPhoneWithMessages (My facilities and inside a facility)', () => {
  it('answers the outcome and shows the message only on failure', async () => {
    await expect(signOutPhoneWithMessages(mockDispatch)).resolves.toEqual({ ok: true });
    expect(alerts()).toHaveLength(0);
    jest.mocked(signOutEverywhere).mockResolvedValueOnce({ ok: false, reason: 'busy' });
    await expect(signOutPhoneWithMessages(mockDispatch)).resolves.toEqual({ ok: false, reason: 'busy' });
    expect(alerts()).toEqual([["Couldn't sign out", 'A save is still being sent. Wait a few seconds, then try again.']]);
  });
});

describe('deleting the account', () => {
  it('central login: the row, both steps and the number step name the facility and say the association sign-in stays', async () => {
    await render();
    expect(hook.deletion.label).toBe('Delete my account at North Cold Store');
    expect(hook.deletion.subtitle).toBe('Removes your profile and sign-in here. Records, your association sign-in and other facilities stay.');
    act(() => hook.deletion.open());
    const warning = hook.deletion.dialog;
    expect(warning.visible).toBe(true);
    expect(warning.field).toBeUndefined();
    expect(warning.title).toBe('Delete your account at North Cold Store?');
    expect(warning.message.match(/North Cold Store/g)).toHaveLength(2);
    expect(warning.message).toContain('Your association sign-in and your other facilities stay');
    expect(warning.message).toContain('Appearance, language and report preferences on this phone stay.');
    act(() => warning.onConfirm());
    const confirm = hook.deletion.dialog;
    expect(confirm.title).toBe('Confirm deletion at North Cold Store');
    expect(confirm.message).toContain('North Cold Store');
    expect(confirm.message).toContain('association sign-in');
    expect(confirm.field?.placeholder).toBe('10-digit mobile number');
  });

  it('never says erased or permanently deleted, in either language', async () => {
    for (const central of [true, false]) {
      mockCentralOn = central;
      for (const language of ['en', 'gu'] as const) {
        setLanguage(language);
        await render();
        act(() => hook.deletion.open());
        const texts = [hook.deletion.label, hook.deletion.subtitle, hook.deletion.dialog.title, hook.deletion.dialog.message];
        act(() => hook.deletion.dialog.onConfirm());
        texts.push(hook.deletion.dialog.title, hook.deletion.dialog.message);
        expect(texts.join(' ')).not.toMatch(/erase|permanent|કાયમી/i);
        act(() => tree!.unmount());
        tree = undefined;
      }
    }
  });

  it('central login, in Gujarati: both steps name the facility and the association sign-in', async () => {
    setLanguage('gu');
    await render();
    act(() => hook.deletion.open());
    expect(hook.deletion.dialog.message).toContain('North Cold Store');
    expect(hook.deletion.dialog.message).toContain('ઍસોસિએશનનું તમારું લૉગિન');
    act(() => hook.deletion.dialog.onConfirm());
    expect(hook.deletion.dialog.title).toContain('North Cold Store');
    expect(hook.deletion.dialog.message).toContain('ઍસોસિએશનનું તમારું લૉગિન');
  });

  it('a wrong number keeps the number step open with the error; nothing is deleted', async () => {
    await render();
    await deleteWith('9000000002');
    expect(hook.deletion.dialog.visible).toBe(true);
    expect(hook.deletion.dialog.field?.error).toBe("This number doesn't match your account. Check it and try again.");
    expect(hook.deletion.dialog.field?.value).toBe('9000000002');
    expect(deleteFacilityAccount).not.toHaveBeenCalled();
    // Typing again clears the error.
    act(() => hook.deletion.dialog.field!.onChangeText('90000'));
    expect(hook.deletion.dialog.field?.error).toBeNull();
  });

  it('an empty field never matches', async () => {
    await render();
    await deleteWith('');
    expect(hook.deletion.dialog.field?.error).toBe("This number doesn't match your account. Check it and try again.");
    expect(deleteFacilityAccount).not.toHaveBeenCalled();
  });

  it.each([true, false])('is not offered for a profile without a mobile number (central login %s)', async central => {
    mockCentralOn = central;
    mockProfile = { id: 'profile-1', name: 'Asha Fictional', role: 'staff' };
    await render();
    expect(hook.deletion.available).toBe(false);
    // Nothing can open it or delete through it.
    act(() => hook.deletion.open());
    expect(hook.deletion.dialog.visible).toBe(false);
    await act(async () => hook.deletion.deleteAccount());
    expect(deleteFacilityAccount).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('is offered for a profile with a mobile number', async () => {
    await render();
    expect(hook.deletion.available).toBe(true);
  });

  it.each([true, false])('two taps on the final step before the next draw delete once (central login %s)', async central => {
    mockCentralOn = central;
    let finish!: (value: 'left') => void;
    jest.mocked(deleteFacilityAccount).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    let finishLegacy!: () => void;
    if (!central) mockDispatch.mockImplementationOnce(() => ({ unwrap: () => new Promise<void>(resolve => { finishLegacy = resolve; }) }));
    await render();
    act(() => hook.deletion.open());
    act(() => hook.deletion.dialog.onConfirm()); // warning → number
    act(() => hook.deletion.dialog.field!.onChangeText('9000000001'));
    const confirm = hook.deletion.dialog.onConfirm;
    act(() => {
      confirm();
      confirm();
    });
    expect(central ? deleteFacilityAccount : deleteAccount).toHaveBeenCalledTimes(1);
    await act(async () => (central ? finish('left') : finishLegacy()));
  });

  it('central login: the right number (in Gujarati digits too) deletes at this facility only', async () => {
    await render();
    await deleteWith('૯૦૦૦૦૦૦૦૦૧');
    expect(deleteFacilityAccount).toHaveBeenCalledWith(mockDispatch);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(hook.deletion.dialog.visible).toBe(false);
    expect(alerts()).toHaveLength(0);
  });

  it('without central login: the row and warning keep their wording with the preferences sentence; the right number deletes and opens sign-in', async () => {
    mockCentralOn = false;
    await render();
    expect(hook.deletion.label).toBe('Delete account');
    expect(hook.deletion.subtitle).toBe('Removes your profile and sign-in. Records are kept.');
    act(() => hook.deletion.open());
    expect(hook.deletion.dialog.title).toBe('Delete your account?');
    expect(hook.deletion.dialog.message).toContain('Appearance, language and report preferences on this phone stay.');
    expect(hook.deletion.dialog.message).not.toContain('App preferences');
    act(() => hook.deletion.dialog.onCancel());
    expect(hook.deletion.dialog.visible).toBe(false);
    await deleteWith('9000000001');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteFacilityAccount).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('shows the server refusal in the number step and keeps it open', async () => {
    mockCentralOn = false;
    mockDispatch.mockImplementationOnce(() => ({
      unwrap: async () => { throw { code: 'REFUSED', serverDeleted: false, message: 'The only administrator cannot be deleted.' }; },
    }));
    await render();
    await deleteWith('9000000001');
    expect(hook.deletion.dialog.visible).toBe(true);
    expect(hook.deletion.dialog.field?.error).toBe('The only administrator cannot be deleted.');
    expect(router.replace).not.toHaveBeenCalled();
  });
});
