/**
 * WH-79: the "Add item" row under the item search of the GRN form. Admins and supervisors always get it; a staff account
 * gets it only on a backend from migration 145 (older servers refuse create_item for staff).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

let mockIsStaff = false;
let mockHasStaffAddItem = true;
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
// Always draws a marker for the search field, and its footer action as a button as the real field does.
jest.mock('@/components/RemoteAutocompleteInput', () => ({
  RemoteAutocompleteInput: (props: { footerAction?: { label: string; onPress: (typed: string) => void } }) => {
    const { Pressable, Text, TextInput } = require('react-native');
    const { footerAction } = props;
    return (
      <>
        <TextInput accessibilityLabel="Item search" />
        {footerAction ? (
          <Pressable accessibilityRole="button" onPress={() => footerAction.onPress('')}>
            <Text>{footerAction.label}</Text>
          </Pressable>
        ) : null}
      </>
    );
  },
}));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const emptyLine: ItemFormData = {
  grn_trl_id: 'line-1', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '',
  package_mark: '', trl_images: [], errors: {},
};

async function renderForm(isStaff: boolean, hasFeature: boolean) {
  mockIsStaff = isStaff;
  mockHasStaffAddItem = hasFeature;
  await render(
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
}

it.each([
  ['an admin or supervisor on an older backend', false, false, true],
  ['an admin or supervisor on a current backend', false, true, true],
  ['a staff account on a backend from migration 145', true, true, true],
  ['a staff account on an older backend', true, false, false],
])('%s: Add item offered = %s', async (_who, isStaff, hasFeature, offered) => {
  await renderForm(isStaff as boolean, hasFeature as boolean);
  // The search field is on the screen, so an absent button is the form's choice and not a form that drew nothing.
  expect(screen.getByLabelText('Item search')).toBeOnTheScreen();
  if (offered) expect(screen.getByRole('button', { name: 'Add item' })).toBeOnTheScreen();
  else expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeOnTheScreen();
});
