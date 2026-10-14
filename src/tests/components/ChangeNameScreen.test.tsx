/**
 * G-11: Change name (app/user/edit/[userId].tsx) has a Back header with the title centred,
 * a Save button under the form, asks before a typed name is dropped, and ends a save with a
 * toast instead of an alert (no message at all when nothing changed).
 *
 * The real expo-router stack runs here, so the header Back, the Android Back key and the
 * unsaved-changes guard are the real ones.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { router, Stack } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown> = {};
const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/store/slices/authSlice', () => ({ setUserProfile: jest.fn((profile: unknown) => ({ type: 'set', profile })) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/services/user-service', () => ({
  UserService: { getUserById: jest.fn(), getAccessibleCustomers: jest.fn(), updateUser: jest.fn() },
}));

import { UserService } from '@/services/user-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';

const getUserById = jest.mocked(UserService.getUserById);
const updateUser = jest.mocked(UserService.updateUser);

const loaded = {
  success: true,
  message: 'ok',
  data: {
    id: 'profile-1',
    auth_user_id: 'auth-1',
    name: 'Dev Administrator',
    email: '',
    mobile: '9000000001',
    role: 'admin' as never,
    supervisor: false,
    active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    assignedCustomers: [],
    assignedCustomersStatus: 'loaded' as const,
  },
};

let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;
const settle = async () => {
  await act(async () => {
    await jest.runAllTimersAsync();
  });
};
const pathname = () => routerStore.getRouteInfo().pathname;
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const nameInput = () => tree.root.findAllByType(TextInput)[0];
const saveButton = () => tree.root.findAll(node => node.props.testID === 'self-edit-save' && typeof node.props.onPress === 'function')[0];
const typeName = async (name: string) => {
  await act(async () => {
    nameInput().props.onChangeText(name);
  });
};
const press = async (node: { props: { onPress?: () => void } }) => {
  await act(async () => {
    node.props.onPress?.();
  });
  await settle();
};
const openScreen = async () => {
  await act(async () => {
    router.push('/edit?userId=profile-1');
  });
  await settle();
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setLanguage('en');
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  mockState = {
    theme: { preference: 'light', brand: 'orange', language: 'en' },
    auth: { userProfile: { id: 'profile-1', name: 'Dev Administrator', role: 'admin' } },
  };
  getUserById.mockResolvedValue(loaded);
  updateUser.mockResolvedValue({ success: true, message: 'ok' });
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    index: () => <Text>Profile</Text>,
    edit: () => <OwnProfileEditScreen />,
  });
  await act(async () => {
    tree = create(<ExpoRoot context={context} location="/" />);
  });
  await settle();
});
afterEach(async () => {
  await act(async () => {
    tree.unmount();
  });
  backKey.restore();
  jest.useRealTimers();
});

describe('the header and the loading state', () => {
  it('shows Back and the centred title while the profile is still loading', async () => {
    getUserById.mockReturnValue(new Promise(() => undefined));
    await openScreen();
    expect(texts()).toContain('Change name');
    expect(texts()).toContain('Back');
    // The old header controls are gone.
    expect(texts()).not.toContain('Cancel');
    expect(texts()).not.toContain('Save');
  });

  it('has the Save button under the form and nothing at the top right', async () => {
    await openScreen();
    expect(texts()).not.toContain('Cancel');
    expect(saveButton()).toBeDefined();
    expect(saveButton().props.children).toBe('Save name');
  });
});

describe('saving', () => {
  it('with no change: leaves with no server call, no toast and no alert', async () => {
    await openScreen();
    await press(saveButton());
    expect(updateUser).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
  });

  it('with a new name: saves it, shows the toast, goes back without a question', async () => {
    await openScreen();
    await typeName('Dev Administrator X');
    await press(saveButton());
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][1].name).toBe('Dev Administrator X');
    expect(showToast).toHaveBeenCalledWith('Name saved.');
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
  });

  it('CR-48: saves the trimmed name, not the text with its trailing space', async () => {
    await openScreen();
    await typeName('Dev Administrator X ');
    await press(saveButton());
    expect(updateUser.mock.calls[0][1].name).toBe('Dev Administrator X');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'set', profile: expect.objectContaining({ name: 'Dev Administrator X' }) });
  });

  it('a failed save stays on the form with an alert and no toast', async () => {
    updateUser.mockResolvedValue({ success: false, message: 'nope' });
    await openScreen();
    await typeName('Dev Administrator X');
    await press(saveButton());
    expect(showToast).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/edit');
  });
});

describe('leaving with a typed name', () => {
  it('asks "Discard changes?" on the header Back and stays; Discard then leaves', async () => {
    await openScreen();
    await typeName('Dev Administrator X');
    await act(async () => {
      router.back();
    });
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Discard changes?');
    expect(pathname()).toBe('/edit');
    const buttons = jest.mocked(showAlert).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await press({ props: { onPress: buttons.find(button => button.text === 'Discard')!.onPress } });
    expect(pathname()).toBe('/');
  });

  it('asks on the phone Back key too, and not at all when nothing was typed', async () => {
    await openScreen();
    await act(async () => {
      backKey.press();
    });
    await settle();
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');

    await openScreen();
    await typeName('Dev Administrator X');
    await act(async () => {
      backKey.press();
    });
    await settle();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/edit');
  });

  it('a name typed and typed back to the original is not a change', async () => {
    await openScreen();
    await typeName('Dev Administrator X');
    await typeName('Dev Administrator');
    await act(async () => {
      router.back();
    });
    await settle();
    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/');
  });
});
