/**
 * The Pricing tab of a deactivated item: its periods are shown read only (no buttons) under the strip
 * "This item is deactivated. Activate it to change its rates." An active item shows the buttons and no strip.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ItemPricingTab } from '@/features/item-pricing/components/ItemPricingTab';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { onionRows } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null }) }));
jest.mock('@/features/item-pricing/useRateActions', () => ({ useRateActions: () => ({ busy: false, dialog: null }) }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));

let tree: ReactTestRenderer | undefined;
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);
const base = { refreshing: false, refreshError: false, lastUpdated: 1, refresh: jest.fn().mockResolvedValue(undefined) };
const text = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join(' | ');
const byId = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');

it('a deactivated item (not among the active items) shows its periods without buttons, under the strip', async () => {
  jest.mocked(useItemRatesFor).mockReturnValue({ ...base, itemRates: undefined, ownRows: DEFAULT_ONLY, status: 'ready', notFound: true });
  await act(async () => { tree = create(<ItemPricingTab itemId="onion" itemName="Review Onion Red" active={false} />); });
  expect(text()).toContain('This item is deactivated. Activate it to change its rates.');
  expect(text()).not.toContain('This item is no longer active.');
  expect(tree!.root.findAll(n => n.props.testID === 'item-pricing-not-found')).toHaveLength(0);
  expect(byId('period-add')).toHaveLength(0);
  expect(byId('period-stop')).toHaveLength(0);
  expect(byId('period-correct')).toHaveLength(0);
  // The periods are there: the monthly section header counts them.
  expect(tree!.root.findAll(n => n.props.testID === 'item-pricing-header').length).toBeGreaterThan(0);
});

it('an active item has the buttons and no strip', async () => {
  jest.mocked(useItemRatesFor).mockReturnValue({
    ...base,
    itemRates: { item: { id: 'onion', name: 'Review Onion Red' } as never, rows: DEFAULT_ONLY },
    ownRows: DEFAULT_ONLY,
    status: 'ready',
    notFound: false,
  });
  await act(async () => { tree = create(<ItemPricingTab itemId="onion" itemName="Review Onion Red" active />); });
  expect(text()).not.toContain('This item is deactivated');
  expect(byId('period-add').length).toBeGreaterThan(0);
});
