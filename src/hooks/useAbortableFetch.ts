/**
 * useAbortableFetch Hook
 *
 * Provides automatic request cancellation when component unmounts
 * or when dependencies change. Prevents stale data updates and memory leaks.
 *
 * @example
 * ```typescript
 * const { fetchWithAbort, isAborted } = useAbortableFetch();
 *
 * useEffect(() => {
 *   fetchWithAbort(async (signal) => {
 *     const data = await fetchData({ signal });
 *     setData(data);
 *   });
 * }, [filters]);
 * ```
 */

import { useRef, useCallback, useEffect } from 'react';

export interface AbortableFetchOptions {
  /** Timeout in milliseconds (default: 30000 = 30 seconds) */
  timeout?: number;
  /** Called when request is aborted */
  onAbort?: () => void;
}

/**
 * Hook for managing abortable fetch requests
 * Automatically cancels pending requests on unmount or when called again
 */
export function useAbortableFetch(options: AbortableFetchOptions = {}) {
  const { timeout = 30000, onAbort } = options;
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      onAbort?.();
    }
  }, [onAbort]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  /**
   * Execute a fetch operation with automatic abort handling
   * Cancels any previous pending request before starting new one
   */
  const fetchWithAbort = useCallback(
    async <T>(
      fetcher: (signal: AbortSignal) => Promise<T>
    ): Promise<T | null> => {
      // Cancel any pending request
      cleanup();

      // Create new abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set up timeout
      if (timeout > 0) {
        timeoutIdRef.current = setTimeout(() => {
          controller.abort();
          console.warn('[useAbortableFetch] Request timed out');
        }, timeout);
      }

      try {
        const result = await fetcher(controller.signal);

        // Clear timeout on success
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }

        return result;
      } catch (error) {
        // Ignore abort errors - they're expected
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('[useAbortableFetch] Request was aborted');
          return null;
        }
        throw error;
      }
    },
    [cleanup, timeout]
  );

  /**
   * Manually abort the current request
   */
  const abort = useCallback(() => {
    cleanup();
  }, [cleanup]);

  /**
   * Check if there's a pending request
   */
  const isPending = useCallback(() => {
    return abortControllerRef.current !== null;
  }, []);

  return {
    fetchWithAbort,
    abort,
    isPending,
  };
}

/**
 * Create an AbortSignal with timeout
 * Useful for one-off requests outside of React components
 */
export function createTimeoutSignal(timeoutMs: number = 30000): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

/**
 * Check if an error is an abort error
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export default useAbortableFetch;
