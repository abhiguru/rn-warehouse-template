/**
 * Customer Activity Report Service (C6)
 *
 * Fetches consolidated customer activity from:
 * - get_all_customer_activity_summary RPC (Level 1 - all customers list)
 * - get_customer_activity_detail RPC (Level 2 - single customer dashboard)
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type {
  AllCustomerActivityResponse,
  AllCustomerActivityData,
  CustomerActivityListKPIs,
  CustomerActivityRow,
  CustomerActivityDetailResponse,
  CustomerActivityDetailData,
  CustomerActivityDetailKPIs,
  MonthlyTrendPoint,
  RecentGRNPreview,
  RecentDispatchPreview,
  StockItemPreview,
  RecentInvoicePreview,
} from '@/types/report.types';

import { t } from '@/i18n';
import { getDateDaysAgo, getToday } from './reportDates';
import { createLogger } from '@/utils/logger';
import { reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');
// Default 420-day period
const DEFAULT_DAYS_BACK = 420;

/**
 * Default empty response for Level 1 (all customers)
 */
const EMPTY_LIST_RESPONSE: AllCustomerActivityData = {
  summary: {
    total_customers: 0,
    total_current_stock: 0,
    total_grns: 0,
    total_dispatches: 0,
    total_invoice_amount: 0,
  },
  customers: [],
};

/**
 * Default empty response for Level 2 (single customer detail)
 */
const EMPTY_DETAIL_RESPONSE: CustomerActivityDetailData = {
  customer_id: '',
  customer_name: '',
  customer_city: '',
  summary: {
    current_stock: 0,
    total_grns: 0,
    total_grn_quantity: 0,
    total_dispatches: 0,
    total_dispatch_quantity: 0,
    total_invoice_amount: 0,
    total_paid_amount: 0,
    total_pending_amount: 0,
    average_stock_age_days: 0,
  },
  monthly_trends: [],
  by_bucket: {},
  recent_grns: [],
  recent_dispatches: [],
  top_stock_items: [],
  recent_invoices: [],
};

export interface CustomerActivityListParams {
  fromDate?: string;
  toDate?: string;
  daysBack?: number;
}

export interface CustomerActivityDetailParams {
  customerId: string;
  fromDate?: string;
  toDate?: string;
  daysBack?: number;
}

/**
 * Fetch all customers activity summary (Level 1)
 *
 * @param params - Date range parameters
 * @returns All customers with consolidated activity metrics
 */
export async function getAllCustomerActivity(
  params: CustomerActivityListParams = {}
): Promise<AllCustomerActivityResponse> {
  try {

    const client = await getAuthenticatedClient();

    const toDate = params.toDate ?? getToday();
    const fromDate =
      params.fromDate ?? getDateDaysAgo(params.daysBack ?? DEFAULT_DAYS_BACK);

    const { data, error } = await client.rpc(
      'get_all_customer_activity_summary',
      {
        p_from_date: fromDate,
        p_to_date: toDate,
      }
    );

    if (error) {
      logger.error('[CustomerActivity] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_LIST_RESPONSE,
        message: t('reports.customerActivity.errors.summaryFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_LIST_RESPONSE,
        message: t('reports.customerActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_LIST_RESPONSE, t('reports.customerActivity.errors.summaryFailed'));
    }

    // Parse the RPC response - handle wrapped formats
    // Backend returns: {data: {summary, customers}, success, metadata}
    let responseData = reportBody(data);

    // Unwrap if response has a data property containing the actual payload
    if (responseData?.data && responseData?.success !== undefined) {
      responseData = responseData.data;
    }

    // Map summary KPIs
    const summary: CustomerActivityListKPIs = {
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_current_stock: responseData?.summary?.total_current_stock ?? 0,
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_invoice_amount: responseData?.summary?.total_invoice_amount ?? 0,
    };

    // Map customer rows
    const customers: CustomerActivityRow[] = (
      responseData?.customers ?? []
    ).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_city: customer.customer_city ?? '',
      current_stock: customer.current_stock ?? 0,
      total_grns: customer.total_grns ?? 0,
      total_dispatches: customer.total_dispatches ?? 0,
      total_invoice_amount: customer.total_invoice_amount ?? 0,
      last_activity_date: customer.last_activity_date ?? '',
      last_activity_type: customer.last_activity_type ?? null,
    }));

    return {
      success: true,
      data: { summary, customers },
      message: t('reports.customerActivity.retrievedSummary'),
    };
  } catch (error) {
    logger.error('[CustomerActivity] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_LIST_RESPONSE,
      message: t('reports.customerActivity.errors.summaryFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch single customer activity detail (Level 2)
 *
 * @param params - Customer ID and date range parameters
 * @returns Detailed customer dashboard with charts data and recent activity
 */
export async function getCustomerActivityDetail(
  params: CustomerActivityDetailParams
): Promise<CustomerActivityDetailResponse> {
  if (!params.customerId) {
    logger.error('[CustomerActivityDetail] Customer ID is required');
    return {
      success: false,
      data: EMPTY_DETAIL_RESPONSE,
      message: t('reports.customerActivity.errors.customerIdRequired'),
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {

    const client = await getAuthenticatedClient();

    const toDate = params.toDate ?? getToday();
    const fromDate =
      params.fromDate ?? getDateDaysAgo(params.daysBack ?? DEFAULT_DAYS_BACK);

    const { data, error } = await client.rpc('get_customer_activity_detail', {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    });

    if (error) {
      logger.error('[CustomerActivityDetail] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_DETAIL_RESPONSE,
        message: t('reports.customerActivity.errors.detailFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_DETAIL_RESPONSE,
        message: t('reports.customerActivity.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_DETAIL_RESPONSE, t('reports.customerActivity.errors.detailFailed'));
    }

    // Parse the RPC response - handle wrapped formats
    let responseData = reportBody(data);

    // Unwrap if response has a data property containing the actual payload
    if (responseData?.data && responseData?.success !== undefined) {
      responseData = responseData.data;
    }

    // Map summary KPIs
    const summary: CustomerActivityDetailKPIs = {
      current_stock: responseData?.summary?.current_stock ?? 0,
      total_grns: responseData?.summary?.total_grns ?? 0,
      total_grn_quantity: responseData?.summary?.total_grn_quantity ?? 0,
      total_dispatches: responseData?.summary?.total_dispatches ?? 0,
      total_dispatch_quantity:
        responseData?.summary?.total_dispatch_quantity ?? 0,
      total_invoice_amount: responseData?.summary?.total_invoice_amount ?? 0,
      total_paid_amount: responseData?.summary?.total_paid_amount ?? 0,
      total_pending_amount: responseData?.summary?.total_pending_amount ?? 0,
      average_stock_age_days:
        responseData?.summary?.average_stock_age_days ?? 0,
    };

    // Map monthly trends
    const monthlyTrends: MonthlyTrendPoint[] = (
      responseData?.monthly_trends ?? []
    ).map((trend: any) => ({
      month: trend.month,
      grn_count: trend.grn_count ?? 0,
      grn_quantity: trend.grn_quantity ?? 0,
      dispatch_count: trend.dispatch_count ?? 0,
      dispatch_quantity: trend.dispatch_quantity ?? 0,
      invoice_amount: trend.invoice_amount ?? 0,
      stock_level_end: trend.stock_level_end ?? 0,
    }));

    // Map recent GRNs
    const recentGrns: RecentGRNPreview[] = (
      responseData?.recent_grns ?? []
    ).map((grn: any) => ({
      grn_id: grn.grn_id,
      gr_no: grn.gr_no,
      grn_date: grn.grn_date,
      total_qty: grn.total_qty ?? 0,
      current_stock: grn.current_stock ?? 0,
      is_invoiced: grn.is_invoiced ?? false,
    }));

    // Map recent dispatches
    const recentDispatches: RecentDispatchPreview[] = (
      responseData?.recent_dispatches ?? []
    ).map((dispatch: any) => ({
      dispatch_id: dispatch.dispatch_id,
      dispatch_no: dispatch.dispatch_no,
      dispatch_date: dispatch.dispatch_date,
      total_qty: dispatch.total_qty ?? 0,
      supervisor_name: dispatch.supervisor_name ?? '',
    }));

    // Map top stock items
    const topStockItems: StockItemPreview[] = (
      responseData?.top_stock_items ?? []
    ).map((item: any) => ({
      item_name: item.item_name,
      total_stock: item.total_stock ?? 0,
      grn_count: item.grn_count ?? 0,
    }));

    // Map recent invoices
    const recentInvoices: RecentInvoicePreview[] = (
      responseData?.recent_invoices ?? []
    ).map((invoice: any) => ({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      net_total: invoice.net_total ?? 0,
      status: invoice.status ?? 'pending',
    }));

    return {
      success: true,
      data: {
        customer_id: responseData?.customer_id ?? params.customerId,
        customer_name: responseData?.customer_name ?? '',
        customer_city: responseData?.customer_city ?? '',
        summary,
        monthly_trends: monthlyTrends,
        by_bucket: responseData?.by_bucket ?? {},
        recent_grns: recentGrns,
        recent_dispatches: recentDispatches,
        top_stock_items: topStockItems,
        recent_invoices: recentInvoices,
      },
      message: t('reports.customerActivity.retrievedDetail'),
    };
  } catch (error) {
    logger.error('[CustomerActivityDetail] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_DETAIL_RESPONSE,
      message: t('reports.customerActivity.errors.detailFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
