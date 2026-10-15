/**
 * G-09, G-10, G-40, G-45: the rows of Settings say what they open.
 *
 * - Warehouse tools subtitles tell a customer record apart from a person who signs in (G-10).
 * - The colour row is "App colours", not "Brand" (G-45).
 * - "Change warehouse server" shows which server is in use (G-09).
 * - Sign out has no chevron and no red (G-40).
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import SettingsScreen from '../../../app/settings';
import { setLanguage } from '@/i18n';
import { router } from 'expo-router';

let mockState: Record<string, unknown>;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
let mockServer: Record<string, string> | null = null;
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
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
const byTestId = (id: string): ReactTestInstance =>
  tree!.root.findAll(node => node.props.testID === id && typeof node.props.onPress === 'function' && node.props.accessibilityLabel)[0];

beforeEach(async () => {
  setLanguage('en');
  mockServer = null;
  mockState = {
    theme: { preference: 'dark', brand: 'gcsa', language: 'en' },
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

describe('Warehouse tools rows (G-10)', () => {
  it('say what a customer, an item and a user are', async () => {
    await render();
    expect(byTestId('settings-feature-customers').props.accessibilityLabel).toBe('Customers, Farmers and traders you store goods for');
    expect(byTestId('settings-feature-items').props.accessibilityLabel).toBe('Items, Produce you store, like potatoes or garlic');
    expect(byTestId('settings-feature-users').props.accessibilityLabel).toBe('Users, People who can sign in, their role and customers');
    expect(byTestId('settings-feature-enrollmentReview').props.accessibilityLabel).toContain('Approve people who asked to use this facility');
  });

  it('name the standard rate and open its screen', async () => {
    await render();
    expect(byTestId('settings-feature-standardRate').props.accessibilityLabel).toBe('Standard rate, The rate new items get');
    await act(async () => { byTestId('settings-feature-standardRate').props.onPress(); });
    expect(router.push).toHaveBeenCalledWith('/standard-rate');
  });
});

describe('App colours (G-45)', () => {
  it('the Preferences row reads "App colours, GCSA navy"', async () => {
    await render();
    expect(byTestId('settings-pref-brand').props.accessibilityLabel).toBe('App colours, GCSA navy');
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
    await render();
    const row = tree!.root.findAll(node => node.props.accessibilityLabel?.startsWith?.('Change warehouse server') && typeof node.props.onPress === 'function')[0];
    expect(row.props.accessibilityLabel).toBe('Change warehouse server, Now using Dev Cold Storage (fictional data)');
  });

  it('has no subtitle when no server is known', async () => {
    await render();
    const row = tree!.root.findAll(node => node.props.accessibilityLabel?.startsWith?.('Change warehouse server') && typeof node.props.onPress === 'function')[0];
    expect(row.props.accessibilityLabel).toBe('Change warehouse server');
  });
});

describe('Sign out row (G-40)', () => {
  it('has no chevron and is not drawn as destructive', async () => {
    await render();
    const row = tree!.root.findAll(node => node.props.testID === 'account-sign-out' && typeof node.type !== 'string' && 'showChevron' in node.props)[0];
    expect(row.props.showChevron).toBe(false);
    expect(row.props.destructive).toBe(false);
  });
});
