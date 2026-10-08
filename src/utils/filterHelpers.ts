/**
 * Filter Helper Utilities
 *
 * Utility functions for filter operations, transformations, and calculations.
 */

import type {
  FilterValues,
  FilterConfig,
  FilterFieldConfig,
  AutocompleteSelection,
  FilterCountBreakdown,
} from '@/types/filter.types';

/**
 * Calculate the number of active (non-empty) filters
 *
 * @param values Filter values object
 * @returns Count of active filters
 */
export function calculateActiveFilterCount(values: FilterValues): number {
  let count = 0;

  Object.values(values).forEach((value) => {
    if (isFilterValueActive(value)) {
      count++;
    }
  });

  return count;
}

/**
 * Check if a filter value is active (non-empty)
 *
 * @param value Any filter value
 * @returns True if value is considered active
 */
export function isFilterValueActive(value: any): boolean {
  // Null, undefined, empty string
  if (value === null || value === undefined || value === '') return false;

  // Arrays (autocomplete selections)
  if (Array.isArray(value)) return value.length > 0;

  // Objects
  if (typeof value === 'object') return Object.keys(value).length > 0;

  // All other non-empty values
  return true;
}

/**
 * Get detailed filter count breakdown by field type
 *
 * @param values Filter values object
 * @param config Filter configuration
 * @returns Breakdown of active filters by type
 */
export function getFilterCountBreakdown(
  values: FilterValues,
  config: FilterConfig
): FilterCountBreakdown {
  const breakdown: FilterCountBreakdown = {
    text: 0,
    numberRange: 0,
    dateRange: 0,
    radio: 0,
    autocomplete: 0,
    total: 0,
  };

  config.fields.forEach((field) => {
    let fieldKey: string;

    // Handle range fields (arrays of keys)
    if (Array.isArray(field.key)) {
      // Check if any of the range values are active
      const hasActiveValue = field.key.some((key) =>
        isFilterValueActive(values[key])
      );
      if (!hasActiveValue) return;
      fieldKey = field.key[0]; // Use first key for type counting
    } else {
      fieldKey = field.key;
      if (!isFilterValueActive(values[fieldKey])) return;
    }

    // Increment appropriate counter
    switch (field.type) {
      case 'text':
        breakdown.text++;
        break;
      case 'number-range':
        breakdown.numberRange++;
        break;
      case 'date-range':
        breakdown.dateRange++;
        break;
      case 'radio':
        breakdown.radio++;
        break;
      case 'autocomplete':
        breakdown.autocomplete++;
        break;
    }

    breakdown.total++;
  });

  return breakdown;
}

/**
 * Transform filter values for API calls
 * Converts complex filter values (like autocomplete selections) to simple API params
 *
 * @param values Filter values object
 * @returns Transformed values for API
 *
 * @example
 * ```typescript
 * const apiParams = transformFiltersForAPI({
 *   itemName: 'Rice',
 *   customer: [{ id: '123', label: 'Aarkay', type: 'customer' }],
 *   dateFrom: new Date('2025-01-01'),
 * });
 * // Returns: { itemName: 'Rice', customerId: '123', dateFrom: '2025-01-01' }
 * ```
 */
export function transformFiltersForAPI(values: FilterValues): Record<string, any> {
  const transformed: Record<string, any> = {};

  Object.entries(values).forEach(([key, value]) => {
    // Skip empty values
    if (!isFilterValueActive(value)) return;

    // Transform autocomplete selections to IDs
    if (Array.isArray(value) && value.length > 0 && 'type' in value[0]) {
      const selections = value as AutocompleteSelection[];

      // Single selection - use singular key with ID
      if (selections.length === 1) {
        transformed[`${key}Id`] = selections[0].id;
      } else {
        // Multiple selections - use plural key with array of IDs
        transformed[`${key}Ids`] = selections.map((s) => s.id);
      }
      return;
    }

    // Transform dates to ISO strings
    if (value instanceof Date) {
      transformed[key] = value.toISOString();
      return;
    }

    // All other values pass through
    transformed[key] = value;
  });

  return transformed;
}

/**
 * Format date for display
 *
 * @param date Date object or ISO string
 * @returns Formatted date string
 */
export function formatDateForDisplay(date: Date | string | null | undefined): string | null {
  if (!date) return null;

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date for API (ISO string)
 *
 * @param date Date object
 * @returns ISO string or null
 */
export function formatDateForAPI(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

/**
 * Parse date from API (ISO string) to Date object
 *
 * @param dateString ISO date string
 * @returns Date object or null
 */
export function parseDateFromAPI(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  try {
    return new Date(dateString);
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
}

/**
 * Validate filter values against configuration
 *
 * @param values Filter values object
 * @param config Filter configuration
 * @returns Validation errors object (empty if valid)
 */
export function validateFilterValues(
  values: FilterValues,
  config: FilterConfig
): Record<string, string> {
  const errors: Record<string, string> = {};

  config.fields.forEach((field) => {
    if (field.type === 'number-range') {
      const [minKey, maxKey] = field.key as [string, string];
      const minValue = values[minKey];
      const maxValue = values[maxKey];

      // Check if min > max
      if (
        minValue !== undefined &&
        maxValue !== undefined &&
        minValue > maxValue
      ) {
        errors[minKey] = 'Minimum value cannot be greater than maximum';
      }

      // Check constraints
      if (field.minValue !== undefined && minValue < field.minValue) {
        errors[minKey] = `Value must be at least ${field.minValue}`;
      }
      if (field.maxValue !== undefined && maxValue > field.maxValue) {
        errors[maxKey] = `Value must be at most ${field.maxValue}`;
      }
    }

    if (field.type === 'date-range') {
      const [fromKey, toKey] = field.key as [string, string];
      const fromDate = values[fromKey];
      const toDate = values[toKey];

      // Check if from > to
      if (
        fromDate instanceof Date &&
        toDate instanceof Date &&
        fromDate > toDate
      ) {
        errors[fromKey] = 'Start date cannot be after end date';
      }
    }
  });

  return errors;
}

/**
 * Clear all empty fields from filter values
 * Removes null, undefined, empty strings, empty arrays, etc.
 *
 * @param values Filter values object
 * @returns Cleaned filter values object
 */
export function cleanFilterValues(values: FilterValues): FilterValues {
  const cleaned: FilterValues = {};

  Object.entries(values).forEach(([key, value]) => {
    if (isFilterValueActive(value)) {
      cleaned[key] = value;
    }
  });

  return cleaned;
}

/**
 * Merge filter values (useful for updating partial filters)
 *
 * @param current Current filter values
 * @param updates Updates to apply
 * @returns Merged filter values
 */
export function mergeFilterValues(
  current: FilterValues,
  updates: FilterValues
): FilterValues {
  return { ...current, ...updates };
}

/**
 * Get human-readable label for filter field
 *
 * @param field Filter field configuration
 * @returns Display label
 */
export function getFilterFieldLabel(field: FilterFieldConfig): string {
  return `${field.icon ? field.icon + ' ' : ''}${field.label}`;
}

/**
 * Check if two filter values are equal
 * Deep equality check for objects and arrays
 *
 * @param a First value
 * @param b Second value
 * @returns True if values are equal
 */
export function areFilterValuesEqual(a: any, b: any): boolean {
  // Strict equality for primitives
  if (a === b) return true;

  // Null/undefined checks
  if (a == null || b == null) return a === b;

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => areFilterValuesEqual(val, b[index]));
  }

  // Object comparison
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => areFilterValuesEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Get default value for a filter field type
 *
 * @param field Filter field configuration
 * @returns Default value for the field
 */
export function getDefaultFilterValue(field: FilterFieldConfig): any {
  switch (field.type) {
    case 'text':
      return '';
    case 'number-range':
      return [undefined, undefined];
    case 'date-range':
      return [undefined, undefined];
    case 'radio':
      return field.defaultValue || (field.options[0]?.value ?? '');
    case 'autocomplete':
      return [];
    default:
      return undefined;
  }
}

/**
 * Initialize empty filter values from configuration
 *
 * @param config Filter configuration
 * @returns Empty filter values object with default values
 */
export function initializeFilterValues(config: FilterConfig): FilterValues {
  const values: FilterValues = {};

  config.fields.forEach((field) => {
    if (Array.isArray(field.key)) {
      // Range fields
      const [key1, key2] = field.key;
      values[key1] = undefined;
      values[key2] = undefined;
    } else {
      // Single key fields
      values[field.key] = getDefaultFilterValue(field);
    }
  });

  return values;
}
