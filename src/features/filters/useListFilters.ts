/**
 * A list's filters, search and sort, and the request they stand for.
 * Changes apply at once; there is no debounce here (the search field debounces
 * its own typing).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { facilityPagesGrnsByReceipt, subscribeFacilityGrnPaging } from '@/config/facilityGrnPaging';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toLocalISODate } from '@/utils/formatters';
import {
  applyListFilters,
  clearListFilters,
  selectListFilters,
  setListFilterField,
  setListSort,
} from '@/store/slices/listFilterSlice';
import { countActiveFilters, currentSort, hasAnyFilter, isRequiredField, normalizeValues, visibleFields } from './filterModel';
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
  const pagesByReceipt = useSyncExternalStore(subscribeFacilityGrnPaging, facilityPagesGrnsByReceipt, facilityPagesGrnsByReceipt);
  return useMemo(() => {
    const role = profile?.role ?? null;
    const isWarehouseRole = role === 'admin' || role === 'supervisor' || role === 'staff';
    const named = profile?.assignedCustomers?.map(customer => ({ id: customer.id, label: customer.name }));
    const assigned = named ?? (profile?.assignedCustomerIds ?? []).map(id => ({ id, label: '' }));
    return { role, isWarehouseRole, assignedCustomers: isWarehouseRole ? [] : assigned, pagesByReceipt };
  }, [profile?.role, profile?.assignedCustomers, profile?.assignedCustomerIds, pagesByReceipt]);
}

export interface UseListFiltersOptions {
  /**
   * What the list is shown for, when one list key serves several (one customer's report):
   * the search is kept per scope, the other choices and the sort for the whole list
   * (review 2026-10-13, SR-06). Left out, the search is the list's own.
   */
  scope?: string;
}

const NO_SEARCHES: Record<string, string> = {};
const NO_LITERALS: Record<string, true> = {};

/** The key a list's recent searches are kept under: per scope when the search is. */
export const recentSearchKey = (listKey: string, scope?: string): string =>
  scope === undefined ? listKey : `${listKey}:${scope}`;

export function useListFilters<TRequest>(config: FilterListConfig<TRequest>, options: UseListFiltersOptions = {}) {
  const { scope } = options;
  const dispatch = useAppDispatch();
  const ctx = useFilterContext();
  const stored = useAppSelector(state => selectListFilters(state, config.listKey));
  const key = config.listKey;
  const scopeSearch = scope === undefined ? undefined : (stored.searches ?? NO_SEARCHES)[scope];
  const scopeLiteral = scope === undefined ? undefined : (stored.searchLiterals ?? NO_LITERALS)[scope];
  // With a scope: the list's shared choices, and this scope's search in place of any other.
  const storedValues = useMemo<FilterValues>(() => {
    if (scope === undefined) return stored.values;
    const { [SEARCH_KEY]: _search, [SEARCH_LITERAL_KEY]: _literal, ...shared } = stored.values;
    return { ...shared, [SEARCH_KEY]: scopeSearch, [SEARCH_LITERAL_KEY]: scopeLiteral };
  }, [scope, stored.values, scopeSearch, scopeLiteral]);

  // Stored values are read through the account as it is now: a field that has
  // become hidden, or a customer no longer assigned, is not used or sent.
  const values = useMemo(() => normalizeValues(config, storedValues, ctx), [config, storedValues, ctx]);
  const sort = currentSort(config, stored.sort);
  // "Today", "Yesterday" and "This month" are stored as words and turned into
  // dates here. The day is part of the key, so a list left open past midnight
  // asks for the new day the next time it is drawn.
  const day = toLocalISODate(new Date());
  const request = useMemo(() => config.toRequest(values, sort, ctx), [config, values, sort, ctx, day]);
  const fields = useMemo(() => visibleFields(config, ctx), [config, ctx]);

  const apply = useCallback(
    (next: FilterValues, nextSort?: SortState) =>
      dispatch(applyListFilters({ key, values: normalizeValues(config, next, ctx), sort: nextSort, scope })),
    [dispatch, key, config, ctx, scope]
  );
  const setField = useCallback(
    (field: string, value: FilterValue | undefined) => {
      const normalised = normalizeValues(config, { ...values, [field]: value }, ctx);
      dispatch(applyListFilters({ key, values: normalised, scope }));
    },
    [dispatch, key, config, ctx, values, scope]
  );
  const setSearch = useCallback(
    (text: string) => {
      // New text means a new reading: forget that an earlier recognition was dismissed.
      const next = { ...values, [SEARCH_KEY]: text, [SEARCH_LITERAL_KEY]: undefined };
      dispatch(applyListFilters({ key, values: normalizeValues(config, next, ctx), scope }));
    },
    [dispatch, key, config, ctx, values, scope]
  );
  const searchAsText = useCallback(
    () => dispatch(setListFilterField({ key, field: SEARCH_LITERAL_KEY, value: true, scope })),
    [dispatch, key, scope]
  );
  const setSort = useCallback((next: SortState) => dispatch(setListSort({ key, sort: next })), [dispatch, key]);
  const clear = useCallback(() => {
    // A required range (a report's period) is not a filter the user turned on: it stays.
    const kept: FilterValues = {};
    for (const field of fields) {
      if (isRequiredField(field) && values[field.key] !== undefined) kept[field.key] = values[field.key];
    }
    // With a scope this forgets the scope's search and the list's shared choices; other scopes' searches stay.
    if (scope !== undefined) dispatch(applyListFilters({ key, values: kept, scope }));
    else dispatch(Object.keys(kept).length > 0 ? applyListFilters({ key, values: kept }) : clearListFilters({ key }));
  }, [dispatch, key, fields, values, scope]);

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
    /** Where the search field keeps its recent searches: per scope when the search is. */
    recentKey: recentSearchKey(key, scope),
  };
}
