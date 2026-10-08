/**
 * useFilterState Hook
 *
 * Custom hook for managing filter state with debouncing and persistence.
 * Provides a simple API for components to interact with the filter system.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setFilterValues,
  updateFilterField,
  clearFilter as clearFilterAction,
  clearAllFilters as clearAllFiltersAction,
  selectFilterValues,
} from '@/store/slices/filterSlice';
import type { FilterValues, FilterValueType } from '@/types/filter.types';

/**
 * Hook options
 */
export interface UseFilterStateOptions {
  /**
   * Feature key for persistence (e.g., 'orders', 'grn', 'dispatch')
   */
  persistKey: string;

  /**
   * Debounce delay in milliseconds
   * @default 500
   */
  debounceMs?: number;

  /**
   * Callback function called when debounced values change
   */
  onFilterChange?: (values: FilterValues) => void;
}

/**
 * Return type of useFilterState hook
 */
export interface UseFilterStateReturn {
  /**
   * Current filter values (immediate, non-debounced)
   */
  filterValues: FilterValues;

  /**
   * Debounced filter values (delayed by debounceMs)
   * Use this for API calls to avoid excessive requests
   */
  debouncedValues: FilterValues;

  /**
   * Update a single filter field
   * @param field - The filter field name
   * @param value - The value (string, number, Date, AutocompleteSelection[], or undefined)
   */
  updateFilter: (field: string, value: FilterValueType) => void;

  /**
   * Update multiple filter fields at once
   */
  updateFilters: (updates: Partial<FilterValues>) => void;

  /**
   * Clear all filters for this feature
   */
  clearFilter: () => void;

  /**
   * Clear all filters across all features
   */
  clearAllFilters: () => void;

  /**
   * Remove a specific filter field
   */
  removeField: (field: string) => void;

  /**
   * Count of active (non-empty) filters
   */
  activeFilterCount: number;

  /**
   * Whether persistence rehydration is complete
   */
  isReady: boolean;
}

/**
 * Custom hook for managing filter state
 *
 * @param persistKey Feature key for Redux persistence
 * @param debounceMs Debounce delay in milliseconds (default: 500)
 * @param onFilterChange Callback when debounced values change
 * @returns Filter state and management functions
 *
 * @example
 * ```typescript
 * const { filterValues, debouncedValues, updateFilter, clearFilter, activeFilterCount } =
 *   useFilterState('orders', 500);
 *
 * // Update a filter field
 * updateFilter('itemName', 'Rice');
 *
 * // Use debounced values for API calls
 * useEffect(() => {
 *   fetchOrders(debouncedValues);
 * }, [debouncedValues]);
 * ```
 */
export function useFilterState({
  persistKey,
  debounceMs = 500,
  onFilterChange,
}: UseFilterStateOptions): UseFilterStateReturn {
  const dispatch = useAppDispatch();

  // Get filter values from Redux
  const filterValues = useAppSelector(state =>
    selectFilterValues(state, persistKey)
  );

  // Local state for debounced values
  const [debouncedValues, setDebouncedValues] =
    useState<FilterValues>(filterValues);

  // Track if initial rehydration is complete
  const [isReady, setIsReady] = useState(false);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track initial mount
  const isMountedRef = useRef(false);

  /**
   * Calculate active filter count
   */
  const activeFilterCount = useMemo(() => {
    let count = 0;

    Object.values(filterValues).forEach(value => {
      // Skip empty values
      if (value === null || value === undefined || value === '') return;

      // Handle arrays (autocomplete selections)
      if (Array.isArray(value)) {
        if (value.length > 0) count++;
        return;
      }

      // Handle objects
      if (typeof value === 'object') {
        if (Object.keys(value).length > 0) count++;
        return;
      }

      // All other non-empty values
      count++;
    });

    return count;
  }, [filterValues]);

  /**
   * Update a single filter field
   */
  const updateFilter = useCallback(
    (field: string, value: FilterValueType) => {
      // Serialize Date objects to ISO strings for Redux
      const serializedValue = value instanceof Date
        ? value.toISOString()
        : value;

      dispatch(
        updateFilterField({
          key: persistKey,
          field,
          value: serializedValue,
        })
      );
    },
    [dispatch, persistKey]
  );

  /**
   * Update multiple filter fields at once
   */
  const updateFilters = useCallback(
    (updates: Partial<FilterValues>) => {
      // Serialize Date objects in updates
      const serializedUpdates: Record<string, any> = {};
      Object.keys(updates).forEach(key => {
        const value = updates[key];
        serializedUpdates[key] = value instanceof Date ? value.toISOString() : value;
      });

      dispatch(
        setFilterValues({
          key: persistKey,
          values: { ...filterValues, ...serializedUpdates },
        })
      );
    },
    [dispatch, persistKey, filterValues]
  );

  /**
   * Clear all filters for this feature
   */
  const clearFilter = useCallback(() => {
    dispatch(clearFilterAction({ key: persistKey }));
  }, [dispatch, persistKey]);

  /**
   * Clear all filters across all features
   */
  const clearAllFilters = useCallback(() => {
    dispatch(clearAllFiltersAction());
  }, [dispatch]);

  /**
   * Remove a specific filter field
   */
  const removeField = useCallback(
    (field: string) => {
      const newValues = { ...filterValues };
      delete newValues[field];
      dispatch(
        setFilterValues({
          key: persistKey,
          values: newValues,
        })
      );
    },
    [dispatch, persistKey, filterValues]
  );

  /**
   * Debounce filter values for API calls
   */
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedValues(filterValues);

      // Call onChange callback if provided (skip on initial mount)
      if (isMountedRef.current && onFilterChange) {
        onFilterChange(filterValues);
      }
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filterValues, debounceMs, onFilterChange]);

  /**
   * Mark as ready after initial mount
   */
  useEffect(() => {
    // Small delay to ensure persistence rehydration is complete
    const timer = setTimeout(() => {
      setIsReady(true);
      isMountedRef.current = true;
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return {
    filterValues,
    debouncedValues,
    updateFilter,
    updateFilters,
    clearFilter,
    clearAllFilters,
    removeField,
    activeFilterCount,
    isReady,
  };
}

/**
 * Helper hook to get a specific filter field value
 *
 * @param persistKey Feature key
 * @param field Field name
 * @returns Field value or undefined
 *
 * @example
 * ```typescript
 * const itemName = useFilterField('orders', 'itemName');
 * ```
 */
export function useFilterField(
  persistKey: string,
  field: string
): FilterValueType {
  return useAppSelector(state => {
    const filters = selectFilterValues(state, persistKey);
    return filters[field];
  });
}

/**
 * Helper hook to check if a feature has any active filters
 *
 * @param persistKey Feature key
 * @returns True if feature has active filters
 *
 * @example
 * ```typescript
 * const hasFilters = useHasActiveFilters('orders');
 * ```
 */
export function useHasActiveFilters(persistKey: string): boolean {
  const filterValues = useAppSelector(state =>
    selectFilterValues(state, persistKey)
  );

  return useMemo(() => {
    return Object.values(filterValues).some(value => {
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    });
  }, [filterValues]);
}
