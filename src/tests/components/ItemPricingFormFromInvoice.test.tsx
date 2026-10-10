/**
 * Price form opened from an invoice line: filled from the line, a row is
 * created only by Save, and only administrators and supervisors may save.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { createItemStoragePrice, getItemStoragePrices, updateItemStoragePrice } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import ItemPricingFormScreen from '../../../app/item-pricing-form';

let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: require('react-native').ScrollView }));
jest.mock('@gorhom/bottom-sheet', () => {
  const RN = require('react-native');
  return {
    BottomSheetModal: () => null,
    BottomSheetFlatList: RN.FlatList,
    BottomSheetTextInput: RN.TextInput,
    BottomSheetBackdrop: () => null,
    BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({
  getItemStoragePrices: jest.fn(),
  createItemStoragePrice: jest.fn(),
  updateItemStoragePrice: jest.fn(),
}));

const ITEM = 'iiiiiiii-2222-4333-8444-555555555555';
const CUSTOMER = 'cccccccc-2222-4333-8444-555555555555';
const fromInvoiceLine = {
  item_id: ITEM, item_name: 'Example Potatoes', customer_id: CUSTOMER, customer_name: 'Example Traders',
  price_type: 'monthly', unit_price: '5.5', labour_rate: '2', tax_percent: '5', weight_min: '0', weight_max: '50',
};

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ItemPricingFormScreen />); });
  return tree;
}
const saveButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === t('pricing.form.savePrice') && typeof node.props.onPress === 'function');

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'supervisor';
  mockParams = {};
});

describe('opened from an invoice line that has no price yet', () => {
  beforeEach(() => { mockParams = { ...fromInvoiceLine }; });

  it('creates nothing until Save is pressed', async () => {
    const tree = await render();

    expect(createItemStoragePrice).not.toHaveBeenCalled();
    expect(updateItemStoragePrice).not.toHaveBeenCalled();
    expect(getItemStoragePrices).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("saves a price for the line's item and customer with the line's rates", async () => {
    jest.mocked(createItemStoragePrice).mockResolvedValue({ success: true, message: 'ok' });
    const tree = await render();

    await act(async () => { await saveButton(tree)[0].props.onPress(); });

    expect(createItemStoragePrice).toHaveBeenCalledTimes(1);
    expect(jest.mocked(createItemStoragePrice).mock.calls[0][0]).toMatchObject({
      item_id: ITEM,
      customer_id: CUSTOMER,
      price_type: 'monthly',
      unit_price: 5.5,
      labour_rate: 2,
      tax_percent: 5,
      weight_min: 0,
      weight_max: 50,
    });
    await act(async () => { tree.unmount(); });
  });
});

describe('a staff account', () => {
  beforeEach(() => { mockRole = 'staff'; });

  it('cannot open the form to add a price', async () => {
    mockParams = { ...fromInvoiceLine };
    const tree = await render();

    expect(saveButton(tree)).toHaveLength(0);
    expect(showAlert).toHaveBeenCalledWith(t('pricing.form.noAccessTitle'), t('errors.parsed.noPermission'));
    expect(router.back).toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('sees an existing price read-only even when the link asks for editing', async () => {
    mockParams = { id: 'p1', mode: 'edit' };
    jest.mocked(getItemStoragePrices).mockResolvedValue({
      success: true,
      data: [{
        id: 'p1', item_id: ITEM, item_name: 'Example Potatoes', customer_id: CUSTOMER, customer_name: 'Example Traders',
        price_type: 'monthly', unit_price: 5, weight_min: 0, weight_max: 50, labour_rate: 2, tax_percent: 5,
        effective_from: '2026-04-01', effective_to: null, created_at: '', created_by: '',
      }],
      pagination: { total_count: 1, limit: 500, offset: 0, has_more: false },
    });
    const tree = await render();

    expect(saveButton(tree)).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });
});
