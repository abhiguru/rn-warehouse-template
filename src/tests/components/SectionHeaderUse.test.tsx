/**
 * G-43: Settings, Profile, Help and the support block draw their section titles with the
 * shared SectionHeader, not with a local copy of its style.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SettingsScreen from '../../../app/settings';
import ProfileScreen from '../../../app/profile';
import HelpScreen from '../../../app/help';
import { setLanguage } from '@/i18n';
import { SectionHeader } from '@/components/ui/SectionHeader';

let mockState: Record<string, unknown>;
// The real SectionHeader, with its calls recorded: a title drawn with a local copy of its style is not one of them.
jest.mock('@/components/ui/SectionHeader', () => {
  const actual = jest.requireActual('@/components/ui/SectionHeader');
  const recorded = jest.fn(actual.SectionHeader);
  return { ...actual, SectionHeader: recorded, default: recorded };
});
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
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));

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
// SectionHeader draws its title as an element with the header role, named by its title.
async function titlesOf(ui: React.ReactElement): Promise<string[]> {
  jest.mocked(SectionHeader).mockClear();
  await render(ui);
  // The titles the shared component was asked to draw (a re-render repeats them).
  const drawn = [...new Set(jest.mocked(SectionHeader).mock.calls.map(([props]) => props.title))];
  // The screen's own title is a header too, with no label: only the section headers carry one. Each drawn title is one.
  const named = screen.getAllByRole('header').map(node => node.props.accessibilityLabel as string | undefined);
  drawn.forEach(title => expect(named).toContain(title));
  return drawn;
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
