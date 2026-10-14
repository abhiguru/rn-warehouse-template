/**
 * GRN Activity Report Service (C2)
 *
 * Fetches GRN activity data from the get_customer_grn_activity RPC.
 * Returns GRN history with items, invoice status, and dispatch summary.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
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

import { t } from '@/i18n';
import { getDateDaysAgo, getToday } from './reportDates';
import { createLogger } from '@/utils/logger';
import { reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');
/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: GRNActivityData = {
  summary: {
    total_grns: 0,
    total_items: 0,
    total_quantity: 0,
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
  },
  by_customer: [],
};

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
    logger.error('[GRNActivity] Customer ID is required');
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

    // Build RPC params
    const rpcParams = {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    const { data, error } = await client.rpc(
      'get_customer_grn_activity',
      rpcParams
    );

    if (error) {
      logger.error('[GRNActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: t('reports.grnActivity.errors.fetchFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: t('reports.grnActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_RESPONSE, t('reports.grnActivity.errors.fetchFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = reportBody(data);

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;

    // Map to our expected format
    const summary: GRNActivityKPIs = {
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
      total_invoiced_grns: responseData?.summary?.total_invoiced_grns ?? 0,
      total_images: responseData?.summary?.total_images ?? 0,
    };

    const grns: GRNActivityRecord[] = (responseData?.grns ?? []).map(
      (grn: any) => ({
        grn_id: grn.grn_id,
        gr_no: grn.gr_no,
        grn_date: grn.grn_date,
        registration: grn.registration ?? '',
        sender_name: grn.sender_name ?? '',
        supervisor_name: grn.supervisor_name ?? '',
        note: grn.note ?? null,
        total_items: grn.total_items ?? 0,
        total_qty: grn.total_qty ?? 0,
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
          is_fully_dispatched:
            grn.dispatch_summary?.is_fully_dispatched ?? false,
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
      })
    );

    return {
      success: true,
      data: { summary, grns },
      message: t('reports.grnActivity.retrieved'),
    };
  } catch (error) {
    logger.error('[GRNActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.grnActivity.errors.fetchFailed'),
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
    const client = await getAuthenticatedClient();

    const rpcParams = {
      p_from_date: params.fromDate,
      p_to_date: params.toDate,
    };

    const { data, error } = await client.rpc('get_all_grn_activity', rpcParams);

    if (error) {
      logger.error('[AllGRNActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.grnActivity.errors.fetchAllFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.grnActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_ALL_RESPONSE, t('reports.grnActivity.errors.fetchAllFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = reportBody(data);

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;

    // Map to our expected format (new get_all_grn_activity RPC)
    const summary: AllGRNActivityKPIs = {
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_items: responseData?.summary?.total_items ?? 0,
      total_quantity: responseData?.summary?.total_quantity ?? 0,
    };

    const byCustomer: CustomerGRNSummary[] = (
      responseData?.by_customer ?? []
    ).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      grn_count: customer.grn_count ?? 0,
      total_quantity: customer.total_qty ?? 0, // Backend uses total_qty
      latest_grn_date: customer.latest_grn ?? '', // Backend uses latest_grn
    }));

    return {
      success: true,
      data: { summary, by_customer: byCustomer },
      message: t('reports.grnActivity.retrievedAll'),
    };
  } catch (error) {
    logger.error('[AllGRNActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: t('reports.grnActivity.errors.fetchAllFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
