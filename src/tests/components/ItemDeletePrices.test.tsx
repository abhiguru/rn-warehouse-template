/** G-31 and G-26: deleting an item says its prices go too; a delete ends in a toast. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: {
    getItemList: jest.fn(),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const flat = (children: unknown) => [children].flat().join('');
const shownText = () => tree!.root.findAllByType(Text).map(node => flat(node.props.children)).join(' | ');
/** The first element with this accessibility label that can be pressed. */
const byLabel = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => { await act(async () => { byLabel(label).props.onPress(); }); };
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};
const rowFor = (name: string) => tree!.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(name) && node.props.accessibilityActions);

const ITEMS = [
  { id: 'i1', name: 'Dry Red Chillies', packaging: 'Bag', description: '', active: true },
  { id: 'i2', name: 'Garlic', packaging: 'Box', description: 'Peeled', active: true },
  { id: 'i3', name: 'Review Item 03', packaging: '', description: '', active: true },
];
const listOf = (data: unknown[], total = data.length) => ({ success: true, message: '', data, pagination: { total_count: total } });
const renderItems = async () => {
  jest.mocked(itemService.getItemList).mockResolvedValue(listOf(ITEMS, 91) as never);
  await act(async () => { tree = create(<ItemsScreen />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

const askDelete = async (name: string) => {
  await act(async () => { rowFor(name).props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
};
const row = (customer: string | null, type: string, from: string, band: number) =>
  ({ id: `${customer}-${type}-${from}-${band}`, item_id: 'i2', customer_id: customer, price_type: type, effective_from: from, weight_min: band, weight_max: band + 10 });
const rows = (data: unknown[]) => jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data, pagination: { total_count: data.length, limit: 200, offset: 0, has_more: false } } as never);
/** n separate rates: one single-band default rate per start date. */
const rates = (n: number) => rows(Array.from({ length: n }, (_, i) => row(null, 'one_time', `2026-0${i + 1}-01`, 0)));

describe('delete question', () => {
  it('counts rates, not band rows: 7 rows of 3 rates say "3 rates"', async () => {
    await renderItems();
    rows([
      // A 3-band default rate, a 3-band old rate and a 1-band customer rate: 7 rows.
      row(null, 'one_time', '2026-05-01', 0), row(null, 'one_time', '2026-05-01', 10), row(null, 'one_time', '2026-05-01', 20),
      row(null, 'one_time', '2026-01-01', 0), row(null, 'one_time', '2026-01-01', 10), row(null, 'one_time', '2026-01-01', 20),
      row('c1', 'one_time', '2026-03-01', 0),
    ]);
    await askDelete('Garlic');
    expect(getItemStoragePrices).toHaveBeenCalledWith({ p_filters: { item_ids: ['i2'], include_expired: true }, p_limit: 200, p_offset: 0 });
    expect(lastAlert().title).toBe('Delete Garlic?');
    expect(lastAlert().message).toBe("Its 3 rates are deleted too. This can't be undone.");
  });

  it('says "rate" for one', async () => {
    await renderItems();
    rates(1);
    await askDelete('Garlic');
    expect(lastAlert().message).toBe("Its 1 rate is deleted too. This can't be undone.");
  });

  it('keeps the plain question when the item has no rates', async () => {
    await renderItems();
    rates(0);
    await askDelete('Garlic');
    expect(lastAlert().message).toBe('The item will be removed from your catalogue.');
  });

  it('still warns when the lookup fails', async () => {
    await renderItems();
    jest.mocked(getItemStoragePrices).mockRejectedValue(new Error('offline'));
    await askDelete('Garlic');
    expect(lastAlert().message).toBe("Any rates it has are deleted too. This can't be undone.");
  });
});

describe('after a delete', () => {
  it('removes the row and shows a toast, not a dialog that needs OK', async () => {
    await renderItems();
    rates(0);
    jest.mocked(itemService.deleteItem).mockResolvedValue({ success: true, message: 'ok' } as never);
    await askDelete('Garlic');
    const asked = jest.mocked(showAlert).mock.calls.length;
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Delete item')!.onPress!(); });
    expect(showToast).toHaveBeenCalledWith('Garlic deleted.');
    expect(jest.mocked(showAlert).mock.calls.length).toBe(asked);
    expect(shownText()).not.toContain('Garlic');
  });
});
