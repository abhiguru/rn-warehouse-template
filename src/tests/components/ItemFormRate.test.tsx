/**
 * Add item: the Rate choice. The new item gets the standard rate (with a summary of its tiers) or
 * the rates of another item; the choice is sent as p_rate_from_item and the toast names the rate it got.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemFormScreen from '../../../app/item-form';
import { itemService } from '@/services/item-service';
import { showToast } from '@/utils/toast';
import { useItemRates } from '@/features/item-pricing/useItemRates';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';
import { F1, ITEMS, row } from '@/tests/helpers/ratesFixtures';

let mockGuard: { hasChanges: boolean } = { hasChanges: false };
let sheetProps: Record<string, any> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({ itemService: { createItem: jest.fn() } }));
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
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRates: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: jest.fn() }));

const tier = (min: number, max: number, rent: number) => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: 1, tax_percent: 5 });
const standard = (tiers: ReturnType<typeof tier>[], status: 'ready' | 'loading' | 'error' = 'ready') =>
  jest.mocked(useStandardRate).mockReturnValue({ rate: status === 'ready' ? { tiers, updatedAt: null, updatedByName: null } : null, status, refresh: jest.fn(), key: 'k' });

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const radio = (label: string) => tree.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const button = (id: string) => tree.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function');
const nameField = () => tree.root.find(n => n.props.accessibilityLabel === 'Item name, required' && typeof n.props.onChangeText === 'function');
const addItem = async () => { await act(async () => { tree.root.find(n => typeof n.props.onPress === 'function' && n.props.children === 'Add item').props.onPress(); }); };

async function open() {
  await act(async () => { tree = create(<ItemFormScreen />); });
  await act(async () => { nameField().props.onChangeText('Fictional Gur Box'); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = { hasChanges: false };
  sheetProps = {};
  standard([tier(0, 10, 3), tier(11, 20, 4)]);
  jest.mocked(useItemRates).mockReturnValue({
    items: ITEMS, rates: F1, status: 'ready', refreshing: false, lastUpdated: 1, refreshError: false, error: null, refresh: jest.fn(), itemRates: () => undefined,
  } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'Fictional Gur Box', active: true, rate_source: 'standard' } } as never);
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe('Add item: Rate', () => {
  it('starts on Standard rate and summarises its tiers', async () => {
    await open();
    expect(radio('Standard rate').props.accessibilityState.selected).toBe(true);
    expect(radio('Same as another item').props.accessibilityState.selected).toBe(false);
    expect(texts()).toContain('0–10 kg ₹3.00 · 11–20 kg ₹4.00');
  });

  it('says where to set it when there is no standard rate yet', async () => {
    standard([]);
    await open();
    expect(texts()).toContain('No standard rate yet. Set it in Tools and settings → Standard rate.');
  });

  it('says nothing about the tiers while they load or when they could not be read', async () => {
    standard([], 'loading');
    await open();
    expect(tree.root.findAll(n => n.props.testID === 'rate-standard-summary')).toHaveLength(0);
    expect(texts().join(' ')).not.toContain('No standard rate yet');
  });

  it('saves with the standard rate: no p_rate_from_item, and the toast says so', async () => {
    await open();
    await addItem();
    const sent = jest.mocked(itemService.createItem).mock.calls[0][0];
    expect(sent.p_name).toBe('Fictional Gur Box');
    expect('p_rate_from_item' in sent).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Fictional Gur Box added with the standard rate.');
    expect(router.back).toHaveBeenCalled();
  });

  it('Same as another item shows a row, and saving without an item is refused', async () => {
    await open();
    await act(async () => { radio('Same as another item').props.onPress(); });
    expect(texts()).toContain('Choose an item');
    await addItem();
    expect(itemService.createItem).not.toHaveBeenCalled();
    expect(texts()).toContain('Choose the item whose rates this item gets.');
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
    await act(async () => { radio('Same as another item').props.onPress(); });
    await act(async () => { button('rate-source-row').props.onPress(); });
    expect(sheetProps.isVisible).toBe(true);
    let offered: { id: string }[] = [];
    await act(async () => { offered = await sheetProps.searchFn(''); });
    expect(offered.map(i => i.id)).toEqual(['ajwain-bold', 'cumin', 'garlic', 'onion']);
    jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok', data: { id: 'new', name: 'Fictional Gur Box', active: true, rate_source: 'copied' } } as never);
    await act(async () => { sheetProps.onSelect(ITEMS.find(i => i.id === 'garlic')); });
    expect(texts()).toContain('Review Garlic Desi');
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
    await act(async () => { tree = create(<ItemFormScreen />); });
    expect(mockGuard.hasChanges).toBe(false);
    await act(async () => { radio('Same as another item').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(true);
    await act(async () => { radio('Standard rate').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('is in Gujarati too', async () => {
    const { setLanguage } = jest.requireActual('@/i18n');
    setLanguage('gu');
    try {
      await act(async () => { tree = create(<ItemFormScreen />); });
      expect(tree.root.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'પ્રમાણભૂત દર')).toBeDefined();
      expect(texts()).toContain('૦–૧૦ કિલો ₹૩.૦૦ · ૧૧–૨૦ કિલો ₹૪.૦૦');
    } finally {
      setLanguage('en');
    }
  });
});
