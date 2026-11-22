/** G-26: saving an item ends in a toast and a screen change, not an alert that needs OK; Save with no change just goes back. */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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

const user = userEvent.setup({ delay: 0 });
const press = async (label: string) => { await user.press(screen.getByRole('button', { name: label })); };

const GARLIC = { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: GARLIC } as never);
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.updateItem).mockResolvedValue({ success: true, message: 'ok' } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok' } as never);
});
const renderEdit = async () => { await render(<ItemEditScreen />); await screen.findByDisplayValue('Garlic'); };
const renderAdd = async () => { await render(<ItemFormScreen />); };
const typeInto = async (label: string, text: string) => {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, text);
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

  const saveButton = () => screen.getByRole('button', { name: 'Save item' });

  it('with nothing changed has Save switched off (WH-218): nothing is saved, no message, no dialog, no leaving', async () => {
    await renderEdit();
    expect(saveButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(saveButton()).toBeDisabled();
    expect(itemService.updateItem).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('switches Save on once a field changes', async () => {
    await renderEdit();
    await typeInto('Item name, required', 'Garlic bulbs');
    expect(saveButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });
});

describe('Add item save', () => {
  it('shows an "added" toast and goes back', async () => {
    await renderAdd();
    await typeInto('Item name, required', 'Onions');
    await typeInto('Packaging, required', 'Katta');
    await press('Add item');
    expect(itemService.createItem).toHaveBeenCalledWith(expect.objectContaining({ p_name: 'Onions', p_packaging: 'Katta' }));
    expect(showToast).toHaveBeenCalledWith('Onions added.');
    expect(router.back).toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('does not add an item without its own packaging word (WH-41): nothing is sent', async () => {
    await renderAdd();
    await typeInto('Item name, required', 'Onions');
    await typeInto('Packaging, required', '   ');
    await press('Add item');
    expect(itemService.createItem).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});
