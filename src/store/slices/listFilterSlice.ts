/**
 * Filters, search and sort of each list (docs/STYLE_GUIDE.md §14.5).
 *
 * Kept for the session only: this slice is not persisted, and it is cleared on
 * sign-out, forced sign-out, account deletion and a facility switch
 * (src/store/sessionScopedState.ts). Values are stored already normalised, so
 * a default such as "All" is never in here (src/features/filters/filterModel.ts).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FilterValue, FilterValues, SortState } from '@/features/filters/types';
import { logout } from './authSlice';

export interface ListFilterEntry {
  values: FilterValues;
  sort?: SortState;
}
export interface ListFilterState {
  lists: Record<string, ListFilterEntry>;
}

const initialState: ListFilterState = { lists: {} };
const entry = (state: ListFilterState, key: string): ListFilterEntry =>
  (state.lists[key] ??= { values: {} });

const listFilterSlice = createSlice({
  name: 'listFilters',
  initialState,
  reducers: {
    /** Replace a list's filters (and its sort, when given) in one step. */
    applyListFilters(state, action: PayloadAction<{ key: string; values: FilterValues; sort?: SortState }>) {
      const target = entry(state, action.payload.key);
      target.values = action.payload.values;
      if (action.payload.sort) target.sort = action.payload.sort;
    },
    setListFilterField(state, action: PayloadAction<{ key: string; field: string; value: FilterValue | undefined }>) {
      const { key, field, value } = action.payload;
      const target = entry(state, key);
      if (value === undefined) delete target.values[field];
      else target.values[field] = value;
    },
    setListSort(state, action: PayloadAction<{ key: string; sort: SortState }>) {
      entry(state, action.payload.key).sort = action.payload.sort;
    },
    /** Clear one list's filters and search. Its sort and every other list are untouched. */
    clearListFilters(state, action: PayloadAction<{ key: string }>) {
      entry(state, action.payload.key).values = {};
    },
    /** Session teardown: forget every list. */
    resetAllListFilters() {
      return initialState;
    },
  },
  extraReducers: builder => {
    builder.addCase(logout.fulfilled, () => initialState);
  },
});

export const { applyListFilters, setListFilterField, setListSort, clearListFilters, resetAllListFilters } =
  listFilterSlice.actions;
export default listFilterSlice.reducer;

const EMPTY: ListFilterEntry = { values: {} };
export const selectListFilters = (state: { listFilters: ListFilterState }, key: string): ListFilterEntry =>
  state.listFilters.lists[key] ?? EMPTY;
