/**
 * Dispatch Activity Report Service (C3)
 *
 * Fetches customer dispatch activity data from the get_customer_dispatch_activity RPC.
 * Returns recent dispatch history with item-level details.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  DispatchActivityResponse,
  DispatchActivityData,
  DispatchActivityKPIs,
  DispatchActivityRecord,
  AllDispatchActivityResponse,
  AllDispatchActivityData,
  AllDispatchActivityKPIs,
  CustomerDispatchRow,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: DispatchActivityData = {
  summary: {
    total_dispatches: 0,
    total_quantity: 0,
    total_weight: 0,
  },
  dispatches: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllDispatchActivityData = {
  summary: {
    total_dispatches: 0,
    total_customers: 0,
    total_quantity: 0,
    total_weight: 0,
  },
  by_customer: [],
};

/**
 * Get date string for N days ago
 */
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date string
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export interface DispatchActivityParams {
  customerId: string; // Required customer UUID
  fromDate?: string;
  toDate?: string;
  daysBack?: number; // Convenience param - defaults to 10 days
}

/**
 * Fetch customer dispatch activity
 *
 * @param params - Filter parameters for dispatch activity (customerId is required)
 * @returns Dispatch activity with KPIs and dispatch-level details
 */
export async function getCustomerDispatchActivity(
  params: DispatchActivityParams
): Promise<DispatchActivityResponse> {
  if (!params.customerId) {
    console.error('[DispatchActivity] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Customer ID is required',
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    console.time('⏱️ [DispatchActivity] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[DispatchActivity] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'none',
    });

    const client = await getAuthenticatedClient();

    // Calculate date range
    const toDate = params.toDate ?? getToday();
    const fromDate = params.fromDate ?? getDateDaysAgo(params.daysBack ?? 10);

    // Build RPC params with correct parameter names
    const rpcParams = {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    console.log('[DispatchActivity] Calling get_customer_dispatch_activity with params:', rpcParams);

    const { data, error } = await client.rpc('get_customer_dispatch_activity', rpcParams);

    console.timeEnd('⏱️ [DispatchActivity] RPC call duration');

    if (error) {
      console.error('[DispatchActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch dispatch activity',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[DispatchActivity] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No dispatch activity found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [DispatchActivity] Response size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = Array.isArray(data) ? data[0] : data;

    // Map to our expected format
    const summary: DispatchActivityKPIs = {
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight: responseData?.summary?.total_weight ?? 0,
    };

    const dispatches: DispatchActivityRecord[] = (responseData?.dispatches ?? []).map((disp: any) => ({
      disp_id: disp.disp_id,
      disp_no: disp.disp_no,
      disp_date: disp.disp_date,
      supervisor_name: disp.supervisor_name ?? '',
      total_qty: disp.total_qty ?? 0,
      total_weight: disp.total_weight ?? 0,
      items: (disp.items ?? []).map((item: any) => ({
        item_name: item.item_name,
        qty: item.qty ?? 0,
        source_grn: item.source_grn ?? '',
        source_grn_id: item.source_grn_id, // GRN ID for navigation
        weight: item.weight,
        orig_qty: item.orig_qty, // Original quantity from source GRN
        package_mark: item.package_mark, // Package mark from source GRN
        rack: item.rack, // Rack location from source GRN
      })),
    }));

    console.log(`[DispatchActivity] Parsed ${dispatches.length} dispatches, total qty: ${summary.total_quantity}`);

    return {
      success: true,
      data: { summary, dispatches },
      message: 'Dispatch activity retrieved successfully',
    };
  } catch (error) {
    console.error('[DispatchActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch dispatch activity',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AllDispatchActivityParams {
  fromDate: string;
  toDate: string;
}

/**
 * Fetch all-customers dispatch activity (staff view)
 *
 * @param params - Date range parameters
 * @returns Dispatch activity across all customers with per-customer breakdown
 */
export async function getAllDispatchActivity(
  params: AllDispatchActivityParams
): Promise<AllDispatchActivityResponse> {
  try {
    console.time('⏱️ [AllDispatchActivity] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[AllDispatchActivity] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
    });

    const client = await getAuthenticatedClient();

    const rpcParams = {
      p_from_date: params.fromDate,
      p_to_date: params.toDate,
    };

    console.log('[AllDispatchActivity] Calling get_all_dispatch_activity with params:', rpcParams);

    const { data, error } = await client.rpc('get_all_dispatch_activity', rpcParams);

    console.timeEnd('⏱️ [AllDispatchActivity] RPC call duration');

    if (error) {
      console.error('[AllDispatchActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: 'Failed to fetch all-customers dispatch activity',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[AllDispatchActivity] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: 'No dispatch activity found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [AllDispatchActivity] Response size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = Array.isArray(data) ? data[0] : data;

    // Map to our expected format
    const summary: AllDispatchActivityKPIs = {
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight: responseData?.summary?.total_weight ?? 0,
    };

    // Debug: Log raw customer data to check field names
    if (responseData?.by_customer?.length > 0) {
      console.log('[AllDispatchActivity] First customer raw data:', JSON.stringify(responseData.by_customer[0]));
    }

    const byCustomer: CustomerDispatchRow[] = (responseData?.by_customer ?? []).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      dispatch_count: customer.dispatch_count ?? 0,
      total_quantity: customer.total_quantity ?? customer.total_qty ?? 0,
      total_weight: customer.total_weight ?? 0,
    }));

    console.log(`[AllDispatchActivity] Parsed ${byCustomer.length} customers, total dispatches: ${summary.total_dispatches}, first customer qty: ${byCustomer[0]?.total_quantity ?? 'N/A'}`);

    return {
      success: true,
      data: { summary, by_customer: byCustomer },
      message: 'All-customers dispatch activity retrieved successfully',
    };
  } catch (error) {
    console.error('[AllDispatchActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: 'Failed to fetch all-customers dispatch activity',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
