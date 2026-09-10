/**
 * Stock Summary Report Service (C1)
 *
 * Fetches customer stock summary data from the get_customer_stock_summary RPC.
 * Returns current inventory at a glance with item-level breakdowns.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  StockSummaryResponse,
  StockSummaryData,
  StockSummaryKPIs,
  StockItemSummary,
  AllStockSummaryResponse,
  AllStockSummaryData,
  AllStockSummaryKPIs,
  CustomerStockRow,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: StockSummaryData = {
  summary: {
    total_items: 0,
    total_quantity: 0,
    total_weight_kg: 0,
    oldest_stock_date: null,
    grn_count: 0,
    grn_count_empty: 0,
  },
  items: [],
  out_of_stock_items: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllStockSummaryData = {
  summary: {
    total_customers_with_stock: 0,
    total_items: 0,
    total_quantity: 0,
    total_weight_kg: 0,
  },
  customers: [],
};

/**
 * Fetch customer stock summary
 *
 * @param customerId - Required customer UUID
 * @returns Stock summary with KPIs and item-level details
 */
export async function getCustomerStockSummary(
  customerId: string
): Promise<StockSummaryResponse> {
  if (!customerId) {
    console.error('[StockSummary] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Customer ID is required',
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    console.time('⏱️ [StockSummary] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[StockSummary] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'none',
    });

    const client = await getAuthenticatedClient();

    const rpcParams = { p_customer_uuid: customerId };

    console.log('[StockSummary] Calling get_customer_stock_summary with params:', rpcParams);

    const { data, error } = await client.rpc('get_customer_stock_summary', rpcParams);

    console.timeEnd('⏱️ [StockSummary] RPC call duration');

    if (error) {
      console.error('[StockSummary] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch stock summary',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[StockSummary] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No stock data available',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [StockSummary] Response size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = Array.isArray(data) ? data[0] : data;

    // Map to our expected format
    const summary: StockSummaryKPIs = {
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight_kg: responseData?.summary?.total_weight_kg ?? 0,
      oldest_stock_date: responseData?.summary?.oldest_stock_date ?? null,
      grn_count: responseData?.summary?.grn_count ?? 0,
      grn_count_empty: responseData?.summary?.grn_count_empty ?? 0,
    };

    // Helper function to map GRN data
    const mapGrns = (grns: any[]) =>
      (grns ?? []).map((grn: any) => ({
        grn_id: grn.grn_id ?? '',
        gr_no: grn.gr_no,
        date: grn.date,
        orig_qty: grn.orig_qty ?? 0,
        stock: grn.stock ?? 0,
        item_weight: grn.item_weight ?? 0, // Per-unit weight
        rack: grn.rack ?? '',
        packaging: grn.packaging ?? '',
        package_mark: grn.package_mark,
        emptied_date: grn.emptied_date, // For out-of-stock items
      }));

    // Helper function to map item data
    const mapItems = (items: any[]): StockItemSummary[] =>
      (items ?? []).map((item: any) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        total_stock: item.total_stock ?? 0,
        total_weight: item.total_weight ?? 0,
        grn_count: item.grn_count ?? 0,
        grns: mapGrns(item.grns),
      }));

    const items = mapItems(responseData?.items);
    const outOfStockItems = mapItems(responseData?.out_of_stock_items);

    console.log(
      `[StockSummary] Parsed ${items.length} in-stock items, ${outOfStockItems.length} out-of-stock items, total qty: ${summary.total_quantity}`
    );

    return {
      success: true,
      data: { summary, items, out_of_stock_items: outOfStockItems },
      message: 'Stock summary retrieved successfully',
    };
  } catch (error) {
    console.error('[StockSummary] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch stock summary',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch all-customers stock summary (staff view)
 *
 * @returns Stock summary across all customers with per-customer breakdown
 */
export async function getAllStockSummary(): Promise<AllStockSummaryResponse> {
  try {
    console.time('⏱️ [AllStockSummary] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[AllStockSummary] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
    });

    const client = await getAuthenticatedClient();

    console.log('[AllStockSummary] Calling get_all_stock_summary');

    const { data, error } = await client.rpc('get_all_stock_summary');

    console.timeEnd('⏱️ [AllStockSummary] RPC call duration');

    if (error) {
      console.error('[AllStockSummary] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: 'Failed to fetch all-customers stock summary',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[AllStockSummary] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: 'No stock data available',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [AllStockSummary] Response size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = Array.isArray(data) ? data[0] : data;

    // Map to our expected format
    const summary: AllStockSummaryKPIs = {
      total_customers_with_stock: responseData?.summary?.total_customers_with_stock ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight_kg: responseData?.summary?.total_weight_kg ?? 0,
    };

    const customers: CustomerStockRow[] = (responseData?.customers ?? []).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      total_stock: customer.total_stock ?? 0,
      total_weight: customer.total_weight ?? 0,
      item_count: customer.item_count ?? 0,
      grn_count: customer.grn_count ?? 0,
    }));

    console.log(`[AllStockSummary] Parsed ${customers.length} customers, total qty: ${summary.total_quantity}`);

    return {
      success: true,
      data: { summary, customers },
      message: 'All-customers stock summary retrieved successfully',
    };
  } catch (error) {
    console.error('[AllStockSummary] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: 'Failed to fetch all-customers stock summary',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
