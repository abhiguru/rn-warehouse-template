/**
 * Dispatch Activity Report Service (C3)
 *
 * Fetches customer dispatch activity data from the get_customer_dispatch_activity RPC.
 * Returns recent dispatch history with item-level details.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
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

import { toLocalISODate } from '@/utils/formatters';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';
import { reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');
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
  return toLocalISODate(date);
}

/**
 * Get today's date string
 */
function getToday(): string {
  return toLocalISODate(new Date());
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
    logger.error('[DispatchActivity] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.customerActivity.errors.customerIdRequired'),
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
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

    const { data, error } = await client.rpc(
      'get_customer_dispatch_activity',
      rpcParams
    );

    if (error) {
      logger.error('[DispatchActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: t('reports.dispatchActivity.errors.fetchFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: t('reports.dispatchActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_RESPONSE, t('reports.dispatchActivity.errors.fetchFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = reportBody(data);

    // Map to our expected format
    const summary: DispatchActivityKPIs = {
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight: responseData?.summary?.total_weight ?? 0,
    };

    const dispatches: DispatchActivityRecord[] = (
      responseData?.dispatches ?? []
    ).map((disp: any) => ({
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

    return {
      success: true,
      data: { summary, dispatches },
      message: t('reports.dispatchActivity.retrieved'),
    };
  } catch (error) {
    logger.error('[DispatchActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.dispatchActivity.errors.fetchFailed'),
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
    const client = await getAuthenticatedClient();

    const rpcParams = {
      p_from_date: params.fromDate,
      p_to_date: params.toDate,
    };

    const { data, error } = await client.rpc(
      'get_all_dispatch_activity',
      rpcParams
    );

    if (error) {
      logger.error('[AllDispatchActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.dispatchActivity.errors.fetchAllFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.dispatchActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_ALL_RESPONSE, t('reports.dispatchActivity.errors.fetchAllFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const responseData = reportBody(data);

    // Map to our expected format
    const summary: AllDispatchActivityKPIs = {
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_weight: responseData?.summary?.total_weight ?? 0,
    };

    const byCustomer: CustomerDispatchRow[] = (
      responseData?.by_customer ?? []
    ).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      dispatch_count: customer.dispatch_count ?? 0,
      total_quantity: customer.total_quantity ?? customer.total_qty ?? 0,
      total_weight: customer.total_weight ?? 0,
    }));

    return {
      success: true,
      data: { summary, by_customer: byCustomer },
      message: t('reports.dispatchActivity.retrievedAll'),
    };
  } catch (error) {
    logger.error('[AllDispatchActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: t('reports.dispatchActivity.errors.fetchAllFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
