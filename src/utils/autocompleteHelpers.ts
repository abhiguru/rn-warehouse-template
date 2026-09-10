/**
 * Autocomplete Helper Utilities
 *
 * J2 Fix: Common patterns for autocomplete components.
 * Reduces boilerplate in ItemAutocomplete, CustomerAutocomplete, etc.
 */

/**
 * Create a debounced fetch function with minimum character check.
 * Wraps the actual fetch logic with standard error handling.
 *
 * @param fetchFn - The actual data fetching function
 * @param options - Configuration options
 *
 * @example
 * const fetchItems = createAutocompleteFetcher(
 *   async (query) => searchService.searchItems(query),
 *   { minChars: 2, componentName: 'ItemAutocomplete' }
 * );
 */
export function createAutocompleteFetcher<T>(
  fetchFn: (query: string) => Promise<T[]>,
  options: {
    minChars?: number;
    componentName?: string;
    onError?: (error: unknown) => void;
  } = {}
): (query: string) => Promise<T[]> {
  const { minChars = 2, componentName = 'Autocomplete', onError } = options;

  return async (query: string): Promise<T[]> => {
    if (query.length < minChars) {
      return [];
    }

    try {
      if (__DEV__) {
        console.log(`[${componentName}] Searching for:`, query);
      }

      const results = await fetchFn(query);

      if (__DEV__) {
        console.log(`[${componentName}] Results:`, results?.length || 0);
      }

      return results || [];
    } catch (error) {
      console.error(`[${componentName}] Search error:`, error);
      onError?.(error);
      return [];
    }
  };
}

/**
 * Create a select handler with null check and transformation.
 *
 * @param onChange - The callback to call with transformed value
 * @param transform - Optional transformer for the selected item
 * @param emptyValue - Value to use when selection is cleared
 *
 * @example
 * const handleSelect = createAutocompleteSelectHandler(
 *   onChange,
 *   (item) => ({ id: item.id, name: item.name }),
 *   { id: '', name: '' }
 * );
 */
export function createAutocompleteSelectHandler<TItem, TValue>(
  onChange: (value: TValue) => void,
  transform: (item: TItem) => TValue,
  emptyValue: TValue
): (item: TItem | null) => void {
  return (item: TItem | null) => {
    if (item) {
      onChange(transform(item));
    } else {
      onChange(emptyValue);
    }
  };
}

/**
 * Standard key extractor that uses 'id' field.
 * Works with any object that has an 'id' property.
 */
export function idKeyExtractor<T extends { id: string }>(item: T): string {
  return item.id;
}

/**
 * Props interface for creating typed autocomplete components.
 * Extend this for specific autocomplete component props.
 */
export interface BaseAutocompleteProps<TValue> {
  value?: TValue;
  onChange: (value: TValue) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  helperText?: string;
  zIndex?: number;
}
