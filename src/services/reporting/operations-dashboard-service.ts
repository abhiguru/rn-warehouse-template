/**
 * Operations Dashboard Service (S1)
 *
 * Fetches operations dashboard data from the get_operations_dashboard RPC.
 * Staff-only report showing cross-customer KPIs and trends.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  OperationsDashboardResponse,
  OperationsDashboardData,
  OperationsKPIs,
  OperationsTrends,
  RecentActivityItem,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: OperationsDashboardData = {
  kpis: {
    total_grns: 0,
    total_dispatches: 0,
    pending_orders: 0,
    active_customers: 0,
    total_stock_qty: 0,
    total_stock_weight: 0,
  },
  trends: {
    grn_daily: [],
    dispatch_daily: [],
  },
  recent_activity: [],
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

export interface OperationsDashboardParams {
  fromDate?: string;
  toDate?: string;
  daysBack?: number; // Convenience param - defaults to 7 days for trends
}

/**
 * Fetch operations dashboard data
 *
 * Note: This RPC is staff-only. Regular customers will receive an error.
 *
 * @param params - Filter parameters for dashboard
 * @returns Operations dashboard with KPIs, trends, and recent activity
 */
export async function getOperationsDashboard(
  params: OperationsDashboardParams = {}
): Promise<OperationsDashboardResponse> {
  try {
    console.time('⏱️ [OperationsDashboard] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[OperationsDashboard] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'none',
    });

    const client = await getAuthenticatedClient();

    // Calculate date range
    const toDate = params.toDate ?? getToday();
    const fromDate = params.fromDate ?? getDateDaysAgo(params.daysBack ?? 7);

    // Build RPC params with correct parameter names
    const rpcParams = {
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    console.log('[OperationsDashboard] Calling get_operations_dashboard with params:', rpcParams);

    const { data, error } = await client.rpc('get_operations_dashboard', rpcParams);

    console.timeEnd('⏱️ [OperationsDashboard] RPC call duration');

    if (error) {
      console.error('[OperationsDashboard] RPC error:', error.message);

      // Check for access denied error
      if (error.message.includes('Access denied') || error.code === '42501') {
        return {
          success: false,
          data: EMPTY_RESPONSE,
          message: 'Access denied. This report is for staff only.',
          error: 'STAFF_ONLY',
        };
      }

      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch operations dashboard',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[OperationsDashboard] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No operations data available',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [OperationsDashboard] Response size: ${(dataSize / 1024).toFixed(2)} KB`);

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = Array.isArray(data) ? data[0] : data;

    // Map to our expected format
    const kpis: OperationsKPIs = {
      total_grns: responseData?.kpis?.total_grns ?? 0,
      total_dispatches: responseData?.kpis?.total_dispatches ?? 0,
      pending_orders: responseData?.kpis?.pending_orders ?? 0,
      active_customers: responseData?.kpis?.active_customers ?? 0,
      total_stock_qty: responseData?.kpis?.total_stock_qty ?? 0,
      total_stock_weight: responseData?.kpis?.total_stock_weight ?? 0,
    };

    const trends: OperationsTrends = {
      grn_daily: (responseData?.trends?.grn_daily ?? []).map((point: any) => ({
        date: point.date,
        count: point.count ?? 0,
      })),
      dispatch_daily: (responseData?.trends?.dispatch_daily ?? []).map((point: any) => ({
        date: point.date,
        count: point.count ?? 0,
      })),
    };

    const recent_activity: RecentActivityItem[] = (responseData?.recent_activity ?? []).map((item: any) => ({
      type: item.type as 'grn' | 'dispatch',
      ref: item.ref,
      customer: item.customer,
      time: item.time,
    }));

    console.log(`[OperationsDashboard] Parsed KPIs - GRNs: ${kpis.total_grns}, Dispatches: ${kpis.total_dispatches}`);

    return {
      success: true,
      data: { kpis, trends, recent_activity },
      message: 'Operations dashboard retrieved successfully',
    };
  } catch (error) {
    console.error('[OperationsDashboard] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch operations dashboard',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
