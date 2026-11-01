/** The GRN item row can give the Item search field the cursor, as it does Quantity, Weight, Rack and Mark (D7). */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { HorizontalItemForm, type HorizontalItemFormRef, type ItemFormData } from '../HorizontalItemForm';

const mockFocus = jest.fn();
const mockBlur = jest.fn();
let mockFocused = false;
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

const mount = () => {
  const ref = React.createRef<HorizontalItemFormRef>();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<HorizontalItemForm ref={ref} currentItem={EMPTY} onFieldChange={jest.fn()} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing editingItemNumber={1} savedItemsCount={1} />);
  });
  return { ref, tree };
};

it('focusField("item") gives the Item field the cursor after the dialog has gone', () => {
  const { ref, tree } = mount();
  act(() => ref.current!.focusField('item'));
  act(() => { jest.advanceTimersByTime(249); });
  expect(mockFocus).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(mockFocus).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('a field that still has the cursor lets go of it first', () => {
  mockFocused = true;
  const { ref, tree } = mount();
  act(() => ref.current!.focusField('item'));
  expect(mockBlur).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(250); });
  expect(mockFocus).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
