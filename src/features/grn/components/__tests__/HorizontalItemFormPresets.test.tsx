/** The Floor and Chamber buttons of the item form are the facility's (backend migration 131). */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: () => null }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));
const mockPresets = jest.fn();
jest.mock('@/services/rackPresetsService', () => ({ rackPresetsForForm: () => mockPresets() }));

const item: ItemFormData = {
  grn_trl_id: 'l1', item_table_id: 'i1', item_name: 'Example', packaging: 'Bag', qty: '1', weight: '', rack: 'ROW 3/G2/X1', package_mark: '', trl_images: [], errors: {},
};

it('shows the facility\'s buttons once they are read, and reads a rack that ends in them', async () => {
  mockPresets.mockResolvedValue({ floor: ['G1', 'G2'], chamber: ['X1'] });
  await render(
    <HorizontalItemForm currentItem={item} onFieldChange={jest.fn()} onImagePick={jest.fn()} onImageRemove={jest.fn()} onSaveItem={jest.fn()} isValid isEditing={false} editingItemNumber={0} savedItemsCount={0} />,
  );
  // The buttons are read from the facility after the first paint: wait for them, then they are exactly these three, in this order.
  expect(await screen.findByRole('radio', { name: 'Floor G1' })).toBeOnTheScreen();
  const chips = screen.getAllByRole('radio');
  expect(chips).toHaveLength(3);
  expect(chips[0]).toHaveAccessibleName('Floor G1');
  expect(chips[1]).toHaveAccessibleName('Floor G2');
  expect(chips[2]).toHaveAccessibleName('Chamber X1');
  expect(screen.getByRole('radio', { name: 'Floor G1' })).not.toBeSelected();
  expect(screen.getByRole('radio', { name: 'Floor G2' })).toBeSelected();
  expect(screen.getByRole('radio', { name: 'Chamber X1' })).toBeSelected();
  expect(screen.getByLabelText('Rack')).toHaveDisplayValue('ROW 3');
});
