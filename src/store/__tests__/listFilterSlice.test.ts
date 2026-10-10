import reducer, {
  applyListFilters,
  clearListFilters,
  resetAllListFilters,
  selectListFilters,
  setListFilterField,
  setListSort,
} from '../slices/listFilterSlice';

jest.mock('../slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } } }));

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

  it('gives an unknown list empty values', () => {
    expect(selectListFilters({ listFilters: withTwoLists() }, 'never-used')).toEqual({ values: {} });
  });
});
