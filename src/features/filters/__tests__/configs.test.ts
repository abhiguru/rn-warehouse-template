import {
  DISPATCH_FILTERS,
  FILTER_CONFIGS,
  GRN_FILTERS,
  INVOICE_FILTERS,
  ITEM_PRICING_FILTERS,
  ORDER_FILTERS,
  ORDER_QUEUE_FILTERS,
} from '../configs';
import { isFieldActive, visibleFields } from '../filterModel';
import type { FilterContext, FilterFieldDef, FilterListConfig, FilterValue } from '../types';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const today = new Date(2026, 9, 10, 2, 0);
const contexts: Record<string, FilterContext> = {
  staff: { role: 'staff', isWarehouseRole: true, assignedCustomers: [] },
  'customer with two customers': {
    role: 'customer',
    isWarehouseRole: false,
    assignedCustomers: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }],
  },
  'customer with one customer': { role: 'customer', isWarehouseRole: false, assignedCustomers: [{ id: 'c1', label: 'A' }] },
};

/** A value that turns the field on, whatever its kind. */
function sample(field: FilterFieldDef): FilterValue {
  switch (field.kind) {
    case 'choice':
      return field.options.find(option => option.value !== field.defaultValue)!.value;
    case 'toggle':
      return true;
    case 'text':
      return 'sample';
    case 'picker':
      return [{ id: 'id-1', label: 'Sample' }];
    case 'dateRange':
      return { from: '2026-09-01', to: '2026-09-30' };
    case 'numberRange':
      return { min: 3, max: 7 };
    case 'textRange':
      return { from: 'A0001', to: 'A0009' };
  }
}

const configs: FilterListConfig<unknown>[] = [GRN_FILTERS as FilterListConfig<unknown>, DISPATCH_FILTERS as FilterListConfig<unknown>, INVOICE_FILTERS as FilterListConfig<unknown>,
  ORDER_FILTERS as FilterListConfig<unknown>,
  ORDER_QUEUE_FILTERS as FilterListConfig<unknown>,
  ITEM_PRICING_FILTERS as FilterListConfig<unknown>,
];

describe.each(configs.map(config => [config.listKey, config] as const))('filter config %s', (_key, config) => {
  it('is registered for the Sort and filter page', () => {
    expect(FILTER_CONFIGS[config.listKey]).toBeDefined();
  });

  it('has unique field keys and only known fast filters', () => {
    const keys = config.fields.map(field => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of config.fastFilters) expect(keys).toContain(key);
    if (config.search?.dateField) expect(keys).toContain(config.search.dateField);
    if (config.search?.rangeField) expect(keys).toContain(config.search.rangeField);
  });

  // The guard against "shown but never sent": a field the account can see must change the request.
  describe.each(Object.entries(contexts))('for a %s', (_name, ctx) => {
    const empty = JSON.stringify(config.toRequest({}, undefined, ctx, today));
    const shown = visibleFields(config, ctx).map(field => [field.key, field] as const);
    // A list with a search and no filters (the Queue) has nothing to check here.
    (shown.length > 0 ? it.each(shown) : it.skip.each([['none', undefined as never]]))('sends the "%s" filter', (_fieldKey, field) => {
      const value = sample(field);
      expect(isFieldActive(field, value)).toBe(true);
      expect(JSON.stringify(config.toRequest({ [field.key]: value }, undefined, ctx, today))).not.toBe(empty);
    });

    if (config.search) {
      it('sends the search text', () => {
        expect(JSON.stringify(config.toRequest({ search: 'garlic' }, undefined, ctx, today))).not.toBe(empty);
      });
    }
    if (config.sort) {
      it('sends every sort field and both directions', () => {
        const seen = new Set<string>();
        for (const option of config.sort!.options) {
          for (const order of ['asc', 'desc'] as const) {
            seen.add(JSON.stringify(config.toRequest({}, { field: option.field, order }, ctx, today)));
          }
        }
        expect(seen.size).toBe(config.sort!.options.length * 2);
      });
    }
  });
});

describe('GRN request', () => {
  const staff = contexts.staff;
  it('maps every filter to its backend parameter', () => {
    const request = GRN_FILTERS.toRequest(
      {
        stock: 'out_of_stock',
        customers: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }],
        items: [{ id: 'i1', label: 'Garlic' }],
        numberRange: { from: ' A0010 ', to: 'A0020' },
        weight: { min: 10.4, max: 50 },
        package: ' red ',
        search: 'lakeview garlic',
      },
      { field: 'date', order: 'asc' },
      staff,
      today
    );
    expect(request).toEqual({
      p_sort_by: 'date',
      p_sort_order: 'asc',
      p_filters: {
        stock_status: 'out_of_stock',
        customer_ids: ['c1', 'c2'],
        item_ids: ['i1'],
        gr_no_from: 'A0010',
        gr_no_to: 'A0020',
        weight_min: 10,
        weight_max: 50,
        package_mark: 'red',
        search: 'lakeview garlic',
      },
    });
  });

  it('sends no filters object and the default sort when nothing is set', () => {
    expect(GRN_FILTERS.toRequest({ stock: 'all' }, undefined, staff, today)).toEqual({ p_sort_by: 'gr_no', p_sort_order: 'desc' });
  });

  it('covers the whole of the last day of a date range', () => {
    const request = GRN_FILTERS.toRequest({ date: { from: '2026-09-01', to: '2026-09-30' } }, undefined, staff, today);
    expect(new Date(request.p_date_from!)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(new Date(request.p_date_to!)).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it('turns a date and a range typed in the search into filters, and searches for the rest', () => {
    const request = GRN_FILTERS.toRequest({ search: 'garlic 7 oct A0010-A0012' }, undefined, staff, today);
    expect(request.p_filters).toEqual({ gr_no_from: 'A0010', gr_no_to: 'A0012', search: 'garlic' });
    expect(new Date(request.p_date_from!)).toEqual(new Date(2026, 9, 7));
    expect(new Date(request.p_date_to!)).toEqual(new Date(2026, 9, 7, 23, 59, 59, 999));
  });

  it('lets a filter set by hand win over the same thing typed in the search', () => {
    const request = GRN_FILTERS.toRequest({ search: 'today', date: { from: '2026-01-01', to: '2026-01-31' } }, undefined, staff, today);
    expect(new Date(request.p_date_from!)).toEqual(new Date(2026, 0, 1));
    expect(request.p_filters).toEqual({ search: 'today' });
  });
});

describe('dispatch request', () => {
  const staff = contexts.staff;
  it('maps every filter to its backend key', () => {
    const request = DISPATCH_FILTERS.toRequest(
      {
        customers: [{ id: 'c1', label: 'A' }],
        items: [{ id: 'i1', label: 'Garlic' }],
        numberRange: { from: ' DD0009 ', to: 'DD0010' },
        bags: { min: 5.4, max: 40 },
        package: ' red ',
        date: { from: '2026-09-01', to: '2026-09-30' },
        search: 'lakeview garlic',
      },
      { field: 'disp_no', order: 'asc' },
      staff,
      today
    );
    expect(request).toEqual({
      p_sort_by: 'disp_no',
      p_sort_order: 'asc',
      p_filters: {
        customer_ids: ['c1'],
        item_ids: ['i1'],
        disp_no_from: 'DD0009',
        disp_no_to: 'DD0010',
        disp_qty_min: 5,
        disp_qty_max: 40,
        package_mark: 'red',
        search: 'lakeview garlic',
        date_from: new Date(2026, 8, 1).toISOString(),
        date_to: new Date(2026, 8, 30, 23, 59, 59, 999).toISOString(),
      },
    });
  });

  it('sorts by date, newest first, with no filters by default', () => {
    expect(DISPATCH_FILTERS.toRequest({}, undefined, staff, today)).toEqual({ p_sort_by: 'dispatch_date', p_sort_order: 'desc', p_filters: {} });
  });

  it('turns a date and a range typed in the search into filters', () => {
    const request = DISPATCH_FILTERS.toRequest({ search: 'garlic 7 oct DD0010-DD0012' }, undefined, staff, today);
    expect(request.p_filters).toEqual({
      disp_no_from: 'DD0010',
      disp_no_to: 'DD0012',
      search: 'garlic',
      date_from: new Date(2026, 9, 7).toISOString(),
      date_to: new Date(2026, 9, 7, 23, 59, 59, 999).toISOString(),
    });
  });
});

describe('invoice request', () => {
  const staff = contexts.staff;
  it('maps every filter to its backend parameter', () => {
    const request = INVOICE_FILTERS.toRequest(
      {
        customers: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }],
        year: '2025',
        numberRange: { min: 10, max: 20 },
        grn: ' dv01 ',
        date: { from: '2026-09-01', to: '2026-09-30' },
        search: 'lakeview',
      },
      { field: 'total', order: 'asc' },
      staff,
      today
    );
    expect(request).toEqual({
      p_sort_field: 'total',
      p_sort_direction: 'asc',
      p_customer_ids: ['c1', 'c2'],
      p_financial_year: 2025,
      p_inv_no_from: 10,
      p_inv_no_to: 20,
      p_search_grn_no: 'dv01',
      p_search: 'lakeview',
      p_date_from: new Date(2026, 8, 1).toISOString(),
      p_date_to: new Date(2026, 8, 30, 23, 59, 59, 999).toISOString(),
    });
  });

  it('sorts by date, newest first, and sends nothing else by default', () => {
    expect(INVOICE_FILTERS.toRequest({ year: 'all' }, undefined, staff, today)).toEqual({ p_sort_field: 'inv_date', p_sort_direction: 'desc' });
  });

  it('reads a financial year and a number range from the search', () => {
    expect(INVOICE_FILTERS.toRequest({ search: 'fy 2025 sunrise 10-20' }, undefined, staff, today)).toEqual({
      p_sort_field: 'inv_date',
      p_sort_direction: 'desc',
      p_financial_year: 2025,
      p_inv_no_from: 10,
      p_inv_no_to: 20,
      p_search: 'sunrise',
    });
  });

  it('searches for "2026-12" as text: it is an invoice written with its year, not a range', () => {
    expect(INVOICE_FILTERS.toRequest({ search: '2026-12' }, undefined, staff, today)).toMatchObject({ p_search: '2026-12' });
    expect(INVOICE_FILTERS.toRequest({ search: '2026-12' }, undefined, staff, today).p_inv_no_from).toBeUndefined();
  });

  it('lets a year chosen by hand win over one typed in the search', () => {
    const request = INVOICE_FILTERS.toRequest({ search: 'fy 2025', year: '2026' }, undefined, staff, today);
    expect(request.p_financial_year).toBe(2026);
    expect(request.p_search).toBe('fy 2025');
  });
});

describe('order requests', () => {
  const staff = contexts.staff;
  it('sends nothing by default, then the toggle and the search', () => {
    expect(ORDER_FILTERS.toRequest({}, undefined, staff, today)).toEqual({});
    expect(ORDER_FILTERS.toRequest({ withItems: true, search: '  lakeview   garlic ' }, undefined, staff, today)).toEqual({
      has_items: true,
      search: 'lakeview garlic',
    });
  });
  it('never reads a date or a range from an order search', () => {
    expect(ORDER_FILTERS.toRequest({ search: 'today 7 oct A0010-A0020' }, undefined, staff, today)).toEqual({ search: 'today 7 oct A0010-A0020' });
  });
  it('always asks the queue for orders with items', () => {
    expect(ORDER_QUEUE_FILTERS.toRequest({}, undefined, staff, today)).toEqual({ has_items: true });
    expect(ORDER_QUEUE_FILTERS.toRequest({ search: 'rajkot' }, undefined, staff, today)).toEqual({ has_items: true, search: 'rajkot' });
  });
});

describe('item pricing request', () => {
  const staff = contexts.staff;
  it('sends no filters by default', () => {
    expect(ITEM_PRICING_FILTERS.toRequest({ priceType: 'all' }, undefined, staff, today)).toEqual({});
  });
  it('maps every filter, with the effective dates as whole days', () => {
    expect(
      ITEM_PRICING_FILTERS.toRequest(
        {
          items: [{ id: 'i1', label: 'Garlic' }],
          customers: [{ id: 'c1', label: 'A' }],
          priceType: 'monthly',
          weight: { min: 10.5, max: 50 },
          effective: { from: '2026-09-01', to: '2026-09-30' },
          expired: true,
        },
        undefined,
        staff,
        today
      )
    ).toEqual({
      p_filters: {
        item_ids: ['i1'],
        customer_ids: ['c1'],
        price_type: 'monthly',
        weight_min: 10.5,
        weight_max: 50,
        effective_from: '2026-09-01',
        effective_to: '2026-09-30',
        include_expired: true,
      },
    });
  });
});
