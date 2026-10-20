/**
 * G-41, G-13: Profile shows the name and the role once, has one way into the name edit,
 * and its Account information lists only the mobile number. At large text the label
 * sits above the value.
 */
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ProfileScreen from '../../../app/profile';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown>;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true, useFocusEffect: require('./focusHarness').useFocusEffect }));
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

let tree: ReactTestRenderer | undefined;
async function render(fontScale = 1) {
  Dimensions.set({ window: { width: 360, height: 800, scale: 3, fontScale } });
  await act(async () => {
    tree = create(<ProfileScreen />);
  });
  return tree!.root;
}
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockState = {
    theme: { preference: 'light', brand: 'orange', language: 'en' },
    auth: {
      user: { id: 'auth-1' },
      userProfile: { id: 'profile-1', name: 'Dev Administrator', role: 'admin', mobile: '9000000001' },
    },
  };
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
});

describe('Profile (G-41)', () => {
  it('shows the name once', async () => {
    await render();
    expect(texts().filter(text => text === 'Dev Administrator')).toHaveLength(1);
  });

  it('has one pressable that leads to the name edit', async () => {
    const root = await render();
    // Every pressable of the screen; the outermost of each (a Pressable and the view it draws share props).
    const found = root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button');
    const pressables = found.filter(node => !found.some(other => other !== node && other.findAll(inner => inner === node).length > 0));
    let leading = 0;
    for (const pressable of pressables) {
      jest.mocked(router.push).mockClear();
      await act(async () => {
        pressable.props.onPress();
      });
      if (jest.mocked(router.push).mock.calls.some(call => String(call[0]).startsWith('/user/edit/'))) leading += 1;
    }
    expect(leading).toBe(1);
  });

  it('lists the mobile number only, as "Mobile number"', async () => {
    await render();
    const all = texts();
    expect(all).toContain('Mobile number');
    expect(all).not.toContain('Phone');
    expect(all).not.toContain('Name');
    expect(all).not.toContain('Role');
    expect(all).toContain('+91 90000 00001');
  });
});

describe('Profile at large text (G-13)', () => {
  it('at 2.0 the label sits above the value', async () => {
    const root = await render(2);
    expect(root.findAll(node => node.props.testID === 'profile-row-stacked').length).toBeGreaterThan(0);
  });
  it('at 1.3 the label and value share a line', async () => {
    const root = await render(1.3);
    expect(root.findAll(node => node.props.testID === 'profile-row-stacked')).toHaveLength(0);
  });
});
