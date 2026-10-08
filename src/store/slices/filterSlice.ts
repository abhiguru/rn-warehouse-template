/**
 * Filter Slice - Redux state management for generic filter system
 *
 * Manages filter values for all features with persistence support.
 * Each feature (identified by persistKey) has its own filter values object.
 */

import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import type {
  FilterState,
  FilterValues,
  FilterValueType,
  initialFilterState,
} from '@/types/filter.types';
// Import logout action to clear filters on logout (privacy cleanup)
import { logout } from './authSlice';

/**
 * Initial state
 */
const initialState: FilterState = {
  filters: {},
};

/**
 * Stable empty object reference to avoid infinite re-renders
 */
const EMPTY_FILTER_VALUES: FilterValues = {};

/**
 * Filter slice
 */
const filterSlice = createSlice({
  name: 'filter',
  initialState,
  reducers: {
    /**
     * Set complete filter values for a feature
     * @param state Current state
     * @param action { key: string, values: FilterValues }
     */
    setFilterValues(
      state,
      action: PayloadAction<{ key: string; values: FilterValues }>
    ) {
      const { key, values } = action.payload;

      // Serialize Date objects in values
      const serializedValues: FilterValues = {};
      Object.keys(values).forEach(field => {
        const value = values[field];
        serializedValues[field] = value instanceof Date ? value.toISOString() : value;
      });

      state.filters[key] = serializedValues;
    },

    /**
     * Update a single field value within a feature's filters
     * @param state Current state
     * @param action { key: string, field: string, value: FilterValueType }
     */
    updateFilterField(
      state,
      action: PayloadAction<{ key: string; field: string; value: FilterValueType }>
    ) {
      const { key, field, value } = action.payload;

      // Initialize filter object if it doesn't exist
      if (!state.filters[key]) {
        state.filters[key] = {};
      }

      // Serialize Date objects to ISO strings for Redux persistence
      let serializedValue = value;
      if (value instanceof Date) {
        serializedValue = value.toISOString();
      }

      // Update the specific field
      state.filters[key][field] = serializedValue;
    },

    /**
     * Clear all filters for a specific feature
     * @param state Current state
     * @param action { key: string }
     */
    clearFilter(state, action: PayloadAction<{ key: string }>) {
      const { key } = action.payload;
      state.filters[key] = {};
    },

    /**
     * Clear all filters across all features
     * @param state Current state
     */
    clearAllFilters(state) {
      state.filters = {};
    },

    /**
     * Remove a specific field from a feature's filters
     * @param state Current state
     * @param action { key: string, field: string }
     */
    removeFilterField(
      state,
      action: PayloadAction<{ key: string; field: string }>
    ) {
      const { key, field } = action.payload;

      if (state.filters[key] && field in state.filters[key]) {
        delete state.filters[key][field];
      }
    },

    /**
     * Batch update multiple filter fields at once
     * @param state Current state
     * @param action { key: string, updates: FilterValues }
     */
    batchUpdateFilters(
      state,
      action: PayloadAction<{ key: string; updates: FilterValues }>
    ) {
      const { key, updates } = action.payload;

      // Initialize filter object if it doesn't exist
      if (!state.filters[key]) {
        state.filters[key] = {};
      }

      // Serialize Date objects in updates
      const serializedUpdates: FilterValues = {};
      Object.keys(updates).forEach(field => {
        const value = updates[field];
        serializedUpdates[field] = value instanceof Date ? value.toISOString() : value;
      });

      // Apply all updates
      Object.assign(state.filters[key], serializedUpdates);
    },
  },
  extraReducers: (builder) => {
    // Clear all filters when user logs out (privacy cleanup)
    builder.addCase(logout.fulfilled, (state) => {
      state.filters = {};
    });
  },
});

// Export actions
export const {
  setFilterValues,
  updateFilterField,
  clearFilter,
  clearAllFilters,
  removeFilterField,
  batchUpdateFilters,
} = filterSlice.actions;

// Export reducer
export default filterSlice.reducer;

/**
 * Selectors
 */

/**
 * Helper function to deserialize ISO date strings back to Date objects
 */
function deserializeFilterValues(values: FilterValues): FilterValues {
  const deserialized: FilterValues = {};

  Object.keys(values).forEach(key => {
    const value = values[key];

    // Check if value is an ISO date string
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      // Verify it's a valid date
      if (!isNaN(date.getTime())) {
        deserialized[key] = date;
        return;
      }
    }

    // Keep value as-is
    deserialized[key] = value;
  });

  return deserialized;
}

/**
 * Get filter values for a specific feature (memoized to prevent infinite re-renders)
 * Automatically deserializes ISO date strings back to Date objects
 * @param state Root state
 * @param key Feature key
 * @returns Filter values object or empty object if not found
 */
export const selectFilterValues = createSelector(
  [
    (state: { filter: FilterState }) => state.filter.filters,
    (_state: { filter: FilterState }, key: string) => key,
  ],
  (filters, key) => {
    const values = filters[key] || EMPTY_FILTER_VALUES;
    // Deserialize dates from ISO strings
    return Object.keys(values).length > 0 ? deserializeFilterValues(values) : values;
  }
);

/**
 * Get a specific field value from a feature's filters
 * @param state Root state
 * @param key Feature key
 * @param field Field name
 * @returns Field value or undefined if not found
 */
export const selectFilterField = (
  state: { filter: FilterState },
  key: string,
  field: string
): FilterValueType => {
  return state.filter.filters[key]?.[field];
};

/**
 * Check if a feature has any active filters
 * @param state Root state
 * @param key Feature key
 * @returns True if feature has any non-empty filter values
 */
export const selectHasActiveFilters = (
  state: { filter: FilterState },
  key: string
): boolean => {
  const filters = state.filter.filters[key];
  if (!filters) return false;

  // Check if any filter value is non-empty
  return Object.values(filters).some(value => {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });
};

/**
 * Get all filter keys (features) that have active filters
 * @param state Root state
 * @returns Array of feature keys with active filters
 */
export const selectFeaturesWithActiveFilters = (state: {
  filter: FilterState;
}): string[] => {
  return Object.keys(state.filter.filters).filter(key =>
    selectHasActiveFilters(state, key)
  );
};
