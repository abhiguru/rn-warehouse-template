import { getSupabaseClient, getAuthenticatedClient } from '../config/supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unwrapArrayResponse } from '@/utils/responseUtils';
import { createErrorResponse } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';
import type { RpcGrnItemRow, RpcPagination } from '@/types/rpc-canonical.types';
import { hasMoreItems } from '@/utils/paginationUtils';
import { PAGINATION } from '@/config/cacheConfig';

/**
 * GRN Item type - uses snake_case matching backend RPC response
 * This is the item-level data returned by get_all_grn_items RPC
 */
export type GRNItem = RpcGrnItemRow;

// M1 Fix: DRY empty response data structure used in error responses
const EMPTY_GRN_RESPONSE_DATA = {
  items: [] as GRNItem[],
  pagination: { total_count: 0, limit: PAGINATION.DEFAULT_LIMIT, offset: 0, has_more: false } as RpcPagination,
  aggregations: { total_qty: 0, total_stock: 0 },
  filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'date', sort_order: 'desc' },
  user_access: { role: '', is_admin: false, is_supervisor: false, accessible_customers: 0 }
} as const;

/**
 * GRN Filters - uses snake_case matching backend RPC parameters
 */
export interface GRNFilters {
  // Text search filters
  item_name?: string;
  customer_name?: string;
  gr_no?: string;
  package_mark?: string;
  rack?: string;

  // Enhanced filters from UI
  item_ids?: string[];
  customer_ids?: string[];
  grn_ids?: string[];
  gr_no_from?: string;
  gr_no_to?: string;
  stock_status?: 'all' | 'in_stock' | 'out_of_stock';
  weight_min?: number;
  weight_max?: number;
}

/**
 * GRN List Request Parameters - uses snake_case matching backend RPC
 */
export interface GRNListParams {
  p_date_from?: string;
  p_date_to?: string;
  p_filters?: GRNFilters;
  p_sort_by?: 'date' | 'gr_no' | 'customer_name' | 'item_name' | 'qty' | 'stock';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

/** Internal RPC params type for get_all_grn_items (V2 signature) */
interface GRNRpcParams {
  p_limit: number;
  p_date_from?: string;
  p_date_to?: string;
  p_filters?: GRNFilters;
  p_sort_by?: string;
  p_sort_order?: string;
  p_offset?: number;
  // Note: p_in_stock_only is NOT part of V2 - use p_filters.stock_status instead
}

/**
 * GRN Aggregations - uses snake_case
 */
export interface GRNAggregations {
  total_qty: number;
  total_stock: number;
}

/**
 * GRN User Access - uses snake_case
 */
export interface GRNUserAccess {
  role: string;
  is_admin: boolean;
  is_supervisor: boolean;
  accessible_customers: number;
}

/**
 * GRN List Response - uses snake_case matching backend RPC
 */
export interface GRNListResponse {
  success: boolean;
  data: {
    items: GRNItem[];
    pagination: RpcPagination;
    aggregations: GRNAggregations;
    filters: {
      date_from: string | null;
      date_to: string | null;
      applied_filters: GRNFilters;
      sort_by: string;
      sort_order: string;
    };
    user_access: GRNUserAccess;
  };
  message: string;
  error?: string;
}

export const getAllGRNItems = async (params: GRNListParams = {}): Promise<GRNListResponse> => {
  try {
    
    // Check for any valid session (Supabase built-in or custom)
    const { data: { session }, error: sessionError } = await getSupabaseClient().auth.getSession();
    
    // Get the stored session marker for custom sessions
    const sessionMarker = await AsyncStorage.getItem('session_marker');
    let userId: string | null = null;
    
    if (session && session.user) {
      userId = session.user.id;
    } else if (sessionMarker) {
      try {
        const parsedMarker = JSON.parse(sessionMarker);
        if (parsedMarker && parsedMarker.expires_at > Date.now()) {
          userId = parsedMarker.user_id;
        }
      } catch (parseError) {
        console.error('[GRNService] Failed to parse session marker:', parseError);
        // Continue without userId - will rely on RLS or other auth
      }
    }
    
    // Prepare RPC parameters - only include non-null/non-undefined values
    const rpcParams: GRNRpcParams = {
      p_limit: Math.min(params.p_limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };
    
    // Only add optional parameters if they have actual values
    if (params.p_date_from) rpcParams.p_date_from = params.p_date_from;
    if (params.p_date_to) rpcParams.p_date_to = params.p_date_to;
    if (params.p_filters && Object.keys(params.p_filters).length > 0) {
      // Clean up filters to only include non-empty values (all snake_case)
      const cleanFilters: GRNFilters = {};
      const filters = params.p_filters;

      if (filters.item_name) cleanFilters.item_name = filters.item_name;
      if (filters.customer_name) cleanFilters.customer_name = filters.customer_name;
      if (filters.gr_no) cleanFilters.gr_no = filters.gr_no;
      if (filters.package_mark) cleanFilters.package_mark = filters.package_mark;
      if (filters.rack) cleanFilters.rack = filters.rack;
      if (filters.item_ids && filters.item_ids.length > 0) cleanFilters.item_ids = filters.item_ids;
      if (filters.customer_ids && filters.customer_ids.length > 0) cleanFilters.customer_ids = filters.customer_ids;
      if (filters.grn_ids && filters.grn_ids.length > 0) cleanFilters.grn_ids = filters.grn_ids;
      if (filters.gr_no_from) cleanFilters.gr_no_from = filters.gr_no_from;
      if (filters.gr_no_to) cleanFilters.gr_no_to = filters.gr_no_to;
      // Pass stock_status inside p_filters (V2 RPC signature)
      if (filters.stock_status && filters.stock_status !== 'all') {
        cleanFilters.stock_status = filters.stock_status;
      }

      if (filters.weight_min !== undefined) cleanFilters.weight_min = filters.weight_min;
      if (filters.weight_max !== undefined) cleanFilters.weight_max = filters.weight_max;

      if (Object.keys(cleanFilters).length > 0) {
        rpcParams.p_filters = cleanFilters;
      }

    }
    if (params.p_sort_by) rpcParams.p_sort_by = params.p_sort_by;
    if (params.p_sort_order) rpcParams.p_sort_order = params.p_sort_order;
    // Fix: Use >= 0 to include offset=0 (first page) - offset=0 was being skipped because 0 is falsy
    if (typeof params.p_offset === 'number' && params.p_offset >= 0) rpcParams.p_offset = params.p_offset;

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();

    // Generate deduplication key for this request (PO9 fix)
    const dedupKey = generateRequestKey('getAllGRNItems', { ...rpcParams });

    console.log('[GRN Service] RPC params:', JSON.stringify(rpcParams, null, 2));
    console.time('⏱️ [GRN Service] RPC call duration');
    const { data, error } = await deduplicatedRequest(dedupKey, async () => {
      return authenticatedClient.rpc('get_all_grn_items', rpcParams);
    });
    console.timeEnd('⏱️ [GRN Service] RPC call duration');

    if (data) {
      const tempResponse = unwrapArrayResponse(data);
      const itemsCount = Array.isArray(tempResponse?.data) ? tempResponse.data.length : 0;
      const dataSize = JSON.stringify(data).length;
      console.log(`📊 [GRN Service] Data size: ${(dataSize / 1024).toFixed(2)} KB, Items: ${itemsCount}`);
      console.log('[GRN Service] Pagination from backend:', JSON.stringify(tempResponse?.pagination, null, 2));
    }

    if (error) {
      console.error('[GRN Service] Failed to fetch GRN items:', error.message);
      return {
        ...createErrorResponse(error, 'Failed to fetch GRN items', 'GRNService.getAllGRNItems'),
        data: EMPTY_GRN_RESPONSE_DATA
      };
    }

    // Handle array response from RPC (use standardized utility)
    const responseData = unwrapArrayResponse(data);

    if (!responseData) {
      return {
        success: false,
        data: EMPTY_GRN_RESPONSE_DATA,
        message: 'No data available'
      };
    }

    // Backend now returns structure: { data: [...], success: true, aggregates: {...}, pagination: {...} }
    // All fields are already snake_case - no transformation needed
    const rawItems = Array.isArray(responseData.data) ? responseData.data : [];

    // Items are already in snake_case format matching GRNItem (RpcGrnListItem)
    const itemsArray: GRNItem[] = rawItems;

    // Backend returns { limit, offset, total_count } - compute has_more
    const backendPagination = responseData.pagination || {};
    const limit = backendPagination.limit || PAGINATION.DEFAULT_LIMIT;
    const offset = backendPagination.offset || 0;
    const total_count = backendPagination.total_count || backendPagination.totalCount || 0;
    const has_more = hasMoreItems(offset, limit, total_count);

    console.log('[GRN Service] Computed has_more:', { offset, itemsLength: itemsArray.length, total_count, has_more });

    return {
      success: responseData.success !== false, // Default to true if not explicitly false
      data: {
        items: itemsArray,
        pagination: { total_count, limit, offset, has_more },
        aggregations: responseData.aggregates || { total_qty: 0, total_stock: 0 },
        filters: {
          date_from: null,
          date_to: null,
          applied_filters: {},
          sort_by: 'date',
          sort_order: 'desc'
        },
        user_access: { role: '', is_admin: false, is_supervisor: false, accessible_customers: 0 }
      },
      message: responseData.message || 'GRN items fetched successfully'
    };
    
  } catch (error) {
    return {
      ...createErrorResponse(error, 'Failed to fetch GRN items', 'GRNService.getAllGRNItems'),
      data: EMPTY_GRN_RESPONSE_DATA
    };
  }
};