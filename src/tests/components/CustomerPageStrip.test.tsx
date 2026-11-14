/** WH-209: one Deactivated strip under the page header on every tab, and the titled load-error state. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useLocalSearchParams } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { setLanguage, t } from '@/i18n';
import { useItemRates, type UseItemRatesResult } from '@/features/item-pricing/useItemRates';
import { F1, ITEMS } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerById: jest.fn(), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));
import CustomerPage from '../../../app/customer/[id]';

const c1 = { id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01' };
const STRIP = 'This customer is deactivated. Activate them to change their rates.';
const rates = (): UseItemRatesResult => ({
  items: ITEMS, rates: F1, status: 'ready', refreshing: false, lastUpdated: Date.now(), refreshError: false, error: null,
  refresh: jest.fn().mockResolvedValue(undefined), refreshIfStale: jest.fn().mockResolvedValue(undefined), itemRates: jest.fn(),
});
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const host = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const tab = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'tab' && String(n.props.accessibilityLabel ?? '').startsWith(label))[0];

let tree: ReactTestRenderer;
const mount = async () => { await act(async () => { tree = create(<CustomerPage />); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockImplementation(() => ({ id: 'c1' }) as never);
  jest.mocked(useItemRates).mockReturnValue(rates());
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: { ...c1, active: false } } as never);
});
afterEach(() => { act(() => tree.unmount()); setLanguage('en'); });

describe('a deactivated customer', () => {
  it('shows the strip once, under the header, on the Overview tab and on the Pricing tab, and not inside either tab', async () => {
    await mount();
    expect(host(tree, 'customer-deactivated')).toHaveLength(1);
    expect(texts(tree).filter(s => s === STRIP)).toHaveLength(1);
    expect(host(tree, 'customer-pricing-deactivated')).toHaveLength(0);
    await act(async () => { tab(tree, 'Pricing').props.onPress(); });
    expect(host(tree, 'customer-pricing-tab').length).toBeGreaterThan(0);
    expect(host(tree, 'customer-deactivated')).toHaveLength(1);
    expect(texts(tree).filter(s => s === STRIP)).toHaveLength(1);
    expect(host(tree, 'customer-pricing-deactivated')).toHaveLength(0);
  });

  it('shows no strip for an active customer', async () => {
    jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: c1 } as never);
    await mount();
    expect(host(tree, 'customer-deactivated')).toHaveLength(0);
    expect(texts(tree)).not.toContain(STRIP);
  });
});

describe('a customer that cannot be opened', () => {
  it('shows a title with the check-connection text under it, not the old one-sentence text', async () => {
    jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: false, message: '' } as never);
    await mount();
    const all = texts(tree);
    const title = all.indexOf("Couldn't open this customer");
    expect(title).toBeGreaterThanOrEqual(0);
    expect(all[title + 1]).toBe('Check your connection and try again.');
    expect(all).not.toContain("Couldn't open this customer. Check your connection and try again.");
  });

  it('has Gujarati for the title and the check-connection text', () => {
    expect(t('customers.page.loadFailedTitle', undefined, 'gu')).toBe('આ વેપારી ખોલી શકાયા નથી');
    expect(t('common.checkConnection', undefined, 'gu')).toBe('તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.');
  });
});
