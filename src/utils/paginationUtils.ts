/**
 * Pagination Utilities
 *
 * Provides standardized pagination conversion and calculation helpers.
 * Addresses Issue #18: Inconsistent Pagination Patterns
 *
 * Frontend uses offset-based pagination (offset/limit)
 * Backend RPCs may use page-based pagination (page/limit)
 * This utility handles conversion between the two patterns.
 */

/**
 * Converts offset-based pagination to page number
 *
 * @param offset - The offset (number of items to skip)
 * @param limit - Page size
 * @returns Page number (1-indexed)
 *
 * @example
 * offsetToPage(0, 20) // => 1 (first page)
 * offsetToPage(20, 20) // => 2 (second page)
 * offsetToPage(159, 80) // => 2 (items 80-159 = page 2)
 */
export function offsetToPage(offset: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.floor(offset / limit) + 1;
}

/**
 * Converts page number to offset
 *
 * @param page - Page number (1-indexed)
 * @param limit - Page size
 * @returns Offset value
 *
 * @example
 * pageToOffset(1, 20) // => 0
 * pageToOffset(2, 20) // => 20
 * pageToOffset(3, 20) // => 40
 */
export function pageToOffset(page: number, limit: number): number {
  if (page <= 0) return 0;
  return (page - 1) * limit;
}

/**
 * Calculates whether there are more items to load
 *
 * @param currentOffset - Current offset
 * @param pageSize - Number of items per page
 * @param totalItems - Total number of items
 * @returns Boolean indicating if there are more items
 */
export function hasMoreItems(
  currentOffset: number,
  pageSize: number,
  totalItems: number
): boolean {
  return currentOffset + pageSize < totalItems;
}

/**
 * Calculates total number of pages
 *
 * @param totalItems - Total number of items
 * @param pageSize - Number of items per page
 * @returns Total page count
 */
export function getTotalPages(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.ceil(totalItems / pageSize);
}

/**
 * Creates pagination info from offset-based parameters (camelCase)
 * @deprecated Use createRpcPagination for snake_case format
 *
 * @param offset - Current offset
 * @param limit - Page size
 * @param total - Total item count
 * @returns Pagination info object
 */
export function createPaginationInfo(
  offset: number,
  limit: number,
  total: number
): {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
} {
  return {
    total,
    limit,
    offset,
    hasMore: hasMoreItems(offset, limit, total),
    currentPage: offsetToPage(offset, limit),
    totalPages: getTotalPages(total, limit),
  };
}

/**
 * Creates RPC-compatible pagination info (snake_case)
 * Matches RpcPagination type from rpc-canonical.types.ts
 *
 * @param offset - Current offset
 * @param limit - Page size
 * @param totalCount - Total item count
 * @returns Pagination info object with snake_case fields
 */
export function createRpcPagination(
  offset: number,
  limit: number,
  totalCount: number
): {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
} {
  return {
    total_count: totalCount,
    limit,
    offset,
    has_more: hasMoreItems(offset, limit, totalCount),
  };
}

/**
 * Applies client-side pagination to an array
 * Use when backend doesn't support pagination
 *
 * @param data - Full data array
 * @param offset - Start index
 * @param limit - Number of items to return
 * @returns Paginated slice of data
 */
export function paginateArray<T>(
  data: T[],
  offset: number,
  limit: number
): T[] {
  return data.slice(offset, offset + limit);
}

/**
 * Validates pagination parameters
 *
 * @param offset - Offset value
 * @param limit - Limit value
 * @returns Normalized pagination params with defaults
 */
export function normalizePaginationParams(
  offset?: number,
  limit?: number,
  defaults: { offset: number; limit: number } = { offset: 0, limit: 20 }
): { offset: number; limit: number } {
  return {
    offset: Math.max(0, offset ?? defaults.offset),
    limit: Math.max(1, limit ?? defaults.limit),
  };
}

export default {
  offsetToPage,
  pageToOffset,
  hasMoreItems,
  getTotalPages,
  createPaginationInfo,
  createRpcPagination,
  paginateArray,
  normalizePaginationParams,
};
