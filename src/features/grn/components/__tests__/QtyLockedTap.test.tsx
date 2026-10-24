/**
 * A line that is already (partly) dispatched has its Quantity locked. On Android a
 * non-editable TextInput never receives focus, so the "Quantity locked" alert hung on onFocus
 * never showed (phone run 2026-10-14, step B19). A tap on the locked field now reaches an
 * overlay that shows it on both platforms.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';
import { QuantityWeightFields } from '../item-form';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: 'RemoteAutocompleteInput' }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const ITEM: ItemFormData = {
  grn_trl_id: 'line-1',
  item_table_id: 'item-1',
  item_name: 'Potato',
  packaging: 'Bag',
  qty: '100',
  weight: '50',
  rack: '20B',
  package_mark: 'PT',
  trl_images: [],
  errors: {},
};

const mounted: ReactTestRenderer[] = [];
function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

const overlays = (tree: ReactTestRenderer): ReactTestInstance[] =>
  tree.root.findAll((n) => n.props.testID === 'grn-qty-locked-overlay' && typeof n.props.onPress === 'function');

const row = (locked: boolean, onQtyLockedPress: () => void) =>
  mount(
    <HorizontalItemForm
      currentItem={ITEM}
      onFieldChange={jest.fn()}
      onImagePick={jest.fn()}
      onImageRemove={jest.fn()}
      onSaveItem={jest.fn()}
      isValid
      isEditing
      editingItemNumber={1}
      savedItemsCount={1}
      isQtyLocked={locked}
      onQtyLockedPress={onQtyLockedPress}
    />
  );

describe('locked Quantity field', () => {
  it('item row: a tap on the locked field shows the lock explanation', () => {
    const onLocked = jest.fn();
    const tree = row(true, onLocked);
    expect(overlays(tree)).toHaveLength(1);
    act(() => overlays(tree)[0].props.onPress());
    expect(onLocked).toHaveBeenCalledTimes(1);
  });

  it('item row: an editable field has no overlay in the way of the keyboard', () => {
    expect(overlays(row(false, jest.fn()))).toHaveLength(0);
  });

  it('QuantityWeightFields: same rule', () => {
    const onLocked = jest.fn();
    const mk = (locked: boolean) =>
      mount(
        <QuantityWeightFields
          qty="100"
          weight="50"
          onQtyChange={jest.fn()}
          onWeightChange={jest.fn()}
          isQtyLocked={locked}
          onQtyLockedPress={onLocked}
        />
      );
    expect(overlays(mk(false))).toHaveLength(0);
    const tree = mk(true);
    act(() => overlays(tree)[0].props.onPress());
    expect(onLocked).toHaveBeenCalledTimes(1);
  });
});
