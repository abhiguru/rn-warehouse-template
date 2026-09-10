/**
 * GRN Activity Report Service (C2)
 *
 * Fetches GRN activity data from the get_customer_grn_activity RPC.
 * Returns GRN history with items, invoice status, and dispatch summary.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  GRNActivityResponse,
  GRNActivityData,
  GRNActivityKPIs,
  GRNActivityRecord,
  AllGRNActivityResponse,
  AllGRNActivityData,
  AllGRNActivityKPIs,
  CustomerGRNSummary,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: GRNActivityData = {
  summary: {
    total_grns: 0,
    total_items: 0,
    total_quantity: 0,
    total_weight_kg: 0,
    total_invoiced_grns: 0,
    total_images: 0,
  },
  grns: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllGRNActivityData = {
  summary: {
    total_grns: 0,
    total_customers: 0,
    total_items: 0,
    total_quantity: 0,
    total_weight_kg: 0,
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

export interface GRNActivityParams {
  customerId: string; // Required customer UUID
  fromDate?: string;
  toDate?: string;
  daysBack?: number; // Convenience param - defaults to 10 days
}

/**
 * Fetch customer GRN activity
 *
 * @param params - Filter parameters for GRN activity (customerId is required)
 * @returns GRN activity with KPIs and GRN-level details
 */
export async function getCustomerGRNActivity(
  params: GRNActivityParams
): Promise<GRNActivityResponse> {
  if (!params.customerId) {
    console.error('[GRNActivity] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Customer ID is required',
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    console.time('⏱️ [GRNActivity] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[GRNActivity] Token status:', {
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

    // Build RPC params
    const rpcParams = {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    console.log('[GRNActivity] Calling get_customer_grn_activity with params:', rpcParams);

    const { data, error } = await client.rpc('get_customer_grn_activity', rpcParams);

    console.timeEnd('⏱️ [GRNActivity] RPC call duration');

    if (error) {
      console.error('[GRNActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch GRN activity',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[GRNActivity] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No GRN activity found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [GRNActivity] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[GRNActivity] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[GRNActivity] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format
    const summary: GRNActivityKPIs = {
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight_kg: responseData?.summary?.total_weight_kg ?? 0,
      total_invoiced_grns: responseData?.summary?.total_invoiced_grns ?? 0,
      total_images: responseData?.summary?.total_images ?? 0,
    };

    const grns: GRNActivityRecord[] = (responseData?.grns ?? []).map((grn: any) => ({
      grn_id: grn.grn_id,
      gr_no: grn.gr_no,
      grn_date: grn.grn_date,
      registration: grn.registration ?? '',
      sender_name: grn.sender_name ?? '',
      supervisor_name: grn.supervisor_name ?? '',
      note: grn.note ?? null,
      total_items: grn.total_items ?? 0,
      total_qty: grn.total_qty ?? 0,
      total_weight: grn.total_weight ?? 0,
      image_count: grn.image_count ?? 0,
      invoice_status: {
        is_invoiced: grn.invoice_status?.is_invoiced ?? false,
        invoice_id: grn.invoice_status?.invoice_id ?? null,
        invoice_number: grn.invoice_status?.invoice_number ?? null,
      },
      dispatch_summary: {
        total_dispatched: grn.dispatch_summary?.total_dispatched ?? 0,
        current_stock: grn.dispatch_summary?.current_stock ?? 0,
        dispatch_count: grn.dispatch_summary?.dispatch_count ?? 0,
        last_dispatch_date: grn.dispatch_summary?.last_dispatch_date ?? null,
        is_fully_dispatched: grn.dispatch_summary?.is_fully_dispatched ?? false,
      },
      items: (grn.items ?? []).map((item: any) => ({
        item_name: item.item_name ?? '',
        packaging: item.packaging ?? '',
        quantity: item.quantity ?? 0,
        current_stock: item.current_stock ?? 0,
        dispatched_qty: item.dispatched_qty ?? 0,
        weight: item.weight ?? 0,
        rack: item.rack ?? '',
        package_mark: item.package_mark ?? '',
      })),
    }));

    console.log(`[GRNActivity] Parsed ${grns.length} GRNs, total qty: ${summary.total_quantity}`);

    return {
      success: true,
      data: { summary, grns },
      message: 'GRN activity retrieved successfully',
    };
  } catch (error) {
    console.error('[GRNActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch GRN activity',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AllGRNActivityParams {
  fromDate: string;
  toDate: string;
}

/**
 * Fetch all-customers GRN activity (staff view)
 *
 * @param params - Date range parameters
 * @returns GRN activity across all customers with per-customer breakdown
 */
export async function getAllGRNActivity(
  params: AllGRNActivityParams
): Promise<AllGRNActivityResponse> {
  try {
    console.time('⏱️ [AllGRNActivity] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[AllGRNActivity] Token status:', {
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

    console.log('[AllGRNActivity] Calling get_all_grn_activity with params:', rpcParams);

    const { data, error } = await client.rpc('get_all_grn_activity', rpcParams);

    console.timeEnd('⏱️ [AllGRNActivity] RPC call duration');

    if (error) {
      console.error('[AllGRNActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: 'Failed to fetch all-customers GRN activity',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[AllGRNActivity] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: 'No GRN activity found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [AllGRNActivity] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[AllGRNActivity] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;
    console.log('[AllGRNActivity] Parsed rawData keys:', rawData ? Object.keys(rawData) : 'null');

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[AllGRNActivity] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format (new get_all_grn_activity RPC)
    const summary: AllGRNActivityKPIs = {
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight_kg: responseData?.summary?.total_weight ?? 0, // Backend uses total_weight
    };

    const byCustomer: CustomerGRNSummary[] = (responseData?.by_customer ?? []).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      grn_count: customer.grn_count ?? 0,
      total_quantity: customer.total_qty ?? 0, // Backend uses total_qty
      total_weight: customer.total_weight ?? 0,
      latest_grn_date: customer.latest_grn ?? '', // Backend uses latest_grn
    }));

    console.log(`[AllGRNActivity] Parsed ${byCustomer.length} customers, total GRNs: ${summary.total_grns}`);

    return {
      success: true,
      data: { summary, by_customer: byCustomer },
      message: 'All-customers GRN activity retrieved successfully',
    };
  } catch (error) {
    console.error('[AllGRNActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: 'Failed to fetch all-customers GRN activity',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
