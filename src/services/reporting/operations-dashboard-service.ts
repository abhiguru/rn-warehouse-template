/**
 * Operations Dashboard Service (S1)
 *
 * Fetches operations dashboard data from the get_operations_dashboard RPC.
 * Staff-only report showing cross-customer KPIs and trends.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type {
  OperationsDashboardResponse,
  OperationsDashboardData,
  OperationsKPIs,
  OperationsTrends,
  RecentActivityItem,
} from '@/types/report.types';

import { t } from '@/i18n';
import { getDateDaysAgo, getToday } from './reportDates';
import { createLogger } from '@/utils/logger';
import { isAccessRefusal, reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');
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
  },
  trends: {
    grn_daily: [],
    dispatch_daily: [],
  },
  recent_activity: [],
};

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
    const client = await getAuthenticatedClient();

    // Calculate date range
    const toDate = params.toDate ?? getToday();
    const fromDate = params.fromDate ?? getDateDaysAgo(params.daysBack ?? 7);

    // Build RPC params with correct parameter names
    const rpcParams = {
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    const { data, error } = await client.rpc(
      'get_operations_dashboard',
      rpcParams
    );

    if (error) {
      logger.error('[OperationsDashboard] RPC error:', error.message);

      // Check for access denied error
      if (error.message.includes('Access denied') || error.code === '42501') {
        return {
          success: false,
          data: EMPTY_RESPONSE,
          message: t('reports.operations.service.accessDenied'),
          error: 'STAFF_ONLY',
        };
      }

      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: t('reports.operations.service.fetchFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: t('reports.operations.service.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      // The role check answers in the body: {error:'Access denied: ...', kpis:null}.
      if (isAccessRefusal(refusal)) {
        return {
          success: false,
          data: EMPTY_RESPONSE,
          message: t('reports.operations.service.accessDenied'),
          error: 'STAFF_ONLY',
        };
      }
      return refusedReport(refusal, EMPTY_RESPONSE, t('reports.operations.service.fetchFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = reportBody(data);

    // Map to our expected format
    const kpis: OperationsKPIs = {
      total_grns: responseData?.kpis?.total_grns ?? 0,
      total_dispatches: responseData?.kpis?.total_dispatches ?? 0,
      pending_orders: responseData?.kpis?.pending_orders ?? 0,
      active_customers: responseData?.kpis?.active_customers ?? 0,
      total_stock_qty: responseData?.kpis?.total_stock_qty ?? 0,
    };

    const trends: OperationsTrends = {
      grn_daily: (responseData?.trends?.grn_daily ?? []).map((point: any) => ({
        date: point.date,
        count: point.count ?? 0,
      })),
      dispatch_daily: (responseData?.trends?.dispatch_daily ?? []).map(
        (point: any) => ({
          date: point.date,
          count: point.count ?? 0,
        })
      ),
    };

    const recent_activity: RecentActivityItem[] = (
      responseData?.recent_activity ?? []
    ).map((item: any) => ({
      type: item.type as 'grn' | 'dispatch',
      ref: item.ref,
      customer: item.customer,
      time: item.time,
    }));

    return {
      success: true,
      data: { kpis, trends, recent_activity },
      message: t('reports.operations.service.retrieved'),
    };
  } catch (error) {
    logger.error('[OperationsDashboard] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.operations.service.fetchFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
