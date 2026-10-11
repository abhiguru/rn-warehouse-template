// Item Storage Pricing Service
// Uses RPC functions for all CRUD operations

import { getAuthenticatedClient } from '../config/supabaseConfig';
import type {
  ItemPricingFilters,
  ItemPricingListParams,
  ItemPricingListResponse,
  CreateItemPricingPayload,
  UpdateItemPricingPayload,
  ItemPricingMutationResponse,
  ItemPricingDeleteResponse,
  ItemPriceHistoryEntry,
  ItemPriceHistoryResponse,
} from '../types/item-pricing.types';
import {
  ItemStoragePrice
} from '../types/item-pricing.types';
import { createLogger } from '@/utils/logger';
import { unwrapArrayResponse } from '@/utils/responseUtils';
import { hasMoreItems } from '@/utils/paginationUtils';
import { PAGINATION } from '@/config/cacheConfig';
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { failureText, serverText } from '@/utils/serverText';

const itemPricingLogger = createLogger('ItemPricingService');

/**
 * Fetch paginated, filtered, sorted item storage prices
 */
export const getItemStoragePrices = async (
  params: ItemPricingListParams = {}
): Promise<ItemPricingListResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Build RPC parameters
    const rpcParams: Record<string, unknown> = {
      p_limit: params.p_limit || PAGINATION.DEFAULT_LIMIT,
      p_offset: params.p_offset || 0,
    };

    // Add filters if provided
    if (params.p_filters && Object.keys(params.p_filters).length > 0) {
      const cleanFilters: ItemPricingFilters = {};

      if (params.p_filters.price_ids && params.p_filters.price_ids.length > 0) {
        cleanFilters.price_ids = params.p_filters.price_ids;
      }
      if (params.p_filters.item_ids && params.p_filters.item_ids.length > 0) {
        cleanFilters.item_ids = params.p_filters.item_ids;
      }
      if (params.p_filters.customer_ids && params.p_filters.customer_ids.length > 0) {
        cleanFilters.customer_ids = params.p_filters.customer_ids;
      }
      if (params.p_filters.price_type) {
        cleanFilters.price_type = params.p_filters.price_type;
      }
      if (params.p_filters.weight_min !== undefined) {
        cleanFilters.weight_min = params.p_filters.weight_min;
      }
      if (params.p_filters.weight_max !== undefined) {
        cleanFilters.weight_max = params.p_filters.weight_max;
      }
      if (params.p_filters.effective_from) {
        cleanFilters.effective_from = params.p_filters.effective_from;
      }
      if (params.p_filters.effective_to) {
        cleanFilters.effective_to = params.p_filters.effective_to;
      }
      if (params.p_filters.include_expired !== undefined) {
        cleanFilters.include_expired = params.p_filters.include_expired;
      }

      if (Object.keys(cleanFilters).length > 0) {
        rpcParams.p_filters = cleanFilters;
      }
    }

    if (params.p_sort_by) {
      rpcParams.p_sort_by = params.p_sort_by;
    }
    if (params.p_sort_order) {
      rpcParams.p_sort_order = params.p_sort_order;
    }

    itemPricingLogger.debug('Fetching prices with params:', rpcParams);

    const startTime = Date.now();

    // Set a timeout for RPC calls (30 seconds)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(t('errors.network.rpcTimedOut30'))), 30000)
    );

    const rpcPromise = authenticatedClient.rpc('get_item_storage_prices', rpcParams);
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    itemPricingLogger.debug(`RPC call completed in ${duration}ms`);

    if (error) {
      itemPricingLogger.error('RPC error:', error);
      return {
        success: false,
        data: [],
        pagination: { total_count: 0, limit: 20, offset: 0, has_more: false },
        message: t('errors.price.fetchFailed'),
        error: error.message,
      };
    }

    itemPricingLogger.debug('RPC response received:', { dataType: typeof data, isArray: Array.isArray(data), dataLength: Array.isArray(data) ? data.length : 'N/A' });

    // Handle response - RPC may return array or object (use standardized utility)
    const responseData = unwrapArrayResponse(data);

    itemPricingLogger.debug('Response data parsed:', {
      hasResponseData: !!responseData,
      success: responseData?.success,
      itemCount: responseData?.data?.length,
      message: responseData?.message
    });

    if (!responseData || !responseData.success) {
      itemPricingLogger.warn('RPC returned unsuccessful response:', {
        responseData: JSON.stringify(responseData).substring(0, 200)
      });
      return {
        success: false,
        data: [],
        pagination: { total_count: 0, limit: 20, offset: 0, has_more: false },
        message: serverText(responseData?.message, t('errors.general.noDataAvailable')),
        error: responseData?.error,
      };
    }

    const items = Array.isArray(responseData.data) ? responseData.data : [];
    const pagination = responseData.pagination || {
      total_count: items.length,
      limit: params.p_limit || PAGINATION.DEFAULT_LIMIT,
      offset: params.p_offset || 0,
      has_more: false,
    };

    // Calculate has_more if not provided (using standardized utility)
    if (pagination.has_more === undefined) {
      pagination.has_more = hasMoreItems(pagination.offset, pagination.limit, pagination.total_count);
    }

    return {
      success: true,
      data: items,
      pagination,
      message: t('errors.price.fetched'),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in getItemStoragePrices:', { error: errorMessage, type: typeof err });
    return {
      success: false,
      data: [],
      pagination: { total_count: 0, limit: 20, offset: 0, has_more: false },
      message: t('errors.price.fetchFailed'),
      error: errorMessage,
    };
  }
};

/**
 * Create a new item storage price
 */
// M3 Fix: Using executeRPC wrapper
export const createItemStoragePrice = async (
  payload: CreateItemPricingPayload
): Promise<ItemPricingMutationResponse> => {
  itemPricingLogger.debug('Creating price:', payload);

  const result = await executeRPC<ItemStoragePrice>(
    getAuthenticatedClient,
    'create_item_storage_price',
    {
      p_item_id: payload.item_id,
      p_customer_id: payload.customer_id || null,
      p_price_type: payload.price_type,
      p_unit_price: payload.unit_price,
      p_weight_min: payload.weight_min,
      p_weight_max: payload.weight_max,
      p_labour_rate: payload.labour_rate,
      p_tax_percent: payload.tax_percent,
      p_effective_from: payload.effective_from,
      p_effective_to: payload.effective_to || null,
    },
    {
      context: 'ItemPricingService.createItemStoragePrice',
      errorMessage: t('errors.price.createFailed'),
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error,
    };
  }

  return {
    success: true,
    data: result.data,
    message: serverText(result.message, t('errors.price.created')),
  };
};

/**
 * Update an existing item storage price
 */
// M3 Fix: Using executeRPC wrapper
export const updateItemStoragePrice = async (
  id: string,
  payload: UpdateItemPricingPayload
): Promise<ItemPricingMutationResponse> => {
  itemPricingLogger.debug('Updating price:', id, payload);

  // Note: p_price_type is not supported by backend - price type cannot be changed after creation
  const result = await executeRPC<ItemStoragePrice>(
    getAuthenticatedClient,
    'update_item_storage_price',
    {
      p_id: id,
      p_unit_price: payload.unit_price,
      p_weight_min: payload.weight_min,
      p_weight_max: payload.weight_max,
      p_labour_rate: payload.labour_rate,
      p_tax_percent: payload.tax_percent,
      p_effective_from: payload.effective_from,
      p_effective_to: payload.effective_to || null,
    },
    {
      context: 'ItemPricingService.updateItemStoragePrice',
      errorMessage: t('errors.price.updateFailed'),
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error,
    };
  }

  return {
    success: true,
    data: result.data,
    message: serverText(result.message, t('errors.price.updated')),
  };
};

/**
 * Delete an item storage price
 */
// M3 Fix: Using executeRPC wrapper
export const deleteItemStoragePrice = async (
  id: string
): Promise<ItemPricingDeleteResponse> => {
  itemPricingLogger.debug('Deleting price:', id);

  const result = await executeRPC<void>(
    getAuthenticatedClient,
    'delete_item_storage_price',
    { p_id: id },
    {
      context: 'ItemPricingService.deleteItemStoragePrice',
      errorMessage: t('errors.price.deleteFailed'),
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error,
    };
  }

  return {
    success: true,
    message: serverText(result.message, t('errors.price.deleted')),
  };
};

/**
 * True when the server answered that it has no `get_item_price_history`: a backend without
 * migration 48. PostgREST says PGRST202 "Could not find the function ... in the schema
 * cache"; the database itself says 42883 "function ... does not exist". Trying again cannot
 * help until the facility's server is updated.
 */
function priceHistoryMissing(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (error?.code === 'PGRST202' || message.includes('could not find the function')) return true;
  return message.includes('get_item_price_history') && (error?.code === '42883' || message.includes('does not exist'));
}

/** One page of the price history is 50 entries; the server allows 1 to 200. */
export const PRICE_HISTORY_PAGE_SIZE = 50;

/**
 * The record of price changes, newest first (backend migration 48). The server gives it to
 * administrators and supervisors only and refuses everyone else with an error.
 *
 * A failure carries `message` for the screen to show under its own "Couldn't load" title:
 * that the server needs an update when it does not have the function (a backend older than
 * migration 48), the reason in the app's words when the server names one the app knows (no
 * permission, connection), otherwise "Try again in a moment."
 */
export const getItemPriceHistory = async (
  params: { limit?: number; offset?: number } = {}
): Promise<ItemPriceHistoryResponse> => {
  const limit = params.limit ?? PRICE_HISTORY_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const failed = (message: string, error?: string): ItemPriceHistoryResponse => ({
    success: false,
    data: [],
    pagination: { total: 0, limit, offset, has_more: false },
    message,
    error,
  });

  try {
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_item_price_history', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      itemPricingLogger.error('get_item_price_history RPC error:', error);
      handleGlobalAuthError(error);
      if (priceHistoryMissing(error)) return failed(t('pricing.history.serverNeedsUpdate'), error.message);
      // The raw text is developer wording: only a reason the app knows is shown.
      return failed(failureText(error.message, null, t('pricing.list.tryAgainInAMoment')), error.message);
    }

    const response = unwrapArrayResponse(data) as
      | { success?: unknown; data?: unknown; pagination?: Partial<ItemPriceHistoryResponse['pagination']>; message?: unknown; error?: unknown }
      | null;

    if (!response || typeof response !== 'object' || response.success !== true) {
      itemPricingLogger.warn('get_item_price_history refused or returned no data');
      handleGlobalAuthError(response);
      const serverSaid = response?.message ?? response?.error;
      return failed(
        serverText(serverSaid, t('pricing.list.tryAgainInAMoment')),
        typeof serverSaid === 'string' ? serverSaid : undefined
      );
    }

    const entries = Array.isArray(response.data) ? (response.data as ItemPriceHistoryEntry[]) : [];
    const total = Number(response.pagination?.total ?? entries.length) || 0;
    return {
      success: true,
      data: entries,
      pagination: {
        total,
        limit: Number(response.pagination?.limit ?? limit) || limit,
        offset: Number(response.pagination?.offset ?? offset) || 0,
        has_more: response.pagination?.has_more ?? hasMoreItems(offset, limit, total),
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in getItemPriceHistory:', { error: errorMessage });
    handleGlobalAuthError(err);
    if (priceHistoryMissing({ code: (err as { code?: unknown } | null)?.code, message: errorMessage })) {
      return failed(t('pricing.history.serverNeedsUpdate'), errorMessage);
    }
    return failed(failureText(errorMessage, null, t('pricing.list.tryAgainInAMoment')), errorMessage);
  }
};
