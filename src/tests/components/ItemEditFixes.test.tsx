/** Code-review fixes CR-27, CR-31 and CR-64 for Edit item and Add item. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ id: 'i2' }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: { getItemList: jest.fn(), getItemById: jest.fn(), updateItem: jest.fn(), createItem: jest.fn(), deleteItem: jest.fn(), toggleItemActive: jest.fn(), getItemUsage: jest.fn() },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
let mockGuard: { hasChanges: boolean } | undefined;
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = undefined;
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

describe('CR-27: an item stored with outer spaces is not "changed" by opening it', () => {
  it('does not ask to discard when nothing was typed', async () => {
    jest.mocked(itemService.getItemById).mockResolvedValue({
      success: true, message: '', data: { id: 'i2', name: 'Garlic ', packaging: 'Bag ', description: ' Peeled', active: true },
    } as never);
    await act(async () => { tree = create(<ItemEditScreen />); });
    expect(mockGuard?.hasChanges).toBe(false);
  });
});

describe('CR-31: deactivating from the refused delete says so', () => {
  it('shows "Garlic deactivated." after Deactivate item (Delete is on the Items list and the item page now, not Edit item)', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValue({
      success: true, message: '', data: [{ id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true }], pagination: { total_count: 1 },
    } as never);
    // The server counts the item as in use: the delete is refused up front, with the offer to deactivate.
    jest.mocked(itemService.getItemUsage).mockResolvedValue({
      success: true, message: '',
      data: { item_id: 'i2', name: 'Garlic', active: true, in_use: true, grn_lines: 2, order_lines: 0, grn_rates: 0, price_rows: 0, rate_count: 0 },
    } as never);
    jest.mocked(itemService.toggleItemActive).mockResolvedValue({ success: true, message: '' } as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    const row = tree!.root.find(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Garlic') && n.props.accessibilityActions);
    await act(async () => { row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Deactivate item')!.onPress!(); });
    expect(itemService.toggleItemActive).toHaveBeenCalledWith('i2', false);
    expect(showToast).toHaveBeenCalledWith('Garlic deactivated.');
  });
});

describe('CR-64: the header is symmetric', () => {
  const sides = () => {
    const header = tree!.root.findAll(node => node.props.testID === 'item-header' && typeof node.type === 'string')[0];
    const kids = header.children.filter(child => typeof child !== 'string') as { props: { style?: unknown } }[];
    return kids.map(kid => (StyleSheet.flatten(kid.props.style as never) ?? {}) as Record<string, unknown>);
  };
  it.each([
    ['Edit item', () => <ItemEditScreen />],
    ['Add item', () => <ItemFormScreen />],
  ])('%s: both sides share the width equally and the title may shrink', async (_name, element) => {
    jest.mocked(itemService.getItemById).mockResolvedValue({
      success: true, message: '', data: { id: 'i2', name: 'Garlic', packaging: '', description: '', active: true },
    } as never);
    await act(async () => { tree = create(element()); });
    const [left, title, right] = sides();
    expect(left).toMatchObject({ flex: 1 });
    expect(right).toMatchObject({ flex: 1 });
    expect(left.width).toBeUndefined();
    expect(title.flexShrink).toBe(1);
    expect(title.flex).toBeUndefined();
  });
});
