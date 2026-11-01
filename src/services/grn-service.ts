import { getAuthenticatedClient } from '../config/supabaseConfig';
import { compareDocumentNumbers } from '@/utils/documentNumber';
import { unwrapArrayResponse } from '@/utils/responseUtils';
import { createErrorResponse, isJWTSignatureError, isSessionInvalidationError } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';
import type { RpcGrnItemRow, RpcPagination } from '@/types/rpc-canonical.types';
import { hasMoreItems } from '@/utils/paginationUtils';
import { PAGINATION } from '@/config/cacheConfig';
import { t } from '@/i18n';
import { closeDateRange } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { noteGrnPagingUnit } from '@/config/facilityGrnPaging';
import { grnLineKey } from '@/features/grn/utils/grnLineKey';

/**
 * GRN Item type - uses snake_case matching backend RPC response
 * This is the item-level data returned by get_all_grn_items RPC
 */
export type GRNItem = RpcGrnItemRow;

// M1 Fix: DRY empty response data structure used in error responses
const EMPTY_GRN_RESPONSE_DATA = {
  items: [] as GRNItem[],
  pagination: { total_count: 0, limit: PAGINATION.DEFAULT_LIMIT, offset: 0, has_more: false } as RpcPagination,
  aggregations: { total_qty: 0, total_stock: 0 },
  filters: { date_from: null, date_to: null, applied_filters: {}, sort_by: 'date', sort_order: 'desc' },
  user_access: { role: '', is_admin: false, is_supervisor: false, accessible_customers: 0 }
} as const;

/**
 * GRN Filters - uses snake_case matching backend RPC parameters
 */
export interface GRNFilters {
  // Text search filter. (The staff function ignores item_name, customer_name, gr_no and rack: search by
  // number, customer, item or rack goes through `search`, so those keys are gone.)
  package_mark?: string;

  // Enhanced filters from UI
  item_ids?: string[];
  customer_ids?: string[];
  grn_ids?: string[];
  gr_no_from?: string;
  gr_no_to?: string;
  /** Per line: in stock, under 20% of the bags received left (backend migration 98), none left. */
  stock_status?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  weight_min?: number;
  weight_max?: number;
  /** Quick search: every word must match the number, customer, item, package, rack or vehicle. */
  search?: string;
  /**
   * Page by receipt (backend migration 98): `p_limit`, `p_offset` and the total count receipts, and a page
   * holds every matching line of its receipts. A facility without 98 ignores it and pages lines; the
   * response's `pagination.unit` says which it did.
   */
  page_by?: 'receipt';
}

/** The filters of a GRN list request, asking for receipt pages. */
export const withReceiptPages = <T extends { p_filters?: GRNFilters }>(request: T): T => ({
  ...request,
  p_filters: { ...request.p_filters, page_by: 'receipt' },
});

/** Distinct receipts among a page's lines, for the next offset of a receipt-paged list. */
export const countReceipts = (items: readonly GRNItem[]): number =>
  new Set(items.map(item => item.grn_id || item.id)).size;

/**
 * GRN List Request Parameters - uses snake_case matching backend RPC
 */
export interface GRNListParams {
  p_date_from?: string;
  p_date_to?: string;
  p_filters?: GRNFilters;
  p_sort_by?: 'date' | 'gr_no' | 'customer_name' | 'item_name' | 'qty' | 'stock';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

/** Internal RPC params type for get_all_grn_items (V2 signature) */
interface GRNRpcParams {
  p_limit: number;
  p_date_from?: string;
  p_date_to?: string;
  p_filters?: GRNFilters;
  p_sort_by?: string;
  p_sort_order?: string;
  p_offset?: number;
  // Note: p_in_stock_only is NOT part of V2 - use p_filters.stock_status instead
}

interface CustomerGRNRpcResponse {
  success?: boolean;
  message?: string;
  data?: {
    items?: Array<Record<string, unknown>>;
    pagination?: {
      total?: number;
      total_count?: number;
      has_more?: boolean;
      unit?: string;
    };
    aggregations?: Partial<GRNAggregations> & { total_count?: number };
  };
}

const CUSTOMER_GRN_RPC_MAX_LIMIT = 100;

/**
 * GRN Aggregations - uses snake_case
 */
export interface GRNAggregations {
  total_qty: number;
  total_stock: number;
}

/**
 * GRN User Access - uses snake_case
 */
export interface GRNUserAccess {
  role: string;
  is_admin: boolean;
  is_supervisor: boolean;
  accessible_customers: number;
}

/**
 * GRN List Response - uses snake_case matching backend RPC
 */
export interface GRNListResponse {
  success: boolean;
  data: {
    items: GRNItem[];
    pagination: RpcPagination;
    aggregations: GRNAggregations;
    filters: {
      date_from: string | null;
      date_to: string | null;
      applied_filters: GRNFilters;
      sort_by: string;
      sort_order: string;
    };
    user_access: GRNUserAccess;
  };
  message: string;
  error?: string;
}

export const getAllGRNItems = async (params: GRNListParams = {}): Promise<GRNListResponse> => {
  try {
    // Prepare RPC parameters - only include non-null/non-undefined values
    const rpcParams: GRNRpcParams = {
      p_limit: Math.min(params.p_limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };
    
    // Only add optional parameters if they have actual values
    if (params.p_date_from) rpcParams.p_date_from = params.p_date_from;
    if (params.p_date_to) rpcParams.p_date_to = params.p_date_to;
    if (params.p_filters && Object.keys(params.p_filters).length > 0) {
      // Clean up filters to only include non-empty values (all snake_case)
      const cleanFilters: GRNFilters = {};
      const filters = params.p_filters;

      if (filters.package_mark) cleanFilters.package_mark = filters.package_mark;
      if (filters.item_ids && filters.item_ids.length > 0) cleanFilters.item_ids = filters.item_ids;
      if (filters.customer_ids && filters.customer_ids.length > 0) cleanFilters.customer_ids = filters.customer_ids;
      if (filters.grn_ids && filters.grn_ids.length > 0) cleanFilters.grn_ids = filters.grn_ids;
      if (filters.gr_no_from) cleanFilters.gr_no_from = filters.gr_no_from;
      if (filters.gr_no_to) cleanFilters.gr_no_to = filters.gr_no_to;
      // Pass stock_status inside p_filters (V2 RPC signature)
      if (filters.stock_status && filters.stock_status !== 'all') {
        cleanFilters.stock_status = filters.stock_status;
      }

      if (filters.weight_min !== undefined) cleanFilters.weight_min = filters.weight_min;
      if (filters.weight_max !== undefined) cleanFilters.weight_max = filters.weight_max;
      if (filters.search?.trim()) cleanFilters.search = filters.search.trim();
      if (filters.page_by === 'receipt') cleanFilters.page_by = 'receipt';

      if (Object.keys(cleanFilters).length > 0) {
        rpcParams.p_filters = cleanFilters;
      }

    }
    if (params.p_sort_by) rpcParams.p_sort_by = params.p_sort_by;
    if (params.p_sort_order) rpcParams.p_sort_order = params.p_sort_order;
    // Fix: Use >= 0 to include offset=0 (first page) - offset=0 was being skipped because 0 is falsy
    if (typeof params.p_offset === 'number' && params.p_offset >= 0) rpcParams.p_offset = params.p_offset;

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();

    // Generate deduplication key for this request (PO9 fix)
    const dedupKey = generateRequestKey('getAllGRNItems', { ...rpcParams });

    console.log('[GRN Service] RPC params:', JSON.stringify(rpcParams, null, 2));
    console.time('⏱️ [GRN Service] RPC call duration');
    const { data, error } = await deduplicatedRequest(dedupKey, async () => {
      return authenticatedClient.rpc('get_all_grn_items', rpcParams);
    });
    console.timeEnd('⏱️ [GRN Service] RPC call duration');

    if (data) {
      const tempResponse = unwrapArrayResponse(data);
      const itemsCount = Array.isArray(tempResponse?.data) ? tempResponse.data.length : 0;
      const dataSize = JSON.stringify(data).length;
      console.log(`📊 [GRN Service] Data size: ${(dataSize / 1024).toFixed(2)} KB, Items: ${itemsCount}`);
      console.log('[GRN Service] Pagination from backend:', JSON.stringify(tempResponse?.pagination, null, 2));
    }

    if (error) {
      // After a forced sign-out the read fails with the ended session: expected, not a fault.
      (isJWTSignatureError(error) || isSessionInvalidationError(error) ? console.log : console.error)('[GRN Service] Failed to fetch GRN items:', error.message);
      return {
        ...createErrorResponse(error, t('errors.grn.fetchItemsFailed'), 'GRNService.getAllGRNItems'),
        data: EMPTY_GRN_RESPONSE_DATA
      };
    }

    // Handle array response from RPC (use standardized utility)
    const responseData = unwrapArrayResponse(data);

    if (!responseData) {
      return {
        success: false,
        data: EMPTY_GRN_RESPONSE_DATA,
        message: t('errors.general.noDataAvailable')
      };
    }

    // Backend now returns structure: { data: [...], success: true, aggregates: {...}, pagination: {...} }
    // All fields are already snake_case - no transformation needed
    const rawItems = Array.isArray(responseData.data) ? responseData.data : [];

    // Items are already in snake_case format matching GRNItem (RpcGrnListItem)
    const itemsArray: GRNItem[] = rawItems;

    // Backend returns { limit, offset, total_count } - compute has_more
    const backendPagination = responseData.pagination || {};
    const limit = backendPagination.limit || PAGINATION.DEFAULT_LIMIT;
    const offset = backendPagination.offset || 0;
    const total_count = backendPagination.total_count || backendPagination.totalCount || 0;
    const has_more = hasMoreItems(offset, limit, total_count);
    const unit = backendPagination.unit === 'receipt' ? 'receipt' : 'line';
    if (params.p_filters?.page_by === 'receipt' && responseData.success !== false) noteGrnPagingUnit(unit);

    console.log('[GRN Service] Computed has_more:', { offset, itemsLength: itemsArray.length, total_count, has_more, unit });

    return {
      success: responseData.success !== false, // Default to true if not explicitly false
      data: {
        items: itemsArray,
        pagination: { total_count, limit, offset, has_more, unit },
        aggregations: responseData.aggregates || { total_qty: 0, total_stock: 0 },
        filters: {
          date_from: null,
          date_to: null,
          applied_filters: {},
          sort_by: 'date',
          sort_order: 'desc'
        },
        user_access: { role: '', is_admin: false, is_supervisor: false, accessible_customers: 0 }
      },
      message: serverText(responseData.message, t('errors.grn.itemsFetched'))
    };
    
  } catch (error) {
    return {
      ...createErrorResponse(error, t('errors.grn.fetchItemsFailed'), 'GRNService.getAllGRNItems'),
      data: EMPTY_GRN_RESPONSE_DATA
    };
  }
};

const normalizeCustomerGRNItem = (raw: Record<string, unknown>): GRNItem => ({
  ...(raw as unknown as GRNItem),
  id: String(raw.id || raw.grn_item_id || ''),
  grn_id: String(raw.grn_id || raw.grns_id || ''),
  grn_item_id: String(raw.grn_item_id || raw.id || ''),
  gr_no: String(raw.gr_no || raw.grns_gr_no || ''),
  date: String(raw.date || raw.grns_date || ''),
  customer_id: String(raw.customer_id || ''),
  customer_name: String(raw.customer_name || ''),
  supervisor_name: raw.supervisor_name == null ? null : String(raw.supervisor_name),
  registration: raw.registration == null ? null : String(raw.registration),
  item_id: raw.item_id == null ? undefined : String(raw.item_id),
  item_name: String(raw.item_name || ''),
  packaging: raw.packaging == null ? null : String(raw.packaging),
  qty: Number(raw.qty) || 0,
  stock: Number(raw.stock) || 0,
  weight: raw.weight == null ? null : Number(raw.weight),
  rack: raw.rack == null ? null : String(raw.rack),
  package_mark: raw.package_mark == null ? null : String(raw.package_mark),
});

export const getCustomerGRNItems = async (
  customerId: string,
  params: GRNListParams = {}
): Promise<GRNListResponse> => {
  const limit = Math.min(params.p_limit || PAGINATION.DEFAULT_LIMIT, CUSTOMER_GRN_RPC_MAX_LIMIT);
  const offset = params.p_offset || 0;
  const emptyData = {
    ...EMPTY_GRN_RESPONSE_DATA,
    pagination: { total_count: 0, limit, offset, has_more: false },
  };

  if (!customerId) {
    return { success: false, data: emptyData, message: t('errors.customer.assignmentRequired') };
  }

  try {
    const authenticatedClient = await getAuthenticatedClient();
    const rpcParams: Record<string, unknown> = {
      p_customer_id: customerId,
      p_sort_by: params.p_sort_by || 'date',
      p_sort_order: params.p_sort_order || 'desc',
      p_limit: limit,
      p_offset: offset,
    };
    // The RPC applies the date range only when both ends are given.
    const dates = closeDateRange(params.p_date_from, params.p_date_to);
    if (dates) {
      rpcParams.p_date_from = dates.from;
      rpcParams.p_date_to = dates.to;
    }
    if (params.p_filters) {
      const { customer_ids: _customerIds, ...customerFilters } = params.p_filters;
      if (Object.keys(customerFilters).length > 0) rpcParams.p_filters = customerFilters;
    }

    const { data, error } = await authenticatedClient.rpc(
      'get_customer_grn_items',
      rpcParams
    );
    if (error) {
      return {
        ...createErrorResponse(error, t('errors.grn.fetchCustomerItemsFailed'), 'GRNService.getCustomerGRNItems'),
        data: emptyData,
      };
    }

    const response = data as CustomerGRNRpcResponse | null;
    if (!response?.success || !response.data) {
      return {
        success: false,
        data: emptyData,
        message: serverText(response?.message, t('errors.grn.fetchCustomerItemsFailed')),
      };
    }

    const items = (response.data.items || []).map(normalizeCustomerGRNItem);
    const unit = response.data.pagination?.unit === 'receipt' ? 'receipt' : 'line';
    if (params.p_filters?.page_by === 'receipt') noteGrnPagingUnit(unit);
    const totalCount = Number(
      response.data.pagination?.total_count ??
        response.data.pagination?.total ??
        response.data.aggregations?.total_count ??
        items.length
    );

    return {
      success: true,
      message: serverText(response.message, t('errors.grn.customerItemsRetrieved')),
      data: {
        items,
        pagination: {
          total_count: totalCount,
          limit,
          offset,
          has_more:
            response.data.pagination?.has_more ?? hasMoreItems(offset, limit, totalCount),
          unit,
        },
        aggregations: {
          total_qty: Number(response.data.aggregations?.total_qty) || 0,
          total_stock: Number(response.data.aggregations?.total_stock) || 0,
        },
        filters: {
          date_from: params.p_date_from || null,
          date_to: params.p_date_to || null,
          applied_filters: params.p_filters || {},
          sort_by: params.p_sort_by || 'date',
          sort_order: params.p_sort_order || 'desc',
        },
        user_access: {
          role: 'customer',
          is_admin: false,
          is_supervisor: false,
          accessible_customers: 1,
        },
      },
    };
  } catch (error) {
    return {
      ...createErrorResponse(error, t('errors.grn.fetchCustomerItemsFailed'), 'GRNService.getCustomerGRNItems'),
      data: emptyData,
    };
  }
};

export const compareGRNItems = (
  left: GRNItem,
  right: GRNItem,
  sortBy: GRNListParams['p_sort_by'],
  sortOrder: GRNListParams['p_sort_order']
) => {
  const direction = sortOrder === 'asc' ? 1 : -1;
  const field = sortBy || 'date';
  // Receipt numbers follow the backend's order, with the line id as its tie-break.
  if (field === 'gr_no') {
    return (
      compareDocumentNumbers(left.gr_no, right.gr_no) * direction ||
      String(left.id).localeCompare(String(right.id))
    );
  }
  const leftValue = left[field];
  const rightValue = right[field];
  if (typeof leftValue === 'number' || typeof rightValue === 'number') {
    return (Number(leftValue) - Number(rightValue)) * direction;
  }
  return String(leftValue || '').localeCompare(String(rightValue || ''), undefined, {
    numeric: true,
  }) * direction;
};

/*
 * A customer account with several assigned customers has no server-side combined list: the app
 * pages `get_customer_grn_items` per customer and merges. To show positions offset..end-1 of the
 * merged order, the app needs, for every customer, enough of that customer's first rows. The
 * cursor below keeps what was downloaded for one request (customers, sort, dates, filters) so the
 * next page fetches only the missing rows instead of every customer's prefix again.
 *
 * Asked for receipt pages (`page_by: 'receipt'`, backend migration 98), each customer's pages hold whole
 * receipts, and the cursor counts, merges and slices receipts: a receipt belongs to one customer and never
 * spans two of its pages, so its lines stay together. A facility without 98 answers in lines, and the cursor
 * then works in lines as before.
 */

/** One customer's rows downloaded so far, for one cursor. */
interface CustomerCursor {
  customerId: string;
  /** The customer's first rows, in the RPC's order, without gaps. */
  rows: GRNItem[];
  /** Keys (`grnLineKey`) of the rows held, to drop a line a later page repeats. */
  seen: Set<string>;
  /**
   * Units the RPC has counted for this customer, in the RPC's own numbering (receipts or lines, as the answers
   * say): the next request's offset. It also counts units whose rows were dropped as repeats, so a page of only
   * repeats still moves on.
   */
  fetched: number;
  /** The RPC said there are no more rows (or returned an empty page). */
  exhausted: boolean;
  /** From the customer's latest page. */
  totalCount: number;
  aggregations: GRNAggregations;
}

interface CursorEntry {
  key: string;
  generation: number;
  /** In the order of the target ids: ties in the merge keep this order. */
  customers: CustomerCursor[];
  /**
   * Whether each customer's RPC order agrees with compareGRNItems. Only then is a row the app has
   * not downloaded known to sort after that customer's last downloaded row.
   */
  orderTrusted: boolean;
  /** What the facility pages by, from its first answer; lines until then. */
  unit: 'line' | 'receipt';
  /** `unit` has been read from an answer. A later answer in another unit starts the cursor again. */
  unitKnown: boolean;
  /** Calls on one cursor run one after another. */
  tail: Promise<unknown>;
}

/** A customer's rows as the cursor's units: whole receipts (consecutive lines of one GRN), or single lines. */
const unitsOf = (entry: CursorEntry, rows: GRNItem[]): GRNItem[][] => {
  if (entry.unit === 'line') return rows.map(row => [row]);
  const units: GRNItem[][] = [];
  for (const row of rows) {
    const current = units[units.length - 1];
    if (current && current[0].grn_id === row.grn_id) current.push(row);
    else units.push([row]);
  }
  return units;
};

const MAX_CURSORS = 4;
/** Insertion order is the least recently used order. */
const cursors = new Map<string, CursorEntry>();
registerSessionScoped('grn-list-cursors', () => cursors.clear(), { onGenerationChange: true });

const cursorKey = (generation: number, targetIds: string[], params: GRNListParams) => {
  const { customer_ids: _customerIds, ...filters } = params.p_filters || {};
  const sortedFilters: Record<string, unknown> = {};
  for (const name of Object.keys(filters).sort()) {
    sortedFilters[name] = filters[name as keyof typeof filters];
  }
  // The customer order stays as given: tied rows keep it in the merge.
  return JSON.stringify([
    generation,
    targetIds,
    params.p_sort_by || 'date',
    params.p_sort_order || 'desc',
    closeDateRange(params.p_date_from, params.p_date_to),
    sortedFilters,
  ]);
};

/** The cursor for a request. A first page (first load, refresh, new filter) always starts again. */
const takeEntry = (targetIds: string[], params: GRNListParams, offset: number): CursorEntry => {
  const generation = getSessionGeneration();
  const key = cursorKey(generation, targetIds, params);
  const entry: CursorEntry = (offset > 0 && cursors.get(key)) || {
    key,
    generation,
    customers: targetIds.map(customerId => ({
      customerId,
      rows: [],
      seen: new Set<string>(),
      fetched: 0,
      exhausted: false,
      totalCount: 0,
      aggregations: { total_qty: 0, total_stock: 0 },
    })),
    // The app's text order (localeCompare) may differ from the database collation. Ascending
    // dates too: the server puts a missing date last, the app first, and fractional seconds
    // compare differently.
    orderTrusted:
      params.p_sort_by !== 'item_name' && !((params.p_sort_by || 'date') === 'date' && params.p_sort_order === 'asc'),
    unit: 'line',
    unitKnown: false,
    tail: Promise.resolve(),
  };
  cursors.delete(key);
  cursors.set(key, entry);
  for (const oldest of cursors.keys()) {
    if (cursors.size <= MAX_CURSORS) break;
    cursors.delete(oldest);
  }
  return entry;
};

/**
 * Merges each customer's first `end` retained units (what the app showed before the cursor, applied
 * to the rows it holds) and lists the customers that must be fetched further before positions
 * 0..end-1 are final. A unit is a receipt in receipt mode and a row otherwise; units compare by
 * their first row.
 */
const planCursor = (entry: CursorEntry, end: number, params: GRNListParams) => {
  const unitsByCustomer = new Map(entry.customers.map(customer => [customer, unitsOf(entry, customer.rows)]));
  const merged = entry.customers
    .flatMap(customer => unitsByCustomer.get(customer)!.slice(0, end))
    .sort((left, right) => compareGRNItems(left[0], right[0], params.p_sort_by, params.p_sort_order));
  const open = entry.customers.filter(customer => !customer.exhausted);
  if (!entry.orderTrusted || merged.length < end) {
    return { merged, needy: open.filter(customer => unitsByCustomer.get(customer)!.length < end) };
  }
  // Every unit of a customer not yet downloaded sorts after its last downloaded unit, so a
  // customer whose last unit is at end-1 or later cannot change positions 0..end-1.
  const positions = new Map<GRNItem[], number>();
  merged.forEach((unit, position) => positions.set(unit, position));
  const needy = open.filter(customer => {
    const units = unitsByCustomer.get(customer)!;
    const last = units[Math.min(units.length, end) - 1];
    return !last || (positions.get(last) ?? -1) < end - 1;
  });
  return { merged, needy };
};

const appendRows = (entry: CursorEntry, customer: CustomerCursor, items: GRNItem[], params: GRNListParams) => {
  let previous = customer.rows[customer.rows.length - 1];
  for (const item of items) {
    // A line the customer's earlier pages already hold (a receipt created meanwhile shifted the offsets) is
    // not added again: a repeated receipt would otherwise join the held one as one doubled unit.
    const key = grnLineKey(item);
    if (customer.seen.has(key)) continue;
    customer.seen.add(key);
    // In receipt mode only receipts are ordered by the sort; the lines of one receipt are in line order.
    const sameReceipt = entry.unit === 'receipt' && previous?.grn_id === item.grn_id;
    if (previous && !sameReceipt && compareGRNItems(previous, item, params.p_sort_by, params.p_sort_order) > 0) {
      entry.orderTrusted = false;
    }
    customer.rows.push(item);
    previous = item;
  }
};

/** Forgets every row downloaded, to start again in the unit the facility now answers in. */
const restartCursor = (entry: CursorEntry, unit: 'line' | 'receipt', params: GRNListParams) => {
  for (const customer of entry.customers) {
    customer.rows = [];
    customer.seen = new Set<string>();
    customer.fetched = 0;
    customer.exhausted = false;
    customer.totalCount = 0;
    customer.aggregations = { total_qty: 0, total_stock: 0 };
  }
  entry.unit = unit;
  entry.unitKnown = true;
  entry.orderTrusted =
    params.p_sort_by !== 'item_name' && !((params.p_sort_by || 'date') === 'date' && params.p_sort_order === 'asc');
};

/** Fetches until positions 0..end-1 are final; returns the merge, or the first failure in customer order. */
const extendCursor = async (
  entry: CursorEntry,
  end: number,
  params: GRNListParams
): Promise<{ merged: GRNItem[][]; failed?: GRNListResponse }> => {
  for (let restarts = 0; ; ) {
    const { merged, needy } = planCursor(entry, end, params);
    if (needy.length === 0) return { merged };
    const responses = await Promise.all(
      needy.map(customer => {
        const held = unitsOf(entry, customer.rows).length;
        return getCustomerGRNItems(customer.customerId, {
          ...params,
          p_offset: customer.fetched,
          p_limit: Math.min(CUSTOMER_GRN_RPC_MAX_LIMIT, end - held),
        });
      })
    );
    // The facility's first answer says what it pages by. If a later answer comes in the other unit (the
    // backend was updated while the list was open), the rows held count something else: start again from 0
    // in the new unit, in this same call, so one answer never mixes units (code review 2026-10-18, R1-03).
    const answered = responses.find(response => response.success);
    if (answered) {
      const answeredUnit = answered.data.pagination.unit === 'receipt' ? 'receipt' : 'line';
      if (!entry.unitKnown) {
        entry.unit = answeredUnit;
        entry.unitKnown = true;
      } else if (answeredUnit !== entry.unit) {
        // A facility that answers in a different unit every time cannot be paged: give up rather than loop.
        if (++restarts > 2) {
          return { merged, failed: { success: false, data: EMPTY_GRN_RESPONSE_DATA, message: t('errors.grn.fetchCustomerItemsFailed') } };
        }
        restartCursor(entry, answeredUnit, params);
        continue;
      }
    }
    let failed: GRNListResponse | undefined;
    responses.forEach((response, index) => {
      const customer = needy[index];
      if (!response.success) {
        failed = failed || response;
        return;
      }
      appendRows(entry, customer, response.data.items, params);
      customer.fetched += entry.unit === 'receipt' ? countReceipts(response.data.items) : response.data.items.length;
      customer.totalCount = response.data.pagination.total_count;
      customer.aggregations = response.data.aggregations;
      if (!response.data.pagination.has_more || response.data.items.length === 0) {
        customer.exhausted = true;
      }
    });
    if (failed) return { merged, failed };
  }
};

export const getAssignedCustomerGRNItems = async (
  assignedCustomerIds: string[],
  params: GRNListParams = {}
): Promise<GRNListResponse> => {
  const uniqueAssignedIds = [...new Set(assignedCustomerIds.filter(Boolean))];
  const requestedIds = params.p_filters?.customer_ids || [];
  const unauthorizedId = requestedIds.find(id => !uniqueAssignedIds.includes(id));
  if (unauthorizedId) {
    return {
      success: false,
      data: EMPTY_GRN_RESPONSE_DATA,
      message: t('errors.customer.accessDenied'),
    };
  }

  const targetIds = requestedIds.length > 0 ? requestedIds : uniqueAssignedIds;
  if (targetIds.length === 0) {
    return {
      success: false,
      data: EMPTY_GRN_RESPONSE_DATA,
      message: t('errors.customer.noAssignment'),
    };
  }

  const offset = params.p_offset || 0;
  const limit = Math.min(params.p_limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  if (targetIds.length === 1) {
    return getCustomerGRNItems(targetIds[0], { ...params, p_limit: limit, p_offset: offset });
  }

  const end = offset + limit;
  const entry = takeEntry(targetIds, params, offset);
  // Not deduplicated: a refresh must not join a page fetched for the cursor it replaces. A
  // replaced cursor is no longer in the map; a call still running on it finishes on its own.
  const page = async (): Promise<GRNListResponse> => {
    const { merged, failed } = await extendCursor(entry, end, params);
    if (failed) return failed;
    const customers = entry.customers;
    const totalCount = customers.reduce((total, customer) => total + customer.totalCount, 0);
    return {
      success: true,
      message: t('errors.grn.assignedItemsRetrieved'),
      data: {
        items: merged.slice(offset, end).flat(),
        pagination: {
          total_count: totalCount,
          limit,
          offset,
          has_more: end < totalCount,
          unit: entry.unit,
        },
        aggregations: {
          total_qty: customers.reduce((total, customer) => total + customer.aggregations.total_qty, 0),
          total_stock: customers.reduce((total, customer) => total + customer.aggregations.total_stock, 0),
        },
        filters: {
          date_from: params.p_date_from || null,
          date_to: params.p_date_to || null,
          applied_filters: params.p_filters || {},
          sort_by: params.p_sort_by || 'date',
          sort_order: params.p_sort_order || 'desc',
        },
        user_access: {
          role: 'customer',
          is_admin: false,
          is_supervisor: false,
          accessible_customers: targetIds.length,
        },
      },
    };
  };
  const result = entry.tail.then(page);
  entry.tail = result.catch(() => undefined);
  return result;
};
