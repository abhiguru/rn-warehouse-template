/**
 * The report configurations. A report's search, sort and choices are applied
 * in the app to the rows the server returned, so "the request changed" proves
 * little: every field, the search and every sort must change the rows that
 * are shown or their order, on rows made for the purpose.
 */
import { REPORT_VIEW_CONFIGS, isLongestPeriod, periodDays, reportPeriod, sortRows, type ReportRequest } from '../configs/reports';
import { DISPATCH_ACTIVITY_CUSTOMER, dispatchRecordsView } from '../configs/reports/dispatchActivity';
import * as dispatchActivityConfigs from '../configs/reports/dispatchActivity';
import {
  INVOICE_HISTORY_CUSTOMER,
  INVOICE_HISTORY_CUSTOMERS,
  invoiceCustomersView,
  invoiceRecordsView,
} from '../configs/reports/invoiceHistory';
import { groupStockAgingLines } from '../configs/reports/stockAging';
import { currentSort, isDefaultSort, isFieldActive, isRequiredField, visibleFields } from '../filterModel';
import type { FilterContext, FilterFieldDef, FilterValue, SortState } from '../types';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const today = new Date(2026, 9, 12);
const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const customer: FilterContext = { role: 'customer', isWarehouseRole: false, assignedCustomers: [{ id: 'c1', label: 'Green Valley Traders' }] };

const grn = (over: Record<string, unknown>) => ({
  grn_id: 'g',
  gr_no: 'A0001',
  grn_date: '2026-09-01',
  registration: '',
  sender_name: '',
  supervisor_name: '',
  note: null,
  total_items: 1,
  total_qty: 0,
  total_weight: 0,
  image_count: 0,
  invoice_status: { is_invoiced: false, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: 0, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
  items: [],
  ...over,
});

const stockItem = (id: string, name: string, stock: number, grns: string[]) => ({
  item_id: id,
  item_name: name,
  total_stock: stock,
  total_weight: stock * 50,
  grn_count: grns.length,
  grns: grns.map((gr_no, index) => ({ grn_id: `${id}-g${index}`, gr_no, date: '2026-09-01', orig_qty: stock, stock, item_weight: 50, rack: '', packaging: 'Bag' })),
});

const stockLine = (over: Record<string, unknown>) => ({
  grn_id: 'g',
  gr_no: 'A0001',
  item_name: 'Garlic',
  packaging: 'Bag',
  current_stock: 0,
  original_qty: 0,
  weight: 0,
  rack: '',
  package_mark: '',
  grn_date: '2026-01-01',
  aging_days: 0,
  aging_bucket: '0-120',
  dispatch_info: { total_dispatched: 0, dispatch_count: 0, last_dispatch_date: null, days_since_last_dispatch: null, avg_days_between_dispatches: null },
  ...over,
});

const dispatch = (over: Record<string, unknown>) => ({
  disp_id: 'd',
  disp_no: 'DD0001',
  disp_date: '2026-09-01',
  supervisor_name: 'Asha Example',
  total_qty: 0,
  total_weight: 0,
  items: [],
  ...over,
});

const invoice = (over: Record<string, unknown>) => ({
  invoice_id: 'i',
  invoice_number: '2026/0001',
  invoice_date: '2026-09-01',
  financial_year: '2026-27',
  grn_ref: '',
  grn_id: '',
  total: 0,
  labour: 0,
  discount: 0,
  tax_amount: 0,
  net_total: 0,
  item_count: 1,
  total_quantity: 0,
  notes: null,
  payment_status: { status: 'pending', paid_date: null, payment_ref: null },
  line_items: [],
  ...over,
});
const paid = { status: 'paid', paid_date: '2026-10-01', payment_ref: null };

/**
 * Rows for each configuration, by list key, with the word a search must find in
 * exactly one of them. No two rows share a value in any sorted column, and no
 * sort gives the order the rows are written in.
 */
const FIXTURES: Record<string, { rows: unknown[]; search: string; found: string[]; id: (row: never) => string }> = {
  'report-grn-activity': {
    rows: [
      { customer_id: 'c1', customer_name: 'Riverbank Produce', grn_count: 9, total_quantity: 80, total_weight: 4000, latest_grn_date: '2026-08-11' },
      { customer_id: 'c2', customer_name: 'Green Valley Traders', grn_count: 2, total_quantity: 300, total_weight: 15000, latest_grn_date: '2026-09-20' },
      { customer_id: 'c3', customer_name: 'Sunrise Agro Foods', grn_count: 4, total_quantity: 120, total_weight: 6000, latest_grn_date: '2026-07-01' },
      { customer_id: 'c4', customer_name: 'Hillside Growers', grn_count: 12, total_quantity: 50, total_weight: 2500, latest_grn_date: '2026-10-02' },
    ],
    search: 'riverbank',
    found: ['c1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  'report-grn-activity-customer': {
    rows: [
      grn({ grn_id: 'g1', gr_no: 'A0010', grn_date: '2026-09-05', sender_name: 'Fictional Farms', total_qty: 50, dispatch_summary: { current_stock: 60 }, invoice_status: { is_invoiced: true, invoice_id: 'i1', invoice_number: '2026/0042' }, items: [{ item_name: 'Garlic', packaging: 'Bag', package_mark: 'GV' }] }),
      grn({ grn_id: 'g2', gr_no: 'A0009', grn_date: '2026-10-01', sender_name: 'Hillside Growers', total_qty: 200, dispatch_summary: { current_stock: 5 }, items: [{ item_name: 'Red chilli', packaging: 'Crate', package_mark: 'HG' }] }),
      grn({ grn_id: 'g3', gr_no: 'A0100', grn_date: '2026-08-15', sender_name: 'Lakeview Co-op', total_qty: 120, dispatch_summary: { current_stock: 90 }, items: [{ item_name: 'Cumin', packaging: 'Bag', package_mark: 'LC' }] }),
      grn({ grn_id: 'g4', gr_no: 'A0050', grn_date: '2026-09-20', sender_name: 'Orchard Lane', total_qty: 20, dispatch_summary: { current_stock: 40 }, items: [{ item_name: 'Turmeric', packaging: 'Bag', package_mark: 'OL' }] }),
    ],
    search: 'red chilli',
    found: ['g2'],
    id: (row: { grn_id: string }) => row.grn_id,
  },
  'report-stock-summary': {
    rows: [
      { customer_id: 'c1', customer_name: 'Riverbank Produce', total_stock: 80, total_weight: 4000, item_count: 7, grn_count: 9 },
      { customer_id: 'c2', customer_name: 'Green Valley Traders', total_stock: 300, total_weight: 15000, item_count: 2, grn_count: 4 },
      { customer_id: 'c3', customer_name: 'Sunrise Agro Foods', total_stock: 120, total_weight: 6000, item_count: 5, grn_count: 2 },
      { customer_id: 'c4', customer_name: 'Hillside Growers', total_stock: 50, total_weight: 2500, item_count: 3, grn_count: 12 },
    ],
    search: 'riverbank',
    found: ['c1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  'report-dispatch-activity': {
    rows: [
      { customer_id: 'c1', customer_name: 'Riverbank Produce', dispatch_count: 9, total_quantity: 80, total_weight: 4000 },
      { customer_id: 'c2', customer_name: 'Green Valley Traders', dispatch_count: 2, total_quantity: 300, total_weight: 15000 },
      { customer_id: 'c3', customer_name: 'Sunrise Agro Foods', dispatch_count: 4, total_quantity: 120, total_weight: 6000 },
      { customer_id: 'c4', customer_name: 'Hillside Growers', dispatch_count: 12, total_quantity: 50, total_weight: 2500 },
    ],
    search: 'riverbank',
    found: ['c1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  'report-stock-summary-customer': {
    rows: [
      stockItem('i1', 'Garlic', 60, ['A0010']),
      stockItem('i2', 'Red chilli', 5, ['A0009', 'A0042']),
      stockItem('i3', 'Cumin', 90, ['A0100']),
      stockItem('i4', 'Turmeric', 40, ['A0050']),
    ],
    // A GRN number, which the item's card does not show until it is opened.
    search: 'a0042',
    found: ['i2'],
    id: (row: { item_id: string }) => row.item_id,
  },
  'report-stock-aging': {
    rows: [
      { customer_id: 's1', customer_name: 'Riverbank Produce', total_stock: 80, average_age_days: 400, oldest_stock_days: 500, items_over_365_days: 2, aging_distribution: {} },
      { customer_id: 's2', customer_name: 'Green Valley Traders', total_stock: 300, average_age_days: 50, oldest_stock_days: 90, items_over_365_days: 0, aging_distribution: {} },
      { customer_id: 's3', customer_name: 'Sunrise Agro Foods', total_stock: 120, average_age_days: 200, oldest_stock_days: 380, items_over_365_days: 1, aging_distribution: {} },
      { customer_id: 's4', customer_name: 'Hillside Growers', total_stock: 50, average_age_days: 130, oldest_stock_days: 250, items_over_365_days: 0, aging_distribution: {} },
    ],
    search: 'riverbank',
    found: ['s1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  // Items of one customer, each with its GRN lines (Garlic has two, in different buckets).
  'report-stock-aging-customer': {
    rows: groupStockAgingLines([
      stockLine({ grn_id: 'g1', gr_no: 'A0010', item_name: 'Garlic', current_stock: 30, aging_days: 400, aging_bucket: '364+' }),
      stockLine({ grn_id: 'g2', gr_no: 'A0020', item_name: 'Cumin', current_stock: 200, aging_days: 150, aging_bucket: '121-240' }),
      stockLine({ grn_id: 'g3', gr_no: 'A0030', item_name: 'Turmeric', current_stock: 10, aging_days: 300, aging_bucket: '241-364' }),
      stockLine({ grn_id: 'g4', gr_no: 'A0011', item_name: 'Garlic', current_stock: 20, aging_days: 90, aging_bucket: '0-120' }),
      stockLine({ grn_id: 'g5', gr_no: 'A0040', item_name: 'Red chilli', current_stock: 120, aging_days: 30, aging_bucket: '0-120' }),
    ]),
    search: 'red chilli',
    found: ['Red chilli'],
    id: (row: { key: string }) => row.key,
  },
  'report-customer-activity': {
    rows: [
      { customer_id: 'a1', customer_name: 'Riverbank Produce', customer_city: 'Rajkot', current_stock: 80, total_grns: 3, total_dispatches: 1, total_invoice_amount: 5000, last_activity_date: '2026-08-11', last_activity_type: 'grn' },
      { customer_id: 'a2', customer_name: 'Green Valley Traders', customer_city: 'Surat', current_stock: 300, total_grns: 1, total_dispatches: 4, total_invoice_amount: 1200, last_activity_date: '2026-09-20', last_activity_type: 'dispatch' },
      { customer_id: 'a3', customer_name: 'Sunrise Agro Foods', customer_city: 'Anand', current_stock: 120, total_grns: 6, total_dispatches: 0, total_invoice_amount: 9000, last_activity_date: '2026-07-01', last_activity_type: 'grn' },
      { customer_id: 'a4', customer_name: 'Hillside Growers', customer_city: 'Morbi', current_stock: 50, total_grns: 2, total_dispatches: 2, total_invoice_amount: 300, last_activity_date: '2026-10-02', last_activity_type: 'dispatch' },
    ],
    search: 'riverbank',
    found: ['a1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  // The server searches, sorts and pages this one; the rows here are what the app does itself
  // when a backend without migration 52 could not sort them (itemStockFallbackView).
  'report-item-stock': {
    rows: [
      { item_id: 'i1', item_name: 'Garlic', packaging: 'Bag', total_stock: 30, total_qty: 200, grn_count: 5 },
      { item_id: 'i2', item_name: 'Red chilli', packaging: 'Crate', total_stock: 90, total_qty: 120, grn_count: 1 },
      { item_id: 'i3', item_name: 'Cumin', packaging: 'Bag', total_stock: 10, total_qty: 300, grn_count: 3 },
      { item_id: 'i4', item_name: 'Turmeric', packaging: 'Bag', total_stock: 50, total_qty: 80, grn_count: 7 },
    ],
    search: 'red chilli',
    found: ['i2'],
    id: (row: { item_id: string }) => row.item_id,
  },
  // One customer's dispatches, with the total weights the server sends. No two rows share a date,
  // number, bags or weight, and weight would give an order none of the sorts gives in either
  // direction: d3, d1, d2, d4 (highest first). The report has no sort by weight: total weights are
  // not shown.
  'report-dispatch-activity-customer': {
    rows: [
      dispatch({ disp_id: 'd1', disp_no: 'DD0010', disp_date: '2026-09-05', total_qty: 50, total_weight: 5000, items: [{ item_name: 'Garlic', qty: 50, source_grn: 'A0010' }] }),
      dispatch({ disp_id: 'd2', disp_no: 'DD0009', disp_date: '2026-10-01', total_qty: 200, total_weight: 3500, supervisor_name: 'Ravi Example', items: [{ item_name: 'Red chilli', qty: 200, source_grn: 'A0009' }] }),
      dispatch({ disp_id: 'd3', disp_no: 'DD0100', disp_date: '2026-08-15', total_qty: 120, total_weight: 6100, items: [{ item_name: 'Cumin', qty: 120, source_grn: 'A0100' }] }),
      dispatch({ disp_id: 'd4', disp_no: 'DD0050', disp_date: '2026-09-20', total_qty: 20, total_weight: 900, items: [{ item_name: 'Turmeric', qty: 20, source_grn: 'A0050' }] }),
    ],
    search: 'red chilli',
    found: ['d2'],
    id: (row: { disp_id: string }) => row.disp_id,
  },
  // The amount is `total_amount`. `net_amount` is what a server without backend migration 61 sends
  // (labour and tax counted twice, the discount taken off twice) and is made to put the customers in
  // another order than `total_amount` does, so a sort on the wrong field fails here.
  'report-invoice-history': {
    rows: [
      { customer_id: 'c1', customer_name: 'Riverbank Produce', invoice_count: 9, total_amount: 9000, net_amount: 9700, latest_invoice_date: '2026-08-11' },
      { customer_id: 'c2', customer_name: 'Green Valley Traders', invoice_count: 2, total_amount: 33000, net_amount: 21000, latest_invoice_date: '2026-09-20' },
      { customer_id: 'c3', customer_name: 'Sunrise Agro Foods', invoice_count: 4, total_amount: 13000, net_amount: 14100, latest_invoice_date: '2026-07-01' },
      { customer_id: 'c4', customer_name: 'Hillside Growers', invoice_count: 12, total_amount: 5500, net_amount: 9800, latest_invoice_date: '2026-10-02' },
    ],
    search: 'riverbank',
    found: ['c1'],
    id: (row: { customer_id: string }) => row.customer_id,
  },
  // The amount is `total`. `net_total` is what a server without migration 61 sends (it is not the same
  // order: i1 before i3 by net_total, after it by total, and i4 is a discounted invoice).
  'report-invoice-history-customer': {
    rows: [
      invoice({ invoice_id: 'i1', invoice_number: '2026/0010', invoice_date: '2026-09-05', grn_ref: 'A0010', total: 5000, net_total: 14000, payment_status: paid, line_items: [{ item_name: 'Garlic' }] }),
      invoice({ invoice_id: 'i2', invoice_number: '2026/0009', invoice_date: '2026-10-01', grn_ref: 'A0009', total: 20000, net_total: 26000, line_items: [{ item_name: 'Red chilli' }] }),
      invoice({ invoice_id: 'i3', invoice_number: '2026/0100', invoice_date: '2026-08-15', grn_ref: 'A0100', total: 12000, net_total: 12500, payment_status: paid, line_items: [{ item_name: 'Cumin' }] }),
      invoice({ invoice_id: 'i4', invoice_number: '2026/0050', invoice_date: '2026-09-20', grn_ref: 'A0050', total: 2000, net_total: -800, line_items: [{ item_name: 'Turmeric' }] }),
    ],
    search: 'red chilli',
    found: ['i2'],
    id: (row: { invoice_id: string }) => row.invoice_id,
  },
};

/** A value that turns the field on, whatever its kind. */
function sample(field: FilterFieldDef): FilterValue {
  switch (field.kind) {
    case 'choice':
      return field.options.find(option => option.value !== field.defaultValue)!.value;
    case 'toggle':
      return true;
    case 'dateRange':
      return { from: '2026-09-01', to: '2026-09-30' };
    default:
      throw new Error(`reportViews.test.ts has no sample for a ${field.kind} field: add one`);
  }
}

describe.each(REPORT_VIEW_CONFIGS.map(entry => [entry.config.listKey, entry] as const))('report config %s', (listKey, { config, apply }) => {
  const fixture = FIXTURES[listKey];
  const request = (values: Record<string, FilterValue>, sort?: SortState, ctx = staff) => config.toRequest(values, sort, ctx, today) as ReportRequest<object>;
  const shown = (values: Record<string, FilterValue>, sort?: SortState) =>
    (apply(fixture.rows as never[], request(values, sort).view as never) as never[]).map(fixture.id);
  const all = () => shown({}, config.sort?.default);

  it('has rows to be checked on', () => {
    expect(fixture).toBeDefined();
    expect(fixture.rows.length).toBeGreaterThanOrEqual(4);
  });

  it('is keyed as a report, with unique field keys and only known fast filters', () => {
    expect(listKey).toMatch(/^report-/);
    const keys = config.fields.map(field => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of config.fastFilters) expect(keys).toContain(key);
  });

  it('shows every row when nothing narrows them', () => {
    expect(all().slice().sort()).toEqual(fixture.rows.map(row => fixture.id(row as never)).sort());
  });

  it('asks for a period exactly when it has a period field (a report of today has neither)', () => {
    const hasPeriod = config.fields.some(isRequiredField);
    expect(request({}).period === undefined).toBe(!hasPeriod);
    // Besides the view, only the one paged report (item stock) carries a `server` part: the search
    // and sort it sends to the server. No report without a period field sends a period.
    if (!hasPeriod) expect(Object.keys(request({ search: fixture.search }, config.sort?.default)).filter(key => key !== 'server')).toEqual(['view']);
  });

  describe.each([['staff', staff], ['a customer account', customer]] as const)('for %s', (_name, ctx) => {
    const fields = visibleFields(config, ctx).map(field => [field.key, field] as const);
    // A report with no fields (today's stock: no period, no choices; item stock: a search and a
    // sort only) has nothing to check here.
    if (fields.length === 0) {
      it('has no fields to check', () => expect(config.fields).toEqual([]));
      return;
    }
    it.each(fields)('the "%s" field changes what is asked for or what is shown', (_key, field) => {
      const value = sample(field);
      expect(isFieldActive(field, value)).toBe(true);
      if (isRequiredField(field)) {
        // The period is the one field the server is asked with.
        expect(request({ [field.key]: value }, undefined, ctx).period).toEqual({ from: '2026-09-01', to: '2026-09-30' });
        expect(request({ [field.key]: value }, undefined, ctx).period).not.toEqual(request({}, undefined, ctx).period);
      } else {
        const narrowed = shown({ [field.key]: value }, config.sort?.default);
        expect(narrowed.length).toBeGreaterThan(0);
        expect(narrowed.length).toBeLessThan(fixture.rows.length);
      }
    });
  });

  it('finds the rows that have every word of the search, in any column and any case', () => {
    expect(config.search).toBeDefined();
    expect(shown({ search: fixture.search.toUpperCase() }, config.sort?.default)).toEqual(fixture.found);
    expect(shown({ search: `${fixture.search} zzzz` }, config.sort?.default)).toEqual([]);
  });

  const sorts = (config.sort?.options ?? []).map(option => [option.field] as const);
  it.each(sorts)('sorting by "%s" orders the rows, and the other direction reverses them', field => {
    const descending = shown({}, { field, order: 'desc' });
    const ascending = shown({}, { field, order: 'asc' });
    expect(descending).toHaveLength(fixture.rows.length);
    expect(ascending).toEqual(descending.slice().reverse());
    // Not simply the order the rows came in, in either direction.
    const written = fixture.rows.map(row => fixture.id(row as never));
    expect([descending, ascending]).not.toContainEqual(written);
  });

  it('gives each sort its own order', () => {
    const orders = (config.sort?.options ?? []).map(option => shown({}, { field: option.field, order: 'desc' }).join(','));
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('one customer\'s dispatches: no sort by weight', () => {
  const rows = FIXTURES['report-dispatch-activity-customer'].rows as Parameters<typeof dispatchRecordsView>[0];
  const ids = (sort: SortState | undefined) => dispatchRecordsView(rows, DISPATCH_ACTIVITY_CUSTOMER.toRequest({}, sort, staff, today).view).map(row => row.disp_id);
  /** The order a sort by the dispatches' total weight would give, highest first. */
  const BY_WEIGHT = ['d3', 'd1', 'd2', 'd4'];

  it('the rows could be told apart by weight: that order, in either direction, is no other sort\'s', () => {
    const byWeight = [...rows].sort((a, b) => b.total_weight - a.total_weight).map(row => row.disp_id);
    expect(byWeight).toEqual(BY_WEIGHT);
    const others = DISPATCH_ACTIVITY_CUSTOMER.sort!.options.flatMap(option => [ids({ field: option.field, order: 'desc' }), ids({ field: option.field, order: 'asc' })]);
    expect(others).toHaveLength(6);
    expect(others).not.toContainEqual(BY_WEIGHT);
    expect(others).not.toContainEqual(BY_WEIGHT.slice().reverse());
    expect(rows.map(row => row.disp_id)).not.toEqual(BY_WEIGHT);
  });

  it('offers exactly Date, Dispatch number and Bags, by default the newest first', () => {
    const options = DISPATCH_ACTIVITY_CUSTOMER.sort!.options;
    expect(options.map(option => option.label)).toEqual(['Date', 'Dispatch number', 'Bags']);
    expect(options.map(option => option.field)).toEqual(['date', 'number', 'bags']);
    expect(options.map(option => option.kind)).toEqual(['date', 'number', 'amount']);
    expect(options.some(option => option.label === 'Weight' || option.field === 'weight')).toBe(false);
    expect(DISPATCH_ACTIVITY_CUSTOMER.sort!.default).toEqual({ field: 'date', order: 'desc' });
    expect(DISPATCH_ACTIVITY_CUSTOMER.listKey).toBe('report-dispatch-activity-customer');
  });

  it('is the one configuration of that list: the one with Weight and its helpers are gone', () => {
    expect(Object.keys(dispatchActivityConfigs).sort()).toEqual(['DISPATCH_ACTIVITY_CUSTOMER', 'DISPATCH_ACTIVITY_CUSTOMERS', 'dispatchCustomersView', 'dispatchRecordsView']);
    const registered = REPORT_VIEW_CONFIGS.filter(entry => entry.config.listKey === 'report-dispatch-activity-customer');
    expect(registered).toHaveLength(1);
    expect(registered[0].config).toBe(DISPATCH_ACTIVITY_CUSTOMER);
  });

  it('keeps its labels as getters, so they follow the app\'s language', () => {
    expect(typeof Object.getOwnPropertyDescriptor(DISPATCH_ACTIVITY_CUSTOMER, 'title')?.get).toBe('function');
    for (const option of DISPATCH_ACTIVITY_CUSTOMER.sort!.options) expect(typeof Object.getOwnPropertyDescriptor(option, 'label')?.get).toBe('function');
  });

  it('asks for the view it was built with: the search and sort given', () => {
    const view = DISPATCH_ACTIVITY_CUSTOMER.toRequest({ search: 'Red Chilli' }, { field: 'bags', order: 'asc' }, staff, today).view;
    expect(view).toEqual({ sort: { field: 'bags', order: 'asc' }, words: ['red', 'chilli'] });
  });

  it('a Weight sort remembered from an earlier version falls back to the default: date, newest first', () => {
    for (const order of ['asc', 'desc'] as const) {
      const stored: SortState = { field: 'weight', order };
      expect(currentSort(DISPATCH_ACTIVITY_CUSTOMER, stored)).toEqual({ field: 'date', order: 'desc' });
      expect(isDefaultSort(DISPATCH_ACTIVITY_CUSTOMER, stored)).toBe(true);
      // The rows come out newest first, as for no stored sort at all: not by their total weights.
      const shown = ids(currentSort(DISPATCH_ACTIVITY_CUSTOMER, stored));
      expect(shown).toEqual(['d2', 'd4', 'd1', 'd3']);
      expect(shown).toEqual(ids(currentSort(DISPATCH_ACTIVITY_CUSTOMER, undefined)));
      expect([BY_WEIGHT, BY_WEIGHT.slice().reverse()]).not.toContainEqual(shown);
    }
    // A sort the list does offer is kept as stored.
    expect(currentSort(DISPATCH_ACTIVITY_CUSTOMER, { field: 'bags', order: 'asc' })).toEqual({ field: 'bags', order: 'asc' });
  });

  it('even handed a weight sort, the rows are not ordered by their total weights', () => {
    // `sortRows` has no accessor for it: the rows stay as the server sent them.
    const written = rows.map(row => row.disp_id);
    expect(ids({ field: 'weight', order: 'desc' })).toEqual(written);
    expect(ids({ field: 'weight', order: 'asc' })).toEqual(written);
    expect(written).not.toEqual(BY_WEIGHT);
  });
});

describe('invoice history sorts by the invoice amount, not by the server\'s net figure', () => {
  const customers = FIXTURES['report-invoice-history'].rows as Parameters<typeof invoiceCustomersView>[0];
  const invoices = FIXTURES['report-invoice-history-customer'].rows as Parameters<typeof invoiceRecordsView>[0];

  it('orders the customers by total_amount, highest first, and the other way round', () => {
    const ids = (order: 'asc' | 'desc') =>
      invoiceCustomersView(customers, INVOICE_HISTORY_CUSTOMERS.toRequest({}, { field: 'amount', order }, staff, today).view).map(row => row.customer_id);
    expect(ids('desc')).toEqual(['c2', 'c3', 'c1', 'c4']);
    expect(ids('asc')).toEqual(['c4', 'c1', 'c3', 'c2']);
    // net_amount would give c2, c3, c4, c1.
    expect(ids('desc')).not.toEqual([...customers].sort((a, b) => b.net_amount - a.net_amount).map(row => row.customer_id));
  });

  it('orders one customer\'s invoices by total, highest first, and the other way round', () => {
    const ids = (order: 'asc' | 'desc') =>
      invoiceRecordsView(invoices, INVOICE_HISTORY_CUSTOMER.toRequest({}, { field: 'total', order }, staff, today).view).map(row => row.invoice_id);
    expect(ids('desc')).toEqual(['i2', 'i3', 'i1', 'i4']);
    expect(ids('asc')).toEqual(['i4', 'i1', 'i3', 'i2']);
    // net_total would give i2, i1, i3, i4.
    expect(ids('desc')).not.toEqual([...invoices].sort((a, b) => b.net_total - a.net_total).map(row => row.invoice_id));
  });

  it('labels both amount sorts "Amount" and keeps their field ids (the PDF sort maps them)', () => {
    const amount = INVOICE_HISTORY_CUSTOMERS.sort!.options.find(option => option.field === 'amount');
    const total = INVOICE_HISTORY_CUSTOMER.sort!.options.find(option => option.field === 'total');
    expect([amount?.label, amount?.kind, total?.label, total?.kind]).toEqual(['Amount', 'amount', 'Amount', 'amount']);
  });
});

describe('the order of rows', () => {
  const rows = [{ id: 'a', n: 10, text: 'A9' }, { id: 'b', n: 9, text: 'a10' }, { id: 'c', n: null, text: '' }, { id: 'd', n: 9, text: 'A9' }];
  const by = { n: (row: (typeof rows)[number]) => row.n, text: (row: (typeof rows)[number]) => row.text };
  const ids = (sort: SortState | undefined) => sortRows(rows, sort, by).map(row => row.id);

  it('sorts numbers as numbers and text as it is read, whatever its case', () => {
    expect(ids({ field: 'n', order: 'asc' })).toEqual(['b', 'd', 'a', 'c']);
    expect(ids({ field: 'text', order: 'asc' })).toEqual(['a', 'd', 'b', 'c']);
  });
  it('puts a row with no value last in either direction, and keeps ties that have no name in the order they came', () => {
    expect(ids({ field: 'n', order: 'desc' })).toEqual(['a', 'b', 'd', 'c']);
    expect(ids({ field: 'text', order: 'desc' })).toEqual(['b', 'a', 'd', 'c']);
  });
  it('leaves the rows as they came for no sort or an unknown one, without changing the array it was given', () => {
    expect(ids(undefined)).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ field: 'unknown', order: 'asc' })).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('rows that tie', () => {
  type Customer = { customer_name: string; bags: number | null };
  const customers: Customer[] = [
    { customer_name: 'Mehta', bags: 100 },
    { customer_name: 'anand', bags: 100 },
    { customer_name: 'Zaveri', bags: 100 },
    { customer_name: 'Bhatt 10', bags: 100 },
    { customer_name: 'Bhatt 9', bags: 100 },
    { customer_name: 'Zzz', bags: 250 },
    { customer_name: 'Aaa', bags: null },
  ];
  const by = { bags: (row: Customer) => row.bags };
  const names = (order: 'asc' | 'desc', tieBreak?: (row: Customer) => string) =>
    sortRows(customers, { field: 'bags', order }, by, tieBreak).map(row => row.customer_name);

  it('are ordered by name, A to Z, in both directions, with a row with no value last', () => {
    expect(names('asc')).toEqual(['anand', 'Bhatt 9', 'Bhatt 10', 'Mehta', 'Zaveri', 'Zzz', 'Aaa']);
    expect(names('desc')).toEqual(['Zzz', 'anand', 'Bhatt 9', 'Bhatt 10', 'Mehta', 'Zaveri', 'Aaa']);
  });
  it('are ordered by the first of the default name keys the row has as a string', () => {
    const rows: Record<string, unknown>[] = [
      { item_name: 'Potato', gr_no: 'A0', n: 1 },
      { gr_no: 'A10', n: 1 },
      { gr_no: 'A9', n: 1 },
      { disp_no: 'D1', n: 1 },
      { invoice_number: 'INV1', n: 1 },
      { name: 'Name', n: 1 },
      { title: 'Chips', n: 1 },
      { key: 'Beet', n: 1 },
      { customer_name: 7, name: 'Zed', n: 1 },
    ];
    const order = sortRows(rows, { field: 'n', order: 'asc' }, { n: row => row.n as number });
    // item_name wins over gr_no ("Potato", not "A0"); a customer_name that is not a string is skipped (name "Zed").
    expect(order.map(row => row.item_name ?? row.gr_no ?? row.disp_no ?? row.invoice_number ?? row.name ?? row.title ?? row.key)).toEqual([
      'A9', 'A10', 'Beet', 'Chips', 'D1', 'INV1', 'Name', 'Potato', 'Zed',
    ]);
  });
  it('are ordered by the tie-break the caller gives, in both directions', () => {
    const byLength = (row: Customer) => String(row.customer_name.length).padStart(2, '0');
    expect(names('asc', byLength)).toEqual(['Mehta', 'anand', 'Zaveri', 'Bhatt 9', 'Bhatt 10', 'Zzz', 'Aaa']);
    expect(names('desc', byLength)).toEqual(['Zzz', 'Mehta', 'anand', 'Zaveri', 'Bhatt 9', 'Bhatt 10', 'Aaa']);
  });
  it('keep the order they came in when the name is the same too', () => {
    const rows = [{ name: 'X', n: 1, i: 1 }, { name: 'x', n: 1, i: 2 }, { name: 'X', n: 1, i: 3 }];
    expect(sortRows(rows, { field: 'n', order: 'desc' }, { n: row => row.n }).map(row => row.i)).toEqual([1, 2, 3]);
  });
});

describe('the days a report asks for', () => {
  it('turns a quick range into days on the day it is read, and takes chosen days as they are', () => {
    expect(reportPeriod({ period: { preset: 'last120' } }, today)).toEqual({ from: '2026-06-15', to: '2026-10-12' });
    expect(reportPeriod({ period: { preset: 'thisFinancialYear' } }, today)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(reportPeriod({ period: { from: '2026-01-01', to: '2026-01-31' } }, today)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
  it('falls back to the last 120 days when there is no period or only half of one', () => {
    expect(reportPeriod({}, today)).toEqual({ from: '2026-06-15', to: '2026-10-12' });
    expect(reportPeriod({ period: { from: '2026-01-01' } }, today)).toEqual({ from: '2026-06-15', to: '2026-10-12' });
  });
  it('knows when no quick range reaches further back, so an empty report suggests no longer period', () => {
    const longest = (preset: string) => isLongestPeriod(reportPeriod({ period: { preset } as never }, today), today);
    expect(longest('last420')).toBe(true);
    expect(['last120', 'last240', 'last364', 'thisMonth', 'lastMonth', 'thisFinancialYear'].filter(longest)).toEqual([]);
    // Days chosen by hand from further back than 420 days are longer still.
    expect(isLongestPeriod({ from: '2025-01-01', to: '2025-12-31' }, today)).toBe(true);
    expect(isLongestPeriod({ from: '2025-08-20', to: '2026-10-12' }, today)).toBe(false);
  });
});

describe('the days a daily average is divided by', () => {
  const days = (from: string, to: string, now: Date = today) => periodDays({ from, to }, now);
  it('counts both ends of the period: one day is 1, a week is 7', () => {
    expect(days('2026-10-05', '2026-10-05')).toBe(1);
    expect(days('2026-09-01', '2026-09-07')).toBe(7);
    expect(days('2026-10-06', '2026-10-12')).toBe(7);
  });
  it('counts a whole month, whatever its length, and the year change', () => {
    expect(days('2026-09-01', '2026-09-30')).toBe(30);
    expect(days('2026-08-01', '2026-08-31')).toBe(31);
    expect(days('2026-03-01', '2026-03-31')).toBe(31);
    expect(days('2025-12-25', '2026-01-03')).toBe(10);
  });
  it('counts the leap day only in a leap year', () => {
    const later = new Date(2028, 2, 10);
    expect(days('2028-02-01', '2028-02-29', later)).toBe(29);
    expect(days('2028-02-28', '2028-03-01', later)).toBe(3);
    expect(days('2027-02-28', '2027-03-01', later)).toBe(2);
  });
  it('stops at today when the period runs past it: the days that have not come are not counted', () => {
    expect(days('2026-10-01', '2026-10-31')).toBe(12);
    expect(days('2026-04-01', '2027-03-31')).toBe(195);
    expect(days('2026-10-12', '2026-10-31')).toBe(1);
  });
  it('is 1 for a period that starts after today, or that ends before it starts', () => {
    expect(days('2026-11-01', '2026-11-30')).toBe(1);
    expect(days('2026-10-13', '2026-10-13')).toBe(1);
    expect(days('2026-10-10', '2026-10-05')).toBe(1);
  });
  it('is the length of a quick range counted from today: 120 days for "Last 120 days", 12 for "This month"', () => {
    const range = (preset: string) => periodDays(reportPeriod({ period: { preset } as never }, today), today);
    expect(range('last120')).toBe(120);
    expect(range('last420')).toBe(420);
    expect(range('thisMonth')).toBe(12);
    expect(range('lastMonth')).toBe(30);
  });
  it('reads today as India does when no day is given: 20:00 UTC on 12 Oct is already 13 Oct in India', () => {
    jest.useFakeTimers({ now: new Date('2026-10-12T20:00:00Z') });
    try {
      expect(periodDays({ from: '2026-10-06', to: '2026-10-31' })).toBe(8);
    } finally {
      jest.useRealTimers();
    }
  });
});
