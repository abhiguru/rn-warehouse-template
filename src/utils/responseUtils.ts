/**
 * Response Extraction Utilities
 *
 * Provides standardized patterns for extracting data from RPC responses.
 * Addresses Issue #27: Inconsistent Response Data Extraction
 *
 * Supabase RPC responses can return data in different formats:
 * 1. Direct object: { success: true, data: {...} }
 * 2. Array with single item: [{ success: true, data: {...} }]
 * 3. Direct array of items: [item1, item2, ...]
 * 4. Nested data: { data: { items: [...], pagination: {...} } }
 */

/**
 * Unwraps RPC response that may be wrapped in an array
 *
 * Some Supabase RPCs return `[result]` instead of `result`.
 * This function normalizes the response.
 *
 * @param data - RPC response data
 * @returns Unwrapped data (first element if array, otherwise data as-is)
 *
 * @example
 * unwrapArrayResponse([{ success: true }]) // => { success: true }
 * unwrapArrayResponse({ success: true })   // => { success: true }
 * unwrapArrayResponse(null)                // => null
 */
export function unwrapArrayResponse<T>(data: T | T[] | null | undefined): T | null {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return data.length > 0 ? data[0] : null;
  }

  return data;
}

/**
 * Extracts array data from RPC response
 *
 * Handles cases where RPC returns items directly as array or nested in response.
 *
 * @param data - RPC response data
 * @param arrayKey - Key to look for if data is nested (default: 'items')
 * @returns Array of items
 *
 * @example
 * extractArrayData([1, 2, 3])                    // => [1, 2, 3]
 * extractArrayData({ items: [1, 2, 3] })         // => [1, 2, 3]
 * extractArrayData({ data: { items: [1, 2] } })  // => [1, 2]
 * extractArrayData(null)                         // => []
 */
export function extractArrayData<T>(
  data: unknown,
  arrayKey: string = 'items'
): T[] {
  if (data === null || data === undefined) {
    return [];
  }

  // Direct array
  if (Array.isArray(data)) {
    return data as T[];
  }

  // Check for nested data
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Try direct key: { items: [...] }
    if (Array.isArray(obj[arrayKey])) {
      return obj[arrayKey] as T[];
    }

    // Try nested: { data: { items: [...] } }
    if (obj.data && typeof obj.data === 'object') {
      const nestedData = obj.data as Record<string, unknown>;
      if (Array.isArray(nestedData[arrayKey])) {
        return nestedData[arrayKey] as T[];
      }
      // Also check if data itself is the array
      if (Array.isArray(obj.data)) {
        return obj.data as T[];
      }
    }
  }

  return [];
}

/**
 * Extracts success status from RPC response
 *
 * @param data - RPC response data
 * @returns Boolean indicating success
 */
export function extractSuccess(data: unknown): boolean {
  if (data === null || data === undefined) {
    return false;
  }

  const unwrapped = unwrapArrayResponse(data);

  if (typeof unwrapped === 'object' && unwrapped !== null) {
    const obj = unwrapped as Record<string, unknown>;
    return obj.success === true;
  }

  return false;
}

/**
 * Extracts error message from RPC response
 *
 * @param data - RPC response data
 * @param error - Supabase error object
 * @returns Error message or null
 */
export function extractErrorMessage(
  data: unknown,
  error?: { message?: string } | null
): string | null {
  // Check Supabase error first
  if (error?.message) {
    return error.message;
  }

  if (data === null || data === undefined) {
    return null;
  }

  const unwrapped = unwrapArrayResponse(data);

  if (typeof unwrapped === 'object' && unwrapped !== null) {
    const obj = unwrapped as Record<string, unknown>;
    if (typeof obj.error === 'string') {
      return obj.error;
    }
    if (typeof obj.message === 'string' && obj.success === false) {
      return obj.message;
    }
  }

  return null;
}

/**
 * Extracts pagination info from RPC response
 *
 * @param data - RPC response data
 * @returns Pagination object or null
 */
export function extractPagination(data: unknown): {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
} | null {
  if (data === null || data === undefined) {
    return null;
  }

  const unwrapped = unwrapArrayResponse(data);

  if (typeof unwrapped === 'object' && unwrapped !== null) {
    const obj = unwrapped as Record<string, unknown>;

    // Direct pagination: { pagination: {...} }
    if (obj.pagination && typeof obj.pagination === 'object') {
      return obj.pagination as {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }

    // Nested pagination: { data: { pagination: {...} } }
    if (obj.data && typeof obj.data === 'object') {
      const nestedData = obj.data as Record<string, unknown>;
      if (nestedData.pagination && typeof nestedData.pagination === 'object') {
        return nestedData.pagination as {
          total: number;
          limit: number;
          offset: number;
          hasMore: boolean;
        };
      }
    }
  }

  return null;
}

/**
 * Standard RPC response structure
 */
export interface StandardRpcResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } | null;
}

/**
 * Parses RPC response into a standardized format
 *
 * @param data - RPC response data
 * @param error - Supabase error object
 * @param arrayKey - Key to look for items (default: 'items')
 * @returns Standardized response object
 */
export function parseRpcResponse<T>(
  data: unknown,
  error?: { message?: string } | null,
  arrayKey: string = 'items'
): StandardRpcResponse<T[]> {
  const unwrapped = unwrapArrayResponse(data);
  const success = !error && extractSuccess(unwrapped);
  const errorMessage = extractErrorMessage(unwrapped, error);
  const items = extractArrayData<T>(unwrapped, arrayKey);
  const pagination = extractPagination(unwrapped);

  return {
    success,
    data: items,
    error: errorMessage,
    pagination,
  };
}

/**
 * Unwraps nested data structure from RPC response
 *
 * Handles the common pattern where Supabase RPC returns { data: actualData }
 * and we need to access actualData directly.
 *
 * @param data - RPC response that may have nested .data property
 * @returns Unwrapped data (data.data if it exists, otherwise data as-is)
 *
 * @example
 * unwrapNestedData({ data: { items: [] } })  // => { items: [] }
 * unwrapNestedData({ items: [] })            // => { items: [] }
 * unwrapNestedData(null)                     // => null
 *
 * @see M4 - DRY Violation: Response Unwrapping Logic Duplicated
 */
export function unwrapNestedData<T>(data: T | { data: T } | null | undefined): T | null {
  if (data === null || data === undefined) {
    return null;
  }

  // Check if data has a nested .data property
  if (typeof data === 'object' && 'data' in data && data.data !== undefined) {
    return data.data as T;
  }

  return data as T;
}

export default {
  unwrapArrayResponse,
  extractArrayData,
  extractSuccess,
  extractErrorMessage,
  extractPagination,
  parseRpcResponse,
  unwrapNestedData,
};
