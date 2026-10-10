/**
 * useSearchAutocomplete Hook
 *
 * Extracts common search/debounce pattern used across BottomSheet components
 * and autocomplete inputs. Reduces ~50-70 lines of boilerplate per component.
 *
 * @example
 * ```tsx
 * const {
 *   searchQuery,
 *   setSearchQuery,
 *   results,
 *   isLoading,
 *   handleSearchChange,
 *   clearSearch,
 * } = useSearchAutocomplete({
 *   searchFn: async (query) => searchService.searchCustomers(query),
 *   minQueryLength: 2,
 *   debounceMs: 300,
 * });
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseSearchAutocompleteOptions<T> {
  /** The async search function to call */
  searchFn: (query: string) => Promise<T[]>;
  /** Minimum query length before searching (default: 2) */
  minQueryLength?: number;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Optional transform function for results */
  transformResults?: (results: T[]) => T[];
  /** Called when search starts */
  onSearchStart?: () => void;
  /** Called when search completes */
  onSearchComplete?: (results: T[]) => void;
  /** Called on search error */
  onSearchError?: (error: unknown) => void;
}

export interface UseSearchAutocompleteReturn<T> {
  /** Current search query */
  searchQuery: string;
  /** Direct setter for search query (no debounce) */
  setSearchQuery: (query: string) => void;
  /** Search results */
  results: T[];
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Handle search input change with debouncing */
  handleSearchChange: (text: string) => void;
  /** Clear search query and results */
  clearSearch: () => void;
  /** Perform search immediately (no debounce) */
  performSearchNow: (query: string) => Promise<void>;
  /** Ref to the search timeout (for manual cleanup if needed) */
  searchTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useSearchAutocomplete<T>({
  searchFn,
  minQueryLength = 2,
  debounceMs = 300,
  transformResults,
  onSearchStart,
  onSearchComplete,
  onSearchError,
}: UseSearchAutocompleteOptions<T>): UseSearchAutocompleteReturn<T> {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The number of the search asked for last. An answer to an earlier one is
  // dropped: answers can arrive out of order on a slow link.
  const latestSearch = useRef(0);

  // Perform the actual search
  const performSearch = useCallback(
    async (query: string) => {
      const search = ++latestSearch.current;
      if (query.trim().length < minQueryLength) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      onSearchStart?.();

      try {
        const searchResults = await searchFn(query);
        if (search !== latestSearch.current) return;
        const finalResults = transformResults
          ? transformResults(searchResults)
          : searchResults;
        setResults(finalResults);
        onSearchComplete?.(finalResults);
      } catch (error) {
        if (search !== latestSearch.current) return;
        console.error('[useSearchAutocomplete] Search error:', error);
        setResults([]);
        onSearchError?.(error);
      } finally {
        if (search === latestSearch.current) setIsLoading(false);
      }
    },
    [searchFn, minQueryLength, transformResults, onSearchStart, onSearchComplete, onSearchError]
  );

  // Handle search change with debouncing
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Set new timeout for debounced search
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(text);
      }, debounceMs);
    },
    [performSearch, debounceMs]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    // A search still on its way answers into a cleared field: drop it.
    latestSearch.current += 1;
    setSearchQuery('');
    setResults([]);
    setIsLoading(false);
  }, []);

  // Perform search immediately (no debounce)
  const performSearchNow = useCallback(
    async (query: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setSearchQuery(query);
      await performSearch(query);
    },
    [performSearch]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    results,
    isLoading,
    handleSearchChange,
    clearSearch,
    performSearchNow,
    searchTimeoutRef,
  };
}

export default useSearchAutocomplete;
