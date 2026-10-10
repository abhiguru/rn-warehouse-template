/**
 * A list's filters, search and sort, and the request they stand for.
 * Changes apply at once; there is no debounce here (the search field debounces
 * its own typing).
 */
import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  applyListFilters,
  clearListFilters,
  selectListFilters,
  setListFilterField,
  setListSort,
} from '@/store/slices/listFilterSlice';
import { countActiveFilters, currentSort, hasAnyFilter, normalizeValues, visibleFields } from './filterModel';
import {
  SEARCH_KEY,
  SEARCH_LITERAL_KEY,
  type FilterContext,
  type FilterListConfig,
  type FilterValue,
  type FilterValues,
  type SortState,
} from './types';

export function useFilterContext(): FilterContext {
  const profile = useAppSelector(state => state.auth.userProfile);
  return useMemo(() => {
    const role = profile?.role ?? null;
    const isWarehouseRole = role === 'admin' || role === 'supervisor' || role === 'staff';
    const named = profile?.assignedCustomers?.map(customer => ({ id: customer.id, label: customer.name }));
    const assigned = named ?? (profile?.assignedCustomerIds ?? []).map(id => ({ id, label: '' }));
    return { role, isWarehouseRole, assignedCustomers: isWarehouseRole ? [] : assigned };
  }, [profile?.role, profile?.assignedCustomers, profile?.assignedCustomerIds]);
}

export function useListFilters<TRequest>(config: FilterListConfig<TRequest>) {
  const dispatch = useAppDispatch();
  const ctx = useFilterContext();
  const stored = useAppSelector(state => selectListFilters(state, config.listKey));
  const key = config.listKey;

  const values = stored.values;
  const sort = currentSort(config, stored.sort);
  const request = useMemo(() => config.toRequest(values, sort, ctx), [config, values, sort, ctx]);
  const fields = useMemo(() => visibleFields(config, ctx), [config, ctx]);

  const apply = useCallback(
    (next: FilterValues, nextSort?: SortState) =>
      dispatch(applyListFilters({ key, values: normalizeValues(config, next, ctx), sort: nextSort })),
    [dispatch, key, config, ctx]
  );
  const setField = useCallback(
    (field: string, value: FilterValue | undefined) => {
      const normalised = normalizeValues(config, { ...values, [field]: value }, ctx);
      dispatch(applyListFilters({ key, values: normalised }));
    },
    [dispatch, key, config, ctx, values]
  );
  const setSearch = useCallback(
    (text: string) => {
      // New text means a new reading: forget that an earlier recognition was dismissed.
      const next = { ...values, [SEARCH_KEY]: text, [SEARCH_LITERAL_KEY]: undefined };
      dispatch(applyListFilters({ key, values: normalizeValues(config, next, ctx) }));
    },
    [dispatch, key, config, ctx, values]
  );
  const searchAsText = useCallback(
    () => dispatch(setListFilterField({ key, field: SEARCH_LITERAL_KEY, value: true })),
    [dispatch, key]
  );
  const setSort = useCallback((next: SortState) => dispatch(setListSort({ key, sort: next })), [dispatch, key]);
  const clear = useCallback(() => dispatch(clearListFilters({ key })), [dispatch, key]);

  return {
    ctx,
    fields,
    values,
    sort,
    request,
    search: typeof values[SEARCH_KEY] === 'string' ? (values[SEARCH_KEY] as string) : '',
    activeCount: countActiveFilters(config, values, ctx),
    hasAny: hasAnyFilter(config, values, ctx),
    apply,
    setField,
    setSearch,
    searchAsText,
    setSort,
    clear,
  };
}
