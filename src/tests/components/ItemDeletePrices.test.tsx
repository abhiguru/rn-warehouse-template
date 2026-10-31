/** G-31 and G-26: deleting an item says its prices go too; a delete ends in a toast. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'staff', name: 'Dev Staff' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: {
    getItemList: jest.fn(),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    getItemUsage: jest.fn(),
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
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
  await act(async () => { tree = create(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>); });
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

const askDelete = async (name: string) => {
  await act(async () => { rowFor(name).props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
};
/** What get_item_usage answers for Garlic: not in use, with this many rates (the server counts them as the pricing screens do). */
const usage = (rateCount: number) => jest.mocked(itemService.getItemUsage).mockResolvedValue({
  success: true, message: '',
  data: { item_id: 'i2', name: 'Garlic', active: true, in_use: false, grn_lines: 0, order_lines: 0, grn_rates: 0, price_rows: 7, rate_count: rateCount },
} as never);

describe('delete question', () => {
  it('counts rates as the server says, not rows: 7 price rows of 3 rates say "3 rates"', async () => {
    await renderItems();
    usage(3);
    await askDelete('Garlic');
    expect(itemService.getItemUsage).toHaveBeenCalledWith('i2');
    expect(lastAlert().title).toBe('Delete Garlic?');
    expect(lastAlert().message).toBe("Its 3 rates are deleted too. This can't be undone.");
  });

  it('says "rate" for one', async () => {
    await renderItems();
    usage(1);
    await askDelete('Garlic');
    expect(lastAlert().message).toBe("Its 1 rate is deleted too. This can't be undone.");
  });

  it('keeps the plain question when the item has no rates', async () => {
    await renderItems();
    usage(0);
    await askDelete('Garlic');
    expect(lastAlert().message).toBe('The item will be removed from your catalogue.');
  });

  it('still warns when the server cannot count them (an older server)', async () => {
    await renderItems();
    jest.mocked(itemService.getItemUsage).mockResolvedValue({ success: false, message: 'x', code: 'SERVER_NEEDS_UPDATE' } as never);
    await askDelete('Garlic');
    expect(lastAlert().message).toBe("Any rates it has are deleted too. This can't be undone.");
  });

  it('asks nothing when the lookup fails; it says so', async () => {
    await renderItems();
    jest.mocked(itemService.getItemUsage).mockRejectedValue(new Error('offline'));
    await askDelete('Garlic');
    expect(lastAlert().title).toBe("Couldn't delete the item");
    expect(lastAlert().message).toBe('Check your connection and try again.');
    expect(itemService.deleteItem).not.toHaveBeenCalled();
  });
});

describe('after a delete', () => {
  it('removes the row and shows a toast, not a dialog that needs OK', async () => {
    await renderItems();
    usage(0);
    jest.mocked(itemService.deleteItem).mockResolvedValue({ success: true, message: 'ok' } as never);
    await askDelete('Garlic');
    const asked = jest.mocked(showAlert).mock.calls.length;
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Delete item')!.onPress!(); });
    expect(showToast).toHaveBeenCalledWith('Garlic deleted.');
    expect(jest.mocked(showAlert).mock.calls.length).toBe(asked);
    expect(shownText()).not.toContain('Garlic');
  });
});
