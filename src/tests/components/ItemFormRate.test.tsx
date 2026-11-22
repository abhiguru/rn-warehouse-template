/**
 * Add item: the Rate choice. The new item gets the standard rate (with a summary of its tiers) or
 * the rates of another item; the choice is sent as p_rate_from_item and the toast names the rate it got.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import ItemFormScreen from '../../../app/item-form';
import { itemService } from '@/services/item-service';
import { showToast } from '@/utils/toast';
import { markItemRatesStale, useItemRates } from '@/features/item-pricing/useItemRates';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { F1, ITEMS, row } from '@/tests/helpers/ratesFixtures';

let mockGuard: { hasChanges: boolean } = { hasChanges: false };
let sheetProps: Record<string, any> = {};
let mockOffline = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({ itemService: { createItem: jest.fn() } }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/features/items/packagingSuggestions', () => ({
  ...jest.requireActual('@/features/items/packagingSuggestions'),
  usePackagingWords: () => ({ groups: [], suggestions: [] }),
}));
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn(), markItemRatesStale: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: jest.fn() }));

const tier = (min: number, max: number, rent: number) => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: 1, tax_percent: 5 });
const standard = (tiers: ReturnType<typeof tier>[], status: 'ready' | 'loading' | 'error' = 'ready') =>
  jest.mocked(useStandardRate).mockReturnValue({ rate: status === 'ready' ? { tiers, updatedAt: null, updatedByName: null } : null, status, refresh: jest.fn(), key: 'k', serverNeedsUpdate: false });

let user: ReturnType<typeof userEvent.setup>;
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const radio = (label: string) => screen.getByRole('radio', { name: label });
const button = (id: string) => screen.getByTestId(id);
const shown = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const addItem = async () => { await user.press(screen.getByRole('button', { name: 'Add item' })); };

async function open() {
  await render(<ItemFormScreen />);
  await user.type(screen.getByLabelText('Item name, required'), 'Fictional Gur Box');
  // The item's own packaging word is required (WH-41).
  await user.type(screen.getByLabelText('Packaging, required'), 'Bag');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = { hasChanges: false };
  sheetProps = {};
  mockOffline = false;
  standard([tier(0, 10, 3), tier(11, 20, 4)]);
  jest.mocked(useItemRates).mockReturnValue({
    items: ITEMS, rates: F1, status: 'ready', refreshing: false, lastUpdated: 1, refreshError: false, error: null, refresh: jest.fn(), itemRates: () => undefined,
  } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'Fictional Gur Box', active: true, rate_source: 'standard' } } as never);
  jest.useFakeTimers();
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Add item: Rate', () => {
  it('starts on Standard rate and summarises its tiers', async () => {
    await open();
    expect(radio('Standard rate')).toBeSelected();
    expect(radio('Standard rate').props.accessibilityState.selected).toBe(true);
    expect(radio('Same as another item').props.accessibilityState.selected).toBe(false);
    shown('0–10 kg ₹3.00 · 11–20 kg ₹4.00');
  });

  it('says where to set it when there is no standard rate yet', async () => {
    standard([]);
    await open();
    shown('No standard rate yet. Set it in Tools and settings → Standard rate.');
  });

  it('says nothing about the tiers while they load or when they could not be read', async () => {
    standard([], 'loading');
    await open();
    expect(screen.queryByTestId('rate-standard-summary', hidden)).not.toBeOnTheScreen();
    expect(screen.queryByText(/No standard rate yet/, hidden)).not.toBeOnTheScreen();
  });

  it('saves with the standard rate: no p_rate_from_item, and the toast says so', async () => {
    await open();
    await addItem();
    const sent = jest.mocked(itemService.createItem).mock.calls[0][0];
    expect(sent.p_name).toBe('Fictional Gur Box');
    expect('p_rate_from_item' in sent).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Fictional Gur Box added with the standard rate.');
    // The Items list and Pricing tabs read the rates again: the new item got one.
    expect(markItemRatesStale).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalled();
  });

  it('Same as another item shows a row, and saving without an item is refused', async () => {
    await open();
    await user.press(radio('Same as another item'));
    shown('Choose an item');
    await addItem();
    expect(itemService.createItem).not.toHaveBeenCalled();
    shown('Choose the item whose rates this item gets.');
  });

  it('offers only the items that have a default rate in force today, and sends the one chosen', async () => {
    // Cumin has a rate in force; onion-small has none; ajwain-a only starts next year; potato's ended.
    const rates = [
      ...F1.filter(r => !['ajwain-a', 'potato'].includes(r.item_id)),
      row({ item_id: 'ajwain-a', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2027-01-01' }),
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 4, effective_from: '2025-01-01', effective_to: '2026-06-30' }),
    ];
    jest.mocked(useItemRates).mockReturnValue({ items: ITEMS, rates, status: 'ready', refreshing: false, lastUpdated: 1, refreshError: false, error: null, refresh: jest.fn(), itemRates: () => undefined } as never);
    await open();
    await user.press(radio('Same as another item'));
    await user.press(button('rate-source-row'));
    expect(sheetProps.isVisible).toBe(true);
    let offered: { id: string }[] = [];
    await act(async () => { offered = await sheetProps.searchFn(''); });
    expect(offered.map(i => i.id)).toEqual(['ajwain-bold', 'cumin', 'garlic', 'onion']);
    jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'Fictional Gur Box', active: true, rate_source: 'copied' } } as never);
    await act(async () => { sheetProps.onSelect(ITEMS.find(i => i.id === 'garlic')); });
    shown('Review Garlic Desi');
    await addItem();
    expect(jest.mocked(itemService.createItem).mock.calls[0][0].p_rate_from_item).toBe('garlic');
    expect(showToast).toHaveBeenCalledWith('Fictional Gur Box added with the rates of Review Garlic Desi.');
  });

  it('says the item was added without a rate, or just added when the server does not say', async () => {
    await open();
    jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'x', active: true, rate_source: 'none' } } as never);
    await addItem();
    expect(showToast).toHaveBeenLastCalledWith('Fictional Gur Box added without a rate.');
    jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'x', active: true } } as never);
    await addItem();
    expect(showToast).toHaveBeenLastCalledWith('Fictional Gur Box added.');
  });

  it('counts for the leave guard: Same as another item asks, going back to Standard rate does not (name aside)', async () => {
    await render(<ItemFormScreen />);
    expect(mockGuard.hasChanges).toBe(false);
    await user.press(radio('Same as another item'));
    expect(mockGuard.hasChanges).toBe(true);
    await user.press(radio('Standard rate'));
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('is in Gujarati too', async () => {
    const { setLanguage } = jest.requireActual('@/i18n');
    setLanguage('gu');
    try {
      await render(<ItemFormScreen />);
      expect(screen.getByRole('radio', { name: 'પ્રમાણભૂત દર' })).toBeOnTheScreen();
      shown('૦–૧૦ કિલો ₹૩.૦૦ · ૧૧–૨૦ કિલો ₹૪.૦૦');
    } finally {
      setLanguage('en');
    }
  });

  // Review A7
  it('says the items could not be loaded, with Try again, instead of "Loading items…" for ever', async () => {
    const refresh = jest.fn();
    jest.mocked(useItemRates).mockReturnValue({ items: [], rates: [], status: 'error', refreshing: false, lastUpdated: null, refreshError: true, error: new Error('x'), refresh, itemRates: () => undefined } as never);
    await open();
    await user.press(radio('Same as another item'));
    await user.press(button('rate-source-row'));
    expect(sheetProps.emptySearchText).toBe("Couldn't load the items.");
    expect(sheetProps.emptyAction.label).toBe('Try again');
    sheetProps.emptyAction.onPress();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('offline with nothing loaded, the item row is disabled; with the items loaded it still opens', async () => {
    mockOffline = true;
    jest.mocked(useItemRates).mockReturnValue({ items: [], rates: [], status: 'loading', refreshing: false, lastUpdated: null, refreshError: false, error: null, refresh: jest.fn(), itemRates: () => undefined } as never);
    await open();
    await user.press(radio('Same as another item'));
    expect(button('rate-source-row')).toBeDisabled();
    expect(button('rate-source-row').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    jest.mocked(useItemRates).mockReturnValue({ items: ITEMS, rates: F1, status: 'ready', refreshing: false, lastUpdated: 1, refreshError: false, error: null, refresh: jest.fn(), itemRates: () => undefined } as never);
    await screen.rerender(<ItemFormScreen />);
    expect(button('rate-source-row')).toBeEnabled();
    expect(button('rate-source-row').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });
});
