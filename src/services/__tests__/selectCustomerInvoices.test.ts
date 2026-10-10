import { selectCustomerInvoices, type AssignedCustomerInvoiceParams, type Invoice } from '../invoice-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

// The same three invoices as the backend's tests/list_search.sql, so the app
// rule for customer accounts and the backend rule for warehouse roles agree.
const invoice = (year: number, number: number, date: string, customer: string, grNo: string, total: number): Invoice =>
  ({
    invoice_id: `${year}-${number}`,
    invoice_number: number,
    inv_fin_year: year,
    invoice_date: date,
    total,
    customer: { id: customer, name: customer },
    grn: { gr_no: grNo },
  }) as unknown as Invoice;
const A = invoice(2026, 12, '2026-10-06T10:00:00+05:30', 'Search Lakeview Spices', 'SRB9', 300);
const B = invoice(2026, 120, '2026-10-07T10:00:00+05:30', 'Search Hilltop Mart', 'SRB100', 100);
const C = invoice(2025, 7, '2025-09-01T10:00:00+05:30', 'Search Lakeview Spices', 'SRB10', 200);
const ids = (params: AssignedCustomerInvoiceParams) => selectCustomerInvoices([C, A, B], params).map(row => row.invoice_id);

describe('customer invoice list: search', () => {
  it('lists everything, newest first, without a search and for a blank one', () => {
    expect(ids({})).toEqual(['2026-120', '2026-12', '2025-7']);
    expect(ids({ p_search: '  ' })).toEqual(['2026-120', '2026-12', '2025-7']);
  });
  it('matches the number, also written with its year and padded', () => {
    expect(ids({ p_search: '120' })).toEqual(['2026-120']);
    expect(ids({ p_search: '2026-12' })).toEqual(['2026-120', '2026-12']);
    expect(ids({ p_search: '2026-0012' })).toEqual(['2026-12']);
  });
  it('matches the customer and the GRN number', () => {
    expect(ids({ p_search: 'hilltop' })).toEqual(['2026-120']);
    expect(ids({ p_search: 'srb9' })).toEqual(['2026-12']);
  });
  it('needs every word, each in any column', () => {
    expect(ids({ p_search: 'lakeview srb10' })).toEqual(['2025-7']);
    expect(ids({ p_search: 'lakeview hilltop' })).toEqual([]);
  });
  it('takes % literally', () => {
    expect(ids({ p_search: '%' })).toEqual([]);
  });
});

describe('customer invoice list: filters', () => {
  it('filters by moments in time', () => {
    expect(ids({ p_date_from: '2026-10-05T18:30:00.000Z' })).toEqual(['2026-120', '2026-12']);
    expect(ids({ p_date_to: '2026-01-01T00:00:00.000Z' })).toEqual(['2025-7']);
    expect(ids({ p_date_from: '2026-10-05T18:30:00.000Z', p_date_to: '2026-10-06T18:29:59.999Z' })).toEqual(['2026-12']);
  });
  it('filters by several customers; an empty list is no filter', () => {
    expect(ids({ p_customer_ids: ['Search Lakeview Spices'] })).toEqual(['2026-12', '2025-7']);
    expect(ids({ p_customer_ids: ['Search Lakeview Spices', 'Search Hilltop Mart'] })).toEqual(['2026-120', '2026-12', '2025-7']);
    expect(ids({ p_customer_ids: [] })).toEqual(['2026-120', '2026-12', '2025-7']);
  });
  it('filters by financial year, number range and GRN number', () => {
    expect(ids({ p_financial_year: 2026 })).toEqual(['2026-120', '2026-12']);
    expect(ids({ p_inv_no_from: 10, p_inv_no_to: 20 })).toEqual(['2026-12']);
    expect(ids({ p_search_grn_no: 'srb10' })).toEqual(['2026-120', '2025-7']);
  });
  it('combines new and old filters', () => {
    expect(ids({ p_customer_ids: ['Search Lakeview Spices'], p_search: 'srb9', p_financial_year: 2026 })).toEqual(['2026-12']);
  });
});

describe('customer invoice list: order', () => {
  it('sorts by date', () => {
    expect(ids({ p_sort_field: 'inv_date', p_sort_direction: 'asc' })).toEqual(['2025-7', '2026-12', '2026-120']);
    expect(ids({ p_sort_field: 'inv_date', p_sort_direction: 'desc' })).toEqual(['2026-120', '2026-12', '2025-7']);
  });
  it('sorts by number', () => {
    expect(ids({ p_sort_field: 'inv_no', p_sort_direction: 'asc' })).toEqual(['2025-7', '2026-12', '2026-120']);
    expect(ids({ p_sort_field: 'inv_no', p_sort_direction: 'desc' })).toEqual(['2026-120', '2026-12', '2025-7']);
  });
  it('sorts by customer, newest first within a customer', () => {
    expect(ids({ p_sort_field: 'customer_name', p_sort_direction: 'asc' })).toEqual(['2026-120', '2026-12', '2025-7']);
    expect(ids({ p_sort_field: 'customer_name', p_sort_direction: 'desc' })).toEqual(['2026-12', '2025-7', '2026-120']);
  });
  it('sorts by total', () => {
    expect(ids({ p_sort_field: 'total', p_sort_direction: 'asc' })).toEqual(['2026-120', '2025-7', '2026-12']);
    expect(ids({ p_sort_field: 'total', p_sort_direction: 'desc' })).toEqual(['2026-12', '2025-7', '2026-120']);
  });
});
