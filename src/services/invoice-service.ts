import { getSupabaseClient, getAuthenticatedClient } from '@/config/supabaseConfig';
import { invalidateReportQueries } from '@/lib/queryClient';
import { createErrorResponse, executeRPC } from '@/utils/serviceErrorHandler';
import { PAGINATION } from '@/config/cacheConfig';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
import { t } from '@/i18n';
import { customerHistory } from './customerHistoryCache';
import { isNetworkError, isStatementTimeout, isTimeoutError, isUnsettledFailure, serverReason, serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';

const invoiceServiceLogger = createLogger('InvoiceService');

// M1 Fix: DRY empty pagination response
const EMPTY_INVOICE_PAGINATION = { total_count: 0, limit: PAGINATION.DEFAULT_LIMIT, offset: 0, has_more: false };

export interface InvoiceFilters {
  customerName?: string;
  invoiceNo?: string;
  grnNo?: string;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: number;
  invoice_date: string;
  financial_year: string;
  inv_fin_year: number;
  total: number;
  labour: number;
  discount: number;
  tax_amount: number;
  notes: string | null;
  inv_name: string | null;
  created_by: string;
  one_time_charge: boolean;
  is_auto_generated: boolean;
  invoice_pricing_mode: string | null;
  customer: {
    id: string;
    name: string;
    city: string;
    phone: string;
    address: string;
    gst: string;
    email: string;
    active: boolean;
  };
  grn: {
    id: string;
    gr_no: string;
    date: string;
    sender_id: string;
    sender_name: string;
    customer_id: string;
    customer_name: string;
    supervisor_id: string | null;
    supervisor_name: string;
    registration: string;
  };
}

export interface InvoiceListResponse {
  success: boolean;
  message: string;
  data: {
    invoices: Invoice[];
    pagination: {
      total_count: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
  };
}

export interface GetInvoicesListParams {
  p_limit?: number;
  p_offset?: number;
  p_customer_id?: string;
  p_financial_year?: number;
  p_search_invoice_no?: string;
  p_search_grn_no?: string;
  p_inv_no_from?: number;  // Invoice number range start
  p_inv_no_to?: number;    // Invoice number range end
  p_sort_field?: string;   // Sort field (default: 'created_at')
  p_sort_direction?: 'asc' | 'desc';  // Sort direction (default: 'desc')
  /** Quick search: every word must match the invoice number, customer or GRN number. */
  p_search?: string;
  /** Invoice date range, as moments in time. */
  p_date_from?: string;
  p_date_to?: string;
  /** Several customers; an empty list is no filter. */
  p_customer_ids?: string[];
}

export const getInvoicesList = async (
  params: GetInvoicesListParams = {}
): Promise<InvoiceListResponse> => {
  invoiceServiceLogger.debug('getInvoicesList called');
  const startTime = Date.now();

  try {
    const {
      p_limit = 20,
      p_offset = 0,
      p_customer_id,
      p_financial_year,
      p_search_invoice_no,
      p_search_grn_no,
      p_inv_no_from,
      p_inv_no_to,
      p_sort_field = 'created_at',
      p_sort_direction = 'desc',
      p_search,
      p_date_from,
      p_date_to,
      p_customer_ids,
    } = params;

    invoiceServiceLogger.debug('Getting authenticated client...');
    const authenticatedClient = await getAuthenticatedClient();
    invoiceServiceLogger.debug('Calling RPC get_invoices_list...');

    const { data, error } = await authenticatedClient.rpc('get_invoices_list', {
      p_limit,
      p_offset,
      p_customer_id: p_customer_id || null,
      p_financial_year: p_financial_year || null,
      p_search_invoice_no: p_search_invoice_no || null,
      p_search_grn_no: p_search_grn_no || null,
      p_inv_no_from: p_inv_no_from || null,
      p_inv_no_to: p_inv_no_to || null,
      p_sort_field,
      p_sort_direction,
      p_search: p_search?.trim() || null,
      p_date_from: p_date_from || null,
      p_date_to: p_date_to || null,
      p_customer_ids: p_customer_ids && p_customer_ids.length > 0 ? p_customer_ids : null,
    });

    const duration = Date.now() - startTime;
    invoiceServiceLogger.debug('RPC completed in', duration, 'ms', {
      hasData: !!data,
      hasError: !!error,
      dataSuccess: data?.success,
      invoiceCount: data?.data?.length || 0,
      errorMsg: error?.message
    });

    if (error) {
      invoiceServiceLogger.error('Failed to fetch invoice list:', error.message);
      return {
        ...createErrorResponse(error, t('errors.invoice.fetchListFailed'), 'InvoiceService.getInvoicesList'),
        data: { invoices: [], pagination: { ...EMPTY_INVOICE_PAGINATION, limit: p_limit, offset: p_offset } }
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        message: serverText(data?.message, t('errors.general.noDataFromServer')),
        data: {
          invoices: [],
          pagination: { total_count: 0, limit: p_limit, offset: p_offset, has_more: false }
        }
      };
    }

    return {
      success: true,
      message: serverText(data.message, t('errors.invoice.listRetrieved')),
      data: {
        invoices: ((data.data || []) as Invoice[]).map(withNumericAmounts),
        pagination: data.pagination || { total_count: 0, limit: p_limit, offset: p_offset, has_more: false }
      }
    };

  } catch (error) {
    invoiceServiceLogger.error('Exception:', error);
    return {
      ...createErrorResponse(error, t('errors.general.unexpected'), 'InvoiceService.getInvoicesList'),
      data: { invoices: [], pagination: { ...EMPTY_INVOICE_PAGINATION, limit: params.p_limit || PAGINATION.DEFAULT_LIMIT, offset: params.p_offset || 0 } }
    };
  }
};

export interface AssignedCustomerInvoiceParams {
  p_limit?: number;
  p_offset?: number;
  /** Limit to one of the account's customers. */
  p_customer_id?: string;
  p_inv_no_from?: number;
  p_inv_no_to?: number;
  /** Invoice date range, as moments in time. */
  p_date_from?: string;
  p_date_to?: string;
  p_search_grn_no?: string;
  p_search?: string;
  p_financial_year?: number;
  /** Limit to several of the account's customers; an empty list is no filter. */
  p_customer_ids?: string[];
  p_sort_field?: string;
  p_sort_direction?: 'asc' | 'desc';
  /** Read the server again instead of the history kept for paging (pull to refresh). */
  p_fresh?: boolean;
  /** Names for the list rows, keyed by customer id (the RPC rows carry no customer name). */
  customerNames?: Record<string, string>;
}

interface CustomerInvoiceRow {
  invoice_id: string;
  /** "<financial year start>-<zero-padded number>", for example "2026-0014". */
  invoice_number: string;
  invoice_date: string;
  /** For example "2026-2027". */
  financial_year: string;
  grn_ref: string | null;
  grn_id: string | null;
  total: number | null;
  labour: number | null;
  discount: number | null;
  tax_amount: number | null;
  notes: string | null;
}

/** The list RPC returns NULL for an amount an invoice never had (every auto-generated invoice has no discount): 0, as on the details screen. */
const withNumericAmounts = (invoice: Invoice): Invoice => ({
  ...invoice,
  total: Number(invoice.total) || 0,
  tax_amount: Number(invoice.tax_amount) || 0,
  labour: Number(invoice.labour) || 0,
  discount: Number(invoice.discount) || 0,
});

/** get_customer_invoice_summary returns a shorter row than the staff list; fill the list shape from it. */
const mapCustomerInvoiceRow = (row: CustomerInvoiceRow, customerId: string, customerName: string): Invoice => {
  const [yearPart, numberPart] = String(row.invoice_number || '').split('-');
  return {
    invoice_id: row.invoice_id,
    invoice_number: Number(numberPart) || 0,
    invoice_date: row.invoice_date,
    financial_year: row.financial_year || '',
    inv_fin_year: Number(yearPart) || 0,
    total: Number(row.total) || 0,
    labour: Number(row.labour) || 0,
    discount: Number(row.discount) || 0,
    tax_amount: Number(row.tax_amount) || 0,
    notes: row.notes ?? null,
    inv_name: null,
    created_by: '',
    one_time_charge: false,
    is_auto_generated: false,
    invoice_pricing_mode: null,
    customer: { id: customerId, name: customerName, city: '', phone: '', address: '', gst: '', email: '', active: true },
    grn: {
      id: row.grn_id || '',
      gr_no: row.grn_ref || '',
      date: '',
      sender_id: '',
      sender_name: '',
      customer_id: customerId,
      customer_name: customerName,
      supervisor_id: null,
      supervisor_name: '',
      registration: '',
    },
  };
};

/**
 * The filters, search and order of the staff invoice list (get_invoices_list),
 * applied to invoices already collected for a customer account. Same parameter
 * names, same meaning.
 */
export function selectCustomerInvoices(all: Invoice[], params: AssignedCustomerInvoiceParams): Invoice[] {
  const moment = (value?: string) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isNaN(time) ? null : time;
  };
  const dateFrom = moment(params.p_date_from);
  const dateTo = moment(params.p_date_to);
  const grnQuery = (params.p_search_grn_no || '').trim().toLowerCase();
  const terms = searchTerms(params.p_search);
  const customerIds = params.p_customer_ids ?? [];

  const matching = all.filter(invoice => {
    if (customerIds.length > 0 && !customerIds.includes(invoice.customer.id)) return false;
    if (params.p_financial_year && invoice.inv_fin_year !== params.p_financial_year) return false;
    if (params.p_inv_no_from && invoice.invoice_number < params.p_inv_no_from) return false;
    if (params.p_inv_no_to && invoice.invoice_number > params.p_inv_no_to) return false;
    if (grnQuery && !invoice.grn.gr_no.toLowerCase().includes(grnQuery)) return false;
    if (dateFrom !== null || dateTo !== null) {
      const time = Date.parse(String(invoice.invoice_date));
      if (Number.isNaN(time)) return false;
      if (dateFrom !== null && time < dateFrom) return false;
      if (dateTo !== null && time > dateTo) return false;
    }
    return matchesSearch(terms, [
      invoice.invoice_number,
      invoice.customer.name,
      invoice.grn.gr_no,
      `${invoice.inv_fin_year}-${invoice.invoice_number}`,
      `${invoice.inv_fin_year}-${String(invoice.invoice_number).padStart(4, '0')}`,
    ]);
  });

  const direction = params.p_sort_direction === 'asc' ? 1 : -1;
  const byDate = (a: Invoice, b: Invoice) => String(a.invoice_date).localeCompare(String(b.invoice_date));
  const newestFirst = (a: Invoice, b: Invoice) => byDate(b, a) || b.invoice_number - a.invoice_number;
  return matching.sort((a, b) => {
    switch (params.p_sort_field) {
      case 'inv_no':
        return (a.invoice_number - b.invoice_number) * direction || newestFirst(a, b);
      case 'customer_name':
        return a.customer.name.localeCompare(b.customer.name) * direction || newestFirst(a, b);
      case 'total':
        return (a.total - b.total) * direction || newestFirst(a, b);
      default:
        return byDate(a, b) * direction || b.invoice_number - a.invoice_number;
    }
  });
}

/**
 * The summary RPC defaults to the last 30 days, so the list always sends a
 * range. The upper bound is not the device's date: a device whose clock or
 * zone is behind the facility's day would hide today's invoices.
 */
const CUSTOMER_INVOICE_EARLIEST = '2000-01-01';
const CUSTOMER_INVOICE_LATEST = '2999-12-31';

type CustomerInvoiceHistory = { success: boolean; message?: string; rows: CustomerInvoiceRow[] };

/**
 * Invoice list for a customer account. The all-customers list RPC is for
 * warehouse roles only, so this reads get_customer_invoice_summary for each
 * assigned customer, newest first, and pages the result here.
 */
export const getAssignedCustomerInvoices = async (
  assignedCustomerIds: string[],
  params: AssignedCustomerInvoiceParams = {}
): Promise<InvoiceListResponse> => {
  const limit = params.p_limit || PAGINATION.DEFAULT_LIMIT;
  const offset = params.p_offset || 0;
  const failure = (message: string): InvoiceListResponse => ({
    success: false,
    message,
    data: { invoices: [], pagination: { total_count: 0, limit, offset, has_more: false } },
  });

  const assigned = [...new Set(assignedCustomerIds.filter(Boolean))];
  const requested = [...(params.p_customer_ids ?? []), ...(params.p_customer_id ? [params.p_customer_id] : [])];
  if (requested.some(id => !assigned.includes(id))) return failure(t('errors.customer.accessDenied'));
  const targetIds = requested.length > 0 ? [...new Set(requested)] : assigned;
  if (targetIds.length === 0) return failure(t('errors.customer.noAssignment'));

  try {
    const authenticatedClient = await getAuthenticatedClient();
    // The summary rows carry no customer name. Use the caller's names, else read
    // them; a failed name lookup only leaves the row's name line empty.
    const names: Record<string, string> = { ...(params.customerNames || {}) };
    if (targetIds.some(id => !names[id])) {
      const { data: customers } = await authenticatedClient.from('customers').select('id, name').in('id', targetIds);
      for (const customer of customers || []) names[customer.id] = customer.name;
    }

    // The summary RPC has no search, sort or paging, so a customer's history is
    // read once and kept for a short time (customerHistoryCache): the next
    // page, a sort, a search and the count do not download it again.
    const results = await Promise.all(
      targetIds.map(customerId =>
        customerHistory<CustomerInvoiceHistory>(
          `invoices:${customerId}`,
          async () => {
            const { data, error } = await authenticatedClient.rpc('get_customer_invoice_summary', {
              p_customer_uuid: customerId,
              // The whole history; the date filter is applied here, to the moment.
              p_from_date: CUSTOMER_INVOICE_EARLIEST,
              p_to_date: CUSTOMER_INVOICE_LATEST,
            });
            if (error) {
              const failed = createErrorResponse(error, t('errors.invoice.fetchListFailed'), 'InvoiceService.getAssignedCustomerInvoices');
              return { success: false, message: failed.message, rows: [] };
            }
            if (!data?.success) {
              return { success: false, message: serverText(data?.error || data?.message, t('errors.general.noDataFromServer')), rows: [] };
            }
            return { success: true, rows: data.data?.invoices || [] };
          },
          { fresh: params.p_fresh, keep: result => result.success }
        )
      )
    );
    const failed = results.find(result => !result.success);
    if (failed) return failure(serverText(failed.message, t('errors.invoice.fetchListFailed')));

    const matching = selectCustomerInvoices(
      results.flatMap((result, index) =>
        result.rows.map(row => mapCustomerInvoiceRow(row, targetIds[index], names[targetIds[index]] || ''))
      ),
      params
    );

    const invoices = matching.slice(offset, offset + limit);
    return {
      success: true,
      message: t('errors.invoice.listRetrieved'),
      data: {
        invoices,
        pagination: {
          total_count: matching.length,
          limit,
          offset,
          has_more: offset + invoices.length < matching.length,
        },
      },
    };
  } catch (error) {
    return {
      ...createErrorResponse(error, t('errors.general.unexpected'), 'InvoiceService.getAssignedCustomerInvoices'),
      data: { invoices: [], pagination: { ...EMPTY_INVOICE_PAGINATION, limit, offset } },
    };
  }
};

/** How many invoices of one GRN are read for its Invoices tab; more than any GRN has. */
const GRN_INVOICE_LIMIT = 200;

export interface GrnInvoiceRowsRequest {
  grnId: string;
  grnNo: string;
  /** The GRN's customer: narrows the list, and a customer account must be assigned to it. */
  customerId?: string | null;
  /** admin, supervisor or staff read the staff list; a customer account its own invoices. */
  warehouseRole: boolean;
  assignedCustomerIds?: string[];
}

/**
 * The invoices of one GRN, for its Invoices tab, from the invoice list the account may read:
 * get_invoices_list for warehouse roles, get_customer_invoice_summary for a customer account
 * (getAssignedCustomerInvoices). Both search by GRN number, which also matches longer numbers,
 * so the rows are kept only when their GRN id is this GRN's. The server decides who sees what.
 */
export const getGrnInvoiceRows = async (request: GrnInvoiceRowsRequest): Promise<{ success: boolean; invoices: Invoice[] }> => {
  const params = {
    p_limit: GRN_INVOICE_LIMIT,
    p_offset: 0,
    p_customer_id: request.customerId || undefined,
    p_search_grn_no: request.grnNo,
    p_sort_field: 'inv_date',
    p_sort_direction: 'asc' as const,
  };
  try {
    const result = request.warehouseRole
      ? await getInvoicesList(params)
      : await getAssignedCustomerInvoices(request.assignedCustomerIds ?? [], params);
    if (!result.success || !result.data) return { success: false, invoices: [] };
    return { success: true, invoices: result.data.invoices.filter(invoice => invoice.grn?.id === request.grnId) };
  } catch {
    return { success: false, invoices: [] };
  }
};

// Invoice Details - Updated to match actual backend response
export interface InvoiceDetail {
  invoice_id: string;
  invoice_number: number;
  invoice_date: string;
  financial_year: string;
  total: number;
  discount: number;
  labour: number;
  tax_amount: number;
  customer: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gst: string;
    pan: string;
    email: string;
    mobile: string;
    contact: string;
    firstName: string;
    lastName: string;
    active: boolean;
  };
  grn: {
    id: string;
    number: string;
    date: string;
    customer_name: string;
    sender_name: string;
    supervisor_name: string;
    registration: string;
    pricing_mode: string;
    invoiced: boolean;
  };
  summary: {
    total_items: number;
    total_quantity: number;
  };
  gr_no: string;
  notes: string | null;
  invoice_customer_name: string;
}

export interface InvoiceItem {
  item_id: string;
  charge: number;
  tax: number;
  duration: number;
  no_of_days: number;
  labour_rate: number;
  catalog: {
    id: string;
    name: string;
    packaging: string;
    description: string;
    active: boolean;
  };
  grn_item: {
    id: string;
    gr_id?: string;
    name: string;
    rack: string;
    weight: number;
    packaging: string;
    package_mark: string;
    pricing_mode: string;
    current_stock: number;
    original_quantity: number;
  };
  dispatch: {
    id: string;
    quantity: number;
    gr_id: string;
    disp_id: string;
    gr_trl_id: string;
    // Dispatch header details (from get_invoice_data RPC)
    disp_no?: string;
    disp_date?: string;
  };
}

export interface InvoiceDetailsResponse {
  success: boolean;
  message: string;
  data?: {
    header: InvoiceDetail;
    items: InvoiceItem[];
  };
  error?: string;
  /** The server answered "Invoice not found": the invoice is gone (deleted), not merely unreadable right now. */
  notFound?: boolean;
  /** The server answered "Access denied to this invoice": a customer whose access to it has ended. */
  accessDenied?: boolean;
}

/** The server's own words for an invoice that is not there (get_invoice_data, whatever the app's language). */
const INVOICE_NOT_FOUND = /invoice not found/i;
/** The server's own words for an invoice the signed-in customer may not read (get_invoice_data). */
const INVOICE_ACCESS_DENIED = /access denied to this invoice/i;

export const getInvoiceDetails = async (invoiceId: string): Promise<InvoiceDetailsResponse> => {
  try {
    if (!invoiceId) {
      return {
        success: false,
        message: t('errors.invoice.idRequired'),
        error: t('errors.general.missingParameter')
      };
    }

    invoiceServiceLogger.debug('Fetching invoice details for ID:', invoiceId);
    const authenticatedClient = await getAuthenticatedClient();
    invoiceServiceLogger.debug('Got authenticated client, calling get_invoice_data RPC...');

    // Use get_invoice_data RPC which includes nested structure with dispatch details (disp_no, disp_date)
    const { data, error } = await authenticatedClient.rpc('get_invoice_data', {
      p_invoice_id: invoiceId
    });

    invoiceServiceLogger.debug('RPC response:', {
      hasData: !!data,
      hasError: !!error,
      errorMsg: error?.message,
      dataSuccess: data?.success,
      dataMessage: data?.message,
      dataError: data?.error,
      hasHeader: !!data?.data?.header,
      itemsCount: data?.data?.items?.length || 0,
      firstItemDispatch: data?.data?.items?.[0]?.dispatch ? JSON.stringify(data.data.items[0].dispatch) : 'no dispatch',
    });

    if (error) {
      invoiceServiceLogger.error('Failed to fetch invoice details:', error.message);
      return createErrorResponse(error, t('errors.invoice.fetchDetailsFailed'), 'InvoiceService.getInvoiceDetails');
    }

    if (!data) {
      return {
        success: false,
        message: t('errors.general.noDataFromServer'),
        error: t('errors.general.emptyResponseFromServer')
      };
    }

    if (!data.success) {
      return {
        success: false,
        message: serverText(data.message, t('errors.invoice.noneFound')),
        error: serverText(data.error, t('errors.invoice.notFoundOrDenied')),
        // From the server's own text: the app's wording of it changes with the language.
        ...(INVOICE_NOT_FOUND.test(String(data.error ?? data.message ?? '')) ? { notFound: true } : {}),
        ...(INVOICE_ACCESS_DENIED.test(String(data.error ?? data.message ?? '')) ? { accessDenied: true } : {}),
      };
    }

    return {
      success: true,
      data: data.data,
      message: t('errors.invoice.detailsFetched')
    };
  } catch (error) {
    invoiceServiceLogger.error('Exception:', error);
    return createErrorResponse(error, t('errors.general.unexpected'), 'InvoiceService.getInvoiceDetails');
  }
};

// Invoice Items Detailed
export interface InvoiceItemDetailed {
  id: string;
  duration: string;
  noOfDays: number;
  charge: number;
  /** Tax RATE in percent (e.g. 5 for 5 %). */
  tax: number;
  /** The line's tax AMOUNT as the server computed it. Absent when the server sent none. */
  taxAmount?: number;
  /** The line's total (base plus tax) as the server computed it. Absent when the server sent none. */
  totalAmount?: number;
  /** goodsreceived_trl id of the line, for grouping. */
  grnItemId?: string;
  dispatchQty: number;
  grnQuantity: number;
  itemName: string;
  grNo: string;
  // Dispatch details
  /** dispatch id (uuid): what the dispatch screen is opened with. */
  dispatchId: string;
  /** Dispatch number as written, e.g. "I2660". */
  dispatchNo?: string;
  dispatchDate?: string;
  // Storage details
  packageMark: string;
  rack: string;
  weight?: number;
  packaging?: string;
  labourRate?: number;
}

export interface InvoiceItemsSummary {
  totalItems: number;
  totalDispatchQty: number;
  totalAmount: number;
  // Alternative snake_case properties from backend
  total_items?: number;
  total_quantity?: number;
  total_amount?: number;
}

export interface InvoiceItemsDetailedResponse {
  success: boolean;
  message: string;
  data?: {
    items: InvoiceItemDetailed[];
    summary: InvoiceItemsSummary;
  };
  error?: string;
}

// Type for raw RPC invoice item response
interface RpcInvoiceItemRaw {
  id?: string;
  item_id?: string;
  duration?: string | number;
  no_of_days?: number;
  noOfDays?: number;
  charge?: number;
  total_charge?: number;
  tax?: number;
  tax_amount?: number;
  total_amount?: number;
  dispatch_qty?: number;
  dispatchQty?: number;
  quantity?: number;
  grn_quantity?: number;
  grnQuantity?: number;
  original_quantity?: number;
  item_name?: string;
  itemName?: string;
  name?: string;
  catalog_name?: string;
  gr_no?: string;
  grNo?: string;
  disp_id?: string;
  dispatch_id?: string;
  dispatch_no?: string;
  dispatchNo?: string;
  dispatch_date?: string;
  dispatchDate?: string;
  package_mark?: string;
  packageMark?: string;
  rack?: string;
  weight?: number;
  packaging?: string;
  labour_rate?: number;
  labourRate?: number;
  catalog?: {
    name?: string;
    packaging?: string;
  };
  grn_item?: {
    id?: string;
    name?: string;
    original_quantity?: number;
    package_mark?: string;
    rack?: string;
    weight?: number;
    packaging?: string;
  };
  dispatch?: {
    quantity?: number;
    disp_id?: string;
    dispatch_no?: string;
    dispatch_date?: string;
  };
  grn_item_id?: string;
}


/** A number the server sent, or undefined when it sent none (0 is a value). */
const sentNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

/**
 * One line of get_invoice_items_detailed in the shape the screens use.
 * The server sends nested objects (catalog, grn_item, dispatch) and flat
 * fields; either is read. `tax` is the rate only: the line's tax amount and
 * total are kept apart as the server computed them.
 */
function mapDetailedInvoiceItem(item: RpcInvoiceItemRaw): InvoiceItemDetailed {
  const catalog = item.catalog || {};
  const grnItem = item.grn_item || {};
  const dispatch = item.dispatch || {};
  const dispatchNo = dispatch.dispatch_no || item.dispatch_no || item.dispatchNo;

  return {
    id: item.id || item.item_id || '',
    // Duration - could be string or number
    duration: item.duration?.toString() || '',
    noOfDays: item.no_of_days || item.noOfDays || 0,
    // Rates
    charge: item.charge || item.total_charge || 0,
    tax: item.tax || 0,
    // The server's amounts for the line
    taxAmount: sentNumber(item.tax_amount),
    totalAmount: sentNumber(item.total_amount),
    // Quantities - check dispatch object first, then flat fields
    dispatchQty: dispatch.quantity || item.dispatch_qty || item.dispatchQty || item.quantity || 0,
    grnQuantity: grnItem.original_quantity || item.grn_quantity || item.grnQuantity || item.original_quantity || 0,
    // Item name - check catalog first, then grn_item, then flat fields
    itemName: catalog.name || grnItem.name || item.item_name || item.itemName || item.name || item.catalog_name || t('errors.general.unknownItem'),
    // GRN number - check flat fields
    grNo: item.gr_no || item.grNo || '',
    grnItemId: grnItem.id || item.grn_item_id || undefined,
    // Dispatch details. The number is kept as written ("I2660"): it is a label, the id opens the dispatch.
    dispatchId: dispatch.disp_id || item.dispatch_id || item.disp_id || '',
    dispatchNo: dispatchNo !== undefined && dispatchNo !== null && String(dispatchNo) !== '' ? String(dispatchNo) : undefined,
    dispatchDate: dispatch.dispatch_date || item.dispatch_date || item.dispatchDate || undefined,
    // Package details from grn_item
    packageMark: grnItem.package_mark || item.package_mark || item.packageMark || '',
    rack: grnItem.rack || item.rack || '',
    // Additional fields that might be useful
    weight: grnItem.weight || item.weight || 0,
    packaging: catalog.packaging || grnItem.packaging || item.packaging || '',
    labourRate: item.labour_rate || item.labourRate || 0,
  };
}

export const getInvoiceItemsDetailed = async (invoiceId: string): Promise<InvoiceItemsDetailedResponse> => {
  try {
    if (!invoiceId) {
      return {
        success: false,
        message: t('errors.invoice.idRequired'),
        error: t('errors.general.missingParameter')
      };
    }

    invoiceServiceLogger.debug('Fetching invoice items for ID:', invoiceId);
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_invoice_items_detailed', {
      p_invoice_id: invoiceId
    });

    invoiceServiceLogger.debug('Invoice items RPC response:', {
      hasData: !!data,
      hasError: !!error,
      isArray: Array.isArray(data),
      dataSuccess: data?.success,
      dataError: data?.error,
      itemCount: Array.isArray(data) ? data.length : data?.data?.items?.length,
    });

    if (error) {
      invoiceServiceLogger.error('Failed to fetch invoice items:', error.message);
      return createErrorResponse(error, t('errors.invoice.fetchItemsFailed'), 'InvoiceService.getInvoiceItemsDetailed');
    }

    // Handle array response format (RPC returns items directly as array)
    if (Array.isArray(data)) {
      invoiceServiceLogger.debug('Invoice items fetched successfully (array format):', {
        itemCount: data.length,
      });

      const mappedItems: InvoiceItemDetailed[] = data.map(mapDetailedInvoiceItem);

      return {
        success: true,
        data: {
          items: mappedItems,
          summary: {
            totalItems: data.length,
            totalAmount: data.reduce((sum: number, item: RpcInvoiceItemRaw) => sum + (item.total_amount || item.charge || 0), 0),
            totalDispatchQty: data.reduce((sum: number, item: RpcInvoiceItemRaw) => {
              const dispatch = item.dispatch || {};
              return sum + (dispatch.quantity || item.dispatch_qty || item.quantity || 0);
            }, 0)
          }
        },
        message: t('errors.invoice.itemsFetched')
      };
    }

    // Handle object response format { success: true, data: { items: [...] } }
    if (!data || !data.success) {
      invoiceServiceLogger.warn('Invoice items not successful:', data?.error || data?.message);
      return {
        success: false,
        message: serverText(data?.message, t('errors.invoice.noItemsFound')),
        error: serverText(data?.error, t('errors.invoice.itemsNotFoundOrDenied'))
      };
    }

    invoiceServiceLogger.debug('Invoice items fetched successfully:', {
      itemCount: data.data?.items?.length,
      summary: data.data?.summary
    });

    // The lines arrive in the server's own field names; the screens read the
    // mapped shape (dispatch id and number, the server's line amounts).
    return {
      success: true,
      data: {
        ...data.data,
        items: Array.isArray(data.data?.items) ? data.data.items.map(mapDetailedInvoiceItem) : [],
      },
      message: t('errors.invoice.itemsFetched')
    };
  } catch (error) {
    invoiceServiceLogger.error('Invoice Items Exception:', error);
    return createErrorResponse(error, t('errors.general.unexpected'), 'InvoiceService.getInvoiceItemsDetailed');
  }
};

/**
 * Delete an invoice
 * Calls delete_invoice RPC which handles:
 * - Authorization (Admin or Supervisor only)
 * - Atomic deletion of invoice and line items
 * - Automatic GRN flag reset (invoiced = false)
 * - Returns detailed deletion info
 */
export interface DeleteInvoiceResponse {
  success: boolean;
  message?: string;
  invoice_info?: {
    inv_fin_year: number;
    inv_no: number;
    gr_no: string;
    customer_name: string;
    inv_date: string;
    total: number;
  };
  deleted_counts?: {
    invoice_trl_items: number;
    orphaned_auto_errors: number;
  };
  gr_id?: string;
  error?: string;
  /**
   * The request may have reached the server, but no answer came back (owner rule D22): the invoice may be deleted
   * already. `sentAt` is when it was sent (ms since 1970). No worded message goes with it: the caller waits for the
   * connection, reads the invoice, and sends the delete again only if the invoice is still there.
   */
  lostAnswer?: boolean;
  sentAt?: number;
  /** The server answered "Invoice not found": someone else deleted it, so it is gone, as the person wanted. */
  notFound?: boolean;
}

/**
 * Asks the server whether an invoice is still there (a lost delete, owner rule D22). `gone`: the server says "Invoice
 * not found", so the delete went through, and an open report is told as after any delete (I6). `there`: the invoice
 * was read. `unknown`: the question itself got no usable answer (no connection, an error): ask again later.
 */
export const invoiceDeleteState = async (invoiceId: string): Promise<'gone' | 'there' | 'unknown'> => {
  const check = await getInvoiceDetails(invoiceId).catch(() => null);
  if (check?.success && check.data) return 'there';
  if (!check?.notFound) return 'unknown';
  void invalidateReportQueries();
  return 'gone';
};

// M3 Fix: Using executeRPC wrapper
/**
 * `options.resend`: this is the delete sent again after one whose answer was lost (owner rule D22). Any failure of it
 * that is not the server's answer (a statement timeout while it waits behind the first delete, a failure before
 * sending, a changed session) leaves the attempt unsettled, so the result says `lostAnswer` and the caller goes back to
 * the check instead of unlocking the page. "Invoice not found" is `notFound`: deleted, as asked.
 */
export const deleteInvoice = async (invoiceId: string, options: { resend?: boolean } = {}): Promise<DeleteInvoiceResponse> => {
  const sentAt = Date.now();
  const result = await executeRPC<{
    message: string;
    invoice_info: DeleteInvoiceResponse['invoice_info'];
    deleted_counts: DeleteInvoiceResponse['deleted_counts'];
    gr_id: string;
  }>(
    getAuthenticatedClient,
    'delete_invoice',
    { p_invoice_id: invoiceId },
    // `delete`: a timeout or a dropped connection says the invoice may have been deleted (not saved).
    { context: 'InvoiceService.deleteInvoice', write: true, delete: true, errorMessage: t('errors.invoice.deleteFailed'), unwrapNested: false, validateSuccess: true }
  );

  if (!result.success) {
    // "Invoice not found" is the server's own raw text: the invoice is gone (deleted on another phone). The caller
    // tells the person it is deleted, and an open report must stop listing it as after any delete (I6).
    if (INVOICE_NOT_FOUND.test(result.error ?? '')) {
      void invalidateReportQueries();
      return { success: false, message: result.message, error: result.error, notFound: true };
    }
    // The request may have reached the server and no answer came: the invoice may be gone already. Nothing is worded
    // for the person; the caller waits, reads the invoice, and sends the delete again only if it is still there (D22).
    // (Not the server's own statement timeout, 57014: it rolled back, so nothing was deleted.)
    if (result.lostAnswer || (options.resend && isUnsettledFailure(result, result.errorCode))) {
      return { success: false, error: result.error, lostAnswer: true, sentAt };
    }
    // A refusal by the server (it has payments, staff may not delete) is worded by the app, in English and in
    // Gujarati. A failure of the connection keeps executeRPC's words: a server sentence would hide it.
    const transportFailure = !isStatementTimeout(result) && (isTimeoutError(result) || isNetworkError(result));
    const refusal = transportFailure ? undefined : serverReason(result.error ?? '');
    // Any other failure says "Couldn't delete the invoice. Try again.": a server sentence the app has no wording for stays hidden.
    return { success: false, message: refusal ?? (transportFailure ? result.message : t('errors.invoice.deleteFailed')), error: result.error };
  }

  // A report left open under the invoice must not keep listing it (SR-10, as for every other write).
  void invalidateReportQueries();

  return {
    success: true,
    message: result.data?.message,
    invoice_info: result.data?.invoice_info,
    deleted_counts: result.data?.deleted_counts,
    gr_id: result.data?.gr_id,
  };
};
