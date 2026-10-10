import { DISPATCH_FILTERS, FILTER_CONFIGS, GRN_FILTERS } from '../configs';
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

const configs: FilterListConfig<unknown>[] = [GRN_FILTERS as FilterListConfig<unknown>, DISPATCH_FILTERS as FilterListConfig<unknown>];

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
    it.each(visibleFields(config, ctx).map(field => [field.key, field] as const))('sends the "%s" filter', (_fieldKey, field) => {
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
