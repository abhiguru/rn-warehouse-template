/**
 * The GRN list when the person comes back to it (review 2026-10-20, G12): it reads again, because a GRN may have been
 * created, edited or deleted, or goods dispatched, while it was away, and it keeps the person's place.
 *
 *  - The first focus is the mount, which loads the list: no second read.
 *  - On return it reads from the first row again, asking for as many receipts as were loaded (at least a first page),
 *    so the answer replaces every row on screen and the list is not cut back to a page.
 *  - A filter, search or sort changed while it was away was already loaded from the first page by the change itself:
 *    the return does not read it a second time.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { grnListElement } from '../helpers/grnListElement';
import { getAllGRNItems } from '@/services/grn-service';

// The screen's focus callback is kept, and the test calls it (focus) and its cleanup (blur) as the navigator would.
let mockFocusEffect: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void | (() => void)) => { mockFocusEffect = callback; },
}));
jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  return {
    FlashList: ({ data, renderItem }: { data: { key: string }[]; renderItem: (info: { item: unknown }) => unknown }) =>
      mockReact.createElement(
        mockReact.Fragment,
        null,
        data.map((item) => mockReact.createElement(mockReact.Fragment, { key: item.key }, renderItem({ item })))
      ),
  };
});
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({
  getAllGRNItems: jest.fn(),
  getAssignedCustomerGRNItems: jest.fn(),
  withReceiptPages: (request: { p_filters?: object }) => ({ ...request, p_filters: { ...request.p_filters, page_by: 'receipt' } }),
  countReceipts: (items: { grn_id?: string; id: string }[]) => new Set(items.map((item) => item.grn_id || item.id)).size,
}));
jest.mock('@/features/filters/configs', () => ({ GRN_FILTERS: { listKey: 'grn-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
let mockFilters = {
  request: { p_sort_by: 'gr_no', p_sort_order: 'desc' } as Record<string, unknown>,
  sort: { field: 'gr_no', order: 'desc' },
  search: '',
  values: {},
  hasAny: false,
  setSearch: jest.fn(),
  apply: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
// One object for every read: the list loads again whenever the profile it reads is a new one.
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', assignedCustomerIds: [] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const receipts = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `grn-fictional-${index}`,
    grn_id: `grn-fictional-${index}`,
    grn_item_id: `line-fictional-${index}`,
    gr_no: `RV${15000 + index}`,
    date: '2026-10-01',
    customer_id: 'customer-fictional-1',
    customer_name: 'Fictional Orchard',
    supervisor_name: null,
    registration: null,
    item_name: 'Example Potatoes',
    packaging: 'Bag',
    qty: 10,
    stock: 10,
    weight: 50,
    rack: null,
    package_mark: null,
  }));
const answer = (count: number) =>
  ({
    success: true,
    message: '',
    data: { items: receipts(count), pagination: { total_count: count, limit: 20, offset: 0, has_more: false, unit: 'receipt' } },
  }) as never;

let tree: ReactTestRenderer;
let cleanup: (() => void) | void;
const focus = () => act(async () => { cleanup = mockFocusEffect!(); });
const blur = () => act(() => { cleanup?.(); cleanup = undefined; });
const reads = () => jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params);

async function mount(loaded: number) {
  jest.mocked(getAllGRNItems).mockResolvedValue(answer(loaded));
  await act(async () => { tree = create(grnListElement()); });
  await focus();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusEffect = null;
  cleanup = undefined;
  mockFilters = { ...mockFilters, request: { p_sort_by: 'gr_no', p_sort_order: 'desc' } };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('the GRN list on return', () => {
  it('does not read again on the first focus: the mount has loaded it', async () => {
    await mount(3);
    expect(getAllGRNItems).toHaveBeenCalledTimes(1);
  });

  it('reads again from the first row, for as many receipts as were loaded, so the answer replaces every row on screen', async () => {
    await mount(45);
    expect(reads()[0]).toMatchObject({ p_limit: 20, p_offset: 0 });

    await blur();
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(45));
    await focus();

    expect(getAllGRNItems).toHaveBeenCalledTimes(2);
    expect(reads()[1]).toMatchObject({ p_limit: 45, p_offset: 0 });
  });

  it('asks for a whole first page at least when fewer receipts are loaded', async () => {
    await mount(3);
    await blur();
    await focus();
    expect(reads()[1]).toMatchObject({ p_limit: 20, p_offset: 0 });
  });

  it('does not read again when the filter changed while the screen was away: the change loaded it from the first page', async () => {
    await mount(45);
    await blur();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'in_stock' } } };
    await act(async () => { tree.update(grnListElement()); });
    // The change itself read the first page of the new filter.
    expect(getAllGRNItems).toHaveBeenCalledTimes(2);
    expect(reads()[1]).toMatchObject({ p_limit: 20, p_offset: 0, p_filters: expect.objectContaining({ stock_status: 'in_stock' }) });

    await focus();
    expect(getAllGRNItems).toHaveBeenCalledTimes(2);
  });

  it('reads again on every return, not only the first', async () => {
    await mount(3);
    await blur();
    await focus();
    await blur();
    await focus();
    expect(getAllGRNItems).toHaveBeenCalledTimes(3);
  });
});
