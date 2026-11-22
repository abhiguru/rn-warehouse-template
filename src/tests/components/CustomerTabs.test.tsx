/**
 * The customer page's tabs (Customers -> a customer): Overview | Pricing for the roles that may open Item pricing,
 * Overview alone (no tab bar) for the others; `tab=pricing` selects the Pricing tab; `item` opens that item's box once.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => require('react').createElement('Skeleton') }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerById: jest.fn(), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const customer = { id: 'orchard-b', name: 'Review Orchard B', mobile: '9999900302', city: 'Rajkot', gst: '', active: true, created_at: '2026-01-01' };
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const tab = (name: string) => screen.getByRole('tab', { name });
const shownText = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const notShown = (text: string) => expect(screen.queryByText(text)).not.toBeOnTheScreen();
// The tab bar container is not an accessibility element, so no role query finds it: count it in the rendered tree.
const tablists = () => {
  const count = (node: unknown): number => {
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) return node.reduce((n: number, child) => n + count(child), 0);
    const { props, children } = node as { props?: { accessibilityRole?: string }; children?: unknown };
    return (props?.accessibilityRole === 'tablist' ? 1 : 0) + count(children);
  };
  return count(screen.toJSON());
};

async function open(role: string, params: Record<string, string> = { id: 'orchard-b' }) {
  mockRole = role;
  mockParams = params;
  await render(<CustomerPage />);
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
  jest.useRealTimers();
});

describe.each(['admin', 'supervisor'])('%s', role => {
  it('sees the tab bar with Overview and Pricing, on Overview', async () => {
    await open(role);
    expect(tablists()).toBe(1);
    expect(screen.getAllByRole('tab').map(n => n.props.accessibilityLabel)).toEqual(['Overview', 'Pricing']);
    expect(tab('Overview').props.accessibilityState).toEqual({ selected: true });
    expect(tab('Pricing').props.accessibilityState).toEqual({ selected: false });
    shownText('Rajkot');
    expect(screen.queryByTestId('customer-pricing-tab')).not.toBeOnTheScreen();
    expect(useItemRates).not.toHaveBeenCalled();
  });
});

it('Pricing replaces the Overview content with the customer\'s item rates, and Overview brings it back', async () => {
  await open('admin');
  await user().press(tab('Pricing'));
  expect(tab('Pricing').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getAllByTestId('customer-pricing-tab').length).toBeGreaterThan(0);
  shownText('Review Onion Red');
  shownText('Default rate: ₹3.50 per bag, per month');
  notShown('Rajkot');
  notShown('Deactivate customer');
  await user().press(tab('Overview'));
  expect(screen.queryByTestId('customer-pricing-tab')).not.toBeOnTheScreen();
  shownText('Rajkot');
  shownText('Deactivate customer');
});

it('tab=pricing opens on the Pricing tab', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing' });
  expect(tab('Pricing').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getAllByTestId('customer-pricing-tab').length).toBeGreaterThan(0);
  notShown('Rajkot');
  expect(router.push).not.toHaveBeenCalled();
});

it('item=onion also opens the onion box once, and not again after leaving the tab and coming back', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing', item: 'onion' });
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/item-rates/[itemId]/customer/[customerId]',
    params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
  });
  await user().press(tab('Overview'));
  await user().press(tab('Pricing'));
  expect(router.push).toHaveBeenCalledTimes(1);
});

it('Edit stays in the nav bar on both tabs', async () => {
  await open('admin', { id: 'orchard-b', tab: 'pricing' });
  await user().press(screen.getByRole('button', { name: 'Edit' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/customer-edit/[id]', params: { id: 'orchard-b' } });
});

describe.each(['staff', 'customer'])('%s (who cannot open Item pricing)', role => {
  it('sees the Overview alone, with no tab bar, even when the link asks for Pricing; the item link opens nothing', async () => {
    await open(role, { id: 'orchard-b', tab: 'pricing', item: 'onion' });
    expect(tablists()).toBe(0);
    shownText('Rajkot');
    expect(screen.queryByTestId('customer-pricing-tab')).not.toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
    expect(useItemRates).not.toHaveBeenCalled();
  });
});
