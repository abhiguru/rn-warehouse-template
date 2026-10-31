/** The Floor and Chamber buttons of the item form are the facility's (backend migration 131). */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: () => null }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));
const mockPresets = jest.fn();
jest.mock('@/services/rackPresetsService', () => ({ rackPresetsForForm: () => mockPresets() }));

const item: ItemFormData = {
  grn_trl_id: 'l1', item_table_id: 'i1', item_name: 'Example', packaging: 'Bag', qty: '1', weight: '', rack: 'ROW 3/G2/X1', package_mark: '', trl_images: [], errors: {},
};

const chips = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');

it('shows the facility\'s buttons once they are read, and reads a rack that ends in them', async () => {
  mockPresets.mockResolvedValue({ floor: ['G1', 'G2'], chamber: ['X1'] });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <HorizontalItemForm currentItem={item} onFieldChange={jest.fn()} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing={false} editingItemNumber={0} savedItemsCount={0} />,
    );
  });
  expect(chips(tree).map((n) => n.props.accessibilityLabel)).toEqual(['Floor G1', 'Floor G2', 'Chamber X1']);
  expect(chips(tree).filter((n) => n.props.accessibilityState.selected).map((n) => n.props.accessibilityLabel)).toEqual(['Floor G2', 'Chamber X1']);
  const rack = tree.root.find((n) => (n.type as unknown) === 'TextInput' && n.props.accessibilityLabel === 'Rack');
  expect(rack.props.value).toBe('ROW 3');
});
