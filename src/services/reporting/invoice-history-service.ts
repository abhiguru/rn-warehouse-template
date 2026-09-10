/**
 * Invoice History Report Service (C4)
 *
 * Fetches invoice history data from the get_customer_invoice_summary RPC.
 * Returns invoices with line items, payment status, and monthly breakdown.
 */

import { getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import type {
  InvoiceHistoryResponse,
  InvoiceHistoryData,
  InvoiceHistoryKPIs,
  InvoiceHistoryRecord,
  InvoiceMonthlyBreakdown,
  AllInvoiceHistoryResponse,
  AllInvoiceHistoryData,
  AllInvoiceHistoryKPIs,
  CustomerInvoiceSummary,
} from '@/types/report.types';

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: InvoiceHistoryData = {
  summary: {
    total_invoices: 0,
    total_amount: 0,
    total_labour: 0,
    total_tax: 0,
    total_discount: 0,
    net_amount: 0,
    paid_count: 0,
    pending_count: 0,
    paid_amount: 0,
    pending_amount: 0,
  },
  invoices: [],
  by_month: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllInvoiceHistoryData = {
  summary: {
    total_invoices: 0,
    total_customers: 0,
    total_amount: 0,
    total_tax: 0,
    net_amount: 0,
  },
  by_customer: [],
  by_month: [],
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

export interface InvoiceHistoryParams {
  customerId: string; // Required customer UUID
  fromDate?: string;
  toDate?: string;
  daysBack?: number; // Convenience param - defaults to 30 days
  financialYear?: number; // Optional financial year filter
}

/**
 * Fetch customer invoice history
 *
 * @param params - Filter parameters for invoice history (customerId is required)
 * @returns Invoice history with KPIs, invoices, and monthly breakdown
 */
export async function getCustomerInvoiceHistory(
  params: InvoiceHistoryParams
): Promise<InvoiceHistoryResponse> {
  if (!params.customerId) {
    console.error('[InvoiceHistory] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Customer ID is required',
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    console.time('⏱️ [InvoiceHistory] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[InvoiceHistory] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : 'none',
    });

    const client = await getAuthenticatedClient();

    // Calculate date range
    const toDate = params.toDate ?? getToday();
    const fromDate = params.fromDate ?? getDateDaysAgo(params.daysBack ?? 30);

    // Build RPC params
    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    if (params.financialYear) {
      rpcParams.p_financial_year = params.financialYear;
    }

    console.log('[InvoiceHistory] Calling get_customer_invoice_summary with params:', rpcParams);

    const { data, error } = await client.rpc('get_customer_invoice_summary', rpcParams);

    console.timeEnd('⏱️ [InvoiceHistory] RPC call duration');

    if (error) {
      console.error('[InvoiceHistory] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: 'Failed to fetch invoice history',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[InvoiceHistory] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: 'No invoice history found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [InvoiceHistory] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[InvoiceHistory] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[InvoiceHistory] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format
    const summary: InvoiceHistoryKPIs = {
      total_invoices: responseData?.summary?.total_invoices ?? 0,
      total_amount: responseData?.summary?.total_amount ?? 0,
      total_labour: responseData?.summary?.total_labour ?? 0,
      total_tax: responseData?.summary?.total_tax ?? 0,
      total_discount: responseData?.summary?.total_discount ?? 0,
      net_amount: responseData?.summary?.net_amount ?? 0,
      paid_count: responseData?.summary?.paid_count ?? 0,
      pending_count: responseData?.summary?.pending_count ?? 0,
      paid_amount: responseData?.summary?.paid_amount ?? 0,
      pending_amount: responseData?.summary?.pending_amount ?? 0,
    };

    const invoices: InvoiceHistoryRecord[] = (responseData?.invoices ?? []).map((inv: any) => ({
      invoice_id: inv.invoice_id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      financial_year: inv.financial_year ?? '',
      grn_ref: inv.grn_ref ?? '',
      grn_id: inv.grn_id ?? '',
      total: inv.total ?? 0,
      labour: inv.labour ?? 0,
      discount: inv.discount ?? 0,
      tax_amount: inv.tax_amount ?? 0,
      net_total: inv.net_total ?? 0,
      item_count: inv.item_count ?? 0,
      total_quantity: inv.total_quantity ?? 0,
      notes: inv.notes ?? null,
      payment_status: {
        status: inv.payment_status?.status ?? 'pending',
        paid_date: inv.payment_status?.paid_date ?? null,
        payment_ref: inv.payment_status?.payment_ref ?? null,
        amount: inv.payment_status?.amount,
        payment_mode: inv.payment_status?.payment_mode,
      },
      line_items: (inv.line_items ?? []).map((item: any) => ({
        item_id: item.item_id ?? '',
        item_name: item.item_name ?? '',
        packaging: item.packaging ?? '',
        quantity: item.quantity ?? 0,
        rate: item.rate ?? 0,
        no_of_days: item.no_of_days ?? 0,
        charge: item.charge ?? 0,
        labour_rate: item.labour_rate ?? 0,
        labour_amount: item.labour_amount ?? 0,
        tax_percent: item.tax_percent ?? 0,
        tax_amount: item.tax_amount ?? 0,
        line_total: item.line_total ?? 0,
        grn_item_ref: {
          gr_no: item.grn_item_ref?.gr_no ?? '',
          rack: item.grn_item_ref?.rack ?? '',
          package_mark: item.grn_item_ref?.package_mark ?? '',
        },
      })),
    }));

    const byMonth: InvoiceMonthlyBreakdown[] = (responseData?.by_month ?? []).map((m: any) => ({
      month: m.month ?? '',
      invoice_count: m.invoice_count ?? 0,
      total_amount: m.total_amount ?? 0,
      paid_amount: m.paid_amount ?? 0,
      pending_amount: m.pending_amount ?? 0,
    }));

    console.log(`[InvoiceHistory] Parsed ${invoices.length} invoices, net amount: ${summary.net_amount}`);

    return {
      success: true,
      data: { summary, invoices, by_month: byMonth },
      message: 'Invoice history retrieved successfully',
    };
  } catch (error) {
    console.error('[InvoiceHistory] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: 'Failed to fetch invoice history',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AllInvoiceHistoryParams {
  fromDate: string;
  toDate: string;
  financialYear?: number;
}

/**
 * Fetch all-customers invoice history (staff view)
 *
 * @param params - Date range and optional financial year parameters
 * @returns Invoice history across all customers with per-customer breakdown
 */
export async function getAllInvoiceHistory(
  params: AllInvoiceHistoryParams
): Promise<AllInvoiceHistoryResponse> {
  try {
    console.time('⏱️ [AllInvoiceHistory] RPC call duration');

    // Debug: Check token status before making RPC call
    const tokenData = await getStoredToken();
    console.log('[AllInvoiceHistory] Token status:', {
      isValid: tokenData.isValid,
      type: tokenData.type,
      hasAuthToken: !!tokenData.authToken,
      tokenPreview: tokenData.authToken ? `${tokenData.authToken.substring(0, 20)}...` : 'none',
    });

    const client = await getAuthenticatedClient();

    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: null, // Null for all customers
      p_from_date: params.fromDate,
      p_to_date: params.toDate,
    };

    if (params.financialYear) {
      rpcParams.p_financial_year = params.financialYear;
    }

    console.log('[AllInvoiceHistory] Calling get_customer_invoice_summary with params:', rpcParams);

    const { data, error } = await client.rpc('get_customer_invoice_summary', rpcParams);

    console.timeEnd('⏱️ [AllInvoiceHistory] RPC call duration');

    if (error) {
      console.error('[AllInvoiceHistory] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: 'Failed to fetch all-customers invoice history',
        error: error.message,
      };
    }

    if (!data) {
      console.log('[AllInvoiceHistory] No data returned from RPC');
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: 'No invoice history found',
      };
    }

    // Log response size for debugging
    const dataSize = JSON.stringify(data).length;
    console.log(`📊 [AllInvoiceHistory] Response size: ${(dataSize / 1024).toFixed(2)} KB`);
    console.log('[AllInvoiceHistory] Raw RPC response:', JSON.stringify(data, null, 2));

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = Array.isArray(data) ? data[0] : data;

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;
    console.log('[AllInvoiceHistory] Unwrapped responseData keys:', responseData ? Object.keys(responseData) : 'null');

    // Map to our expected format
    const summary: AllInvoiceHistoryKPIs = {
      total_invoices: responseData?.summary?.total_invoices ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_amount: responseData?.summary?.total_amount ?? 0,
      total_tax: responseData?.summary?.total_tax ?? 0,
      net_amount: responseData?.summary?.net_amount ?? 0,
    };

    const byCustomer: CustomerInvoiceSummary[] = (responseData?.by_customer ?? []).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      invoice_count: customer.invoice_count ?? 0,
      total_amount: customer.total_amount ?? 0,
      net_amount: customer.net_amount ?? 0,
      latest_invoice_date: customer.latest_invoice_date ?? '',
    }));

    const byMonth = (responseData?.by_month ?? []).map((m: any) => ({
      month: m.month ?? '',
      invoice_count: m.invoice_count ?? 0,
      total_amount: m.total_amount ?? 0,
    }));

    console.log(`[AllInvoiceHistory] Parsed ${byCustomer.length} customers, total invoices: ${summary.total_invoices}`);

    return {
      success: true,
      data: { summary, by_customer: byCustomer, by_month: byMonth },
      message: 'All-customers invoice history retrieved successfully',
    };
  } catch (error) {
    console.error('[AllInvoiceHistory] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: 'Failed to fetch all-customers invoice history',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
