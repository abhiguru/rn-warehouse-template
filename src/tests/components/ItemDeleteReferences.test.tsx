/** G-30: 'Can't delete this item' lists where the item is used, under the names the server sends. */
import React from 'react';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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
  await act(async () => { tree = create(<ItemsScreen />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  // Not in use when counted; the delete itself is refused (a GRN saved in between) in the tests below.
  jest.mocked(itemService.getItemUsage).mockResolvedValue({
    success: true, message: '', data: { item_id: 'i2', name: 'Garlic', active: true, in_use: false, grn_lines: 0, order_lines: 0, grn_rates: 0, price_rows: 0, rate_count: 0 },
  } as never);
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

describe('delete an item that is in use', () => {
  it('says where it is used before asking, without a delete question, and offers to deactivate', async () => {
    await renderItems();
    jest.mocked(itemService.getItemUsage).mockResolvedValue({
      success: true, message: '', data: { item_id: 'i2', name: 'Garlic', active: true, in_use: true, grn_lines: 12, order_lines: 3, grn_rates: 0, price_rows: 0, rate_count: 0 },
    } as never);
    await act(async () => { rowFor('Garlic').props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    const { title, message, buttons } = lastAlert();
    expect(title).toBe("Can't delete Garlic");
    expect(message).toContain('• 12 GRN lines');
    expect(message).toContain('• 3 order lines');
    expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Deactivate item']);
    expect(itemService.deleteItem).not.toHaveBeenCalled();
  });

  it('lists the GRN lines and order lines and offers to deactivate', async () => {
    await renderItems();
    jest.mocked(itemService.deleteItem).mockResolvedValue({
      success: false,
      message: 'Cannot delete item "Garlic": It is referenced in existing records',
      references: { grn_items_count: 12, order_items_count: 3, pricing_count: 1 },
    } as never);
    jest.mocked(itemService.toggleItemActive).mockResolvedValue({ success: true, message: '' } as never);

    await act(async () => { rowFor('Garlic').props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Delete item')!.onPress!(); });

    const { title, message, buttons } = lastAlert();
    expect(title).toBe("Can't delete Garlic");
    expect(message).toContain('• 12 GRN lines');
    expect(message).toContain('• 3 order lines');
    expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Deactivate item']);

    // "Deactivate item" deactivates as the swipe does.
    await act(async () => { buttons[1].onPress!(); });
    expect(itemService.toggleItemActive).toHaveBeenCalledWith('i2', false);
  });

  it('says "1 GRN line" for one', async () => {
    await renderItems();
    jest.mocked(itemService.deleteItem).mockResolvedValue({
      success: false, message: 'x', references: { grn_items_count: 1, order_items_count: 0, pricing_count: 0 },
    } as never);
    await act(async () => { rowFor('Garlic').props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Delete item')!.onPress!(); });
    expect(lastAlert().message).toContain('• 1 GRN line\n');
    expect(lastAlert().message).not.toContain('order line');
  });
});
