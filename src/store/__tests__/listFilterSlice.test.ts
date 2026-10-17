import reducer, {
  applyListFilters,
  clearListFilters,
  clearListFilterScope,
  resetAllListFilters,
  selectListFilters,
  setListFilterField,
  setListSort,
} from '../slices/listFilterSlice';
import { logout } from '../slices/authSlice';

// The test, not the slice, loads the real auth slice: it needs the thunk's action types. The slice
// itself must not import it (src/tests/storeRequireCycle.test.ts guards that). Its heavy dependencies
// are stubbed.
jest.mock('@/config/supabaseConfig', () => ({}));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('../sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));

describe('list filter slice', () => {
  const withTwoLists = () => {
    let state = reducer(undefined, applyListFilters({ key: 'grn-list', values: { stock: 'in_stock' }, sort: { field: 'date', order: 'asc' } }));
    state = reducer(state, applyListFilters({ key: 'dispatch-list', values: { search: 'garlic' } }));
    return state;
  };

  it('clears one list and leaves every other list and the sort alone', () => {
    const state = reducer(withTwoLists(), clearListFilters({ key: 'grn-list' }));
    expect(state.lists['grn-list']).toEqual({ values: {}, sort: { field: 'date', order: 'asc' } });
    expect(state.lists['dispatch-list'].values).toEqual({ search: 'garlic' });
  });

  it('sets and removes a single field', () => {
    let state = reducer(withTwoLists(), setListFilterField({ key: 'grn-list', field: 'package', value: 'red' }));
    expect(state.lists['grn-list'].values).toEqual({ stock: 'in_stock', package: 'red' });
    state = reducer(state, setListFilterField({ key: 'grn-list', field: 'stock', value: undefined }));
    expect(state.lists['grn-list'].values).toEqual({ package: 'red' });
  });

  it('keeps the sort when filters are applied without one, and sets it on its own', () => {
    let state = reducer(withTwoLists(), applyListFilters({ key: 'grn-list', values: {} }));
    expect(state.lists['grn-list'].sort).toEqual({ field: 'date', order: 'asc' });
    state = reducer(state, setListSort({ key: 'grn-list', sort: { field: 'gr_no', order: 'desc' } }));
    expect(state.lists['grn-list'].sort).toEqual({ field: 'gr_no', order: 'desc' });
  });

  it('forgets every list on session teardown', () => {
    expect(reducer(withTwoLists(), resetAllListFilters())).toEqual({ lists: {} });
  });

  describe('sign-out', () => {
    it('the logout thunk still has the type string the slice matches', () => {
      expect(logout.fulfilled.type).toBe('auth/logout/fulfilled');
    });

    it('resets list filters that had values when logout is fulfilled', () => {
      const before = withTwoLists();
      expect(before.lists['grn-list'].values).toEqual({ stock: 'in_stock' });
      expect(before.lists['dispatch-list'].values).toEqual({ search: 'garlic' });
      expect(reducer(before, logout.fulfilled({ localCleared: true }, 'request-1', undefined))).toEqual({ lists: {} });
    });

    it('keeps list filters while logout is pending or after it is rejected', () => {
      const before = withTwoLists();
      expect(reducer(before, logout.pending('request-1', undefined))).toEqual(before);
      expect(reducer(before, logout.rejected(new Error('offline'), 'request-1', undefined))).toEqual(before);
    });
  });

  it('gives an unknown list empty values', () => {
    expect(selectListFilters({ listFilters: withTwoLists() }, 'never-used')).toEqual({ values: {} });
  });

  // SR-06: one customer's search must not narrow another customer's report.
  describe('scoped search', () => {
    const KEY = 'report-grn-activity-customer';
    const scoped = () => {
      let state = reducer(undefined, applyListFilters({ key: KEY, values: { search: 'E0014', invoicing: 'not_invoiced' }, scope: 'c1' }));
      state = reducer(state, applyListFilters({ key: KEY, values: { search: 'A0006', invoicing: 'not_invoiced' }, scope: 'c2' }));
      return state;
    };

    it('keeps the search of each scope apart and the other choices shared', () => {
      const state = scoped();
      expect(state.lists[KEY].values).toEqual({ invoicing: 'not_invoiced' });
      expect(state.lists[KEY].searches).toEqual({ c1: 'E0014', c2: 'A0006' });
    });

    it('a scoped write without a search forgets that scope only', () => {
      const state = reducer(scoped(), applyListFilters({ key: KEY, values: { invoicing: 'invoiced' }, scope: 'c2' }));
      expect(state.lists[KEY].searches).toEqual({ c1: 'E0014' });
      expect(state.lists[KEY].values).toEqual({ invoicing: 'invoiced' });
    });

    it('keeps the "search as text" flag per scope', () => {
      let state = reducer(scoped(), setListFilterField({ key: KEY, field: 'searchLiteral', value: true, scope: 'c1' }));
      expect(state.lists[KEY].searchLiterals).toEqual({ c1: true });
      expect(state.lists[KEY].values).toEqual({ invoicing: 'not_invoiced' });
      state = reducer(state, applyListFilters({ key: KEY, values: { search: 'E0015' }, scope: 'c1' }));
      expect(state.lists[KEY].searchLiterals).toEqual({});
      state = reducer(state, applyListFilters({ key: KEY, values: { search: 'E0015', searchLiteral: true }, scope: 'c1' }));
      expect(state.lists[KEY].searchLiterals).toEqual({ c1: true });
    });

    it('a scoped field write of the search goes to the scope, any other field to the shared values', () => {
      let state = reducer(scoped(), setListFilterField({ key: KEY, field: 'search', value: 'B0001', scope: 'c3' }));
      expect(state.lists[KEY].searches).toEqual({ c1: 'E0014', c2: 'A0006', c3: 'B0001' });
      state = reducer(state, setListFilterField({ key: KEY, field: 'search', value: undefined, scope: 'c1' }));
      expect(state.lists[KEY].searches).toEqual({ c2: 'A0006', c3: 'B0001' });
      state = reducer(state, setListFilterField({ key: KEY, field: 'invoicing', value: 'invoiced', scope: 'c1' }));
      expect(state.lists[KEY].values).toEqual({ invoicing: 'invoiced' });
    });

    it('clearing a scope forgets its search and keeps the choices unless asked', () => {
      let state = reducer(scoped(), setListSort({ key: KEY, sort: { field: 'number', order: 'asc' } }));
      state = reducer(state, clearListFilterScope({ key: KEY, scope: 'c1' }));
      expect(state.lists[KEY]).toEqual({
        values: { invoicing: 'not_invoiced' },
        sort: { field: 'number', order: 'asc' },
        searches: { c2: 'A0006' },
        searchLiterals: undefined,
      } as never);
      state = reducer(state, clearListFilterScope({ key: KEY, scope: 'c2', choices: true }));
      expect(state.lists[KEY].values).toEqual({});
      expect(state.lists[KEY].searches).toEqual({});
      expect(state.lists[KEY].sort).toEqual({ field: 'number', order: 'asc' });
    });

    it('clearing a scope with its choices keeps the list\'s unscoped search (an all-customers view)', () => {
      let state = reducer(undefined, applyListFilters({ key: 'report-item-stock', values: { search: 'garlic' } }));
      state = reducer(state, applyListFilters({ key: 'report-item-stock', values: { search: 'cumin' }, scope: 'c1' }));
      expect(state.lists['report-item-stock'].values).toEqual({ search: 'garlic' });
      state = reducer(state, clearListFilterScope({ key: 'report-item-stock', scope: 'c1', choices: true }));
      expect(state.lists['report-item-stock'].values).toEqual({ search: 'garlic' });
      expect(state.lists['report-item-stock'].searches).toEqual({});
    });

    it('clearing a scope of a list never used adds nothing', () => {
      expect(reducer(undefined, clearListFilterScope({ key: KEY, scope: 'c1', choices: true }))).toEqual({ lists: {} });
    });

    it('forgets every scope on sign-out', () => {
      expect(reducer(scoped(), logout.fulfilled({ localCleared: true }, 'request-1', undefined))).toEqual({ lists: {} });
    });
  });
});
