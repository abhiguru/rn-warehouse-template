/**
 * Invoice items step (new and edit): the bottom bar does not add the inset a second time on
 * Android, where the root stack already pads every screen by it; iOS keeps it.
 */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { space } from '@/theme/tokens';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import invoiceFormReducer, { loadInvoiceEditData, resetForm } from '@/store/slices/invoiceFormSlice';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n/language';
import type { InvoiceItemData } from '@/types/invoice.types';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';

const mockStore = configureStore({
  reducer: {
    invoiceForm: invoiceFormReducer,
    theme: () => ({ preference: 'light', brand: 'orange' }),
    auth: () => ({ userProfile: { role: 'staff' } }),
  },
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockStore.dispatch,
  useAppStore: () => mockStore,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockStore.getState()),
}));

const line = (id: string, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: `edit_${id}_0`,
  disp_trl_id: `${id}-2222-4333-8444-555555555555`,
  grn_item_id: 'g1',
  item_id: 'i1',
  item_name: 'Example Potatoes',
  qty: 100,
  grn_original_qty: 100,
  package_mark: 'M1',
  rack: '',
  weight: 50,
  dispatch_id: 'd1',
  dispatch_no: 'I0001',
  dispatch_date: '2026-10-01',
  grn_id: '11111111-2222-4333-8444-555555555555',
  grn_no: 'A0010',
  grn_date: '2026-09-01',
  duration: 1,
  no_of_days: 30,
  charge: 5,
  labour_rate: 2,
  tax: 5,
  amount: 500,
  labour_amount: 200,
  tax_amount: 35,
  item_total: 735,
  ...overrides,
});

let mockItems: InvoiceItemData[] = [];
const mockNavigateToStep = jest.fn();
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: { customer_id: 'c1', customer_name: 'Example Traders', one_time_charge: false, inv_no: 12 },
    items: mockItems,
    itemOverrides: {},
    updateItemPricing: jest.fn(),
    applyGroupPricing: jest.fn(),
    navigateToStep: mockNavigateToStep,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  // The items table (a stand-in here) is a keyboard-aware FlashList.
  listenToKeyboardEvents: () => (component: unknown) => component,
}));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: 'InvoiceItemsEditor' }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));


const realOS = Platform.OS;
afterEach(() => { Platform.OS = realOS; });
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });

const barPadding = (tree: ReactTestRenderer) => {
  const next = tree.root.find((n) => n.props.accessibilityLabel === 'Next: review' && typeof n.props.onPress === 'function');
  let node = next.parent;
  while (node) {
    const style = StyleSheet.flatten(node.props.style);
    if (typeof node.type === 'string' && style && typeof style.paddingBottom === 'number') return style.paddingBottom;
    node = node.parent;
  }
  throw new Error('no bottom bar');
};

describe.each([['new invoice', InvoiceFormStep2], ['invoice edit', InvoiceEditStep2]] as const)('%s, items step bottom bar', (_name, Step) => {
  it.each([['android', 0], ['ios', 24]] as const)('on %s with a 24 dp inset adds %d dp of inset', async (os, inset) => {
    Platform.OS = os;
    mockItems = [line('aaaaaaaa')];
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<Step />); });
    const own = barPadding(tree) - inset;
    // Android: only the step's own spacing (space.md), not 24 + 16.
    expect(own).toBe(space.md);
    await act(async () => { tree.unmount(); });
  });
});
