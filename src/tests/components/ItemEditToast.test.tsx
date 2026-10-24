/** G-26: saving an item ends in a toast and a screen change, not an alert that needs OK; Save with no change just goes back. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

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

const GARLIC = { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: GARLIC } as never);
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.updateItem).mockResolvedValue({ success: true, message: 'ok' } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok' } as never);
});
const renderEdit = async () => { await act(async () => { tree = create(<ItemEditScreen />); }); };
const renderAdd = async () => { await act(async () => { tree = create(<ItemFormScreen />); }); };
const typeInto = async (label: string, text: string) => {
  const field = tree!.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
};

describe('Edit item save', () => {
  it('shows a toast and goes back after a change', async () => {
    await renderEdit();
    await typeInto('Description', 'Test');
    await press('Save item');
    expect(itemService.updateItem).toHaveBeenCalledWith(expect.objectContaining({ p_item_id: 'i2', p_description: 'Test' }));
    expect(showToast).toHaveBeenCalledWith('Garlic saved.');
    expect(router.back).toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('with nothing changed goes back without saving, a message or a dialog', async () => {
    await renderEdit();
    await press('Save item');
    expect(itemService.updateItem).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('Add item save', () => {
  it('shows an "added" toast and goes back', async () => {
    await renderAdd();
    await typeInto('Item name, required', 'Onions');
    await press('Add item');
    expect(itemService.createItem).toHaveBeenCalledWith(expect.objectContaining({ p_name: 'Onions' }));
    expect(showToast).toHaveBeenCalledWith('Onions added.');
    expect(router.back).toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });
});
