/** The check mark of the GRN item form stays pressable with an incomplete line (style guide §10, owner decision D7). */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
let mockAutocomplete: any;
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: (props: unknown) => { mockAutocomplete = props; return null; } }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const empty: ItemFormData = {
  grn_trl_id: 'line-1', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '', package_mark: '', trl_images: [], errors: {},
};

const check = (blockedNotice?: string) => {
  const onSaveItem = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <HorizontalItemForm
        currentItem={empty}
        onFieldChange={jest.fn()}
        onImagePick={jest.fn()}
        onImageRemove={jest.fn()}
        onSaveItem={onSaveItem}
        isValid={false}
        isEditing={false}
        editingItemNumber={0}
        savedItemsCount={0}
        blockedNotice={blockedNotice}
      />,
    );
  });
  const button = tree.root.find((n) => n.props.accessibilityLabel === 'Save receipt item' && typeof n.props.onPress === 'function');
  return { button, onSaveItem };
};

it('is pressable with an empty line, and a tap runs the check', () => {
  const { button, onSaveItem } = check();
  expect(button.props.disabled).toBe(false);
  expect(button.props.accessibilityState).toEqual({ disabled: false });
  act(() => button.props.onPress());
  expect(onSaveItem).toHaveBeenCalledTimes(1);
});

it('is still off when the GRN takes no new line', () => {
  expect(check('This GRN is invoiced.').button.props.disabled).toBe(true);
});

describe('typing in the item field after a pick', () => {
  const picked: ItemFormData = { ...empty, item_table_id: 'item-1', item_name: 'Example Potatoes', packaging: 'Bag' };
  const mount = (item: ItemFormData) => {
    const onFieldChange = jest.fn();
    act(() => {
      create(
        <HorizontalItemForm currentItem={item} onFieldChange={onFieldChange} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing={false} editingItemNumber={0} savedItemsCount={0} />,
      );
    });
    return onFieldChange;
  };

  it('unchooses the item, so the form cannot save an item the field does not show', () => {
    const onFieldChange = mount(picked);
    act(() => mockAutocomplete.onTextChange('Zzz unknown'));
    expect(onFieldChange).toHaveBeenCalledWith('item_table_id', '');
    expect(onFieldChange).toHaveBeenCalledWith('packaging', '');
    expect(onFieldChange).toHaveBeenCalledWith('item_name', 'Zzz unknown');
  });

  it('unchooses it when the field is emptied too', () => {
    const onFieldChange = mount(picked);
    act(() => mockAutocomplete.onTextChange(''));
    expect(onFieldChange).toHaveBeenCalledWith('item_table_id', '');
    expect(onFieldChange).toHaveBeenCalledWith('item_name', '');
  });

  it('only follows the text while no item is chosen', () => {
    const onFieldChange = mount(empty);
    act(() => mockAutocomplete.onTextChange('Po'));
    expect(onFieldChange).toHaveBeenCalledTimes(1);
    expect(onFieldChange).toHaveBeenCalledWith('item_name', 'Po');
  });
});
