/** The check mark of the GRN item form stays pressable with an incomplete line (style guide §10, owner decision D7). */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));

// Draws a text field that reports every change to the real onTextChange prop.
jest.mock('@/components/RemoteAutocompleteInput', () => ({
  RemoteAutocompleteInput: (props: { onTextChange?: (text: string) => void }) => {
    const { TextInput } = require('react-native');
    return <TextInput accessibilityLabel="Item search" onChangeText={props.onTextChange} />;
  },
}));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const empty: ItemFormData = {
  grn_trl_id: 'line-1', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '', package_mark: '', trl_images: [], errors: {},
};

const check = async (blockedNotice?: string) => {
  const onSaveItem = jest.fn();
  await render(
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
  return { button: screen.getByRole('button', { name: 'Save receipt item' }), onSaveItem };
};

it('is pressable with an empty line, and a tap runs the check', async () => {
  const user = userEvent.setup({ delay: 0 });
  const { button, onSaveItem } = await check();
  expect(button).toBeEnabled();
  expect(button.props.accessibilityState).toEqual({ disabled: false });
  await user.press(button);
  expect(onSaveItem).toHaveBeenCalledTimes(1);
});

it('is still off when the GRN takes no new line', async () => {
  expect((await check('This GRN is invoiced.')).button).toBeDisabled();
});

describe('typing in the item field after a pick', () => {
  const picked: ItemFormData = { ...empty, item_table_id: 'item-1', item_name: 'Example Potatoes', packaging: 'Bag' };
  const mount = async (item: ItemFormData) => {
    const onFieldChange = jest.fn();
    await render(
      <HorizontalItemForm currentItem={item} onFieldChange={onFieldChange} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing={false} editingItemNumber={0} savedItemsCount={0} />,
    );
    return onFieldChange;
  };

  it('unchooses the item, so the form cannot save an item the field does not show', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onFieldChange = await mount(picked);
    await user.paste(screen.getByLabelText('Item search'), 'Zzz unknown');
    expect(onFieldChange).toHaveBeenCalledWith('item_table_id', '');
    expect(onFieldChange).toHaveBeenCalledWith('packaging', '');
    expect(onFieldChange).toHaveBeenCalledWith('item_name', 'Zzz unknown');
  });

  it('unchooses it when the field is emptied too', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onFieldChange = await mount(picked);
    await user.clear(screen.getByLabelText('Item search'));
    expect(onFieldChange).toHaveBeenCalledWith('item_table_id', '');
    expect(onFieldChange).toHaveBeenCalledWith('item_name', '');
  });

  it('only follows the text while no item is chosen', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onFieldChange = await mount(empty);
    await user.paste(screen.getByLabelText('Item search'), 'Po');
    expect(onFieldChange).toHaveBeenCalledTimes(1);
    expect(onFieldChange).toHaveBeenCalledWith('item_name', 'Po');
  });
});
