/**
 * WH-141: a build with one brand (no brand pack) has no "App colours" row in Settings, and no colour sheet; a build
 * with the fictional sample pack has both. The pack is registered only in the second test, so the first sees the
 * neutral build.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import SettingsScreen from '../../../app/settings';
import { setLanguage } from '@/i18n';
import { registerSampleBrand } from '@/tests/helpers/sampleBrand';

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
jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => true }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));

let tree: ReactTestRenderer | undefined;
const ids = () => tree!.root.findAll(node => typeof node.props.testID === 'string').map(node => node.props.testID as string);

beforeEach(() => {
  setLanguage('en');
  mockState = {
    theme: { preference: 'light', brand: 'orange', language: 'en' },
    auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin', mobile: '919000000001' } },
  };
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});
async function render() {
  await act(async () => {
    tree = create(<SettingsScreen />);
  });
}

describe('the App colours row', () => {
  it('is hidden in a build with one brand, while Appearance and Language stay', async () => {
    await render();
    expect(ids()).toContain('settings-pref-appearance');
    expect(ids()).toContain('settings-pref-language');
    expect(ids()).not.toContain('settings-pref-brand');
    const sheet = tree!.root.findAll(node => node.props.testID === 'settings-sheet-brand' && 'visible' in node.props);
    expect(sheet.every(node => node.props.visible === false)).toBe(true); // the sheet is never opened without a choice
  });

  it('is shown in a build with a second brand, reading the current brand', async () => {
    registerSampleBrand();
    await render();
    const row = tree!.root.findAll(node => node.props.testID === 'settings-pref-brand' && typeof node.props.onPress === 'function' && node.props.accessibilityLabel)[0];
    expect(row.props.accessibilityLabel).toBe('App colours, Orange');
  });
});
