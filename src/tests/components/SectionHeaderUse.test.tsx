/**
 * G-43: Settings, Profile, Help and the support block draw their section titles with the
 * shared SectionHeader, not with a local copy of its style.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import SettingsScreen from '../../../app/settings';
import ProfileScreen from '../../../app/profile';
import HelpScreen from '../../../app/help';
import { SectionHeader } from '@/components/ui/SectionHeader';
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
jest.mock('@/hooks/useCapability', () => ({
  useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
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
});

async function titlesOf(screen: React.ReactElement): Promise<string[]> {
  await act(async () => {
    tree = create(screen);
  });
  return tree!.root.findAllByType(SectionHeader).map(node => node.props.title);
}

it('Settings', async () => {
  expect(await titlesOf(<SettingsScreen />)).toEqual(
    expect.arrayContaining(['Warehouse tools', 'Preferences', 'Account', 'Help and about'])
  );
});

it('Profile', async () => {
  expect(await titlesOf(<ProfileScreen />)).toEqual(['Account information', 'Actions']);
});

it('Help, with the support block', async () => {
  expect(await titlesOf(<HelpScreen />)).toEqual([
    'Your facility',
    'Getting help',
    'Roles',
    'When something changes',
    'Details for support',
  ]);
});
