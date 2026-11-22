/**
 * The Invoices tab after the 2026-10-18 list review (style guide 14.9): a failed refresh keeps the rows
 * under a strip; a failed first page or new filter is the error state; a failed next page is the last row
 * with Try again; offline, the first date heading (or the top of a list sorted by anything else) says when
 * the rows were loaded. No snackbar.
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import { getAssignedCustomerInvoices, getInvoicesList } from '@/services/invoice-service';
import { resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
// The shared stand-in hands its props to the host element, ref included; Testing Library then gives the list's ref the host instance, which has no scrollToOffset. Drop the ref, as the old renderer's null did.
jest.mock('@shopify/flash-list', () => {
  const mock = require('@/tests/helpers/windowedFlashListMock');
  return { ...mock, FlashList: ({ ref: _ref, ...props }: { ref?: unknown }) => mock.FlashList(props) };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
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

type Host = ReturnType<typeof screen.getByText>;
async function renderList() {
  await render(<InvoiceFlashList />);
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
afterEach(() => {
  jest.restoreAllMocks();
});

const user = () => userEvent.setup({ delay: 0 });
// A negative check must also see an element that is mounted but hidden.
const anywhere = { includeHiddenElements: true } as const;
const present = (testID: string) => expect(screen.getByTestId(testID)).toBeOnTheScreen();
const absent = (testID: string) => expect(screen.queryByTestId(testID, anywhere)).not.toBeOnTheScreen();
const card = (n: number) => screen.queryByTestId(`invoice-card-i${n}`);
/** Every host element below one, in order (the stand-in host "FlashList" has no role, label or text). */
const below = (node: Host): Host[] => node.children.flatMap((child) => (!child || typeof child === 'string' ? [] : [child as Host, ...below(child as Host)]));
const list = () => {
  const found = [screen.root as Host, ...below(screen.root as Host)].filter((node) => (node.type as unknown) === 'FlashList');
  if (found.length !== 1) throw new Error(`expected one FlashList, found ${found.length}`);
  return found[0];
};
const endReached = () => fireEvent(list(), 'endReached');
const refresh = () => act(async () => { await list().props.refreshControl.props.onRefresh(); });
const texts = (hidden = false) =>
  screen
    .queryAllByText(/^/, { includeHiddenElements: hidden })
    .map((node) => [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join(''));

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await refresh();

    present('invoice-stale-strip');
    expect(texts()).toContain("Couldn't refresh invoices.");
    expect(card(1)).toBeOnTheScreen();
    // No snackbar: the strip is the only place the message is (a snackbar would say it a second time).
    expect(texts(true).filter((text) => text === "Couldn't refresh invoices.")).toHaveLength(1);

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never);
    await user().press(screen.getByTestId('invoice-stale-strip-retry'));
    await waitFor(() => absent('invoice-stale-strip'));
    expect(card(1)).toBeOnTheScreen();
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(failure as never);
    await renderList();

    expect(texts()).toContain("Couldn't load invoices");
    expect(screen.queryByTestId('invoice-card-i1', anywhere)).not.toBeOnTheScreen();

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never);
    await user().press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('invoice-card-i1')).toBeOnTheScreen();
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)]) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    expect(card(1)).toBeOnTheScreen();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_search: 'onion' } };
    await screen.rerender(<InvoiceFlashList />);

    expect(screen.queryByTestId('invoice-card-i1', anywhere)).not.toBeOnTheScreen();
    absent('invoice-stale-strip');
    expect(texts()).toContain("Couldn't load invoices");
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(1)], true) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await endReached();

    present('invoice-load-more-error');
    expect(texts()).toContain("Couldn't load more invoices.");
    // The footer is the way to retry: reaching the end again does not loop on a dead connection.
    await endReached();
    expect(jest.mocked(getInvoicesList)).toHaveBeenCalledTimes(2);

    jest.mocked(getInvoicesList).mockResolvedValueOnce(answer([invoiceOf(2)]) as never);
    await user().press(screen.getByLabelText('Try loading more invoices again'));

    await waitFor(() => expect(card(2)).toBeOnTheScreen());
    const offsets = jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset);
    expect(offsets).toEqual([0, 1, 1]);
    absent('invoice-load-more-error');
  });

  it('a failed refresh keeps the offset of the rows on screen: the next page asks after them (R2-2)', async () => {
    jest.mocked(getInvoicesList)
      .mockResolvedValueOnce(answer([invoiceOf(1), invoiceOf(2)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(3)], true) as never)
      .mockResolvedValueOnce(failure as never)
      .mockResolvedValueOnce(answer([invoiceOf(4)]) as never);
    await renderList();
    await endReached();
    await refresh();
    present('invoice-stale-strip');
    await endReached();

    expect(jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 2, 0, 3]);
  });

  it('a next page that repeats an invoice does not show it twice, and the offset counts the raw page (R1-01)', async () => {
    jest.mocked(getInvoicesList)
      .mockResolvedValueOnce(answer([invoiceOf(1), invoiceOf(2)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(2), invoiceOf(3)], true) as never)
      .mockResolvedValueOnce(answer([invoiceOf(4)]) as never);
    await renderList();
    await endReached();
    await endReached();

    // The cards drawn, in order: each invoice once.
    expect(screen.getAllByTestId(/^invoice-card-/, anywhere).map((node) => node.props.testID)).toEqual(['invoice-card-i1', 'invoice-card-i2', 'invoice-card-i3', 'invoice-card-i4']);
    expect(jest.mocked(getInvoicesList).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 2, 4]);
  });

  it('offline, a list not sorted by date says at its top when the invoices were loaded', async () => {
    mockOffline = true;
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1)]) as never);
    await renderList();

    present('invoice-last-updated');
  });

  it('offline, a list with date headings says it under the first heading only', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_field: 'inv_date' }, sort: { field: 'inv_date', order: 'desc' } };
    mockOffline = true;
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1, '2026-10-02'), invoiceOf(2, '2026-10-01')]) as never);
    await renderList();

    expect(screen.getAllByTestId('invoice-last-updated', anywhere)).toHaveLength(1);
  });

  it('online, there is no last-updated line', async () => {
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1)]) as never);
    await renderList();

    absent('invoice-last-updated');
  });
});

describe('WH-220: the offline line shows the date of an earlier load', () => {
  it('offline, a list not sorted by date shows "Last updated 09/10/26, 4:05 pm" when the invoices were loaded that day', async () => {
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1)]) as never);
    const real = Date.now();
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 16, 5), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      await renderList();
      jest.setSystemTime(real);
      mockOffline = true;
      await screen.rerender(<InvoiceFlashList />);
      expect(texts()).toContain('Last updated 09/10/26, 4:05 pm');
    } finally {
      jest.useRealTimers();
    }
  });
});
