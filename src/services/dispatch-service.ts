import { getSupabaseClient, getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import { offsetToPage, hasMoreItems } from '@/utils/paginationUtils';
import {
  generateCacheKey,
  getCachedData,
  setCachedData,
  invalidateCacheByPrefix,
} from '@/utils/cacheManager';
import { unwrapNestedData } from '@/utils/responseUtils';
import { createErrorResponse, executeRPC, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';
import { BackendDispatchData, RecentDispatchedOrdersResponse } from '@/types/dispatch.types';
import { CACHE_DURATION_DEFAULT_MS, CACHE_PREFIXES, PAGINATION } from '@/config/cacheConfig';
// Import canonical types for migration
import type { RpcPagination, RpcDispatchListItem } from '@/types/rpc-canonical.types';

// Cache configuration for dispatch data (DRY-7: Using shared cacheManager)
const DISPATCH_CACHE_PREFIX = CACHE_PREFIXES.DISPATCH_LIST;
const DISPATCH_CACHE_EXPIRY_MS = CACHE_DURATION_DEFAULT_MS;

/**
 * Generate a dispatch-specific cache key
 */
const generateDispatchCacheKey = (params: GetDispatchListWithItemsParams & { offset?: number }): string => {
  return generateCacheKey(DISPATCH_CACHE_PREFIX, {
    customerId: params.p_customer_id || 'all',
    sortBy: params.p_sort_by || 'dispatch_date',
    sortOrder: params.p_sort_order || 'desc',
    limit: params.p_limit || PAGINATION.DEFAULT_LIMIT,
    offset: params.offset || 0,
    filters: params.p_filters || {},
  });
};

/**
 * P13: Invalidate all dispatch list caches after mutations
 * Clears all cached dispatch data to ensure fresh data is fetched
 */
export const invalidateDispatchCache = async (): Promise<void> => {
  await invalidateCacheByPrefix(DISPATCH_CACHE_PREFIX);
};

/**
 * Dispatch item - uses snake_case matching backend RPC response
 */
export interface DispatchItem {
  id: string;
  dispatch_id: string;
  disp_no: string;
  disp_date: string;
  customer_name: string;
  supervisor_name: string | null;
  registration: string | null;
  disp_qty: number;
  grn_item_id: string;
  item_name: string;
  original_qty: number;
  current_stock: number;
  weight: number | null;
  rack: string | null;
  package_mark: string | null;
  created_at: string;
  updated_at: string;
  note?: string | null;
  grn_id: string;
  item_id: string;
  packaging: string | null;
  customer_id: string;
  pricing_mode: string | null;
  supervisor_id: string | null;
  source_order_id?: string | null;
  source_order_no?: string | null;
}

/**
 * Dispatch filters - uses snake_case matching backend RPC parameters
 */
export interface DispatchFilters {
  customer_name?: string;       // Partial customer name search
  disp_no?: string;            // Partial dispatch number search
  disp_no_from?: string;       // Dispatch number range start
  disp_no_to?: string;         // Dispatch number range end
  supervisor_name?: string;    // Partial supervisor name search
  item_name?: string;          // Search dispatches containing this item
  registration?: string;       // Registration number filter
  gr_no?: string;              // GRN number filter
}

/**
 * Dispatch entity - uses snake_case matching backend RPC response
 */
export interface Dispatch {
  id: string;
  dispatch_id: string;
  disp_no: string;
  disp_date: string;
  registration?: string | null;
  note?: string | null;
  customer_id: string;
  customer_name: string;
  supervisor_id: string | null;
  supervisor_name?: string | null;
  total_items?: number;
  total_qty?: number;
  total_weight?: number | null;
  item_summary?: DispatchItemSummary[];
  grn_summary?: {
    unique_grns: number;
    grn_numbers: string[];
  };
  items?: DispatchItemDetail[];
  created_at: string;
  updated_at: string;
}

/**
 * Dispatch item summary - uses snake_case
 */
export interface DispatchItemSummary {
  item_id: string;
  item_name?: string;
  disp_qty?: number;
  weight?: number | null;
  package_mark?: string | null;
  rack?: string | null;
  gr_no?: string;
  grn_item_id: string;
}

/**
 * Dispatch item detail from get_dispatch_list_with_items RPC
 */
export interface DispatchItemDetail {
  item_id: string;
  item_name: string;
  disp_qty: number;
  weight: number | null;
  gr_no: string;
  grn_item_id: string;
  package_mark: string | null;
  grn_qty: number;
  rack?: string | null;
}

/**
 * Dispatch aggregations - uses snake_case
 */
export interface DispatchAggregations {
  total_dispatches: number;
  total_dispatched_qty: number;
  total_weight: number | null;
  unique_customers: number;
  unique_grns: number;
}

/**
 * Dispatch user access info - uses snake_case
 */
export interface DispatchUserAccess {
  user_id: string;
  role: string;
  is_admin: boolean;
  is_supervisor: boolean;
  accessible_customers: number;
}

/**
 * Dispatch list response - uses snake_case
 */
export interface DispatchListResponseNew {
  success: boolean;
  message: string;
  data: {
    dispatches: Dispatch[];
    pagination: RpcPagination;
    aggregations: DispatchAggregations;
    filters: {
      date_from: string | null;
      date_to: string | null;
      applied_filters: DispatchFilters;
      sort_by: string;
      sort_order: string;
    };
    user_access: DispatchUserAccess;
  };
}

/**
 * Get dispatch list parameters - uses snake_case for sort fields
 */
export interface GetDispatchListParams {
  p_date_from?: string;
  p_date_to?: string;
  p_filters?: DispatchFilters;
  p_sort_by?: 'disp_date' | 'disp_no' | 'customer_name' | 'supervisor_name' | 'total_qty' | 'total_weight' | 'created_at';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

/**
 * Get dispatch list with items parameters
 */
export interface GetDispatchListWithItemsParams {
  p_customer_id?: string;
  p_filters?: Record<string, unknown>;
  p_sort_by?: 'dispatch_date' | 'disp_no' | 'customer_name';
  p_sort_order?: 'asc' | 'desc';
  p_page?: number;
  p_limit?: number;
  p_include_items?: boolean;
}

/**
 * @deprecated Use DispatchFilters instead
 * Legacy filters for backward compatibility
 */
export interface LegacyDispatchFilters {
  disp_no?: string;
  customer_name?: string;
  item_name?: string;
  package_mark?: string;
  rack?: string;
}

/**
 * Dispatch list response - uses snake_case
 */
export interface DispatchListResponse {
  success: boolean;
  message: string;
  error?: string;
  data?: {
    items: DispatchItem[];
    pagination: RpcPagination;
    aggregations: {
      total_dispatches: number;
      total_dispatch_qty: number;
    };
    user_access: DispatchUserAccess;
  };
}

/**
 * Get all dispatch items parameters - uses snake_case for sort fields
 */
export interface GetAllDispatchItemsParams {
  p_filters?: LegacyDispatchFilters;
  p_date_from?: string;
  p_date_to?: string;
  p_sort_by?: 'date' | 'disp_no' | 'customer_name' | 'item_name' | 'disp_qty';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

export const getAllDispatchItems = async (
  params: GetAllDispatchItemsParams
): Promise<DispatchListResponse> => {
  try {
    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_all_dispatch_items', params);

    if (error) {
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        message: 'Failed to fetch dispatch items',
        error: error.message || error.details || 'Unknown database error'
      };
    }

    if (!data) {
      return {
        success: false,
        message: 'No data returned from server',
        error: 'Empty response'
      };
    }

    // The RPC returns data in a nested structure: { data: { items: [...], pagination: {...}, ... } }
    // Using unwrapNestedData utility for consistent response handling (M4 fix)
    const responseData = unwrapNestedData(data) || data;

    // Calculate pagination based on the response structure using standardized utility
    const totalItems = responseData.pagination?.total || responseData.aggregations?.totalDispatches || 0;
    const currentOffset = params.p_offset || 0;
    const currentLimit = params.p_limit || PAGINATION.DEFAULT_LIMIT;
    const itemsReturned = responseData.items?.length || 0;
    // hasMoreItems(offset, pageSize, total): returns true if offset + pageSize < total
    const hasMore = hasMoreItems(currentOffset, itemsReturned, totalItems);

    return {
      success: true,
      message: 'Dispatch items fetched successfully',
      data: {
        items: responseData.items || [],
        pagination: {
          total_count: totalItems,
          limit: currentLimit,
          offset: currentOffset,
          has_more: hasMore
        },
        aggregations: {
          total_dispatches: responseData.aggregations?.totalDispatches || responseData.aggregations?.total_dispatches || 0,
          total_dispatch_qty: responseData.aggregations?.totalDispatchQty || responseData.aggregations?.total_dispatch_qty || 0
        },
        user_access: responseData.userAccess || responseData.user_access || {
          user_id: '',
          role: 'customer',
          is_admin: false,
          is_supervisor: false,
          accessible_customers: 0
        }
      }
    };

  } catch (error) {
    return createErrorResponse(error, 'An unexpected error occurred', 'DispatchService.getAllDispatchItems');
  }
};

// New dispatch-wise function using get_dispatch_list RPC
export const getDispatchList = async (
  params: GetDispatchListParams = {}
): Promise<DispatchListResponseNew> => {
  try {
    const {
      p_date_from,
      p_date_to,
      p_filters = {},
      p_sort_by = 'dispDate',
      p_sort_order = 'desc',
      p_limit = 20,
      p_offset = 0
    } = params;

    // Generate deduplication key for this request
    const dedupKey = generateRequestKey('getDispatchList', {
      p_date_from, p_date_to, p_filters, p_sort_by, p_sort_order, p_limit, p_offset
    });

    // Use deduplication to prevent duplicate simultaneous requests
    const { data, error } = await deduplicatedRequest(dedupKey, async () => {
      const authenticatedClient = await getAuthenticatedClient();
      return authenticatedClient.rpc('get_dispatch_list', {
        p_date_from: p_date_from || null,
        p_date_to: p_date_to || null,
        p_filters: p_filters,
        p_sort_by,
        p_sort_order,
        p_limit,
        p_offset
      });
    });
    

    if (error) {
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        message: 'Failed to fetch dispatch list',
        data: {
          dispatches: [],
          pagination: { total_count: 0, limit: p_limit, offset: p_offset, has_more: false },
          aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
          filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: p_sort_by, sort_order: p_sort_order },
          user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
        }
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        message: data?.message || 'No data returned from server',
        data: {
          dispatches: [],
          pagination: { total_count: 0, limit: p_limit, offset: p_offset, has_more: false },
          aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
          filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: p_sort_by, sort_order: p_sort_order },
          user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
        }
      };
    }

    return {
      success: true,
      message: data.message || 'Dispatch list retrieved successfully',
      data: data.data
    };

  } catch (error) {
    return {
      ...createErrorResponse(error, 'An unexpected error occurred', 'DispatchService.getDispatchList'),
      data: {
        dispatches: [],
        pagination: { total_count: 0, limit: params.p_limit || PAGINATION.DEFAULT_LIMIT, offset: params.p_offset || 0, has_more: false },
        aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
        filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: params.p_sort_by || 'disp_date', sort_order: params.p_sort_order || 'desc' },
        user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
      }
    };
  }
};

// New function using get_dispatch_list_with_items RPC with optional item details
export const getDispatchListWithItems = async (
  params: GetDispatchListWithItemsParams & { offset?: number } = {}
): Promise<DispatchListResponseNew> => {
  const {
    p_customer_id,
    p_filters = {},
    p_sort_by = 'dispatch_date',
    p_sort_order = 'desc',
    p_limit = 20,
    p_include_items = true,
    offset = 0
  } = params;

  // Generate cache key for this request (DRY-7)
  const cacheKey = generateDispatchCacheKey(params);

  try {
    // Convert offset-based pagination to page-based using standardized utility
    const p_page = offsetToPage(offset, p_limit);

    // Debug: Check token storage
    const tokenData = await getStoredToken();
    console.log('[Dispatch Service] Token check:', {
      hasToken: !!tokenData.authToken,
      isValid: tokenData.isValid,
      type: tokenData.type,
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'N/A'
    });

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();

    // Debug: Check authentication status and token validity
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    console.log('[Dispatch Service] Session check:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      userId: session?.user?.id,
      sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
      isExpired: session?.expires_at ? new Date(session.expires_at * 1000) < new Date() : 'N/A'
    });

    // Transform filter keys from camelCase (frontend) to snake_case (backend)
    const transformedFilters: Record<string, unknown> = {};
    const keyMap: Record<string, string> = {
      dispNoFrom: 'disp_no_from',
      dispNoTo: 'disp_no_to',
      qtyMin: 'qty_min',
      qtyMax: 'qty_max',
      dispQtyMin: 'disp_qty_min',
      dispQtyMax: 'disp_qty_max',
    };
    for (const [key, value] of Object.entries(p_filters)) {
      if (value !== undefined && value !== null && value !== '') {
        transformedFilters[keyMap[key] || key] = value;
      }
    }

    console.log('🔍 [Dispatch Service] RPC params being sent:', JSON.stringify({
      p_customer_id: p_customer_id || null,
      p_filters: transformedFilters,
      p_sort_by,
      p_sort_order,
      p_page,
      p_limit,
      p_include_items
    }, null, 2));

    // Generate deduplication key for this request (PO9 fix)
    const dedupKey = generateRequestKey('getDispatchListWithItems', {
      p_customer_id, p_filters: transformedFilters, p_sort_by, p_sort_order, p_page, p_limit, p_include_items
    });

    console.time('⏱️ [Dispatch Service] RPC call duration');
    const { data, error } = await deduplicatedRequest(dedupKey, async () => {
      return authenticatedClient.rpc('get_dispatch_list_with_items', {
        p_customer_id: p_customer_id || null,
        p_filters: transformedFilters,
        p_sort_by,
        p_sort_order,
        p_page,
        p_limit,
        p_include_items
      });
    });
    console.timeEnd('⏱️ [Dispatch Service] RPC call duration');

    if (data) {
      const dataSize = JSON.stringify(data).length;
      const dispatches = (data.dispatches || data.data?.dispatches || []) as Array<{ items?: unknown[]; dispNo?: string }>;
      const totalItems = dispatches.reduce((sum: number, d) => sum + (d.items?.length || 0), 0);
      console.log(`📊 [Dispatch Service] Data size: ${(dataSize / 1024).toFixed(2)} KB, Dispatches: ${dispatches.length}, Total items: ${totalItems}`);

      // Log first few dispatch numbers to verify filtering
      const firstFewDispNos = dispatches.slice(0, 3).map((d) => d.dispNo);
      console.log('📥 [Dispatch Range Debug] First few dispatch numbers returned:', firstFewDispNos);

      // Log first dispatch item to check available fields for GRN quantity
      const firstDispatchWithItems = dispatches.find((d) => d.items && d.items.length > 0);
      if (firstDispatchWithItems?.items?.[0]) {
        console.log('📋 [Dispatch Item Fields] Sample item:', JSON.stringify(firstDispatchWithItems.items[0], null, 2));
      }

      // Debug: Log if no dispatches to help troubleshoot
      if (dispatches.length === 0) {
        console.log('⚠️ [Dispatch Service] No dispatches returned. Full response structure:', Object.keys(data));
        console.log('⚠️ [Dispatch Service] Response data.success:', data.success);
        console.log('⚠️ [Dispatch Service] Response data.message:', data.message);
      }
    }

    if (error) {
      console.error('[getDispatchListWithItems] RPC error:', error);
      console.error('[getDispatchListWithItems] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        message: error.message || 'Failed to fetch dispatch list',
        data: {
          dispatches: [],
          pagination: { total_count: 0, limit: p_limit, offset: offset, has_more: false },
          aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
          filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'disp_date', sort_order: p_sort_order },
          user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
        }
      };
    }

    if (!data || !data.success) {
      console.error('[getDispatchListWithItems] Invalid response:', data);
      return {
        success: false,
        message: data?.message || 'No data returned from server',
        data: {
          dispatches: [],
          pagination: { total_count: 0, limit: p_limit, offset: offset, has_more: false },
          aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
          filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'disp_date', sort_order: p_sort_order },
          user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
        }
      };
    }

    // Map response to match existing structure
    // Note: RPC returns page-based pagination, we need to convert back to offset-based
    const responseData = data.data;
    const dispatchesReturned = responseData.dispatches?.length || 0;
    const totalItems = responseData.pagination?.total || responseData.totalCount || 0;
    const currentPage = responseData.pagination?.currentPage || responseData.currentPage || p_page;
    const totalPages = responseData.pagination?.totalPages || responseData.totalPages || 0;

    // Calculate hasMore: prefer page-based comparison if totalPages is available,
    // otherwise fall back to checking if we got a full page of results
    const hasMore = totalPages > 0
      ? currentPage < totalPages
      : dispatchesReturned >= p_limit; // Assume more if we got a full page

    if (__DEV__) console.log('[DispatchService] Pagination calculation:', {
      totalItems,
      currentPage,
      totalPages,
      hasMore,
      requestedPage: p_page,
      requestedOffset: offset,
      dispatchesReturned,
      p_limit,
    });

    // Map backend field names to frontend interface (snake_case)
    // BackendDispatchData is imported from @/types/dispatch.types
    if (__DEV__ && responseData.dispatches?.length > 0) {
      const firstDispatch = responseData.dispatches[0];
      console.log('[DispatchService] Raw dispatch fields from RPC:', Object.keys(firstDispatch));
      console.log('[DispatchService] First dispatch FULL object:', JSON.stringify(firstDispatch, null, 2));
      console.log('[DispatchService] Raw dispatch date fields:', {
        dispDate: firstDispatch.dispDate,
        dispatchDate: firstDispatch.dispatchDate,
        disp_date: firstDispatch.disp_date,
        dispatch_date: firstDispatch.dispatch_date,
        date: firstDispatch.date,
      });
    }
    const mappedDispatches: Dispatch[] = responseData.dispatches.map((dispatch: BackendDispatchData) => {
      // Calculate totals from items array if not provided by backend
      // Use Number() to coerce strings to numbers and prevent string concatenation
      const items = dispatch.items || [];
      const calculatedTotalItems = items.length;
      const calculatedTotalQty = items.reduce((sum, item) => sum + (Number(item.dispQty || item.disp_qty) || 0), 0);
      const calculatedTotalWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);

      // Map to snake_case format
      const mapped: Dispatch = {
        id: dispatch.id,
        dispatch_id: dispatch.id,
        disp_no: dispatch.dispNo || dispatch.disp_no || '',
        note: dispatch.notes || dispatch.note || null,
        disp_date: dispatch.dispDate || dispatch.dispatchDate || dispatch.disp_date || dispatch.dispatch_date || dispatch.date || '',
        registration: dispatch.registration || dispatch.truck_no || null,
        customer_id: dispatch.customerId || dispatch.customer_id || '',
        customer_name: dispatch.customerName || dispatch.customer_name || '',
        supervisor_id: dispatch.supervisorId || dispatch.supervisor_id || null,
        supervisor_name: dispatch.supervisorName || dispatch.supervisor_name || null,
        total_items: dispatch.totalItems || dispatch.total_items || calculatedTotalItems,
        total_qty: dispatch.totalQty || dispatch.total_qty || calculatedTotalQty,
        total_weight: dispatch.totalWeight || dispatch.total_weight || calculatedTotalWeight,
        items: items.map(item => ({
          item_id: item.itemId || item.item_id || '',
          item_name: item.itemName || item.item_name || '',
          disp_qty: Number(item.dispQty || item.disp_qty) || 0,
          weight: Number(item.weight) || null,
          gr_no: item.grNo || item.gr_no || '',
          grn_item_id: item.grnItemId || item.grn_item_id || '',
          package_mark: item.packageMark || item.package_mark || null,
          grn_qty: Number(item.grnQty || item.grn_qty) || 0,
          rack: item.rack || null,
        })),
        created_at: dispatch.createdAt || dispatch.created_at || '',
        updated_at: dispatch.updatedAt || dispatch.updated_at || '',
      };

      return mapped;
    });

    const responsePayload = {
      ...responseData,
      dispatches: mappedDispatches,
      pagination: {
        total_count: totalItems,
        limit: p_limit,
        offset: offset,
        has_more: hasMore
      }
    };

    // Cache successful response for offline access (fire and forget) - DRY-7
    setCachedData(cacheKey, responsePayload, { expiryMs: DISPATCH_CACHE_EXPIRY_MS }).catch((err) => {
      console.warn('[DispatchService] Failed to cache dispatch data:', cacheKey, err);
    });

    return {
      success: true,
      message: data.message || 'Dispatch list retrieved successfully',
      data: responsePayload
    };

  } catch (error) {
    console.error('[getDispatchListWithItems] Exception:', error);

    // On network error, try to return cached data as fallback (DRY-7)
    const cachedData = await getCachedData<DispatchListResponseNew['data']>(cacheKey, {
      expiryMs: DISPATCH_CACHE_EXPIRY_MS,
    });
    if (cachedData) {
      console.log('[DispatchService] Network error, returning cached dispatch data as fallback');
      return {
        success: true,
        message: 'Dispatch list retrieved from cache (network error fallback)',
        data: cachedData,
      };
    }

    return {
      ...createErrorResponse(error, 'An unexpected error occurred', 'DispatchService.getDispatchListWithItems'),
      data: {
        dispatches: [],
        pagination: { total_count: 0, limit: params.p_limit || PAGINATION.DEFAULT_LIMIT, offset: params.offset || 0, has_more: false },
        aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
        filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'disp_date', sort_order: params.p_sort_order || 'desc' },
        user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 }
      }
    };
  }
};

/**
 * Delete a dispatch by ID with comprehensive cleanup
 * Restores stock, recreates order items, restores cart quantities, and resets order status
 */
export const deleteDispatch = async (
  dispatchId: string,
  userId: string
): Promise<{ success: boolean; message: string; error?: string; invoiceItemsCount?: number; blockingReason?: string; instructions?: string; cacheInvalidated?: boolean; orderRestored?: boolean; restoredOrderId?: string }> => {
  try {
    console.log('[DispatchService] ========== DELETE DISPATCH START ==========');
    console.log('[DispatchService] Dispatch ID:', dispatchId);
    console.log('[DispatchService] User ID:', userId);
    console.log('[DispatchService] Calling RPC: delete_dispatch_with_order_cleanup');

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('delete_dispatch_with_order_cleanup', {
      p_dispatch_id: dispatchId,
      p_user_id: userId,
    });

    console.log('[DispatchService] RPC Response - error:', error);
    console.log('[DispatchService] RPC Response - data:', JSON.stringify(data, null, 2));

    if (error) {
      console.error('[DispatchService] ❌ RPC Error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        message: 'Failed to delete dispatch',
        error: error.message,
      };
    }

    // Handle response - the RPC returns a single object, not an array
    const result = data;

    if (!result.success) {
      console.error('[DispatchService] ❌ Dispatch deletion failed:', result);
      return {
        success: false,
        message: result.message || 'Failed to delete dispatch',
        error: result.error,
        invoiceItemsCount: result.invoice_items_count,
        blockingReason: result.blocking_reason,
        instructions: result.instructions,
      };
    }

    console.log('[DispatchService] ✅ Dispatch deleted successfully');
    console.log('[DispatchService] Order restored:', result.order_restored || result.orderRestored || false);
    console.log('[DispatchService] Restored order ID:', result.restored_order_id || result.restoredOrderId || 'N/A');
    console.log('[DispatchService] Stock restored:', result.stock_restored || result.stockRestored || 'N/A');
    console.log('[DispatchService] Full result:', JSON.stringify(result, null, 2));

    // P13: Invalidate cache after successful deletion
    // E10 Fix: Handle cache invalidation errors gracefully
    let cacheInvalidated = true;
    try {
      await invalidateDispatchCache();
    } catch (cacheError) {
      console.error('[DispatchService] Cache invalidation failed (mutation succeeded):', cacheError);
      cacheInvalidated = false;
    }

    console.log('[DispatchService] ========== DELETE DISPATCH END ==========');

    return {
      success: true,
      message: result.message || 'Dispatch deleted successfully with order and stock restoration.',
      cacheInvalidated, // E10: Inform UI if cache invalidation failed
      orderRestored: result.order_restored || result.orderRestored || false,
      restoredOrderId: result.restored_order_id || result.restoredOrderId,
    };
  } catch (error) {
    console.error('[DispatchService] ❌ Exception deleting dispatch:', error);
    return createErrorResponse(error, 'An unexpected error occurred', 'DispatchService.deleteDispatch');
  }
};

/**
 * Get recent dispatched orders (dispatches created from orders)
 * Uses get_recent_dispatched_orders RPC
 * Only accessible by admin, supervisor, staff roles
 */
export const getRecentDispatchedOrders = async (
  limit: number = 10,
  offset: number = 0
): Promise<RecentDispatchedOrdersResponse> => {
  try {
    if (__DEV__) {
      console.log('[DispatchService] Fetching recent dispatched orders:', { limit, offset });
    }

    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_recent_dispatched_orders', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('[DispatchService] get_recent_dispatched_orders RPC error:', error);
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        error: error.message || 'Failed to fetch recent dispatched orders',
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'No data returned from server',
      };
    }

    // Handle access denied case
    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Access denied',
      };
    }

    if (__DEV__) {
      console.log('[DispatchService] Recent dispatched orders fetched:', {
        count: data.data?.dispatches?.length || 0,
        total: data.data?.total_count || 0,
      });
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error('[DispatchService] Exception in getRecentDispatchedOrders:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
};