/**
 * A customer account with several assigned customers pages its GRN list through one RPC per
 * customer. The service keeps what it has already downloaded for each customer (a cursor per
 * request) and fetches only the rows the next page needs, while showing exactly what merging the
 * full per-customer prefixes would show (DATA-02 of the 2026-10-13 performance review).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { noteGrnPagingUnit } from '@/config/facilityGrnPaging';
import {
  compareGRNItems,
  countReceipts,
  getAssignedCustomerGRNItems,
  withReceiptPages,
  type GRNItem,
  type GRNListParams,
} from '../grn-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(() => ({
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) },
  })),
  getStoredToken: jest.fn(),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/config/facilityGrnPaging', () => ({ noteGrnPagingUnit: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

type RpcParams = {
  p_customer_id: string;
  p_limit: number;
  p_offset: number;
  p_sort_by: string;
  p_sort_order: string;
  p_filters?: Record<string, unknown>;
};

/** Row `index` of a customer, as the fake backend returns it. */
type RowFactory = (customerId: string, index: number) => Record<string, unknown>;

const defaultRow: RowFactory = (customerId, index) => ({
  id: `${customerId}-${index}`,
  grn_id: `grn-${customerId}-${index}`,
  gr_no: String(100000 - index),
  date: '2026-01-01',
  customer_id: customerId,
  customer_name: `Example Customer ${customerId}`,
  item_name: 'Example Item',
  qty: 1,
  stock: 1,
});

let makeRow: RowFactory = defaultRow;
const rpc = jest.fn();
let logs: jest.SpyInstance[];

const fakeBackend = (_name: string, params: RpcParams) =>
  Promise.resolve({
    data: {
      success: true,
      data: {
        items: Array.from({ length: params.p_limit }, (_, i) => makeRow(params.p_customer_id, params.p_offset + i)),
        pagination: { total_count: 100000, has_more: true },
        aggregations: { total_qty: 7, total_stock: 3 },
      },
    },
    error: null,
  });

const calls = () => rpc.mock.calls.map(([, params]) => params as RpcParams);
const callsOf = (customerId: string) =>
  calls()
    .filter(params => params.p_customer_id === customerId)
    .map(params => [params.p_offset, params.p_limit]);
const ids = (items: GRNItem[]) => items.map(item => item.id);

/** UI page n of GRNListFiori: 20 rows first, then 80 at a time. */
const uiPage = (n: number) => ({ p_offset: n === 0 ? 0 : 20 + (n - 1) * 80, p_limit: n === 0 ? 20 : 80 });

/**
 * What the service showed before the cursor: every customer's first `offset + limit` rows (or all
 * of them), merged with a stable sort in customer order, then the requested slice.
 */
function oldAlgorithmIds(customerIds: string[], params: GRNListParams, rowsPerCustomer = Infinity) {
  const offset = params.p_offset || 0;
  const end = offset + (params.p_limit || 20);
  const prefix = (customerId: string) =>
    Array.from({ length: Math.min(end, rowsPerCustomer) }, (_, index) => makeRow(customerId, index) as unknown as GRNItem);
  return ids(
    customerIds
      .flatMap(prefix)
      .sort((left, right) => compareGRNItems(left, right, params.p_sort_by, params.p_sort_order))
      .slice(offset, end)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  makeRow = defaultRow;
  rpc.mockImplementation(fakeBackend);
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as any);
  logs = ['log', 'warn', 'error', 'time', 'timeEnd'].map(method =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
  // A new session generation drops every retained cursor.
  advanceSessionGeneration();
});

afterEach(() => logs.forEach(log => log.mockRestore()));

it('pages ten UI pages with ten RPCs, in the order the full merge gives, never refetching a retained offset', async () => {
  const customers = ['a', 'b'];
  for (let n = 0; n < 10; n++) {
    const params: GRNListParams = { ...uiPage(n), p_sort_by: 'gr_no' };
    const result = await getAssignedCustomerGRNItems(customers, params);
    expect(result.success).toBe(true);
    expect(ids(result.data.items)).toEqual(oldAlgorithmIds(customers, params));
    expect(result.data.pagination).toEqual({
      total_count: 200000,
      limit: params.p_limit,
      offset: params.p_offset,
      has_more: true,
      unit: 'line',
    });
    expect(result.data.aggregations).toEqual({ total_qty: 14, total_stock: 6 });
    expect(result.data.user_access.accessible_customers).toBe(2);
  }

  expect(rpc).toHaveBeenCalledTimes(10);
  expect(calls().reduce((total, params) => total + params.p_limit, 0)).toBe(800);
  for (const customerId of customers) {
    expect(callsOf(customerId)).toEqual([[0, 20], [20, 80], [100, 100], [200, 100], [300, 100]]);
    // Each request starts where the retained rows end.
    let retained = 0;
    for (const [offset, limit] of callsOf(customerId)) {
      expect(offset).toBe(retained);
      retained += limit;
    }
  }
});

it('starts again from offset 0 when a filter changes, then continues under the new filter', async () => {
  const base: GRNListParams = { p_sort_by: 'gr_no', p_sort_order: 'desc' };
  await getAssignedCustomerGRNItems(['a', 'b'], { ...base, ...uiPage(0) });
  await getAssignedCustomerGRNItems(['a', 'b'], { ...base, ...uiPage(1) });

  rpc.mockClear();
  const filtered = { ...base, p_filters: { search: 'Example' } };
  await getAssignedCustomerGRNItems(['a', 'b'], { ...filtered, ...uiPage(0) });
  expect(callsOf('a')).toEqual([[0, 20]]);
  expect(callsOf('b')).toEqual([[0, 20]]);
  expect(calls()[0].p_filters).toEqual({ search: 'Example' });

  rpc.mockClear();
  const next = await getAssignedCustomerGRNItems(['a', 'b'], { ...filtered, ...uiPage(1) });
  expect(ids(next.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], { ...filtered, ...uiPage(1) }));
  expect(calls().filter(params => params.p_offset === 0)).toEqual([]);
  expect(callsOf('a')).toEqual([[20, 80]]);
});

it('starts again from offset 0 when the sort order changes', async () => {
  await getAssignedCustomerGRNItems(['a', 'b'], { p_sort_by: 'gr_no', p_sort_order: 'desc', ...uiPage(0) });
  await getAssignedCustomerGRNItems(['a', 'b'], { p_sort_by: 'gr_no', p_sort_order: 'desc', ...uiPage(1) });

  rpc.mockClear();
  // The same offset under another order is another cursor.
  await getAssignedCustomerGRNItems(['a', 'b'], { p_sort_by: 'gr_no', p_sort_order: 'asc', ...uiPage(2) });
  expect(callsOf('a')[0]).toEqual([0, 100]);
  expect(callsOf('b')[0]).toEqual([0, 100]);
});

it('downloads the first page again on a refresh (offset 0 again)', async () => {
  const params: GRNListParams = { p_sort_by: 'gr_no' };
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(0) });
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(1) });

  rpc.mockClear();
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(0) });
  expect(callsOf('a')).toEqual([[0, 20]]);
  expect(callsOf('b')).toEqual([[0, 20]]);

  // The refreshed cursor holds only the new first page.
  rpc.mockClear();
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(1) });
  expect(callsOf('a')).toEqual([[20, 80]]);
});

it('starts again from offset 0 when the assigned customers change', async () => {
  const params: GRNListParams = { p_sort_by: 'gr_no' };
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(0) });
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(1) });

  rpc.mockClear();
  const result = await getAssignedCustomerGRNItems(['a', 'b', 'c'], { ...params, ...uiPage(2) });
  expect(callsOf('a')[0]).toEqual([0, 100]);
  expect(callsOf('b')[0]).toEqual([0, 100]);
  expect(callsOf('c')[0]).toEqual([0, 100]);
  expect(ids(result.data.items)).toEqual(oldAlgorithmIds(['a', 'b', 'c'], { ...params, ...uiPage(2) }));
});

it('forgets every cursor when the session changes', async () => {
  const params: GRNListParams = { p_sort_by: 'gr_no' };
  for (let n = 0; n < 3; n++) await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(n) });

  advanceSessionGeneration();
  rpc.mockClear();
  await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(3) });
  expect(callsOf('a')[0]).toEqual([0, 100]);
  expect(callsOf('b')[0]).toEqual([0, 100]);
});

it('keeps at most four cursors and rebuilds the least recently used one from 0', async () => {
  const keys = ['one', 'two', 'three', 'four', 'five'].map(search => ({
    p_sort_by: 'gr_no' as const,
    p_filters: { search },
  }));
  for (const filters of keys) await getAssignedCustomerGRNItems(['a', 'b'], { ...filters, ...uiPage(0) });

  // The fourth most recent cursor is still there.
  rpc.mockClear();
  await getAssignedCustomerGRNItems(['a', 'b'], { ...keys[1], ...uiPage(1) });
  expect(callsOf('a')).toEqual([[20, 80]]);

  // The first was evicted by the fifth.
  rpc.mockClear();
  await getAssignedCustomerGRNItems(['a', 'b'], { ...keys[0], p_offset: 100, p_limit: 80 });
  expect(callsOf('a')).toEqual([[0, 100]]);
  expect(callsOf('b')).toEqual([[0, 100]]);
});

it('reports a failed customer and later fetches only that customer, from its retained offset', async () => {
  let bCalls = 0;
  rpc.mockImplementation((name: string, params: RpcParams) => {
    if (params.p_customer_id === 'b' && ++bCalls === 3) return Promise.reject(new Error('Network unavailable'));
    return fakeBackend(name, params);
  });
  const params: GRNListParams = { p_sort_by: 'gr_no' };
  for (let n = 0; n < 3; n++) await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(n) });

  rpc.mockClear();
  const failed = await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(3) });
  expect(failed).toMatchObject({ success: false, message: 'Failed to fetch customer GRN items' });
  expect(callsOf('a')).toEqual([[100, 100]]);
  expect(callsOf('b')).toEqual([[100, 100]]);

  rpc.mockClear();
  const retried = await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(3) });
  expect(retried.success).toBe(true);
  expect(callsOf('a')).toEqual([]);
  expect(callsOf('b')).toEqual([[100, 100]]);
  expect(ids(retried.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], { ...params, ...uiPage(3) }));
});

describe('when the server order and the app order may disagree', () => {
  it('sorting by item name gives the same rows as the full merge', async () => {
    // Names out of order within each customer's pages: the app cannot trust the server order.
    makeRow = (customerId, index) => ({ ...defaultRow(customerId, index), item_name: `Item ${(index * 37) % 101}` });
    for (let n = 0; n < 5; n++) {
      const params: GRNListParams = { ...uiPage(n), p_sort_by: 'item_name', p_sort_order: 'asc' };
      const result = await getAssignedCustomerGRNItems(['a', 'b'], params);
      expect(ids(result.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], params));
    }
  });

  it('sorting by date ascending gives the same rows as the full merge, with rows that have no date', async () => {
    // The server sorts a missing date last in both directions; the app puts it first when
    // ascending. Customer b's rows past its first 100 have no date and are only reached late.
    const minute = (index: number) =>
      `${String(Math.floor(index / 60) % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00`;
    makeRow = (customerId, index) => ({
      ...defaultRow(customerId, index),
      date: customerId === 'a' ? `2026-01-01T${minute(index)}` : index < 100 ? `2026-06-01T${minute(index)}` : null,
    });
    for (let n = 0; n < 5; n++) {
      const params: GRNListParams = { ...uiPage(n), p_sort_by: 'date', p_sort_order: 'asc' };
      const result = await getAssignedCustomerGRNItems(['a', 'b'], params);
      expect(ids(result.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], params));
    }
  });

  it('a page that breaks the expected order makes later pages use the full merge', async () => {
    // Quantities fall with the index, except one row that is out of order.
    makeRow = (customerId, index) => ({ ...defaultRow(customerId, index), qty: index === 50 ? 5000 : 1000 - index });
    for (let n = 0; n < 5; n++) {
      const params: GRNListParams = { ...uiPage(n), p_sort_by: 'qty', p_sort_order: 'desc' };
      const result = await getAssignedCustomerGRNItems(['a', 'b'], params);
      expect(ids(result.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], params));
    }
  });
});

it('stops asking a customer whose rows have run out', async () => {
  rpc.mockImplementation((name: string, params: RpcParams) => {
    if (params.p_customer_id !== 'b') return fakeBackend(name, params);
    const count = Math.max(0, Math.min(params.p_limit, 30 - params.p_offset));
    return Promise.resolve({
      data: {
        success: true,
        data: {
          items: Array.from({ length: count }, (_, i) => makeRow('b', params.p_offset + i)),
          pagination: { total_count: 30, has_more: params.p_offset + count < 30 },
          aggregations: { total_qty: 1, total_stock: 1 },
        },
      },
      error: null,
    });
  });
  const params: GRNListParams = { p_sort_by: 'gr_no' };
  for (let n = 0; n < 4; n++) {
    const result = await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(n) });
    expect(ids(result.data.items)).toEqual(
      ids(
        [...Array.from({ length: 300 }, (_, i) => makeRow('a', i)), ...Array.from({ length: 30 }, (_, i) => makeRow('b', i))]
          .map(row => row as unknown as GRNItem)
          .sort((left, right) => compareGRNItems(left, right, 'gr_no', undefined))
          .slice(uiPage(n).p_offset, uiPage(n).p_offset + uiPage(n).p_limit)
      )
    );
    expect(result.data.pagination.total_count).toBe(100030);
  }
  expect(callsOf('b')).toEqual([[0, 20], [20, 80]]);
});

describe('receipt pages (backend migration 98)', () => {
  /** Receipt k of a customer has 1 to 3 lines; a's and b's receipt numbers interleave. */
  const linesOf = (customerId: string, receipt: number) =>
    Array.from({ length: (receipt % 3) + 1 }, (_, line) => ({
      ...defaultRow(customerId, receipt),
      id: `${customerId}-${receipt}-${line}`,
      grn_id: `grn-${customerId}-${receipt}`,
      gr_no: String(100000 - 2 * receipt - (customerId === 'a' ? 0 : 1)),
    }));
  const RECEIPTS = 500;

  /** A facility with migration 98: limit and offset count receipts, and a page holds whole receipts. */
  const receiptBackend = (_name: string, params: RpcParams) => {
    const byReceipt = params.p_filters?.page_by === 'receipt';
    const end = Math.min(RECEIPTS, params.p_offset + params.p_limit);
    const items = byReceipt
      ? Array.from({ length: Math.max(0, end - params.p_offset) }, (_, i) => linesOf(params.p_customer_id, params.p_offset + i)).flat()
      : [];
    return Promise.resolve({
      data: {
        success: true,
        data: {
          items,
          pagination: { total_count: RECEIPTS, has_more: end < RECEIPTS, unit: 'receipt' },
          aggregations: { total_qty: 7, total_stock: 3 },
        },
      },
      error: null,
    });
  };

  /** The whole merged list in receipts, then receipts offset..end-1 as lines. */
  const expectedIds = (customerIds: string[], offset: number, limit: number) =>
    customerIds
      .flatMap(customerId => Array.from({ length: RECEIPTS }, (_, receipt) => linesOf(customerId, receipt)))
      .sort((left, right) => compareGRNItems(left[0] as unknown as GRNItem, right[0] as unknown as GRNItem, 'gr_no', 'desc'))
      .slice(offset, offset + limit)
      .flat()
      .map(row => row.id);

  beforeEach(() => rpc.mockImplementation(receiptBackend));

  it('pages whole receipts in the full merged order, counting receipts', async () => {
    for (let n = 0; n < 6; n++) {
      const params = withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_sort_order: 'desc', p_offset: n * 20, p_limit: 20 });
      const result = await getAssignedCustomerGRNItems(['a', 'b'], params);
      expect(result.success).toBe(true);
      expect(ids(result.data.items)).toEqual(expectedIds(['a', 'b'], n * 20, 20));
      expect(countReceipts(result.data.items)).toBe(20);
      expect(result.data.pagination).toEqual({ total_count: 1000, limit: 20, offset: n * 20, has_more: true, unit: 'receipt' });
    }
    // Each customer's requests continue from the receipts already held, never from a line count.
    for (const customerId of ['a', 'b']) {
      let held = 0;
      for (const [offset, limit] of callsOf(customerId)) {
        expect(offset).toBe(held);
        held += limit;
      }
    }
    expect(calls().every(params => params.p_filters?.page_by === 'receipt')).toBe(true);
  });

  it('a receipt a later page repeats (one was created meanwhile) is not merged into the held one (R1-01)', async () => {
    // After page 1 a receipt was created: every offset now points one receipt earlier.
    rpc.mockImplementation((name: string, params: RpcParams) =>
      receiptBackend(name, { ...params, p_offset: Math.max(0, params.p_offset - (params.p_offset > 0 ? 1 : 0)) })
    );
    const first = await getAssignedCustomerGRNItems(['a', 'b'], withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_sort_order: 'desc', p_offset: 0, p_limit: 20 }));
    const second = await getAssignedCustomerGRNItems(['a', 'b'], withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_sort_order: 'desc', p_offset: 20, p_limit: 20 }));

    const all = [...first.data.items, ...second.data.items];
    expect(new Set(ids(all)).size).toBe(all.length);
    // Every receipt keeps exactly its own lines (1 to 3), and the pages are the unshifted merge.
    const perReceipt = new Map<string, number>();
    for (const item of all) perReceipt.set(item.grn_id!, (perReceipt.get(item.grn_id!) ?? 0) + 1);
    for (const [grnId, lines] of perReceipt) expect(lines).toBe((Number(grnId.split('-')[2]) % 3) + 1);
    expect(ids(second.data.items)).toEqual(expectedIds(['a', 'b'], 20, 20));
    expect(countReceipts(second.data.items)).toBe(20);
  });

  it('starts again in receipts when the facility changes unit between pages, and never returns mixed units (R1-03)', async () => {
    rpc.mockImplementation(fakeBackend);
    const params = withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_sort_order: 'desc' });
    const first = await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(0) });
    expect(first.data.pagination.unit).toBe('line');

    // Migration 98 is deployed while the list is open.
    rpc.mockImplementation(receiptBackend);
    const second = await getAssignedCustomerGRNItems(['a', 'b'], { ...params, ...uiPage(1) });

    expect(second.success).toBe(true);
    expect(second.data.pagination.unit).toBe('receipt');
    expect(ids(second.data.items)).toEqual(expectedIds(['a', 'b'], 20, 80));
    // Customer a was asked for line 20 (found to be answered in receipts), then again from receipt 0.
    expect(callsOf('a')).toEqual([[0, 20], [20, 80], [0, 100]]);
  });

  it('tells the paging store what each receipt-paged answer paged by, and nothing for a request that did not ask', async () => {
    jest.mocked(noteGrnPagingUnit).mockClear();
    await getAssignedCustomerGRNItems(['a'], withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_offset: 0, p_limit: 20 }));
    expect(noteGrnPagingUnit).toHaveBeenLastCalledWith('receipt');

    rpc.mockImplementation(fakeBackend);
    await getAssignedCustomerGRNItems(['a'], withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', p_offset: 0, p_limit: 20 }));
    expect(noteGrnPagingUnit).toHaveBeenLastCalledWith('line');

    jest.mocked(noteGrnPagingUnit).mockClear();
    await getAssignedCustomerGRNItems(['a'], { p_sort_by: 'gr_no', p_offset: 0, p_limit: 20 });
    expect(noteGrnPagingUnit).not.toHaveBeenCalled();
  });

  it('works in lines when the facility has no migration 98 and ignores page_by', async () => {
    rpc.mockImplementation(fakeBackend);
    const params = withReceiptPages<GRNListParams>({ p_sort_by: 'gr_no', ...uiPage(0) });
    const result = await getAssignedCustomerGRNItems(['a', 'b'], params);
    expect(result.data.items).toHaveLength(20);
    expect(result.data.pagination.unit).toBe('line');
    expect(ids(result.data.items)).toEqual(oldAlgorithmIds(['a', 'b'], params));
  });
});
