/**
 * Filters, search and sort of each list (docs/STYLE_GUIDE.md §14.5).
 *
 * Kept for the session only: this slice is not persisted, and it is cleared on
 * sign-out, forced sign-out, account deletion and a facility switch
 * (src/store/sessionScopedState.ts). Values are stored already normalised, so
 * a default such as "All" is never in here (src/features/filters/filterModel.ts).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { SEARCH_KEY, SEARCH_LITERAL_KEY, type FilterValue, type FilterValues, type SortState } from '@/features/filters/types';

/**
 * One list's stored filters.
 *
 * A list shown for one of several things (a customer's report, one per customer) keeps its
 * search per scope: a GRN number searched for one customer must not narrow the next
 * customer's report (review 2026-10-13, SR-06). The other choices (payment, age bucket,
 * invoicing) are shared by every scope of the list, and so is the sort. A write that names a
 * `scope` puts the search and its "search as text" flag in that scope's maps, never in
 * `values`; a search in `values` is the list's unscoped one (item stock for all customers,
 * which shares its key with one customer's item stock) and a scoped write leaves it alone.
 */
export interface ListFilterEntry {
  values: FilterValues;
  sort?: SortState;
  /** The search typed in each scope, by scope. */
  searches?: Record<string, string>;
  /** The scopes whose search is read as text (the recognition was dismissed there). */
  searchLiterals?: Record<string, true>;
}
export interface ListFilterState {
  lists: Record<string, ListFilterEntry>;
}

const initialState: ListFilterState = { lists: {} };
const entry = (state: ListFilterState, key: string): ListFilterEntry =>
  (state.lists[key] ??= { values: {} });

/** Put `scope`'s search (or none) and its text flag in the scope maps. */
function setScopeSearch(target: ListFilterEntry, scope: string, search: FilterValue | undefined, literal: FilterValue | undefined) {
  if (typeof search === 'string' && search.trim() !== '') (target.searches ??= {})[scope] = search;
  else if (target.searches) delete target.searches[scope];
  if (literal === true) (target.searchLiterals ??= {})[scope] = true;
  else if (target.searchLiterals) delete target.searchLiterals[scope];
}

/** The values without the search and its flag. */
function withoutSearch(values: FilterValues): FilterValues {
  const rest = { ...values };
  delete rest[SEARCH_KEY];
  delete rest[SEARCH_LITERAL_KEY];
  return rest;
}

/** Only the search and its flag, of those that are set. */
function onlySearch(values: FilterValues): FilterValues {
  const kept: FilterValues = {};
  if (values[SEARCH_KEY] !== undefined) kept[SEARCH_KEY] = values[SEARCH_KEY];
  if (values[SEARCH_LITERAL_KEY] !== undefined) kept[SEARCH_LITERAL_KEY] = values[SEARCH_LITERAL_KEY];
  return kept;
}

const listFilterSlice = createSlice({
  name: 'listFilters',
  initialState,
  reducers: {
    /**
     * Replace a list's filters (and its sort, when given) in one step. With a `scope`, the
     * search in `values` is that scope's, and the other values are the list's shared ones.
     */
    applyListFilters(state, action: PayloadAction<{ key: string; values: FilterValues; sort?: SortState; scope?: string }>) {
      const { key, values, sort, scope } = action.payload;
      const target = entry(state, key);
      if (scope === undefined) {
        target.values = values;
      } else {
        // The list's own (unscoped) search, if it has one, belongs to its unscoped view: kept.
        target.values = { ...withoutSearch(values), ...onlySearch(target.values) };
        setScopeSearch(target, scope, values[SEARCH_KEY], values[SEARCH_LITERAL_KEY]);
      }
      if (sort) target.sort = sort;
    },
    setListFilterField(state, action: PayloadAction<{ key: string; field: string; value: FilterValue | undefined; scope?: string }>) {
      const { key, field, value, scope } = action.payload;
      const target = entry(state, key);
      if (scope !== undefined && field === SEARCH_KEY) {
        setScopeSearch(target, scope, value, value === undefined ? undefined : target.searchLiterals?.[scope]);
      } else if (scope !== undefined && field === SEARCH_LITERAL_KEY) {
        setScopeSearch(target, scope, target.searches?.[scope], value);
      } else if (value === undefined) {
        delete target.values[field];
      } else {
        target.values[field] = value;
      }
    },
    setListSort(state, action: PayloadAction<{ key: string; sort: SortState }>) {
      entry(state, action.payload.key).sort = action.payload.sort;
    },
    /** Clear one list's filters and search. Its sort and every other list are untouched. */
    clearListFilters(state, action: PayloadAction<{ key: string }>) {
      entry(state, action.payload.key).values = {};
    },
    /**
     * Forget one scope's search (opening a customer's report afresh). With `choices`, the
     * list's shared choices go too ("View all" means all). The sort, the other scopes'
     * searches, the list's unscoped search and every other list are untouched.
     */
    clearListFilterScope(state, action: PayloadAction<{ key: string; scope: string; choices?: boolean }>) {
      const { key, scope, choices = false } = action.payload;
      const target = state.lists[key];
      if (!target) return;
      setScopeSearch(target, scope, undefined, undefined);
      // The list's own (unscoped) search, if it has one, belongs to its unscoped view: kept.
      if (choices) target.values = onlySearch(target.values);
    },
    /** Session teardown: forget every list. */
    resetAllListFilters() {
      return initialState;
    },
  },
  extraReducers: builder => {
    // Matched by type string, not by importing the `logout` thunk from the auth slice: that import
    // closes a require cycle (this slice -> auth slice -> sessionScopedState -> this slice).
    // Must equal `logout.fulfilled.type`: the thunk's 'auth/logout' prefix plus '/fulfilled'.
    builder.addCase('auth/logout/fulfilled', () => initialState);
  },
});

export const {
  applyListFilters,
  setListFilterField,
  setListSort,
  clearListFilters,
  clearListFilterScope,
  resetAllListFilters,
} = listFilterSlice.actions;
export default listFilterSlice.reducer;

const EMPTY: ListFilterEntry = { values: {} };
export const selectListFilters = (state: { listFilters: ListFilterState }, key: string): ListFilterEntry =>
  state.listFilters.lists[key] ?? EMPTY;
