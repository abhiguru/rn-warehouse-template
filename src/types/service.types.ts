/**
 * Standardized Service Types
 *
 * These types provide a consistent interface for all service responses,
 * pagination, and common patterns across the application.
 *
 * Issue #6: Standardize service return types to ServiceListResponse<T>
 *
 * MIGRATION NOTE: Moving to snake_case types from rpc-canonical.types.ts
 * Use RpcPagination instead of PaginationInfo/PaginationInfoSnakeCase
 */

// Import canonical types for use in this file
// Note: These are re-exported from index.ts to avoid conflicts with rpc.types.ts
import type { RpcPagination } from './rpc-canonical.types';
export type { RpcPagination };

/**
 * @deprecated Use RpcPagination from rpc-canonical.types.ts instead
 * Standard pagination information returned by list endpoints (camelCase)
 * @see J7 - DRY Violation: Pagination Types Duplicated
 */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * @deprecated Use RpcPagination from rpc-canonical.types.ts instead
 * Pagination info with snake_case fields (matches backend response format)
 * @see J7 - DRY Violation: Pagination Types Duplicated
 */
export interface PaginationInfoSnakeCase {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * @deprecated Use RpcPagination from rpc-canonical.types.ts instead
 * Simple pagination with only total and hasMore (for minimal responses)
 * @see J7 - DRY Violation: Pagination Types Duplicated
 */
export interface SimplePagination {
  total: number;
  hasMore: boolean;
}

/**
 * Standard pagination parameters for list requests
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Standard sort parameters
 */
export interface SortParams<T extends string = string> {
  sortBy?: T;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Standard date range filter
 */
export interface DateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Base service response interface for all service calls
 */
export interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Standard list response interface for paginated list endpoints
 * All list services should return this format
 */
export interface ServiceListResponse<TItem, TAggregations = Record<string, unknown>> {
  success: boolean;
  message: string;
  data: {
    items: TItem[];
    pagination: PaginationInfo;
    aggregations?: TAggregations;
    filters?: {
      dateFrom: string | null;
      dateTo: string | null;
      appliedFilters: Record<string, unknown>;
      sortBy: string;
      sortOrder: string;
    };
    userAccess?: {
      userId?: string;
      role: string;
      isAdmin: boolean;
      isSupervisor: boolean;
      accessibleCustomers?: number;
    };
  };
  error?: string;
}

/**
 * Standard detail response interface for single item endpoints
 */
export interface ServiceDetailResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error?: string;
}

/**
 * Standard create/update response interface
 */
export interface ServiceMutationResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Standard delete response interface
 */
export interface ServiceDeleteResponse {
  success: boolean;
  message: string;
  deletedId?: string;
  error?: string;
}

/**
 * Error information for categorized errors
 */
export interface ServiceError {
  type: 'network' | 'auth' | 'server' | 'validation' | 'timeout' | 'unknown';
  code?: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  originalError?: unknown;
}

/**
 * Helper type to create empty list response
 */
export function createEmptyListResponse<TItem, TAggregations = Record<string, unknown>>(
  message: string,
  pagination: Partial<PaginationInfo> = {}
): ServiceListResponse<TItem, TAggregations> {
  return {
    success: false,
    message,
    data: {
      items: [],
      pagination: {
        total: 0,
        limit: pagination.limit ?? 20,
        offset: pagination.offset ?? 0,
        hasMore: false,
      },
    },
  };
}

/**
 * Helper type to create success list response
 */
export function createListResponse<TItem, TAggregations = Record<string, unknown>>(
  items: TItem[],
  pagination: PaginationInfo,
  message: string = 'Data retrieved successfully',
  aggregations?: TAggregations
): ServiceListResponse<TItem, TAggregations> {
  return {
    success: true,
    message,
    data: {
      items,
      pagination,
      aggregations,
    },
  };
}

// ============================================================
// GRN-specific types (for backward compatibility during migration)
// ============================================================

export interface GRNAggregations {
  totalQty: number;
  totalStock: number;
}

export interface GRNUserAccess {
  role: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  accessibleCustomers: number;
}

// ============================================================
// Dispatch-specific types (for backward compatibility during migration)
// ============================================================

export interface DispatchAggregations {
  totalDispatches: number;
  totalDispatchedQty: number;
  totalWeight: number;
  uniqueCustomers: number;
  uniqueGrns: number;
}

export interface DispatchUserAccess {
  userId: string;
  role: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  accessibleCustomers: number;
}

// ============================================================
// Invoice-specific types (for backward compatibility during migration)
// ============================================================

export interface InvoiceAggregations {
  totalAmount?: number;
  invoiceCount?: number;
}

// ============================================================
// Order-specific types (for backward compatibility during migration)
// ============================================================

export interface OrderAggregations {
  totalOrders?: number;
  totalItems?: number;
}
