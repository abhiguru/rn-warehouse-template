import reducer, {
  applyListFilters,
  clearListFilters,
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
      expect(reducer(before, logout.fulfilled(undefined, 'request-1', undefined))).toEqual({ lists: {} });
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
});
