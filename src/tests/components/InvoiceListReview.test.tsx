/**
 * The Invoices tab after the 2026-10-18 list review (style guide 14.9): a failed refresh keeps the rows
 * under a strip; a failed first page or new filter is the error state; a failed next page is the last row
 * with Try again; offline, the first date heading (or the top of a list sorted by anything else) says when
 * the rows were loaded. No snackbar.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import { getAssignedCustomerInvoices, getInvoicesList } from '@/services/invoice-service';
import { resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The card is a host element that keeps its props.
jest.mock('@/components/list-items', () => ({
  MemoizedInvoiceItem: (props: { invoice: { invoice_id: string } }) => require('react').createElement('InvoiceCard', { ...props, testID: `invoice-card-${props.invoice.invoice_id}` }),
}));
jest.mock('@/features/filters/configs', () => ({ INVOICE_FILTERS: { listKey: 'invoice-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
// The header is the shared one; here it is a host element that keeps its props.
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: object) => require('react').createElement('FilteredListHeader', props),
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
let mockFilters = {
  request: { p_sort_field: 'inv_no', p_sort_direction: 'desc' } as Record<string, unknown>,
  sort: { field: 'inv_no', order: 'desc' },
  values: {},
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/services/invoice-service', () => ({
  getInvoicesList: jest.fn(),
  getAssignedCustomerInvoices: jest.fn(),
}));
const mockAccess = { canManageOrders: true, assignedCustomerIds: ['customer-fictional-1'] };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'staff', assignedCustomers: [{ id: 'customer-fictional-1', name: 'Fictional Farms' }] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

/** Invoice `n`. */
const invoiceOf = (n: number, date = '2026-10-01') => ({
  invoice_id: `i${n}`,
  invoice_no: `INV${String(n).padStart(4, '0')}`,
  invoice_date: date,
  customer_name: 'Fictional Farms',
});
const answer = (invoices: ReturnType<typeof invoiceOf>[], more = false) => ({
  success: true,
  message: '',
  data: { invoices, pagination: { has_more: more } },
});
const failure = { success: false, message: 'Network unavailable', data: null };

const mounted: ReactTestRenderer[] = [];
async function renderList() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceFlashList />);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getInvoicesList).mockReset();
  jest.mocked(getAssignedCustomerInvoices).mockReset();
  resetFlashListWindow();
  mockFilters = { ...mockFilters, request: { p_sort_field: 'inv_no', p_sort_direction: 'desc' }, sort: { field: 'inv_no', order: 'desc' } };
  mockAccess.canManageOrders = true;
  mockOffline = false;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const host = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0];
const card = (tree: ReactTestRenderer, n: number) => host(tree, `invoice-card-i${n}`);
const pressable = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const press = (node: ReactTestInstance) => act(async () => { await node.props.onPress(); });
const list = (tree: ReactTestRenderer) => tree.root.findByType('FlashList' as never);
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join(''));

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });

    expect(host(tree, 'invoice-stale-strip')).toBeDefined();
    expect(texts(tree)).toContain("Couldn't refresh invoices.");
    expect(card(tree, 1)).toBeDefined();
    expect(tree.root.findAll((node) => (node.type as unknown) === 'Snackbar')).toHaveLength(0);

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never);
    await press(pressable(tree, 'invoice-stale-strip-retry'));
    expect(host(tree, 'invoice-stale-strip')).toBeUndefined();
    expect(card(tree, 1)).toBeDefined();
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(failure as never);
    const tree = await renderList();

    expect(texts(tree)).toContain("Couldn't load invoices");
    expect(card(tree, 1)).toBeUndefined();

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never);
    const errorView = tree.root.findAll((node) => node.props.presentation === 'inline' && typeof node.props.onRetry === 'function')[0];
    await act(async () => { await errorView.props.onRetry(); });
    expect(card(tree, 1)).toBeDefined();
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    expect(card(tree, 1)).toBeDefined();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_search: 'onion' } };
    await act(async () => { tree.update(<InvoiceFlashList />); });

    expect(card(tree, 1)).toBeUndefined();
    expect(host(tree, 'invoice-stale-strip')).toBeUndefined();
    expect(texts(tree)).toContain("Couldn't load invoices");
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)], true) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(host(tree, 'invoice-load-more-error')).toBeDefined();
    expect(texts(tree)).toContain("Couldn't load more invoices.");
    // The footer is the way to retry: reaching the end again does not loop on a dead connection.
    await act(async () => { await list(tree).props.onEndReached(); });
    expect(jest.mocked(getInvoicesList)).toHaveBeenCalledTimes(2);

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(2)]) as never);
    await press(tree.root.findAll((node) => node.props.accessibilityLabel === 'Try loading more invoices again' && typeof node.props.onPress === 'function')[0]);

    const offsets = jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset);
    expect(offsets).toEqual([0, 1, 1]);
    expect(card(tree, 2)).toBeDefined();
    expect(host(tree, 'invoice-load-more-error')).toBeUndefined();
  });

  it('a failed refresh keeps the offset of the rows on screen: the next page asks after them (R2-2)', async () => {
    jest.mocked(getInvoicesList)
      .mockResolvedValueOnce(answer([invoiceOf(1), invoiceOf(2)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(3)], true) as never)
      .mockResolvedValueOnce(failure as never)
      .mockResolvedValueOnce(answer([invoiceOf(4)]) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });
    expect(host(tree, 'invoice-stale-strip')).toBeDefined();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 2, 0, 3]);
  });

  it('a next page that repeats an invoice does not show it twice, and the offset counts the raw page (R1-01)', async () => {
    jest.mocked(getInvoicesList)
      .mockResolvedValueOnce(answer([invoiceOf(1), invoiceOf(2)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(2), invoiceOf(3)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(4)]) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(list(tree).props.data.filter((row: { type: string }) => row.type === 'card').map((row: { key: string }) => row.key)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 2, 4]);
  });

  it('offline, a list not sorted by date says at its top when the invoices were loaded', async () => {
    mockOffline = true;
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1)]) as never);
    const tree = await renderList();

    expect(host(tree, 'invoice-last-updated')).toBeDefined();
  });

  it('offline, a list with date headings says it under the first heading only', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_field: 'inv_date' }, sort: { field: 'inv_date', order: 'desc' } };
    mockOffline = true;
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1, '2026-10-02'), invoiceOf(2, '2026-10-01')]) as never);
    const tree = await renderList();

    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'invoice-last-updated')).toHaveLength(1);
  });

  it('online, there is no last-updated line', async () => {
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1)]) as never);
    const tree = await renderList();

    expect(host(tree, 'invoice-last-updated')).toBeUndefined();
  });
});
