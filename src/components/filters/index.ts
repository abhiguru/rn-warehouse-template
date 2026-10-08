/**
 * Generic Filter System - Main Exports
 *
 * Centralized exports for the generic filter system components and utilities.
 */

// Main component
export { GenericFilterModal } from './GenericFilterModal';

// Field components
export { TextFilterField } from './fields/TextFilterField';
export { NumberRangeFilterField } from './fields/NumberRangeFilterField';
export { DateRangeFilterField } from './fields/DateRangeFilterField';
export { RadioFilterField } from './fields/RadioFilterField';
export { AutocompleteFilterField } from './fields/AutocompleteFilterField';

// Autocomplete bottom sheet
export { AutocompleteBottomSheet } from './AutocompleteBottomSheet';

// Re-export types
export type {
  FilterConfig,
  FilterFieldConfig,
  FilterValues,
  AutocompleteSelection,
  AutocompleteType,
  FilterFieldType,
  TextFieldConfig,
  NumberRangeFieldConfig,
  DateRangeFieldConfig,
  RadioFieldConfig,
  AutocompleteFieldConfig,
  GenericFilterModalProps,
} from '@/types/filter.types';

// Re-export hooks
export { useFilterState, useFilterField, useHasActiveFilters } from '@/hooks/useFilterState';

// Re-export utilities
export {
  calculateActiveFilterCount,
  isFilterValueActive,
  getFilterCountBreakdown,
  transformFiltersForAPI,
  formatDateForDisplay,
  formatDateForAPI,
  parseDateFromAPI,
  validateFilterValues,
  cleanFilterValues,
  mergeFilterValues,
  getFilterFieldLabel,
  areFilterValuesEqual,
  getDefaultFilterValue,
  initializeFilterValues,
} from '@/utils/filterHelpers';

// Re-export autocomplete service helpers
export {
  searchAutocomplete,
  getAutocompleteTypeLabel,
  getAutocompletePlaceholder,
  getAutocompleteIcon,
  getAutocompleteChipColor,
} from '@/services/filter-autocomplete-service';
