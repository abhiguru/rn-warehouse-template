/** The GRN item row can give the Item search field the cursor, as it does Quantity, Weight, Rack and Mark (D7). */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { HorizontalItemForm, type HorizontalItemFormRef, type ItemFormData } from '../HorizontalItemForm';

const mockFocus = jest.fn();
const mockBlur = jest.fn();
let mockFocused = false;
// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/components/RemoteAutocompleteInput', () => {
  const React = require('react');
  return {
    RemoteAutocompleteInput: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ focus: mockFocus, blur: mockBlur, isFocused: () => mockFocused }));
      return null;
    }),
  };
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const EMPTY: ItemFormData = { grn_trl_id: 'line-1', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '', package_mark: '', trl_images: [], errors: { item_table_id: 'Choose an item' } };

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockFocused = false; });
afterEach(() => jest.useRealTimers());

const mount = async () => {
  const ref = React.createRef<HorizontalItemFormRef>();
  await render(<HorizontalItemForm ref={ref} currentItem={EMPTY} onFieldChange={jest.fn()} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing editingItemNumber={1} savedItemsCount={1} />);
  return ref;
};

it('focusField("item") gives the Item field the cursor after the dialog has gone', async () => {
  const ref = await mount();
  await act(() => ref.current!.focusField('item'));
  await act(() => { jest.advanceTimersByTime(249); });
  expect(mockFocus).not.toHaveBeenCalled();
  await act(() => { jest.advanceTimersByTime(1); });
  expect(mockFocus).toHaveBeenCalledTimes(1);
});

it('a field that still has the cursor lets go of it first', async () => {
  mockFocused = true;
  const ref = await mount();
  await act(() => ref.current!.focusField('item'));
  expect(mockBlur).toHaveBeenCalledTimes(1);
  await act(() => { jest.advanceTimersByTime(250); });
  expect(mockFocus).toHaveBeenCalledTimes(1);
});
