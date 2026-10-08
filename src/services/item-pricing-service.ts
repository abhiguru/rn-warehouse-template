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
  FindOrCreatePricingParams,
  FindOrCreatePricingResponse,
} from '../types/item-pricing.types';
import {
  ItemStoragePrice
} from '../types/item-pricing.types';
import { createLogger } from '@/utils/logger';
import { unwrapArrayResponse } from '@/utils/responseUtils';
import { hasMoreItems } from '@/utils/paginationUtils';
import { PAGINATION } from '@/config/cacheConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

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
      setTimeout(() => reject(new Error('RPC request timed out after 30 seconds')), 30000)
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
        message: 'Failed to fetch item prices',
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
        message: responseData?.message || 'No data available',
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
      message: 'Item prices fetched successfully',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in getItemStoragePrices:', { error: errorMessage, type: typeof err });
    return {
      success: false,
      data: [],
      pagination: { total_count: 0, limit: 20, offset: 0, has_more: false },
      message: 'Failed to fetch item prices',
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
      errorMessage: 'Failed to create item price',
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
    message: result.message || 'Price created successfully',
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
      errorMessage: 'Failed to update item price',
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
    message: result.message || 'Price updated successfully',
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
      errorMessage: 'Failed to delete item price',
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
    message: result.message || 'Price deleted successfully',
  };
};

/**
 * Find existing item storage price or create one if not found
 * Used when navigating to edit pricing from invoice items screen
 */
export const findOrCreateItemStoragePrice = async (
  params: FindOrCreatePricingParams
): Promise<FindOrCreatePricingResponse> => {
  itemPricingLogger.debug('Finding or creating price:', params);

  const result = await executeRPC<ItemStoragePrice & { was_created: boolean }>(
    getAuthenticatedClient,
    'find_or_create_item_storage_price',
    {
      p_item_id: params.item_id,
      p_customer_id: params.customer_id,
      p_weight: params.weight,
      p_price_type: params.price_type,
      p_default_unit_price: params.default_values?.unit_price ?? 0,
      p_default_labour_rate: params.default_values?.labour_rate ?? 0,
      p_default_tax_percent: params.default_values?.tax_percent ?? 18,
      p_default_weight_min: params.default_values?.weight_min ?? 0,
      p_default_weight_max: params.default_values?.weight_max ?? params.weight,
    },
    {
      context: 'ItemPricingService.findOrCreateItemStoragePrice',
      errorMessage: 'Failed to find or create item price',
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
    message: result.data?.was_created
      ? 'Price created successfully'
      : 'Existing price found',
  };
};
