/**
 * Invoice form, items step: the pencil beside an item group opens the rate editor
 * (/item-rates/edit, mode 'invoice') with the line and its goods-received day. Opening it
 * must not write anything: a rate is written only when the editor is saved.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getItemStoragePrices, listItemRates } from '@/services/item-pricing-service';
import { notifyRatesChanged } from '@/features/item-pricing/contract';
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
const mockUpdateItemPricing = jest.fn();
const mockApplySaved = jest.fn();
const mockLine = {
  temp_id: 't1', item_id: ITEM, item_name: 'Example Potatoes', package_mark: 'M1', weight: 50, qty: 100,
  charge: 5, labour_rate: 2, tax: 5, duration: 1, grn_date: '2026-05-02',
};
const mockItems: unknown[] = [];
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: { customer_id: 'cccccccc-2222-4333-8444-555555555555', customer_name: 'Example Traders', one_time_charge: false, inv_no: 12 },
    items: mockItems,
    itemOverrides: {},
    updateItemPricing: mockUpdateItemPricing,
    applyGroupPricing: mockApplyGroupPricing,
    applySavedRatesToLines: mockApplySaved,
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
  listItemRates: jest.fn(),
}));

const pencil = { item_id: ITEM, item_name: 'Example Potatoes', package_mark: 'M1', weight: 50, charge: 5, labour_rate: 2, tax: 5 };
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
  mockItems.length = 0;
  mockItems.push(mockLine);
  mockFocusCallbacks.length = 0;
  mockRole = 'supervisor';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const editorParams = {
  mode: 'invoice',
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
  grn_date: '2026-05-02',
};

it('opens the rate editor in invoice mode, filled from the line and its received day, and writes nothing', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  // No RPC or table write of any kind went out: only the mocked price list was read.
  expect(getAuthenticatedClient).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledTimes(1);
  const route = jest.mocked(router.push).mock.calls[0][0] as { pathname: string; params: Record<string, string> };
  expect(route.pathname).toBe('/item-rates/edit');
  expect(route.params).toEqual(editorParams);
  await act(async () => { tree.unmount(); });
});

it("opens the same editor when the customer already has a price: the editor itself finds the rate", async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([savedPrice]));
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  expect(getAuthenticatedClient).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/edit', params: editorParams });
  await act(async () => { tree.unmount(); });
});

// CR-06 / CR-20: two lots of the same item and weight, received on different days.
it('sends the received day of the group that was pressed, not of another group of the same item and weight', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  mockItems.push({ ...mockLine, temp_id: 't2', package_mark: 'M2', grn_date: '2026-10-01' });
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing({ ...pencil, package_mark: 'M2' }); });

  const params = (jest.mocked(router.push).mock.calls[0][0] as { params: Record<string, string> }).params;
  expect(params.grn_date).toBe('2026-10-01');
  expect(params.weight_max).toBe('50');
  await act(async () => { tree.unmount(); });
});

it('uses the latest received day of a group that holds lots from several days, and says so', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  mockItems.push({ ...mockLine, temp_id: 't2', grn_date: '2026-09-09' });
  const tree = await render();

  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  const params = (jest.mocked(router.push).mock.calls[0][0] as { params: Record<string, string> }).params;
  expect(params.grn_date).toBe('2026-09-09');
  expect(params.grn_dates_differ).toBe('1');
  await act(async () => { tree.unmount(); });
});

const own = (rent: number, from: string, to: string | null) => ({ ...savedPrice, unit_price: rent, effective_from: from, effective_to: to });

// CR-05: after a save, each line is priced by its own received day.
it('after a saved change from today, each line keeps the rate of its own received day', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  mockItems.push({ ...mockLine, temp_id: 't2', package_mark: 'M2', grn_date: '2026-10-20' });
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });
  // The staff change: Rs11 up to 13 Oct, Rs12 from today (14 Oct).
  jest.mocked(listItemRates).mockResolvedValue([own(11, '2026-01-01', '2026-10-13'), own(12, '2026-10-14', null)] as never);

  await act(async () => { notifyRatesChanged(ITEM); });
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  // One write for all lines, which marks nothing as typed by hand.
  expect(mockApplySaved).toHaveBeenCalledTimes(1);
  expect(mockApplySaved).toHaveBeenCalledWith([
    { temp_id: 't1', charge: 11, labour_rate: 2, tax: 5 },
    { temp_id: 't2', charge: 12, labour_rate: 2, tax: 5 },
  ]);
  expect(mockUpdateItemPricing).not.toHaveBeenCalled();
  expect(mockApplyGroupPricing).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});

it('a line whose received day has no customer rate takes the default rate', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });
  jest.mocked(listItemRates).mockResolvedValue([
    { ...savedPrice, customer_id: null, customer_name: null, unit_price: 4, effective_from: '2026-01-01' },
    own(12, '2026-10-14', null),
  ] as never);

  await act(async () => { notifyRatesChanged(ITEM); });
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplySaved).toHaveBeenCalledWith([{ temp_id: 't1', charge: 4, labour_rate: 2, tax: 5 }]);
  await act(async () => { tree.unmount(); });
});

it('leaves the invoice lines alone when the price form was left without saving, even if the customer has an own rate', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([own(11, '2026-01-01', null)]));
  jest.mocked(listItemRates).mockResolvedValue([own(11, '2026-01-01', null)] as never);
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });

  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplyGroupPricing).not.toHaveBeenCalled();
  expect(mockUpdateItemPricing).not.toHaveBeenCalled();
  expect(mockApplySaved).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});

// F03: a line of another weight, in this group or another, is priced by its own weight.
it('prices lines of other weights by their own band after a save', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  mockItems.push({ ...mockLine, temp_id: 't2', weight: 25 });
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });
  jest.mocked(listItemRates).mockResolvedValue([
    { ...own(12, '2026-04-01', null), weight_min: 0, weight_max: 30 },
    { ...own(15, '2026-04-01', null), weight_min: 30, weight_max: 100 },
  ] as never);

  await act(async () => { notifyRatesChanged(ITEM); });
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplySaved).toHaveBeenCalledWith([
    { temp_id: 't1', charge: 15, labour_rate: 2, tax: 5 },
    { temp_id: 't2', charge: 12, labour_rate: 2, tax: 5 },
  ]);
  await act(async () => { tree.unmount(); });
});

// F04: an answer that arrives after the screen was left writes nothing.
it('drops rates that arrive after the step lost focus, and applies them on the next focus', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });
  let release!: (value: unknown) => void;
  jest.mocked(listItemRates).mockReturnValue(new Promise(resolve => { release = resolve; }) as never);
  await act(async () => { notifyRatesChanged(ITEM); });
  const focusCallback = mockFocusCallbacks[mockFocusCallbacks.length - 1];
  let cleanup: unknown;
  await act(async () => { cleanup = (focusCallback as () => unknown)(); });

  // The user leaves the step (blur runs the effect's cleanup) before the answer comes.
  await act(async () => { (cleanup as () => void)(); release([own(12, '2026-04-01', null)]); });

  expect(mockApplySaved).not.toHaveBeenCalled();
  jest.mocked(listItemRates).mockResolvedValue([own(12, '2026-04-01', null)] as never);
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });
  expect(mockApplySaved).toHaveBeenCalledWith([{ temp_id: 't1', charge: 12, labour_rate: 2, tax: 5 }]);
  await act(async () => { tree.unmount(); });
});

// F05: a failed read says so and is tried again on the next return.
it('tells the user when the saved rates could not be read, and retries on the next focus', async () => {
  jest.mocked(getItemStoragePrices).mockResolvedValue(priceList([]));
  const tree = await render();
  await act(async () => { await table(tree).props.onEditPricing(pencil); });
  jest.mocked(listItemRates).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { notifyRatesChanged(ITEM); });

  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });

  expect(mockApplySaved).not.toHaveBeenCalled();
  const dialogs = tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType);
  expect(dialogs.some(d => d.props.visible === true && /not applied/i.test(String(d.props.title)))).toBe(true);

  jest.mocked(listItemRates).mockResolvedValue([own(12, '2026-04-01', null)] as never);
  await act(async () => { mockFocusCallbacks[mockFocusCallbacks.length - 1](); });
  expect(mockApplySaved).toHaveBeenCalledTimes(1);
  await act(async () => { tree.unmount(); });
});

// F06: a second tap while the first is still reading opens no second editor.
it('opens one editor when the pencil is tapped twice while the price list is being read', async () => {
  let release!: (value: unknown) => void;
  jest.mocked(getItemStoragePrices).mockReturnValue(new Promise(resolve => { release = resolve; }) as never);
  const tree = await render();

  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = table(tree).props.onEditPricing(pencil);
    second = table(tree).props.onEditPricing(pencil);
    release(priceList([]));
    await Promise.all([first, second]);
  });

  expect(getItemStoragePrices).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledTimes(1);
  await act(async () => { tree.unmount(); });
});

// Item pricing is for administrators and supervisors (owner, 2026-10-16; the server refuses staff from migration 90).
it.each([
  ['admin', true],
  ['supervisor', true],
  ['staff', false],
  ['customer', false],
])('pencil for %s: %s', async (role, offered) => {
  mockRole = role;
  const tree = await render();

  expect(typeof table(tree).props.onEditPricing === 'function').toBe(offered);
  await act(async () => { tree.unmount(); });
});
