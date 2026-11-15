/**
 * WH-228: the own-profile edit screen (app/user/edit/[userId].tsx) lifts its own Save bar by the part the keyboard
 * covers, through useKeyboardCoverLift. The real screen; the keyboard is a recorded stand-in.
 */
import React from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'profile-1', name: 'Asha Example', role: 'staff' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: 'profile-1' }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/slices/authSlice', () => ({ setUserProfile: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/services/user-service', () => ({
  UserService: { getUserById: jest.fn(), getAccessibleCustomers: jest.fn(), updateUser: jest.fn() },
}));

import { UserService } from '@/services/user-service';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

it('lifts the Save bar by the covered part while the keyboard is up, and drops the lift when it hides', async () => {
  jest.mocked(UserService.getUserById).mockResolvedValue({
    success: true, message: 'ok',
    data: { id: 'profile-1', auth_user_id: 'a', name: 'Asha Example', email: '', mobile: '9000000002', role: 'staff' as never, supervisor: false, active: true, created_at: '', updated_at: '', assignedCustomers: [], assignedCustomersStatus: 'loaded' },
  } as never);
  const listeners: Record<string, (event?: unknown) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  await act(async () => { tree = create(<OwnProfileEditScreen />); });
  // The deepest View with an onLayout that holds the Save button is the bar.
  const bars = tree!.root.findAll(n => n.instance != null && n.props.onLayout != null && n.findAll(c => c.props.testID === 'self-edit-save').length > 0);
  const bar = bars[bars.length - 1];
  (bar as unknown as { instance: { measureInWindow: unknown } }).instance.measureInWindow =
    (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 1400, 1080, 100);
  const margin = () => (StyleSheet.flatten(bar.props.style) as { marginBottom?: number }).marginBottom ?? 0;
  expect(margin()).toBe(0);
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1350, height: 800 } }); });
  expect(margin()).toBe(150);
  await act(async () => { listeners.keyboardDidHide(); });
  expect(margin()).toBe(0);
});
