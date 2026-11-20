/**
 * The Pricing tab of a deactivated item: its periods are shown read only (no buttons) under the strip
 * "This item is deactivated. Activate it to change its rates." An active item shows the buttons and no strip.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);
const base = { refreshing: false, refreshError: false, lastUpdated: 1, refresh: jest.fn().mockResolvedValue(undefined) };

it('a deactivated item (not among the active items) shows its periods without buttons, under the strip', async () => {
  jest.mocked(useItemRatesFor).mockReturnValue({ ...base, itemRates: undefined, ownRows: DEFAULT_ONLY, status: 'ready', notFound: true });
  await render(<ItemPricingTab itemId="onion" itemName="Review Onion Red" active={false} />);
  // WH-216: the strip is under the item page header, on every tab, not in this tab.
  expect(screen.queryByText(/This item is deactivated\. Activate it to change its rates\./)).not.toBeOnTheScreen();
  expect(screen.queryByText(/This item is no longer active\./)).not.toBeOnTheScreen();
  expect(screen.queryByTestId('item-pricing-not-found')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('period-add')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('period-stop')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('period-correct')).not.toBeOnTheScreen();
  // The periods are there: the monthly section header counts them.
  expect(screen.getAllByTestId('item-pricing-header')[0]).toBeOnTheScreen();
});

it('an active item has the buttons and no strip', async () => {
  jest.mocked(useItemRatesFor).mockReturnValue({
    ...base,
    itemRates: { item: { id: 'onion', name: 'Review Onion Red' } as never, rows: DEFAULT_ONLY },
    ownRows: DEFAULT_ONLY,
    status: 'ready',
    notFound: false,
  });
  await render(<ItemPricingTab itemId="onion" itemName="Review Onion Red" active />);
  expect(screen.queryByText(/This item is deactivated/)).not.toBeOnTheScreen();
  expect(screen.getAllByTestId('period-add')[0]).toBeOnTheScreen();
  expect(screen.getAllByTestId('period-add')[0]).toBeEnabled();
});
