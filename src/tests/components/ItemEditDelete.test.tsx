/** G-57: Edit item has a Delete item button that asks through the same flow as the Items swipe. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';
import ItemsScreen from '../../../app/items';
import { deleteItemFlow } from '@/features/items/deleteItemFlow';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ id: 'i2' }),
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
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));


const flat = (children: unknown) => [children].flat().join('');
// A check that something is NOT on the screen must also see a mounted-but-hidden Text.
const shownText = (hidden = false) => screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map(node => flat(node.props.children)).join(" | ");
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};
const rowFor = (name: string) => {
  const rows = screen.queryAllByLabelText(new RegExp(`^${name}`)).filter(node => node.props.accessibilityActions);
  if (rows.length !== 1) throw new Error(`expected one row for ${name}, found ${rows.length}`);
  return rows[0];
};
const askDeleteOf = (name: string) => fireEvent(rowFor(name), "accessibilityAction", { nativeEvent: { actionName: "delete" } });

jest.mock('@/features/items/deleteItemFlow', () => {
  const actual = jest.requireActual('@/features/items/deleteItemFlow');
  return { deleteItemFlow: jest.fn((...args: Parameters<typeof actual.deleteItemFlow>) => actual.deleteItemFlow(...args)) };
});

const GARLIC = { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: GARLIC } as never);
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.updateItem).mockResolvedValue({ success: true, message: 'ok' } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok' } as never);
});
const renderEdit = async () => { await render(<ItemEditScreen />); };
const renderAdd = async () => { await render(<ItemFormScreen />); };
const typeInto = async (label: string, text: string) => {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
};

beforeEach(() => {
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: { ...GARLIC, id: 'i2', name: 'Review Item 03' } } as never);
  jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 1, offset: 0, has_more: false } } as never);
});

describe('Delete item', () => {
  it('is not on Edit item any more: deleting is on the item page and in the Items list', async () => {
    await renderEdit();
    expect(screen.queryByLabelText('Delete item', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(deleteItemFlow).not.toHaveBeenCalled();
  });

  it('is the same flow the Items swipe uses', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [{ ...GARLIC, id: 'i2', name: 'Review Item 03' }], pagination: { total_count: 1 } } as never);
    await render(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>);
    await askDeleteOf('Review Item 03');
    expect(deleteItemFlow).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2', name: 'Review Item 03' }), expect.any(Object));
  });
});
