/**
 * WH-79: the "Add item" row under the item search of the GRN form. Admins and supervisors always get it; a staff account
 * gets it only on a backend from migration 145 (older servers refuse create_item for staff).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

let mockIsStaff = false;
let mockHasStaffAddItem = true;
const mockSearchProps: { footerAction?: unknown }[] = [];
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: mockIsStaff }) }));
jest.mock('@/config/backendFeatures', () => ({
  backendHasFeature: (feature: string) => (feature === 'staffAddItem' ? mockHasStaffAddItem : true),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({
  RemoteAutocompleteInput: (props: { footerAction?: unknown }) => {
    mockSearchProps.push(props);
    return null;
  },
}));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const emptyLine: ItemFormData = {
  grn_trl_id: 'line-1', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '',
  package_mark: '', trl_images: [], errors: {},
};

function footerActionFor(isStaff: boolean, hasFeature: boolean) {
  mockIsStaff = isStaff;
  mockHasStaffAddItem = hasFeature;
  mockSearchProps.length = 0;
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <HorizontalItemForm
        currentItem={emptyLine}
        onFieldChange={jest.fn()}
        onImagePick={jest.fn()}
        onImageRemove={jest.fn()}
        onSaveItem={jest.fn()}
        isValid={false}
        isEditing={false}
        editingItemNumber={1}
        savedItemsCount={0}
      />
    );
  });
  const last = mockSearchProps[mockSearchProps.length - 1];
  act(() => tree.unmount());
  return last;
}

it.each([
  ['an admin or supervisor on an older backend', false, false, true],
  ['an admin or supervisor on a current backend', false, true, true],
  ['a staff account on a backend from migration 145', true, true, true],
  ['a staff account on an older backend', true, false, false],
])('%s: Add item offered = %s', (_who, isStaff, hasFeature, offered) => {
  const props = footerActionFor(isStaff as boolean, hasFeature as boolean);
  expect(props).toBeDefined();
  expect(props.footerAction !== undefined).toBe(offered);
});
