/**
 * Request Deduplication Utility
 *
 * P9 Fix: Prevents duplicate simultaneous API requests.
 * When multiple identical requests are made concurrently,
 * only one network call is made and all callers share the result.
 */

type PendingRequest<T> = Promise<T>;

// Map of in-flight requests by key
const pendingRequests = new Map<string, PendingRequest<unknown>>();

/**
 * Stable JSON stringify that sorts object keys recursively.
 * Ensures two semantically identical objects produce the same string.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  // Object - sort keys
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',');
  return '{' + sorted + '}';
}

/**
 * Generate a cache key from request parameters.
 * Uses stable JSON stringification to ensure property order doesn't affect the key.
 */
export function generateRequestKey(
  operation: string,
  params: Record<string, unknown> = {}
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${stableStringify(params[key])}`)
    .join('|');
  return `${operation}::${sortedParams}`;
}

/**
 * Execute a request with deduplication.
 * If an identical request is already in flight, returns the existing promise.
 *
 * @param key - Unique key for this request
 * @param requestFn - Function that makes the actual request
 * @returns Promise with the request result
 *
 * @example
 * const result = await deduplicatedRequest(
 *   generateRequestKey('getDispatchList', { customerId, offset }),
 *   () => fetchDispatchList(customerId, offset)
 * );
 */
export async function deduplicatedRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Check if identical request is already in flight
  const existing = pendingRequests.get(key) as PendingRequest<T> | undefined;
  if (existing) {
    if (__DEV__) {
      console.log(`[RequestDedup] Reusing in-flight request: ${key}`);
    }
    return existing;
  }

  // Create new request and track it
  const request = requestFn()
    .then((result) => {
      // Clean up after successful completion
      pendingRequests.delete(key);
      return result;
    })
    .catch((error) => {
      // Clean up on error too
      pendingRequests.delete(key);
      throw error;
    });

  pendingRequests.set(key, request);

  if (__DEV__) {
    console.log(`[RequestDedup] New request started: ${key}`);
  }

  return request;
}

/**
 * Cancel/clear a pending request by key.
 * Useful when component unmounts or request is no longer needed.
 */
export function cancelPendingRequest(key: string): boolean {
  if (pendingRequests.has(key)) {
    pendingRequests.delete(key);
    if (__DEV__) {
      console.log(`[RequestDedup] Cancelled pending request: ${key}`);
    }
    return true;
  }
  return false;
}

/**
 * Clear all pending requests.
 * Useful for logout or app reset.
 */
export function clearAllPendingRequests(): number {
  const count = pendingRequests.size;
  pendingRequests.clear();
  if (__DEV__ && count > 0) {
    console.log(`[RequestDedup] Cleared ${count} pending requests`);
  }
  return count;
}

/**
 * Get count of currently pending requests.
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Check if a specific request is in flight.
 */
export function isRequestPending(key: string): boolean {
  return pendingRequests.has(key);
}

/**
 * HOF to wrap a service function with deduplication.
 *
 * @example
 * const getDispatchListDeduped = withDeduplication(
 *   'getDispatchList',
 *   (params) => `${params.customerId}_${params.offset}`,
 *   getDispatchList
 * );
 */
export function withDeduplication<TParams, TResult>(
  operationName: string,
  keyGenerator: (params: TParams) => string,
  fn: (params: TParams) => Promise<TResult>
): (params: TParams) => Promise<TResult> {
  return (params: TParams) => {
    const key = `${operationName}::${keyGenerator(params)}`;
    return deduplicatedRequest(key, () => fn(params));
  };
}
