import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { compareDocumentNumbers } from '@/utils/documentNumber';
import { offsetToPage, hasMoreItems } from '@/utils/paginationUtils';
import {
  generateScopedCacheKey,
  getCachedData,
  getSessionCacheScope,
  setCachedData,
  invalidateCacheByPrefix,
} from '@/utils/cacheManager';
import { unwrapNestedData } from '@/utils/responseUtils';
import { createErrorResponse, executeRPC, handleGlobalAuthError, isOfflineFailure } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';
import { BackendDispatchData, RecentDispatchedOrdersResponse } from '@/types/dispatch.types';
import { CACHE_DURATION_DEFAULT_MS, CACHE_PREFIXES, PAGINATION } from '@/config/cacheConfig';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
// Import canonical types for migration
import type { RpcPagination, RpcDispatchListItem } from '@/types/rpc-canonical.types';
import { t } from '@/i18n';

// Cache configuration for dispatch data (DRY-7: Using shared cacheManager)
const DISPATCH_CACHE_PREFIX = CACHE_PREFIXES.DISPATCH_LIST;
const DISPATCH_CACHE_EXPIRY_MS = CACHE_DURATION_DEFAULT_MS;

/**
 * Generate a dispatch-specific cache key scoped to the signed-in session on the
 * selected server. Without a session scope there is no key: nothing is read
 * from or written to the cache.
 */
const generateDispatchCacheKey = async (
  params: GetDispatchListWithItemsParams & { offset?: number }
): Promise<string | null> => {
  const scope = await getSessionCacheScope();
  if (!scope) return null;
  return generateScopedCacheKey(DISPATCH_CACHE_PREFIX, scope, {
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

export interface GetCustomerDispatchListParams {
  p_customer_id: string;
  p_limit?: number;
  p_offset?: number;
  p_include_items?: boolean;
}

export const mapBackendDispatch = (dispatch: BackendDispatchData): Dispatch => {
  const items = dispatch.items || [];
  const calculatedTotalItems = items.length;
  const calculatedTotalQty = items.reduce(
    (sum, item) => sum + (Number(item.dispQty || item.disp_qty) || 0),
    0
  );
  const calculatedTotalWeight = items.reduce(
    (sum, item) => sum + (Number(item.weight) || 0),
    0
  );

  return {
    id: dispatch.id,
    dispatch_id: dispatch.id,
    disp_no: dispatch.dispNo || dispatch.disp_no || '',
    note: dispatch.notes || dispatch.note || null,
    disp_date:
      dispatch.dispDate ||
      dispatch.dispatchDate ||
      dispatch.disp_date ||
      dispatch.dispatch_date ||
      dispatch.date ||
      '',
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
};

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
        message: t('errors.dispatch.fetchItemsFailed'),
        error: error.message || error.details || t('errors.general.unknownDatabase')
      };
    }

    if (!data) {
      return {
        success: false,
        message: t('errors.general.noDataFromServer'),
        error: t('errors.general.emptyResponse')
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
      message: t('errors.dispatch.itemsFetched'),
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
    return createErrorResponse(error, t('errors.general.unexpected'), 'DispatchService.getAllDispatchItems');
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
        message: t('errors.dispatch.fetchListFailed'),
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
        message: data?.message || t('errors.general.noDataFromServer'),
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
      message: data.message || t('errors.dispatch.listRetrieved'),
      data: data.data
    };

  } catch (error) {
    return {
      ...createErrorResponse(error, t('errors.general.unexpected'), 'DispatchService.getDispatchList'),
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

  // Session-scoped cache key for this request (DRY-7); null without a session.
  const cacheKey = await generateDispatchCacheKey(params);

  // Only a connectivity failure may be answered from this session's cache. A
  // session change, a missing or unverified session and every authorization
  // failure return the error instead. PostgREST reports a failed fetch as an
  // error object rather than an exception, so both branches below use this.
  const serveCachedList = async (error: unknown): Promise<DispatchListResponseNew | null> => {
    if (!cacheKey || !isOfflineFailure(error)) return null;
    const cachedData = await getCachedData<DispatchListResponseNew['data']>(cacheKey, {
      expiryMs: DISPATCH_CACHE_EXPIRY_MS,
    });
    if (!cachedData) return null;
    console.log('[DispatchService] Network error, returning cached dispatch data as fallback');
    return {
      success: true,
      message: t('errors.dispatch.listFromCache'),
      data: cachedData,
    };
  };

  try {
    // Convert offset-based pagination to page-based using standardized utility
    const p_page = offsetToPage(offset, p_limit);

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();

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

    if (__DEV__ && data) {
      // Counts only: the response carries customer, GRN and item data.
      const dispatches = (data.dispatches || data.data?.dispatches || []) as Array<{ items?: unknown[] }>;
      const totalItems = dispatches.reduce((sum: number, d) => sum + (d.items?.length || 0), 0);
      console.log('[DispatchService] get_dispatch_list_with_items returned', {
        dispatches: dispatches.length,
        totalItems,
      });
    }

    if (error) {
      console.error('[getDispatchListWithItems] RPC error', { code: error.code });
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      const cached = await serveCachedList(error);
      if (cached) return cached;
      return {
        success: false,
        message: error.message || t('errors.dispatch.fetchListFailed'),
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
      console.error('[getDispatchListWithItems] Invalid response', { success: data?.success === true });
      return {
        success: false,
        message: data?.message || t('errors.general.noDataFromServer'),
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
    const totalItems =
      responseData.pagination?.total_count ||
      responseData.pagination?.total ||
      responseData.total_count ||
      responseData.totalCount ||
      0;
    const currentPage =
      responseData.pagination?.current_page ||
      responseData.pagination?.currentPage ||
      responseData.current_page ||
      responseData.currentPage ||
      p_page;
    const totalPages =
      responseData.pagination?.total_pages ||
      responseData.pagination?.totalPages ||
      responseData.total_pages ||
      responseData.totalPages ||
      0;

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
    const mappedDispatches: Dispatch[] = responseData.dispatches.map(mapBackendDispatch);

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
    if (cacheKey) {
      setCachedData(cacheKey, responsePayload, { expiryMs: DISPATCH_CACHE_EXPIRY_MS }).catch((err) => {
        console.warn('[DispatchService] Failed to cache dispatch data:', cacheKey, err);
      });
    }

    return {
      success: true,
      message: data.message || t('errors.dispatch.listRetrieved'),
      data: responsePayload
    };

  } catch (error) {
    console.error('[getDispatchListWithItems] Exception:', error);

    const cached = await serveCachedList(error);
    if (cached) return cached;

    return {
      ...createErrorResponse(error, t('errors.general.unexpected'), 'DispatchService.getDispatchListWithItems'),
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

export const getCustomerDispatchList = async (
  params: GetCustomerDispatchListParams
): Promise<DispatchListResponseNew> => {
  const limit = Math.min(Math.max(params.p_limit || 10, 1), 100);
  const offset = Math.max(params.p_offset || 0, 0);
  const emptyData: DispatchListResponseNew['data'] = {
    dispatches: [],
    pagination: { total_count: 0, limit, offset, has_more: false },
    aggregations: {
      total_dispatches: 0,
      total_dispatched_qty: 0,
      total_weight: null,
      unique_customers: 0,
      unique_grns: 0,
    },
    filters: {
      date_from: null,
      date_to: null,
      applied_filters: {},
      sort_by: 'disp_date',
      sort_order: 'desc',
    },
    user_access: {
      user_id: '',
      role: 'customer',
      is_admin: false,
      is_supervisor: false,
      accessible_customers: 1,
    },
  };

  if (!params.p_customer_id) {
    return {
      success: false,
      message: t('errors.customer.idRequired'),
      data: emptyData,
    };
  }

  try {
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc(
      'get_customer_dispatch_list',
      {
        p_customer_id: params.p_customer_id,
        p_limit: limit,
        p_offset: offset,
        p_include_items: params.p_include_items ?? true,
      }
    );

    if (error) {
      return {
        ...createErrorResponse(
          error,
          t('errors.dispatch.fetchCustomerFailed'),
          'DispatchService.getCustomerDispatchList'
        ),
        data: emptyData,
      };
    }

    if (!data?.success || !data.data) {
      return {
        success: false,
        message: data?.message || t('errors.dispatch.fetchCustomerFailed'),
        data: emptyData,
      };
    }

    const dispatches: Dispatch[] = (data.data.dispatches || []).map(
      (dispatch: BackendDispatchData) => mapBackendDispatch(dispatch)
    );
    const pagination = data.data.pagination || {};
    const totalCount = Number(pagination.total_count) || dispatches.length;

    return {
      success: true,
      message: data.message || t('errors.dispatch.customerRetrieved'),
      data: {
        ...emptyData,
        dispatches,
        pagination: {
          total_count: totalCount,
          limit: Number(pagination.limit) || limit,
          offset: Number(pagination.offset) || offset,
          has_more:
            typeof pagination.has_more === 'boolean'
              ? pagination.has_more
              : hasMoreItems(offset, limit, totalCount),
        },
        aggregations: {
          ...emptyData.aggregations,
          total_dispatches: totalCount,
          total_dispatched_qty: dispatches.reduce(
            (total, dispatch) => total + (dispatch.total_qty || 0),
            0
          ),
          total_weight: dispatches.reduce(
            (total, dispatch) => total + (dispatch.total_weight || 0),
            0
          ),
          unique_customers: dispatches.length > 0 ? 1 : 0,
          unique_grns: new Set(
            dispatches.flatMap(dispatch => dispatch.items?.map(item => item.gr_no) || [])
          ).size,
        },
      },
    };
  } catch (error) {
    return {
      ...createErrorResponse(
        error,
        t('errors.dispatch.fetchCustomerFailed'),
        'DispatchService.getCustomerDispatchList'
      ),
      data: emptyData,
    };
  }
};

/** Rows per request when collecting a customer account's dispatches. */
const CUSTOMER_DISPATCH_PAGE = 100;
/** Upper bound on dispatches collected per customer for one list view. */
const CUSTOMER_DISPATCH_MAX = 1000;

export interface AssignedCustomerDispatchParams {
  p_sort_by?: 'disp_no' | 'dispatch_date';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  offset?: number;
  /** Same keys the staff list sends (see selectCustomerDispatches). */
  p_filters?: Record<string, unknown>;
}

/**
 * The filters, search and order of the staff dispatch list (get_dispatch_list_with_items),
 * applied to dispatches already collected for a customer account. Same filter
 * keys, same meaning: a line filter matches when one line of the dispatch does.
 */
export function selectCustomerDispatches(
  all: Dispatch[],
  filters: Record<string, unknown>,
  sortBy: 'disp_no' | 'dispatch_date' = 'dispatch_date',
  sortOrder: 'asc' | 'desc' = 'desc'
): Dispatch[] {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const moment = (value: unknown) => {
    const time = text(value) ? Date.parse(text(value)) : NaN;
    return Number.isNaN(time) ? null : time;
  };
  const itemIds = Array.isArray(filters.item_ids) ? (filters.item_ids as string[]) : [];
  const from = text(filters.disp_no_from);
  const to = text(filters.disp_no_to);
  const dateFrom = moment(filters.date_from);
  const dateTo = moment(filters.date_to);
  const qtyMin = number(filters.disp_qty_min);
  const qtyMax = number(filters.disp_qty_max);
  const packageTerms = searchTerms(text(filters.package_mark));
  const terms = searchTerms(text(filters.search));
  // The backend's order for document numbers, so customer accounts and warehouse roles agree.
  const compareNo = compareDocumentNumbers;

  const matching = all.filter(dispatch => {
    const lines = dispatch.items ?? [];
    if (itemIds.length > 0 && !lines.some(item => itemIds.includes(item.item_id))) return false;
    if (from && compareNo(dispatch.disp_no, from) < 0) return false;
    if (to && compareNo(dispatch.disp_no, to) > 0) return false;
    if (dateFrom !== null || dateTo !== null) {
      const time = Date.parse(String(dispatch.disp_date));
      if (Number.isNaN(time)) return false;
      if (dateFrom !== null && time < dateFrom) return false;
      if (dateTo !== null && time > dateTo) return false;
    }
    if (qtyMin !== null || qtyMax !== null) {
      const fits = (qty: number) => (qtyMin === null || qty >= qtyMin) && (qtyMax === null || qty <= qtyMax);
      if (!lines.some(item => fits(item.disp_qty ?? 0))) return false;
    }
    if (packageTerms.length > 0 && !lines.some(item => matchesSearch(packageTerms, [item.package_mark]))) return false;
    // Each word may match the dispatch itself or any one of its lines.
    return terms.every(term =>
      matchesSearch([term], [dispatch.disp_no, dispatch.customer_name, dispatch.registration]) ||
      lines.some(item => matchesSearch([term], [item.item_name, item.package_mark, item.rack, item.gr_no]))
    );
  });
  const direction = sortOrder === 'asc' ? 1 : -1;
  return matching.sort((a, b) => {
    const primary =
      sortBy === 'disp_no'
        ? compareNo(a.disp_no, b.disp_no)
        : String(a.disp_date).localeCompare(String(b.disp_date));
    return (primary || compareNo(a.disp_no, b.disp_no)) * direction;
  });
}

/**
 * Dispatch list for a customer account. The all-customers list RPC is for
 * warehouse roles only, so this collects get_customer_dispatch_list for each
 * assigned customer and sorts, filters and pages the result here.
 */
export const getAssignedCustomerDispatchList = async (
  assignedCustomerIds: string[],
  params: AssignedCustomerDispatchParams = {}
): Promise<DispatchListResponseNew> => {
  const limit = Math.min(Math.max(params.p_limit || PAGINATION.DEFAULT_LIMIT, 1), 100);
  const offset = Math.max(params.offset || 0, 0);
  const sortBy = params.p_sort_by || 'dispatch_date';
  const sortOrder = params.p_sort_order || 'desc';
  const filters = params.p_filters || {};
  const empty = (message: string, success: boolean): DispatchListResponseNew => ({
    success,
    message,
    data: {
      dispatches: [],
      pagination: { total_count: 0, limit, offset, has_more: false },
      aggregations: { total_dispatches: 0, total_dispatched_qty: 0, total_weight: null, unique_customers: 0, unique_grns: 0 },
      filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'disp_date', sort_order: sortOrder },
      user_access: { user_id: '', role: 'customer', is_admin: false, is_supervisor: false, accessible_customers: 0 },
    },
  });

  const assigned = [...new Set(assignedCustomerIds.filter(Boolean))];
  const requested = Array.isArray(filters.customer_ids) ? (filters.customer_ids as string[]) : [];
  if (requested.some(id => !assigned.includes(id))) return empty(t('errors.customer.accessDenied'), false);
  const targetIds = requested.length > 0 ? requested : assigned;
  if (targetIds.length === 0) {
    return empty(t('errors.customer.noAssignment'), false);
  }

  const perCustomer = await Promise.all(
    targetIds.map(async customerId => {
      const collected: Dispatch[] = [];
      let pageOffset = 0;
      while (collected.length < CUSTOMER_DISPATCH_MAX) {
        const page = await getCustomerDispatchList({
          p_customer_id: customerId,
          p_limit: CUSTOMER_DISPATCH_PAGE,
          p_offset: pageOffset,
          p_include_items: true,
        });
        if (!page.success) return page;
        collected.push(...page.data.dispatches);
        if (!page.data.pagination.has_more || page.data.dispatches.length === 0) break;
        pageOffset += page.data.dispatches.length;
      }
      return collected;
    })
  );
  const failed = perCustomer.find((result): result is DispatchListResponseNew => !Array.isArray(result));
  if (failed) return failed;

  const matching = selectCustomerDispatches((perCustomer as Dispatch[][]).flat(), filters, sortBy, sortOrder);

  const dispatches = matching.slice(offset, offset + limit);
  const result = empty(t('errors.dispatch.customerRetrieved'), true);
  result.data.dispatches = dispatches;
  result.data.pagination = {
    total_count: matching.length,
    limit,
    offset,
    has_more: offset + dispatches.length < matching.length,
  };
  result.data.aggregations = {
    total_dispatches: matching.length,
    total_dispatched_qty: matching.reduce((total, dispatch) => total + (dispatch.total_qty || 0), 0),
    total_weight: matching.reduce((total, dispatch) => total + (dispatch.total_weight || 0), 0),
    unique_customers: new Set(matching.map(dispatch => dispatch.customer_id)).size,
    unique_grns: new Set(matching.flatMap(dispatch => dispatch.items?.map(item => item.gr_no) || [])).size,
  };
  result.data.user_access.accessible_customers = assigned.length;
  return result;
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

    if (error) {
      console.error('[DispatchService] delete_dispatch_with_order_cleanup failed', { code: error.code });
      // Global auth error handling - auto logout on auth failures
      handleGlobalAuthError(error);
      return {
        success: false,
        message: t('errors.dispatch.deleteFailed'),
        error: error.message,
      };
    }

    // Handle response - the RPC returns a single object, not an array
    const result = data;

    if (!result.success) {
      console.error('[DispatchService] Dispatch deletion refused', { blocked: Boolean(result.blocking_reason) });
      return {
        success: false,
        message: result.message || t('errors.dispatch.deleteFailed'),
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
      message: result.message || t('errors.dispatch.deletedWithRestore'),
      cacheInvalidated, // E10: Inform UI if cache invalidation failed
      orderRestored: result.order_restored || result.orderRestored || false,
      restoredOrderId: result.restored_order_id || result.restoredOrderId,
    };
  } catch (error) {
    console.error('[DispatchService] ❌ Exception deleting dispatch:', error);
    return createErrorResponse(error, t('errors.general.unexpected'), 'DispatchService.deleteDispatch');
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
        error: error.message || t('errors.dispatch.fetchRecentOrdersFailed'),
      };
    }

    if (!data) {
      return {
        success: false,
        error: t('errors.general.noDataFromServer'),
      };
    }

    // Handle access denied case
    if (!data.success) {
      return {
        success: false,
        error: data.error || t('errors.general.accessDenied'),
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
      error: error instanceof Error ? error.message : t('errors.general.unexpected'),
    };
  }
};
