/**
 * Invoice form, items step: the pencil beside an item group opens the price
 * form. Opening it must not write anything: a price row is created only when
 * the price form is saved.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';

let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));

const ITEM = 'iiiiiiii-2222-4333-8444-555555555555';
const CUSTOMER = 'cccccccc-2222-4333-8444-555555555555';
const mockApplyGroupPricing = jest.fn();
const mockLine = {
  temp_id: 't1', item_id: ITEM, item_name: 'Example Potatoes', package_mark: 'M1', weight: 50, qty: 100,
  charge: 5, labour_rate: 2, tax: 5, duration: 1,
};
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: { customer_id: 'cccccccc-2222-4333-8444-555555555555', customer_name: 'Example Traders', one_time_charge: false, inv_no: 12 },
    items: [mockLine],
    itemOverrides: {},
    updateItemPricing: jest.fn(),
    applyGroupPricing: mockApplyGroupPricing,
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
  }),
}));
// Every screen-focus callback, so the test can bring the step back into focus.
const mockFocusCallbacks: Array<() => void> = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => { mockFocusCallbacks.push(callback); },
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceItemsTable', () => ({ InvoiceItemsTable: 'InvoiceItemsTable' }));
jest.mock('@/features/invoice/components/InvoiceItemCard', () => ({ InvoiceItemCard: 'InvoiceItemCard' }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({
  ...jest.requireActual('@/services/item-pricing-service'),
  getItemStoragePrices: jest.fn(),
}));

const pencil = { item_id: ITEM, item_name: 'Example Potatoes', weight: 50, charge: 5, labour_rate: 2, tax: 5 };
const savedPrice = {
  id: 'pppppppp-2222-4333-8444-555555555555', item_id: ITEM, item_name: 'Example Potatoes', customer_id: CUSTOMER,
  customer_name: 'Example Traders', price_type: 'monthly', unit_price: 6.5, weight_min: 0, weight_max: 50, labour_rate: 2,
  tax_percent: 5, effective_from: '2026-04-01', effective_to: null, created_at: '', created_by: '',
};
const priceList = (rows: unknown[]) =>
  ({ success: true, data: rows, pagination: { total_count: rows.length, limit: 100, offset: 0, has_more: false } }) as never;

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceFormStep2 />); });
  return tree;
}
const table = (tree: ReactTestRenderer) => tree.root.findByType('InvoiceItemsTable' as unknown as React.ElementType);

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.length = 0;
  mockRole = 'supervisor';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('opens an empty price form filled from the line when the customer has no price, and writes nothing', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  // No RPC or table write of any kind went out: only the mocked price list was read.
  expect(getAuthenticatedClient).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledTimes(1);
  const route = jest.mocked(router.push).mock.calls[0][0] as { pathname: string; params: Record<string, string> };
  expect(route.pathname).toBe('/item-pricing-form');
  expect(route.params).toEqual({
    item_id: ITEM,
    item_name: 'Example Potatoes',
    customer_id: CUSTOMER,
    customer_name: 'Example Traders',
    price_type: 'monthly',
    unit_price: '5',
    labour_rate: '2',
    tax_percent: '5',
    weight_min: '0',
    weight_max: '50',
  });
  await act(async () => { tree.unmount(); });
});

it("opens the customer's existing price for editing", async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([savedPrice]));
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  expect(getAuthenticatedClient).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/item-pricing-form', params: { id: savedPrice.id, mode: 'edit' } });
  await act(async () => { tree.unmount(); });
});

it('takes the saved price into the invoice lines when the price form is left', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValueOnce(priceList([])).mockResolvedValue(priceList([savedPrice]));
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  // Back from the price form, where the price was saved as 6.50.
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplyGroupPricing).toHaveBeenCalledWith(`${ITEM}:::M1`, { charge: 6.5, labour_rate: 2, tax: 5 });
  await act(async () => { tree.unmount(); });
});

it('leaves the invoice lines alone when the price form was left without saving', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplyGroupPricing).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});

// The server lets staff change prices (migration 45); a customer account never may.
it.each([
  ['admin', true],
  ['supervisor', true],
  ['staff', true],
  ['customer', false],
])('pencil for %s: %s', async (role, offered) => {
  mockRole = role;
  const tree = await render();

  expect(typeof table(tree).props.onEditPricing === 'function').toBe(offered);
  await act(async () => { tree.unmount(); });
});
