import { selectCustomerDispatches, type Dispatch } from '../dispatch-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

// The same three dispatches as the backend's tests/list_search.sql, so the app
// rule for customer accounts and the backend rule for warehouse roles agree.
const line = (item_id: string, item_name: string, gr_no: string, disp_qty: number, package_mark: string | null, rack: string | null) => ({
  item_id, item_name, gr_no, disp_qty, package_mark, rack, weight: 5, grn_item_id: `lot-${gr_no}`, grn_qty: 10,
});
const dispatch = (disp_no: string, disp_date: string, customer_name: string, registration: string | null, items: ReturnType<typeof line>[]): Dispatch => ({
  id: disp_no, dispatch_id: disp_no, disp_no, disp_date, customer_id: customer_name, customer_name, registration,
  supervisor_id: null, items, created_at: disp_date, updated_at: disp_date,
});
const SDB9 = dispatch('SDB9', '2026-10-05T10:00:00+05:30', 'Search Lakeview Spices', 'GJ05DS0009', [line('garlic', 'Search Garlic', 'SRB9', 2, 'PKG-RED', 'R7')]);
const SDB10 = dispatch('SDB10', '2026-10-06T10:00:00+05:30', 'Search Lakeview Spices', null, [line('onion', 'Search Onion', 'SRB10', 12, null, null)]);
const SDB100 = dispatch('SDB100', '2026-10-07T10:00:00+05:30', 'Search Hilltop Mart', null, [
  line('garlic', 'Search Garlic', 'SRB100', 2, 'PKG_50%', null),
  line('onion', 'Search Onion', 'SRB100', 40, null, 'R9'),
]);
const ALL = [SDB100, SDB9, SDB10];
const numbers = (filters: Record<string, unknown>, sortBy: 'disp_no' | 'dispatch_date' = 'disp_no', order: 'asc' | 'desc' = 'asc') =>
  selectCustomerDispatches([...ALL], filters, sortBy, order).map(row => row.disp_no);

describe('customer dispatch list: search', () => {
  it('lists everything without a search, and for a blank one', () => {
    expect(numbers({})).toEqual(['SDB9', 'SDB10', 'SDB100']);
    expect(numbers({ search: '   ' })).toEqual(['SDB9', 'SDB10', 'SDB100']);
  });
  it('matches the dispatch number, customer and vehicle number', () => {
    expect(numbers({ search: 'sdb9' })).toEqual(['SDB9']);
    expect(numbers({ search: 'HILLTOP' })).toEqual(['SDB100']);
    expect(numbers({ search: 'gj05ds' })).toEqual(['SDB9']);
  });
  it('matches the item, package, rack and GRN number of a line', () => {
    expect(numbers({ search: 'garlic' })).toEqual(['SDB9', 'SDB100']);
    expect(numbers({ search: 'pkg-red' })).toEqual(['SDB9']);
    expect(numbers({ search: 'r7' })).toEqual(['SDB9']);
    expect(numbers({ search: 'srb9' })).toEqual(['SDB9']);
  });
  it('needs every word; words may match the dispatch and different lines', () => {
    expect(numbers({ search: 'lakeview garlic' })).toEqual(['SDB9']);
    expect(numbers({ search: 'lakeview hilltop' })).toEqual([]);
    expect(numbers({ search: 'garlic r9' })).toEqual(['SDB100']);
  });
  it('takes % and _ literally', () => {
    expect(numbers({ search: '50%' })).toEqual(['SDB100']);
    expect(numbers({ search: 'pkg_red' })).toEqual([]);
  });
});

describe('customer dispatch list: filters', () => {
  it('filters by package on a line', () => {
    expect(numbers({ package_mark: 'pkg-red' })).toEqual(['SDB9']);
    expect(numbers({ package_mark: 'pkg' })).toEqual(['SDB9', 'SDB100']);
    expect(numbers({ package_mark: 'pkg_red' })).toEqual([]);
    expect(numbers({ package_mark: 'pkg', search: 'hilltop' })).toEqual(['SDB100']);
  });
  it('filters number ranges in document order, not as text', () => {
    expect(numbers({ disp_no_from: 'SDB9', disp_no_to: 'SDB10' })).toEqual(['SDB9', 'SDB10']);
    expect(numbers({ disp_no_from: 'SDB10' })).toEqual(['SDB10', 'SDB100']);
    expect(numbers({ disp_no_to: 'SDB9' })).toEqual(['SDB9']);
  });
  it('filters by moments in time', () => {
    expect(numbers({ date_from: '2026-10-05T18:30:00.000Z' })).toEqual(['SDB10', 'SDB100']);
    expect(numbers({ date_to: '2026-10-06T18:29:59.999Z' })).toEqual(['SDB9', 'SDB10']);
    expect(numbers({ date_from: '2026-10-05T18:30:00.000Z', date_to: '2026-10-06T18:29:59.999Z' })).toEqual(['SDB10']);
  });
  it('filters by bags on one line', () => {
    expect(numbers({ disp_qty_min: 10 })).toEqual(['SDB10', 'SDB100']);
    expect(numbers({ disp_qty_max: 5 })).toEqual(['SDB9', 'SDB100']);
    expect(numbers({ disp_qty_min: 10, disp_qty_max: 20 })).toEqual(['SDB10']);
  });
  it('filters by item', () => {
    expect(numbers({ item_ids: ['onion'] })).toEqual(['SDB10', 'SDB100']);
  });
});

describe('customer dispatch list: order', () => {
  it('sorts by number in document order, both ways', () => {
    expect(numbers({}, 'disp_no', 'asc')).toEqual(['SDB9', 'SDB10', 'SDB100']);
    expect(numbers({}, 'disp_no', 'desc')).toEqual(['SDB100', 'SDB10', 'SDB9']);
  });
  it('sorts by date, both ways', () => {
    expect(numbers({}, 'dispatch_date', 'desc')).toEqual(['SDB100', 'SDB10', 'SDB9']);
    expect(numbers({}, 'dispatch_date', 'asc')).toEqual(['SDB9', 'SDB10', 'SDB100']);
  });
});
