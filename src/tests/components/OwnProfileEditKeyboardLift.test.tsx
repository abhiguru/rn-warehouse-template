/**
 * WH-228: the own-profile edit screen (app/user/edit/[userId].tsx) lifts its own Save bar by the part the keyboard
 * covers, through useKeyboardCoverLift. The real screen; the keyboard is a recorded stand-in.
 */
import React from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

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

afterEach(() => {
  jest.restoreAllMocks();
});

it('lifts the Save bar by the covered part while the keyboard is up, and drops the lift when it hides', async () => {
  jest.mocked(UserService.getUserById).mockResolvedValue({
    success: true, message: 'ok',
    data: { id: 'profile-1', auth_user_id: 'a', name: 'Asha Example', email: '', mobile: '9000000002', role: 'staff' as never, supervisor: false, active: true, created_at: '', updated_at: '', assignedCustomers: [], assignedCustomersStatus: 'loaded' },
  } as never);
  const listeners: Record<string, (event?: unknown) => void> = {};
  let barLayout: unknown;
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  // The jest View keeps measureInWindow on a shared prototype and there are no native views: it is given a place
  // (the spy is undone by restoreAllMocks).
  jest.spyOn(View.prototype as unknown as { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }, 'measureInWindow')
    // Only the Save bar answers (it is the view whose onLayout is `barLayout`, known once it is drawn): a hook measuring another view gets nothing.
    .mockImplementation(function (this: { props?: { onLayout?: unknown } }, cb) { if (barLayout !== undefined && this.props?.onLayout === barLayout) cb(0, 1400, 1080, 100); });
  await render(<OwnProfileEditScreen />);
  // The bar has no role or text of its own: it is the nearest laid-out host View above the Save button.
  const save = await screen.findByTestId('self-edit-save');
  let bar: typeof save | null = save.parent;
  while (bar && !(typeof bar.type === 'string' && bar.props.onLayout != null)) bar = bar.parent;
  if (!bar) throw new Error('The Save bar was not found');
  const found = bar;
  barLayout = found.props.onLayout;
  const margin = () => (StyleSheet.flatten(found.props.style) as { marginBottom?: number }).marginBottom ?? 0;
  expect(margin()).toBe(0);
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1350, height: 800 } }); });
  expect(margin()).toBe(150);
  await act(async () => { listeners.keyboardDidHide(); });
  expect(margin()).toBe(0);
});
