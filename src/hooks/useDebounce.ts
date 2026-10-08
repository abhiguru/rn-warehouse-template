/**
 * Debounce Hooks
 *
 * Provides reusable debouncing utilities for search inputs and other use cases.
 * Helps prevent excessive API calls by delaying execution until user stops typing.
 *
 * Features:
 * - useDebounce: Debounce any value with automatic cleanup
 * - useDebouncedCallback: Create a stable debounced function
 * - useDebouncedSearch: Specialized hook for search inputs with loading state
 *
 * @example
 * ```typescript
 * // Debounce a value
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 *
 * // Debounce a callback
 * const debouncedSearch = useDebouncedCallback((term: string) => {
 *   performSearch(term);
 * }, 300);
 *
 * // Search with loading state
 * const { value, setValue, isDebouncing } = useDebouncedSearch(300);
 * ```
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Debounce a value
 *
 * Returns a debounced version of the value that only updates after
 * the specified delay has passed without the value changing.
 *
 * @param value The value to debounce
 * @param delay Delay in milliseconds (default: 300)
 * @returns The debounced value
 *
 * @example
 * ```typescript
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedTerm = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   // Only fires 300ms after user stops typing
 *   performSearch(debouncedTerm);
 * }, [debouncedTerm]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout to update the debounced value
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes or component unmounts
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Create a debounced callback function
 *
 * Returns a stable, memoized debounced version of the provided callback.
 * The returned function will only execute after the delay has passed
 * without being called again.
 *
 * @param callback The function to debounce
 * @param delay Delay in milliseconds (default: 300)
 * @returns Object with debounced function and cancel method
 *
 * @example
 * ```typescript
 * const { debouncedFn, cancel } = useDebouncedCallback(
 *   (searchTerm: string) => performSearch(searchTerm),
 *   300
 * );
 *
 * // Call the debounced function
 * debouncedFn('hello');
 *
 * // Cancel pending execution if needed
 * cancel();
 * ```
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number = 300
): { debouncedFn: (...args: Parameters<T>) => void; cancel: () => void; flush: () => void } {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && pendingArgsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Store pending args for potential flush
      pendingArgsRef.current = args;

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
        pendingArgsRef.current = null;
      }, delay);
    },
    [delay]
  );

  return useMemo(
    () => ({ debouncedFn, cancel, flush }),
    [debouncedFn, cancel, flush]
  );
}

/**
 * Search input hook with debouncing and loading state
 *
 * Provides a complete solution for search inputs with:
 * - Immediate value for display in the input
 * - Debounced value for API calls
 * - Loading/debouncing state indicator
 *
 * @param delay Delay in milliseconds (default: 300)
 * @param initialValue Initial search value
 * @returns Object with value, debouncedValue, setValue, isDebouncing, and clear
 *
 * @example
 * ```typescript
 * const { value, debouncedValue, setValue, isDebouncing, clear } = useDebouncedSearch(300);
 *
 * return (
 *   <>
 *     <TextInput value={value} onChangeText={setValue} />
 *     {isDebouncing && <ActivityIndicator />}
 *   </>
 * );
 *
 * useEffect(() => {
 *   performSearch(debouncedValue);
 * }, [debouncedValue]);
 * ```
 */
export function useDebouncedSearch(
  delay: number = 300,
  initialValue: string = ''
): {
  value: string;
  debouncedValue: string;
  setValue: (value: string) => void;
  isDebouncing: boolean;
  clear: () => void;
} {
  const [value, setValueState] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const setValue = useCallback(
    (newValue: string) => {
      setValueState(newValue);
      setIsDebouncing(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(newValue);
        setIsDebouncing(false);
        timeoutRef.current = null;
      }, delay);
    },
    [delay]
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setValueState('');
    setDebouncedValue('');
    setIsDebouncing(false);
  }, []);

  return useMemo(
    () => ({ value, debouncedValue, setValue, isDebouncing, clear }),
    [value, debouncedValue, setValue, isDebouncing, clear]
  );
}

/**
 * Throttled callback hook
 *
 * Unlike debounce which waits for silence, throttle ensures the function
 * is called at most once per time period. Useful for scroll handlers,
 * resize events, or progress updates.
 *
 * @param callback The function to throttle
 * @param limit Time limit in milliseconds (default: 300)
 * @returns Throttled function
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  limit: number = 300
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef(0);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRunRef.current >= limit) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      }
    },
    [limit]
  );
}
