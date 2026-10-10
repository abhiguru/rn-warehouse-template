import { getSupabaseClient, getAuthenticatedClient } from '@/config/supabaseConfig';
import { createErrorResponse, executeRPC } from '@/utils/serviceErrorHandler';
import { PAGINATION } from '@/config/cacheConfig';
import { toLocalISODate } from '@/utils/formatters';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';

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
  console.log('[InvoiceService] getInvoicesList called with params:', params);
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

    console.log('[InvoiceService] Getting authenticated client...');
    const authenticatedClient = await getAuthenticatedClient();
    console.log('[InvoiceService] Calling RPC get_invoices_list...');

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
    console.log('[InvoiceService] RPC completed in', duration, 'ms', {
      hasData: !!data,
      hasError: !!error,
      dataSuccess: data?.success,
      invoiceCount: data?.data?.length || 0,
      errorMsg: error?.message
    });

    if (error) {
      console.error('[InvoiceService] Failed to fetch invoice list:', error.message);
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
        invoices: data.data || [],
        pagination: data.pagination || { total_count: 0, limit: p_limit, offset: p_offset, has_more: false }
      }
    };

  } catch (error) {
    console.error('[InvoiceService] Exception:', error);
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

/** The summary RPC defaults to the last 30 days, so the list always sends a range. */
const CUSTOMER_INVOICE_EARLIEST = '2000-01-01';

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

    const results = await Promise.all(
      targetIds.map(async (customerId): Promise<{ success: boolean; message?: string; invoices: Invoice[] }> => {
        const { data, error } = await authenticatedClient.rpc('get_customer_invoice_summary', {
          p_customer_uuid: customerId,
          // The whole history; the date filter is applied here, to the moment.
          p_from_date: CUSTOMER_INVOICE_EARLIEST,
          p_to_date: toLocalISODate(new Date()),
        });
        if (error) {
          const failed = createErrorResponse(error, t('errors.invoice.fetchListFailed'), 'InvoiceService.getAssignedCustomerInvoices');
          return { success: false, message: failed.message, invoices: [] };
        }
        if (!data?.success) {
          return { success: false, message: serverText(data?.error || data?.message, t('errors.general.noDataFromServer')), invoices: [] };
        }
        const rows: CustomerInvoiceRow[] = data.data?.invoices || [];
        return { success: true, invoices: rows.map(row => mapCustomerInvoiceRow(row, customerId, names[customerId] || '')) };
      })
    );
    const failed = results.find(result => !result.success);
    if (failed) return failure(serverText(failed.message, t('errors.invoice.fetchListFailed')));

    const matching = selectCustomerInvoices(results.flatMap(result => result.invoices), params);

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
}

export const getInvoiceDetails = async (invoiceId: string): Promise<InvoiceDetailsResponse> => {
  try {
    if (!invoiceId) {
      return {
        success: false,
        message: t('errors.invoice.idRequired'),
        error: t('errors.general.missingParameter')
      };
    }

    console.log('[InvoiceService] Fetching invoice details for ID:', invoiceId);
    const authenticatedClient = await getAuthenticatedClient();
    console.log('[InvoiceService] Got authenticated client, calling get_invoice_data RPC...');

    // Use get_invoice_data RPC which includes nested structure with dispatch details (disp_no, disp_date)
    const { data, error } = await authenticatedClient.rpc('get_invoice_data', {
      p_invoice_id: invoiceId
    });

    console.log('[InvoiceService] RPC response:', {
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
      console.error('[InvoiceService] Failed to fetch invoice details:', error.message, error);
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
        error: serverText(data.error, t('errors.invoice.notFoundOrDenied'))
      };
    }

    return {
      success: true,
      data: data.data,
      message: t('errors.invoice.detailsFetched')
    };
  } catch (error) {
    console.error('[InvoiceService] Exception:', error);
    return createErrorResponse(error, t('errors.general.unexpected'), 'InvoiceService.getInvoiceDetails');
  }
};

// Invoice Items Detailed
export interface InvoiceItemDetailed {
  id: string;
  duration: string;
  noOfDays: number;
  charge: number;
  tax: number;
  dispatchQty: number;
  grnQuantity: number;
  itemName: string;
  grNo: string;
  // Dispatch details
  dispatchId: string;
  dispatchNo?: number;
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

export const getInvoiceItemsDetailed = async (invoiceId: string): Promise<InvoiceItemsDetailedResponse> => {
  try {
    if (!invoiceId) {
      return {
        success: false,
        message: t('errors.invoice.idRequired'),
        error: t('errors.general.missingParameter')
      };
    }

    console.log('[InvoiceService] Fetching invoice items for ID:', invoiceId);
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_invoice_items_detailed', {
      p_invoice_id: invoiceId
    });

    console.log('[InvoiceService] Invoice items RPC response:', {
      hasData: !!data,
      hasError: !!error,
      isArray: Array.isArray(data),
      dataSuccess: data?.success,
      dataError: data?.error,
      itemCount: Array.isArray(data) ? data.length : data?.data?.items?.length,
      fullData: JSON.stringify(data).substring(0, 500)
    });

    if (error) {
      console.error('[InvoiceService] Failed to fetch invoice items:', error.message);
      return createErrorResponse(error, t('errors.invoice.fetchItemsFailed'), 'InvoiceService.getInvoiceItemsDetailed');
    }

    // Handle array response format (RPC returns items directly as array)
    if (Array.isArray(data)) {
      console.log('[InvoiceService] Invoice items fetched successfully (array format):', {
        itemCount: data.length,
        firstItemKeys: data.length > 0 ? Object.keys(data[0]) : [],
        firstItem: data.length > 0 ? JSON.stringify(data[0]).substring(0, 1000) : 'empty'
      });

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
      }

      // Map fields from RPC to camelCase fields expected by frontend
      // RPC may return nested objects (catalog, grn_item, dispatch) or flat structure
      const mappedItems: InvoiceItemDetailed[] = data.map((item: RpcInvoiceItemRaw) => {
        // Extract from nested objects if present
        const catalog = item.catalog || {};
        const grnItem = item.grn_item || {};
        const dispatch = item.dispatch || {};

        // Debug: log raw duration value from API
        console.log('[InvoiceService] Raw duration from API:', item.duration, 'type:', typeof item.duration);

        return {
          id: item.id || item.item_id || '',
          // Duration - could be string or number
          duration: item.duration?.toString() || '',
          noOfDays: item.no_of_days || item.noOfDays || 0,
          // Charges
          charge: item.charge || item.total_charge || 0,
          tax: item.tax || item.tax_amount || 0,
          // Quantities - check dispatch object first, then flat fields
          dispatchQty: dispatch.quantity || item.dispatch_qty || item.dispatchQty || item.quantity || 0,
          grnQuantity: grnItem.original_quantity || item.grn_quantity || item.grnQuantity || item.original_quantity || 0,
          // Item name - check catalog first, then grn_item, then flat fields
          itemName: catalog.name || grnItem.name || item.item_name || item.itemName || item.name || item.catalog_name || t('errors.general.unknownItem'),
          // GRN number - check flat fields
          grNo: item.gr_no || item.grNo || '',
          // Dispatch details
          dispatchId: dispatch.disp_id || item.disp_id || item.dispatch_id || '',
          dispatchNo: parseInt(dispatch.dispatch_no || item.dispatch_no || item.dispatchNo || '0', 10) || undefined,
          dispatchDate: dispatch.dispatch_date || item.dispatch_date || item.dispatchDate || undefined,
          // Package details from grn_item
          packageMark: grnItem.package_mark || item.package_mark || item.packageMark || '',
          rack: grnItem.rack || item.rack || '',
          // Additional fields that might be useful
          weight: grnItem.weight || item.weight || 0,
          packaging: catalog.packaging || grnItem.packaging || item.packaging || '',
          labourRate: item.labour_rate || item.labourRate || 0,
        };
      });

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
      console.warn('[InvoiceService] Invoice items not successful:', data?.error || data?.message);
      return {
        success: false,
        message: serverText(data?.message, t('errors.invoice.noItemsFound')),
        error: serverText(data?.error, t('errors.invoice.itemsNotFoundOrDenied'))
      };
    }

    console.log('[InvoiceService] Invoice items fetched successfully:', {
      itemCount: data.data?.items?.length,
      summary: data.data?.summary
    });

    return {
      success: true,
      data: data.data,
      message: t('errors.invoice.itemsFetched')
    };
  } catch (error) {
    console.error('[InvoiceService] Invoice Items Exception:', error);
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
}

// M3 Fix: Using executeRPC wrapper
export const deleteInvoice = async (invoiceId: string): Promise<DeleteInvoiceResponse> => {
  const result = await executeRPC<{
    message: string;
    invoice_info: DeleteInvoiceResponse['invoice_info'];
    deleted_counts: DeleteInvoiceResponse['deleted_counts'];
    gr_id: string;
  }>(
    getAuthenticatedClient,
    'delete_invoice',
    { p_invoice_id: invoiceId },
    { context: 'InvoiceService.deleteInvoice', errorMessage: t('errors.invoice.deleteFailed'), unwrapNested: false, validateSuccess: true }
  );

  if (!result.success) {
    return { success: false, message: result.message, error: result.error };
  }

  return {
    success: true,
    message: result.data?.message,
    invoice_info: result.data?.invoice_info,
    deleted_counts: result.data?.deleted_counts,
    gr_id: result.data?.gr_id,
  };
};
