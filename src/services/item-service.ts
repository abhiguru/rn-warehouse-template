/**
 * Item Service
 *
 * Handles all item master-related API operations including:
 * - List/search items
 * - Create new items
 * - Update existing items
 * - Delete items (with reference check)
 *
 * Uses Supabase RPCs for security and consistency.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  Item,
  ItemListItem,
  ItemListResponse,
  ItemServiceResponse,
  CreatedItem,
  ItemRateSource,
  ItemFilters,
  CreateItemParams,
  UpdateItemParams,
  DeleteItemResponse,
  ItemUsage,
  DEFAULT_ITEM_FILTERS,
} from '@/types/item.types';
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { isMissingFunction } from '@/services/item-pricing-service';
import { errorCodeOf, serverText } from '@/utils/serverText';

// =============================================================================
// RAW RPC RESPONSE TYPES
// =============================================================================

/** Raw item data from RPC responses */
interface RpcItemRow {
  id: string;
  name: string;
  packaging?: string;
  description?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  total_count?: number; // May be included in array items for total count
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class ItemService {
  // ===========================================================================
  // SEARCH/LIST
  // ===========================================================================

  /**
   * Search items by name or packaging
   * Uses get_items RPC which respects RLS
   */
  async searchItems(
    query: string,
    limit: number = 20
  ): Promise<ItemListItem[]> {
    try {
      console.log('[ItemService] searchItems:', { query, limit });

      if (!query || query.length < 1) {
        return [];
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_items', {
        p_search_query: query,
        p_active_only: true,
        p_limit: limit,
        p_offset: 0,
      });

      if (error) {
        handleGlobalAuthError(error);
        console.error('[ItemService] Search error:', error);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      // Map RPC response to ItemListItem
      return data.map((item: RpcItemRow) => ({
        id: item.id,
        name: item.name,
        packaging: item.packaging,
        description: item.description,
        active: item.active ?? true,
      }));
    } catch (error) {
      console.error('[ItemService] Exception in searchItems:', error);
      return [];
    }
  }

  /**
   * Get paginated item list with filters
   * Uses get_items RPC
   */
  async getItemList(
    filters: ItemFilters = DEFAULT_ITEM_FILTERS,
    limit: number = 20,
    offset: number = 0
  ): Promise<ItemListResponse> {
    try {
      console.log('[ItemService] getItemList:', { filters, limit, offset });

      const client = await getAuthenticatedClient();

      // Call RPC with filters
      // p_active_only: true = active only, false = all items (including inactive)
      const { data, error } = await client.rpc('get_items', {
        p_search_query: filters.search || null,
        p_active_only: filters.active === true ? true : false, // false shows ALL items
        p_limit: limit,
        p_offset: offset,
      });

      console.log('[ItemService] RPC response structure:', {
        rawKeys: data ? Object.keys(data) : [],
        dataType: typeof data?.data,
        dataIsArray: Array.isArray(data?.data),
        dataKeys: data?.data && typeof data.data === 'object' && !Array.isArray(data.data) ? Object.keys(data.data) : [],
        dataDataTotalCount: data?.data?.total_count,
        dataDataItemsLength: Array.isArray(data?.data?.items) ? data.data.items.length : undefined,
      });

      if (error) {
        handleGlobalAuthError(error);
        console.error('[ItemService] List error:', error);
        return {
          success: false,
          message: serverText(error, t('errors.item.fetchListFailed')),
          data: [],
          error: error.message,
          code: error.code,
        };
      }

      // Handle different response structures:
      // 1. { data: [...] } - array inside data property
      // 2. { success, data: { items: [...], pagination: {...} } }
      // 3. { items: [...], total_count: N }
      // 4. Direct array [...]
      let itemsArray: RpcItemRow[] = [];
      let totalCount = 0;

      if (Array.isArray(data)) {
        // Direct array response
        console.log('[ItemService] Branch: Direct array');
        itemsArray = data;
        totalCount = data[0]?.total_count || data.length;
      } else if (data?.data && Array.isArray(data.data)) {
        // { data: [...], total_count: N } structure - array directly in data property
        console.log('[ItemService] Branch: { data: [...] }');
        itemsArray = data.data;
        totalCount =
          data.total_count ||
          data.pagination?.total_count ||
          itemsArray[0]?.total_count ||
          itemsArray.length;
      } else if (data?.data?.items && Array.isArray(data.data.items)) {
        // { success, data: { items: [...], totalCount: N } } structure
        console.log('[ItemService] Branch: { data: { items: [...] } }');
        itemsArray = data.data.items;
        // Check both camelCase and snake_case for total count
        totalCount = data.data.totalCount || data.data.total_count || data.data.pagination?.total_count || itemsArray.length;
        console.log('[ItemService] totalCount:', totalCount);
      } else if (data?.items && Array.isArray(data.items)) {
        // { items: [...] } structure
        console.log('[ItemService] Branch: { items: [...] }');
        itemsArray = data.items;
        totalCount = data.total_count || data.pagination?.total_count || itemsArray.length;
      } else if (data?.success === false) {
        // RPC returned error in response body
        return {
          success: false,
          message: serverText(data.message, t('errors.item.fetchListFailed')),
          data: [],
          error: data.message,
        };
      }

      const items: ItemListItem[] = itemsArray.map((item: RpcItemRow) => ({
        id: item.id,
        name: item.name,
        packaging: item.packaging,
        description: item.description,
        active: item.active ?? true,
      }));

      console.log('[ItemService] Mapped items count:', items.length);

      return {
        success: true,
        message: t('errors.item.listFetched'),
        data: items,
        pagination: {
          total_count: totalCount,
          limit,
          offset,
          has_more: totalCount > offset + limit,
        },
      };
    } catch (error) {
      console.error('[ItemService] Exception in getItemList:', error);
      return {
        success: false,
        message: serverText(error, t('errors.item.fetchListFailed')),
        data: [],
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
      };
    }
  }

  // ===========================================================================
  // GET BY ID
  // ===========================================================================

  /**
   * Get item by ID with full details
   */
  async getItemById(itemId: string): Promise<ItemServiceResponse> {
    try {
      console.log('[ItemService] getItemById:', itemId);

      if (!itemId) {
        return {
          success: false,
          message: t('errors.item.idRequired'),
          error: t('errors.general.missingParameter'),
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_item', {
        p_item_id: itemId,
      });

      console.log('[ItemService] get_item response:', {
        error: error?.message,
        dataType: typeof data,
        hasItem: data?.item !== undefined,
        hasSuccess: data?.success !== undefined,
        rawData: JSON.stringify(data, null, 2),
      });

      if (error) {
        handleGlobalAuthError(error);
        console.error('[ItemService] Get by ID error:', error);
        // A failed read (no connection, a timeout, no permission) is not "not found": the code tells them apart.
        return {
          success: false,
          message: serverText(error, t('errors.item.fetchFailed')),
          error: error.message,
          code: error.code,
        };
      }

      if (!data) {
        return {
          success: false,
          message: t('errors.item.notFound'),
          error: 'NOT_FOUND',
          code: 'NOT_FOUND',
        };
      }

      // Handle different response structures:
      // 1. { success: true, item: {...} }
      // 2. Direct item object { id, name, ... }
      // 3. { data: { id, name, ... } }
      let itemData: RpcItemRow | null = null;

      if (data.success === false) {
        return {
          success: false,
          message: serverText(data.message, t('errors.item.notFound')),
          error: 'NOT_FOUND',
          code: 'NOT_FOUND',
        };
      } else if (data.item) {
        itemData = data.item;
      } else if (data.data) {
        itemData = data.data;
      } else if (data.id) {
        itemData = data;
      }

      if (!itemData) {
        return {
          success: false,
          message: t('errors.item.notFound'),
          error: 'NOT_FOUND',
          code: 'NOT_FOUND',
        };
      }

      const item: Item = {
        id: itemData.id,
        name: itemData.name,
        packaging: itemData.packaging,
        description: itemData.description,
        active: itemData.active ?? true,
        created_at: itemData.created_at,
        updated_at: itemData.updated_at,
      };

      return {
        success: true,
        message: t('errors.item.fetched'),
        data: item,
      };
    } catch (error) {
      console.error('[ItemService] Exception in getItemById:', error);
      return {
        success: false,
        message: serverText(error, t('errors.item.fetchFailed')),
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
        // A thrown failure carries its own code (network, timeout); the text rules read the rest.
        code: errorCodeOf(error),
      };
    }
  }

  // ===========================================================================
  // USAGE
  // ===========================================================================

  /**
   * Where an item is used, read before Delete is offered (get_item_usage, administrators and
   * supervisors). A refusal carries the server's error_code in `code` (NOT_FOUND when the item is gone);
   * a failed read carries the transport code, so the caller can tell the two apart.
   */
  async getItemUsage(itemId: string): Promise<ItemServiceResponse<ItemUsage>> {
    const result = await executeRPC<{ success: boolean; data?: ItemUsage | null; error_code?: string; error?: string; message?: string }>(
      getAuthenticatedClient,
      'get_item_usage',
      { p_item_id: itemId },
      {
        context: 'ItemService.getItemUsage',
        errorMessage: t('errors.item.fetchFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );
    if (!result.success || !result.data) {
      // A server without migration 114 has no get_item_usage: the caller falls back to asking first.
      if (isMissingFunction({ code: result.errorCode, message: result.error }, 'get_item_usage')) {
        return { success: false, message: result.message, error: result.error, code: 'SERVER_NEEDS_UPDATE' };
      }
      return { success: false, message: result.message, error: result.error, code: result.errorCode };
    }
    const rpcData = result.data;
    if (!rpcData.success || !rpcData.data) {
      return {
        success: false,
        message: serverText(rpcData.message ?? rpcData.error, t('errors.item.fetchFailed'), { code: rpcData.error_code }),
        error: rpcData.error,
        code: rpcData.error_code,
      };
    }
    return { success: true, message: '', data: rpcData.data };
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new item
   * Uses create_item RPC
   * M3 Fix: Using executeRPC wrapper
   *
   * Validates:
   * - Name (required, max 80 chars, must be unique)
   * - Packaging (optional, max 40 chars)
   * - Description (optional, max 40 chars)
   */
  async createItem(params: CreateItemParams): Promise<ItemServiceResponse<CreatedItem>> {
    console.log('[ItemService] createItem:', params);

    interface CreateItemRpcResponse {
      success: boolean;
      message?: string;
      item_id?: string;
      /** The item and `rate_source` (backend migration 85). */
      data?: { id?: string; rate_source?: unknown } | null;
      error?: string;
      /** DUPLICATE_NAME, INVALID_INPUT or PERMISSION_DENIED (backend, Items screens 2026-10-20). */
      error_code?: string;
    }

    const result = await executeRPC<CreateItemRpcResponse>(
      getAuthenticatedClient,
      'create_item',
      params as unknown as Record<string, unknown>,
      {
        context: 'ItemService.createItem',
        write: true,
        errorMessage: t('errors.item.createFailed'),
        unwrapNested: false,
        validateSuccess: false, // We validate manually below
      }
    );

    if (!result.success || !result.data) {
      // PGRST202: this facility's create_item has no Standard rate / Same as another item parameters (migration 85 missing).
      if (result.errorCode === 'PGRST202') {
        return { success: false, message: t('pricing.standard.error.serverNeedsUpdate'), error: result.error };
      }
      return {
        success: false,
        message: result.message,
        error: result.error,
        code: result.errorCode,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      console.error('[ItemService] RPC returned success=false:', rpcData);
      return {
        success: false,
        message: serverText(rpcData.message, t('errors.item.createFailed'), { code: rpcData.error_code }),
        error: serverText(rpcData.error, t('errors.general.unknown')),
        code: rpcData.error_code,
      };
    }

    console.log('[ItemService] Item created via RPC:', rpcData.item_id ?? rpcData.data?.id);
    const source = rpcData.data?.rate_source;
    const rate_source: ItemRateSource | undefined = source === 'standard' || source === 'copied' || source === 'none' ? source : undefined;
    return {
      success: true,
      message: serverText(rpcData.message, t('errors.item.created')),
      data: {
        id: rpcData.item_id ?? rpcData.data?.id,
        ...(rate_source ? { rate_source } : {}),
        name: params.p_name,
        packaging: params.p_packaging,
        description: params.p_description,
        active: params.p_active ?? true,
        created_at: new Date().toISOString(),
      } as Item,
    };
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  /**
   * Update an existing item
   * Uses update_item RPC
   * M3 Fix: Using executeRPC wrapper
   */
  async updateItem(params: UpdateItemParams): Promise<ItemServiceResponse> {
    console.log('[ItemService] updateItem:', {
      item_id: params.p_item_id,
      name: params.p_name,
    });

    interface UpdateItemRpcResponse {
      success: boolean;
      message?: string;
      error?: string;
      /** DUPLICATE_NAME, NOT_FOUND, INVALID_INPUT or PERMISSION_DENIED. */
      error_code?: string;
      /** `rate_source: 'standard'` when an inactive item turned active and got the standard rate. */
      data?: { rate_source?: unknown } | null;
    }

    const result = await executeRPC<UpdateItemRpcResponse>(
      getAuthenticatedClient,
      'update_item',
      params as unknown as Record<string, unknown>,
      {
        context: 'ItemService.updateItem',
        write: true,
        errorMessage: t('errors.item.updateFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
        code: result.errorCode,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      console.error('[ItemService] RPC returned success=false:', rpcData);
      return {
        success: false,
        message: serverText(rpcData.message, t('errors.item.updateFailed'), { code: rpcData.error_code }),
        error: serverText(rpcData.error, t('errors.general.unknown')),
        code: rpcData.error_code,
      };
    }

    console.log('[ItemService] Item updated via RPC');
    const rateSource = rpcData.data?.rate_source;
    return {
      success: true,
      message: serverText(rpcData.message, t('errors.item.updated')),
      ...(typeof rateSource === 'string' ? { rateSource } : {}),
    };
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  /**
   * Delete an item (with reference check)
   * Uses delete_item_safe RPC
   * M3 Fix: Using executeRPC wrapper
   * Returns reference counts if deletion is blocked
   */
  async deleteItem(itemId: string): Promise<DeleteItemResponse> {
    console.log('[ItemService] deleteItem:', itemId);

    if (!itemId) {
      return {
        success: false,
        message: t('errors.item.idRequired'),
      };
    }

    interface DeleteItemRpcResponse {
      success: boolean;
      message?: string;
      /** NOT_FOUND when the item no longer exists (backend Items screens 2026-10-20). */
      error_code?: string;
      references?: {
        /** Where the server found the item (delete_item_safe): GRN lines, order lines and prices. */
        grn_items_count: number;
        order_items_count: number;
        grn_rates_count?: number;
        pricing_count: number;
      };
    }

    const result = await executeRPC<DeleteItemRpcResponse>(
      getAuthenticatedClient,
      'delete_item_safe',
      { p_item_id: itemId },
      {
        context: 'ItemService.deleteItem',
        write: true,
        errorMessage: t('errors.item.deleteFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
      };
    }

    const rpcData = result.data;
    // Check if RPC returned success: false with reference info
    if (rpcData.success === false) {
      return {
        success: false,
        message: serverText(rpcData.message, t('errors.item.cannotDelete'), { code: rpcData.error_code }),
        references: rpcData.references,
        code: rpcData.error_code,
        serverMessage: typeof rpcData.message === 'string' ? rpcData.message : undefined,
      };
    }

    return {
      success: true,
      message: serverText(rpcData.message, t('errors.item.deleted')),
    };
  }

  // ===========================================================================
  // TOGGLE ACTIVE
  // ===========================================================================

  /**
   * Toggle item active status
   * Uses update_item RPC
   */
  async toggleItemActive(itemId: string, active: boolean): Promise<ItemServiceResponse> {
    try {
      console.log('[ItemService] toggleItemActive:', { itemId, active });

      // First get the current item to preserve other fields
      const currentItem = await this.getItemById(itemId);
      if (!currentItem.success || !currentItem.data) {
        // The read's own failure, so a lost connection is not reported as "not found".
        return currentItem.success ? { success: false, message: t('errors.item.notFound'), error: 'NOT_FOUND', code: 'NOT_FOUND' } : currentItem;
      }

      // Update with new active status
      return this.updateItem({
        p_item_id: itemId,
        p_name: currentItem.data.name,
        p_packaging: currentItem.data.packaging,
        p_description: currentItem.data.description,
        p_active: active,
      });
    } catch (error) {
      console.error('[ItemService] Exception in toggleItemActive:', error);
      return {
        success: false,
        message: serverText(error, t('errors.item.toggleStatusFailed'), { write: true }),
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
      };
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const itemService = new ItemService();

// Also export individual functions for convenience
export const {
  searchItems,
  getItemList,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getItemUsage,
  toggleItemActive,
} = itemService;
