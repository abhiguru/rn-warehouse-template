/**
 * G-09, G-10, G-40, G-45: the rows of Settings say what they open.
 *
 * - Warehouse tools subtitles tell a customer record apart from a person who signs in (G-10).
 * - The colour row is "App colours", not "Brand" (G-45).
 * - "Change warehouse server" shows which server is in use (G-09).
 * - Sign out has no chevron and no red (G-40).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import SettingsScreen from '../../../app/settings';
import { setLanguage } from '@/i18n';
import { router } from 'expo-router';
import { registerBrandPack, type BrandPack } from '@/theme/brandPack';

// The fictional sample pack stands in for an organisation's own brand (WH-141).
registerBrandPack(require('../../../brand-packs/sample-teal/brand.json') as BrandPack);

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
let mockServer: Record<string, string> | null = null;
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('@/hooks/useCapability', () => ({
  useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }),
}));
let mockHasNumbering = true;
jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => mockHasNumbering }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));

let user: ReturnType<typeof userEvent.setup>;
// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const byTestId = (id: string) => screen.getByTestId(id);

beforeEach(async () => {
  setLanguage('en');
  user = userEvent.setup({ delay: 0 });
  mockServer = null;
  mockHasNumbering = true;
  mockState = {
    theme: { preference: 'dark', brand: 'sample-teal', language: 'en' },
    auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin', mobile: '919000000001' } },
  };
});

describe('Warehouse tools rows (G-10)', () => {
  it('say what a customer, an item and a user are', async () => {
    await render(<SettingsScreen />);
    expect(byTestId('settings-feature-customers')).toHaveAccessibleName('Customers, Farmers and traders you store goods for');
    expect(byTestId('settings-feature-items')).toHaveAccessibleName('Items, Produce you store, like potatoes or garlic');
    expect(byTestId('settings-feature-users')).toHaveAccessibleName('Users, People who can sign in, their role and customers');
    expect(byTestId('settings-feature-enrollmentReview')).toHaveAccessibleName(/Approve people who asked to use this facility/);
  });

  it('name the standard rate and open its screen', async () => {
    await render(<SettingsScreen />);
    expect(byTestId('settings-feature-standardRate')).toHaveAccessibleName('Standard rate, The rate new items get');
    await user.press(byTestId('settings-feature-standardRate'));
    expect(router.push).toHaveBeenCalledWith('/standard-rate');
  });
});

describe('Document numbers row (WS-8)', () => {
  it('is under Warehouse tools for an administrator and opens its screen', async () => {
    await render(<SettingsScreen />);
    expect(byTestId('settings-feature-documentNumbering')).toHaveAccessibleName('Document numbers, How GRN, dispatch and invoice numbers are written');
    await user.press(byTestId('settings-feature-documentNumbering'));
    expect(router.push).toHaveBeenCalledWith('/document-numbering');
  });

  it('is not offered while the backend is older than migration 127 (it would open to a failed load)', async () => {
    mockHasNumbering = false;
    await render(<SettingsScreen />);
    expect(screen.queryAllByTestId('settings-feature-documentNumbering', everything)).toHaveLength(0);
    expect(byTestId('settings-feature-items')).toBeOnTheScreen();
  });

  it.each(['supervisor', 'staff'])('is not offered to %s', async role => {
    mockState = { ...mockState, auth: { userProfile: { id: 'u2', name: 'Fictional Person', role, mobile: '919000000002' } } };
    await render(<SettingsScreen />);
    expect(screen.queryAllByTestId('settings-feature-documentNumbering', everything)).toHaveLength(0);
  });
});

describe('App colours (G-45)', () => {
  it('the Preferences row reads "App colours, Sample teal"', async () => {
    await render(<SettingsScreen />);
    expect(byTestId('settings-pref-brand')).toHaveAccessibleName('App colours, Sample teal');
  });
});

describe('Change warehouse server (G-09)', () => {
  it('names the server in use under the row', async () => {
    mockServer = {
      origin: 'https://warehouse-dev.gurucold.in',
      displayName: 'Dev',
      companyName: 'Dev Cold Storage (fictional data)',
      instanceId: 'i1',
    };
    await render(<SettingsScreen />);
    expect(screen.getByLabelText(/^Change warehouse server/)).toHaveAccessibleName('Change warehouse server, Now using Dev Cold Storage (fictional data)');
  });

  it('has no subtitle when no server is known', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByLabelText(/^Change warehouse server/)).toHaveAccessibleName('Change warehouse server');
  });
});

describe('Sign out row (G-40)', () => {
  it('has no chevron and is not drawn as destructive', async () => {
    await render(<SettingsScreen />);
    const signOut = byTestId('account-sign-out');
    // The chevron is an icon with no role or text: found by its name under the row.
    expect(signOut.queryAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'chevron-right')).toHaveLength(0);
    // Not destructive: the label is drawn in the colour of an ordinary row (Help), not the one of a destructive row.
    const colourOf = (row: ReturnType<typeof byTestId>, label: string) => StyleSheet.flatten(within(row).getByText(label).props.style).color;
    expect(colourOf(signOut, 'Sign out')).toBe(colourOf(byTestId('settings-help'), 'Help'));
    // The Help row does have a chevron, so the check above can fail.
    expect(byTestId('settings-help').queryAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'chevron-right')).toHaveLength(1);
  });
});
