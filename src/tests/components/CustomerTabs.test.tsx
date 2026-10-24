/**
 * The customer page's tabs (Customers -> a customer): Overview | Pricing for the roles that may open Item pricing,
 * Overview alone (no tab bar) for the others; `tab=pricing` selects the Pricing tab; `item` opens that item's box once.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { customerService } from '@/services/customer-service';
import { useItemRates } from '@/features/item-pricing/useItemRates';
import { F1, ITEMS } from '@/tests/helpers/ratesFixtures';
import CustomerPage from '../../../app/customer/[id]';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
let mockParams: Record<string, string> = { id: 'orchard-b' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => require('react').createElement('Skeleton') }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerById: jest.fn(), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const customer = { id: 'orchard-b', name: 'Review Orchard B', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01' };
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const shown = () => texts(tree).join(' | ');
const host = (id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const tablist = () => tree.root.findAll(n => n.props.accessibilityRole === 'tablist' && typeof n.type === 'string');
const tabs = () => tree.root.findAll(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
const tab = (label: string) => tabs().find(n => n.props.accessibilityLabel === label)!;

let tree: ReactTestRenderer;
async function open(role: string, params: Record<string, string> = { id: 'orchard-b' }) {
  mockRole = role;
  mockParams = params;
  await act(async () => { tree = create(<CustomerPage />); });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
  jest.mocked(customerService.getCustomerById).mockResolvedValue({ success: true, message: '', data: customer } as never);
  jest.mocked(useItemRates).mockReturnValue({
    items: ITEMS, rates: F1, status: 'ready', refreshing: false, lastUpdated: Date.now(), refreshError: false, error: null,
    refresh: jest.fn().mockResolvedValue(undefined), refreshIfStale: jest.fn().mockResolvedValue(undefined), itemRates: jest.fn(),
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe.each(['admin', 'supervisor'])('%s', role => {
  it('sees the tab bar with Overview and Pricing, on Overview', async () => {
    await open(role);
    expect(tablist()).toHaveLength(1);
    expect(tabs().map(n => n.props.accessibilityLabel)).toEqual(['Overview', 'Pricing']);
    expect(tab('Overview').props.accessibilityState).toEqual({ selected: true });
    expect(tab('Pricing').props.accessibilityState).toEqual({ selected: false });
    expect(shown()).toContain('Rajkot');
    expect(host('customer-pricing-tab')).toHaveLength(0);
    expect(useItemRates).not.toHaveBeenCalled();
  });
});

it('Pricing replaces the Overview content with the customer\'s item rates, and Overview brings it back', async () => {
  await open('admin');
  await act(async () => { tab('Pricing').props.onPress(); });
  expect(tab('Pricing').props.accessibilityState).toEqual({ selected: true });
  expect(host('customer-pricing-tab').length).toBeGreaterThan(0);
  expect(texts(tree)).toContain('Review Onion Red');
  expect(texts(tree)).toContain('Default rate: ₹3.50 per bag, per month');
  expect(shown()).not.toContain('Rajkot');
  expect(shown()).not.toContain('Deactivate customer');
  await act(async () => { tab('Overview').props.onPress(); });
  expect(host('customer-pricing-tab')).toHaveLength(0);
  expect(shown()).toContain('Rajkot');
  expect(shown()).toContain('Deactivate customer');
});

it('tab=pricing opens on the Pricing tab', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing' });
  expect(tab('Pricing').props.accessibilityState).toEqual({ selected: true });
  expect(host('customer-pricing-tab').length).toBeGreaterThan(0);
  expect(shown()).not.toContain('Rajkot');
  expect(router.push).not.toHaveBeenCalled();
});

it('item=onion also opens the onion box once, and not again after leaving the tab and coming back', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing', item: 'onion' });
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/item-rates/[itemId]/customer/[customerId]',
    params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
  });
  await act(async () => { tab('Overview').props.onPress(); });
  await act(async () => { tab('Pricing').props.onPress(); });
  expect(router.push).toHaveBeenCalledTimes(1);
});

it('Edit stays in the nav bar on both tabs', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing' });
  const edit = () => tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Edit' && typeof n.props.onPress === 'function')[0];
  await act(async () => { edit().props.onPress(); });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer-edit/[id]', params: { id: 'orchard-b' } });
});

describe.each(['staff', 'customer'])('%s (who cannot open Item pricing)', role => {
  it('sees the Overview alone, with no tab bar, even when the link asks for Pricing; the item link opens nothing', async () => {
    await open(role, { id: 'orchard-b', tab: 'pricing', item: 'onion' });
    expect(tablist()).toHaveLength(0);
    expect(shown()).toContain('Rajkot');
    expect(host('customer-pricing-tab')).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
    expect(useItemRates).not.toHaveBeenCalled();
  });
});
