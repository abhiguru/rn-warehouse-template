/**
 * Stock Aging Report Service (C5)
 *
 * Fetches stock aging data from the get_stock_aging_report RPC.
 * Returns stock items grouped by aging buckets with dispatch velocity info.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  StockAgingResponse,
  StockAgingData,
  StockAgingKPIs,
  StockAgingItem,
  AgingBucketData,
  AllStockAgingResponse,
  AllStockAgingData,
  AllStockAgingKPIs,
  CustomerAgingSummary,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: StockAgingData = {
  summary: {
    total_items: 0,
    total_quantity: 0,
    total_weight_kg: 0,
    oldest_stock_days: 0,
    average_age_days: 0,
    items_over_365_days: 0,
    qty_over_365_days: 0,
    avg_dispatch_velocity_days: null,
    items_no_recent_dispatch: 0,
  },
  by_bucket: {},
  items: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllStockAgingData = {
  summary: {
    total_customers: 0,
    total_items: 0,
    total_quantity: 0,
    oldest_stock_days: 0,
    average_age_days: 0,
    items_over_365_days: 0,
    qty_over_365_days: 0,
  },
  by_bucket: {},
  by_customer: [],
};

export interface StockAgingParams {
  customerId: string; // Required customer UUID
  agingBuckets?: number[]; // Custom bucket thresholds (default: [30, 60, 90])
}

/**
 * Fetch customer stock aging report
 *
 * @param params - Filter parameters for stock aging (customerId is required)
 * @returns Stock aging data with KPIs, buckets, and item-level details
 */
export async function getCustomerStockAging(
  params: StockAgingParams
): Promise<StockAgingResponse> {
  if (!params.customerId) {
    console.error('[StockAging] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Customer ID is required',
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    console.time('⏱️ [StockAging] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[StockAging] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'none',
    });

    const client = await getAuthenticatedClient();

    // Build RPC params
    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: params.customerId,
    };

    // Only add aging_buckets if provided
    if (params.agingBuckets && params.agingBuckets.length > 0) {
      rpcParams.p_aging_buckets = params.agingBuckets;
    }

    console.log('[StockAging] Calling get_stock_aging_report with params:', rpcParams);

    const { data, error } = await client.rpc('get_stock_aging_report', rpcParams);

    console.timeEnd('⏱️ [StockAging] RPC call duration');

    if (error) {
      console.error('[StockAging] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch stock aging report',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[StockAging] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No stock aging data found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [StockAging] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[StockAging] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[StockAging] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format
    const summary: StockAgingKPIs = {
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight_kg: responseData?.summary?.total_weight_kg ?? 0,
      oldest_stock_days: responseData?.summary?.oldest_stock_days ?? 0,
      average_age_days: responseData?.summary?.average_age_days ?? 0,
      items_over_365_days: responseData?.summary?.items_over_365_days ?? 0,
      qty_over_365_days: responseData?.summary?.qty_over_365_days ?? 0,
      avg_dispatch_velocity_days: responseData?.summary?.avg_dispatch_velocity_days ?? null,
      items_no_recent_dispatch: responseData?.summary?.items_no_recent_dispatch ?? 0,
    };

    // Map bucket data
    const byBucket: Record<string, AgingBucketData> = {};
    if (responseData?.by_bucket) {
      Object.entries(responseData.by_bucket).forEach(([key, value]: [string, any]) => {
        byBucket[key] = {
          item_count: value?.item_count ?? 0,
          total_quantity: value?.total_quantity ?? 0,
          total_weight: value?.total_weight ?? 0,
          percentage: value?.percentage ?? 0,
        };
      });
    }

    // Map items
    const items: StockAgingItem[] = (responseData?.items ?? []).map((item: any) => ({
      grn_id: item.grn_id,
      gr_no: item.gr_no,
      item_name: item.item_name,
      packaging: item.packaging ?? '',
      current_stock: item.current_stock ?? 0,
      original_qty: item.original_qty ?? 0,
      weight: item.weight ?? 0,
      rack: item.rack ?? '',
      package_mark: item.package_mark ?? '',
      grn_date: item.grn_date,
      aging_days: item.aging_days ?? 0,
      aging_bucket: item.aging_bucket ?? '',
      dispatch_info: {
        total_dispatched: item.dispatch_info?.total_dispatched ?? 0,
        dispatch_count: item.dispatch_info?.dispatch_count ?? 0,
        last_dispatch_date: item.dispatch_info?.last_dispatch_date ?? null,
        days_since_last_dispatch: item.dispatch_info?.days_since_last_dispatch ?? null,
        avg_days_between_dispatches: item.dispatch_info?.avg_days_between_dispatches ?? null,
      },
    }));

    console.log(`[StockAging] Parsed ${items.length} items, avg age: ${summary.average_age_days} days`);

    return {
      success: true,
      data: { summary, by_bucket: byBucket, items },
      message: 'Stock aging report retrieved successfully',
    };
  } catch (error) {
    console.error('[StockAging] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch stock aging report',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AllStockAgingParams {
  agingBuckets?: number[]; // Custom bucket thresholds (default: [30, 60, 90])
}

/**
 * Fetch all-customers stock aging (staff view)
 *
 * @param params - Optional aging bucket configuration
 * @returns Stock aging across all customers with per-customer breakdown
 */
export async function getAllStockAging(
  params?: AllStockAgingParams
): Promise<AllStockAgingResponse> {
  try {
    console.time('⏱️ [AllStockAging] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[AllStockAging] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
    });

    const client = await getAuthenticatedClient();

    // Build RPC params - pass null for customer to get all customers
    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: null,
    };

    // Only add aging_buckets if provided
    if (params?.agingBuckets && params.agingBuckets.length > 0) {
      rpcParams.p_aging_buckets = params.agingBuckets;
    }

    console.log('[AllStockAging] Calling get_stock_aging_report with params:', rpcParams);

    const { data, error } = await client.rpc('get_stock_aging_report', rpcParams);

    console.timeEnd('⏱️ [AllStockAging] RPC call duration');

    if (error) {
      console.error('[AllStockAging] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: 'Failed to fetch all-customers stock aging',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[AllStockAging] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: 'No stock aging data found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [AllStockAging] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[AllStockAging] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[AllStockAging] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format
    const summary: AllStockAgingKPIs = {
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      oldest_stock_days: responseData?.summary?.oldest_stock_days ?? 0,
      average_age_days: responseData?.summary?.average_age_days ?? 0,
      items_over_365_days: responseData?.summary?.items_over_365_days ?? 0,
      qty_over_365_days: responseData?.summary?.qty_over_365_days ?? 0,
    };

    // Map bucket data
    const byBucket: Record<string, { item_count: number; total_quantity: number; percentage: number }> = {};
    if (responseData?.by_bucket) {
      Object.entries(responseData.by_bucket).forEach(([key, value]: [string, any]) => {
        byBucket[key] = {
          item_count: value?.item_count ?? 0,
          total_quantity: value?.total_quantity ?? 0,
          percentage: value?.percentage ?? 0,
        };
      });
    }

    // Map customer data
    const byCustomer: CustomerAgingSummary[] = (responseData?.by_customer ?? []).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      total_stock: customer.total_stock ?? 0,
      average_age_days: customer.average_age_days ?? 0,
      oldest_stock_days: customer.oldest_stock_days ?? 0,
      items_over_365_days: customer.items_over_365_days ?? 0,
      aging_distribution: customer.aging_distribution ?? {},
    }));

    console.log(`[AllStockAging] Parsed ${byCustomer.length} customers, avg age: ${summary.average_age_days} days`);

    return {
      success: true,
      data: { summary, by_bucket: byBucket, by_customer: byCustomer },
      message: 'All-customers stock aging retrieved successfully',
    };
  } catch (error) {
    console.error('[AllStockAging] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: 'Failed to fetch all-customers stock aging',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
