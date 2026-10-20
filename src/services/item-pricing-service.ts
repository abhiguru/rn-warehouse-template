// Item Storage Pricing Service
// Uses RPC functions for all CRUD operations

import { getAuthenticatedClient } from '../config/supabaseConfig';
import type {
  ItemPricingFilters,
  ItemPricingListParams,
  ItemPricingListResponse,
  CreateItemPricingPayload,
  UpdateItemPricingPayload,
  ItemPricingMutationResponse,
  ItemPricingDeleteResponse,
  ItemPriceHistoryEntry,
  ItemPriceHistoryResponse,
  ItemPriceHistoryParams,
  ActiveItem,
  ReplaceRatesInput,
  ReplaceRatesResult,
  UndoRateChangeInput,
  UndoRateChangeResult,
  RateErrorCode,
  StandardRate,
  StandardTier,
  SetStandardRateResult,
} from '../types/item-pricing.types';
import {
  ItemStoragePrice
} from '../types/item-pricing.types';
import { createLogger } from '@/utils/logger';
import { unwrapArrayResponse } from '@/utils/responseUtils';
import { hasMoreItems } from '@/utils/paginationUtils';
import { PAGINATION } from '@/config/cacheConfig';
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { withTimeout } from '@/utils/rpcClient';
import { t } from '@/i18n';
import type { RpcGrnItemRate, RpcGrnItemRates } from '@/types/rpc-canonical.types';
import { formatDate, toCalendarDay } from '@/utils/formatters';
import { addDays } from '@/features/item-pricing/rateText';
import type { TranslationKey } from '@/i18n';
import { failureText, serverText, transportText } from '@/utils/serverText';

import { rememberRateStartFloor } from './rateStartFloor';

const itemPricingLogger = createLogger('ItemPricingService');

/**
 * Fetch paginated, filtered, sorted item storage prices
 */
export const getItemStoragePrices = async (
  params: ItemPricingListParams = {}
): Promise<ItemPricingListResponse> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();

    // Build RPC parameters
    const rpcParams: Record<string, unknown> = {
      p_limit: params.p_limit || PAGINATION.DEFAULT_LIMIT,
      p_offset: params.p_offset || 0,
    };

    // Add filters if provided
    if (params.p_filters && Object.keys(params.p_filters).length > 0) {
      const cleanFilters: ItemPricingFilters = {};

      if (params.p_filters.price_ids && params.p_filters.price_ids.length > 0) {
        cleanFilters.price_ids = params.p_filters.price_ids;
      }
      if (params.p_filters.item_ids && params.p_filters.item_ids.length > 0) {
        cleanFilters.item_ids = params.p_filters.item_ids;
      }
      if (params.p_filters.customer_ids && params.p_filters.customer_ids.length > 0) {
        cleanFilters.customer_ids = params.p_filters.customer_ids;
      }
      if (params.p_filters.price_type) {
        cleanFilters.price_type = params.p_filters.price_type;
      }
      if (params.p_filters.weight_min !== undefined) {
        cleanFilters.weight_min = params.p_filters.weight_min;
      }
      if (params.p_filters.weight_max !== undefined) {
        cleanFilters.weight_max = params.p_filters.weight_max;
      }
      if (params.p_filters.effective_from) {
        cleanFilters.effective_from = params.p_filters.effective_from;
      }
      if (params.p_filters.effective_to) {
        cleanFilters.effective_to = params.p_filters.effective_to;
      }
      if (params.p_filters.include_expired !== undefined) {
        cleanFilters.include_expired = params.p_filters.include_expired;
      }

      if (Object.keys(cleanFilters).length > 0) {
        rpcParams.p_filters = cleanFilters;
      }
    }

    if (params.p_sort_by) {
      rpcParams.p_sort_by = params.p_sort_by;
    }
    if (params.p_sort_order) {
      rpcParams.p_sort_order = params.p_sort_order;
    }

    itemPricingLogger.debug('Fetching prices with params:', rpcParams);

    const startTime = Date.now();

    // Set a timeout for RPC calls (30 seconds). It is cleared when the answer comes, so no
    // timer is left counting down (it also kept the Jest process open after the suite).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(t('errors.network.rpcTimedOut30'))), 30000);
    });

    const rpcPromise = authenticatedClient.rpc('get_item_storage_prices', rpcParams);
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]).finally(() => clearTimeout(timer));

    const duration = Date.now() - startTime;
    itemPricingLogger.debug(`RPC call completed in ${duration}ms`);

    if (error) {
      itemPricingLogger.error('RPC error:', error);
      return {
        success: false,
        data: [],
        pagination: { total_count: 0, total: 0, limit: 20, offset: 0, has_more: false },
        message: t('errors.price.fetchFailed'),
        error: error.message,
      };
    }

    itemPricingLogger.debug('RPC response received:', { dataType: typeof data, isArray: Array.isArray(data), dataLength: Array.isArray(data) ? data.length : 'N/A' });

    // Handle response - RPC may return array or object (use standardized utility)
    const responseData = unwrapArrayResponse(data);

    itemPricingLogger.debug('Response data parsed:', {
      hasResponseData: !!responseData,
      success: responseData?.success,
      itemCount: responseData?.data?.length,
      message: responseData?.message
    });

    if (!responseData || !responseData.success) {
      itemPricingLogger.warn('RPC returned unsuccessful response:', {
        responseData: JSON.stringify(responseData).substring(0, 200)
      });
      return {
        success: false,
        data: [],
        pagination: { total_count: 0, total: 0, limit: 20, offset: 0, has_more: false },
        message: serverText(responseData?.message, t('errors.general.noDataAvailable')),
        error: responseData?.error,
      };
    }

    const items = Array.isArray(responseData.data) ? responseData.data : [];
    const rawPagination = (responseData.pagination || {}) as Partial<ItemPricingListResponse['pagination']>;
    const totalCount = Number(rawPagination.total_count ?? rawPagination.total ?? items.length) || 0;
    const pagination: ItemPricingListResponse['pagination'] = {
      total_count: totalCount,
      total: totalCount,
      limit: rawPagination.limit ?? (params.p_limit || PAGINATION.DEFAULT_LIMIT),
      offset: rawPagination.offset ?? (params.p_offset || 0),
      has_more:
        rawPagination.has_more ??
        hasMoreItems(rawPagination.offset ?? (params.p_offset || 0), rawPagination.limit ?? (params.p_limit || PAGINATION.DEFAULT_LIMIT), totalCount),
    };

    // Backend migration 86 adds the earliest day a rate may start to every rates read. `data` is the row
    // list, so it comes beside it (an object `data` or the pagination block are accepted as well).
    const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
    const earliest = responseData.earliest_start ?? asObject(responseData.data)?.earliest_start ?? (rawPagination as Record<string, unknown>).earliest_start;
    rememberRateStartFloor(earliest);

    return {
      success: true,
      data: items,
      pagination,
      message: t('errors.price.fetched'),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in getItemStoragePrices:', { error: errorMessage, type: typeof err });
    return {
      success: false,
      data: [],
      pagination: { total_count: 0, total: 0, limit: 20, offset: 0, has_more: false },
      message: t('errors.price.fetchFailed'),
      error: errorMessage,
    };
  }
};

/**
 * True when the server answered that it has no `get_item_price_history`: a backend without
 * migration 48. PostgREST says PGRST202 "Could not find the function ... in the schema
 * cache"; the database itself says 42883 "function ... does not exist". Trying again cannot
 * help until the facility's server is updated.
 */
export function isMissingFunction(
  error: { code?: unknown; message?: unknown } | null | undefined,
  name: string
): boolean {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (error?.code === 'PGRST202' || message.includes('could not find the function')) return true;
  return message.includes(name) && (error?.code === '42883' || message.includes('does not exist'));
}

const priceHistoryMissing = (error: { code?: unknown; message?: unknown } | null | undefined): boolean =>
  isMissingFunction(error, 'get_item_price_history');

/** One page of the price history is 50 entries; the server allows 1 to 200. */
export const PRICE_HISTORY_PAGE_SIZE = 50;

/**
 * The record of price changes, newest first (backend migration 48). The server gives it to
 * administrators and supervisors only and refuses everyone else with an error.
 *
 * A failure carries `message` for the screen to show under its own "Couldn't load" title:
 * that the server needs an update when it does not have the function (a backend older than
 * migration 48), the reason in the app's words when the server names one the app knows (no
 * permission, connection), otherwise "Try again in a moment."
 */
export const getItemPriceHistory = async (
  params: ItemPriceHistoryParams = {}
): Promise<ItemPriceHistoryResponse> => {
  const limit = params.limit ?? PRICE_HISTORY_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const failed = (message: string, error?: string): ItemPriceHistoryResponse => ({
    success: false,
    data: [],
    pagination: { total: 0, limit, offset, has_more: false },
    message,
    error,
  });

  try {
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_item_price_history', {
      p_limit: limit,
      p_offset: offset,
      ...(params.itemId ? { p_item_id: params.itemId } : {}),
      ...(params.customerId ? { p_customer_id: params.customerId } : {}),
    });

    if (error) {
      itemPricingLogger.error('get_item_price_history RPC error:', error);
      handleGlobalAuthError(error);
      if (priceHistoryMissing(error)) return failed(t('pricing.history.serverNeedsUpdate'), error.message);
      // The raw text is developer wording: only a reason the app knows is shown.
      return failed(failureText(error.message, null, t('pricing.list.tryAgainInAMoment')), error.message);
    }

    const response = unwrapArrayResponse(data) as
      | { success?: unknown; data?: unknown; pagination?: Partial<ItemPriceHistoryResponse['pagination']>; message?: unknown; error?: unknown }
      | null;

    if (!response || typeof response !== 'object' || response.success !== true) {
      itemPricingLogger.warn('get_item_price_history refused or returned no data');
      handleGlobalAuthError(response);
      const serverSaid = response?.message ?? response?.error;
      return failed(
        serverText(serverSaid, t('pricing.list.tryAgainInAMoment')),
        typeof serverSaid === 'string' ? serverSaid : undefined
      );
    }

    const entries = Array.isArray(response.data) ? (response.data as ItemPriceHistoryEntry[]) : [];
    const total = Number(response.pagination?.total ?? entries.length) || 0;
    return {
      success: true,
      data: entries,
      pagination: {
        total,
        limit: Number(response.pagination?.limit ?? limit) || limit,
        offset: Number(response.pagination?.offset ?? offset) || 0,
        has_more: response.pagination?.has_more ?? hasMoreItems(offset, limit, total),
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in getItemPriceHistory:', { error: errorMessage });
    handleGlobalAuthError(err);
    if (priceHistoryMissing({ code: (err as { code?: unknown } | null)?.code, message: errorMessage })) {
      return failed(t('pricing.history.serverNeedsUpdate'), errorMessage);
    }
    return failed(failureText(errorMessage, null, t('pricing.list.tryAgainInAMoment')), errorMessage);
  }
};

const RATE_ERROR_KEYS: Partial<Record<RateErrorCode, TranslationKey>> = {
  INVALID_PRICE_TYPE: 'pricing.error.generic',
  PAST_DATE_NOT_ALLOWED: 'pricing.error.pastDateNotAllowed',
  RATE_IN_FORCE_MANAGER_ONLY: 'pricing.error.rateInForceManagerOnly',
  ITEM_NOT_FOUND: 'pricing.error.itemNotFound',
  CUSTOMER_NOT_FOUND: 'pricing.error.customerNotFound',
  INVALID_BANDS: 'pricing.error.tooManyBands',
  INVALID_BAND: 'pricing.error.invalidBand',
  INVALID_AMOUNT: 'pricing.error.invalidAmount',
  BANDS_OVERLAP: 'pricing.error.bandsOverlap',
  BANDS_GAP: 'pricing.error.bandsGap',
  NOTHING_TO_STOP: 'pricing.error.nothingToStop',
  NOTHING_TO_UNDO: 'pricing.error.nothingToUndo',
  INVALID_MODE: 'pricing.error.generic',
  NOT_A_RATE_START: 'pricing.error.notARateStart',
  NOTHING_TO_MOVE: 'pricing.error.nothingToMove',
  STALE_RATES: 'pricing.error.staleRates',
  STALE_STANDARD_RATE: 'pricing.standard.error.stale',
  STANDARD_RATE_MANAGER_ONLY: 'pricing.standard.error.managerOnly',
  // LATER_RATES_EXIST has no message: the screen's dialog explains.
};

const RPC_TIMEOUT_MS = 30000;

/** The code and the app's own text for an RPC that failed outright (missing function, no right, anything else). */
const mapRateError = (
  error: { code?: unknown; message?: unknown },
  fn: string
): { code: RateErrorCode; message: string } => {
  const text = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (isMissingFunction(error, fn)) return { code: 'SERVER_NEEDS_UPDATE', message: t('pricing.error.serverNeedsUpdate') };
  if (error.code === '42501' || text.includes('access required')) return { code: 'PERMISSION_DENIED', message: t('errors.parsed.noPermission') };
  return { code: 'UNKNOWN', message: t('pricing.error.generic') };
};

/** INVALID_DATE: names the oldest day that is allowed when the server sends it (`data.earliest`, migration 86). */
const invalidDateText = (details: { earliest?: unknown }, startsOn?: string | null): string => {
  // The server sends INVALID_DATE for a day too far ahead as well: that one is told apart by the day sent.
  if (startsOn && startsOn.slice(0, 10) > addDays(toCalendarDay(new Date()), 730)) return t('pricing.error.startTooFar');
  return typeof details.earliest === 'string' && /^\d{4}-\d{2}-\d{2}/.test(details.earliest)
    ? t('pricing.error.invalidDate', { date: formatDate(details.earliest.slice(0, 10), 'medium') })
    : t('pricing.error.invalidDateWindow');
};

const RATE_FIELDS = ['unit_price', 'labour_rate', 'tax_percent'] as const;

/** The request left the phone but the answer did not come back: the rate may or may not be saved. */
const outcomeUnknown = (): ReplaceRatesResult => ({
  success: false,
  errorCode: 'UNKNOWN',
  message: t('pricing.error.unconfirmed'),
  outcomeUnknown: true,
});

const rateFailure = (errorCode: RateErrorCode, message: string | undefined, extra: Partial<ReplaceRatesResult> = {}): ReplaceRatesResult => ({
  success: false,
  errorCode,
  ...(message ? { message } : {}),
  ...extra,
});

/**
 * Replace the rates of one scope (item, customer or default, price type) from a day
 * (backend migration 76). `bands: []` stops the rate from `starts_on`. The server's English
 * text is never shown: a failure carries `errorCode` and the app's own `message`.
 */
export const replaceItemRates = async (input: ReplaceRatesInput): Promise<ReplaceRatesResult> => {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await withTimeout(
      Promise.resolve(client.rpc('replace_item_rates', {
        p_item_id: input.item_id,
        p_customer_id: input.customer_id,
        p_price_type: input.price_type,
        p_starts_on: input.starts_on,
        p_bands: input.bands,
        p_replace_later: input.replace_later ?? false,
        p_mode: input.mode ?? 'change',
        p_move_from: input.move_from ?? null,
        // The rows the editor loaded: the server refuses (STALE_RATES) when it would change one that is not listed.
        ...(input.seen_rows ? { p_seen_rows: input.seen_rows } : {}),
      })),
      RPC_TIMEOUT_MS,
      'Rate change'
    );

    if (error) {
      itemPricingLogger.error('replace_item_rates RPC error:', error);
      handleGlobalAuthError(error);
      const mapped = mapRateError(error, 'replace_item_rates');
      // An error with no database code is the connection failing: the save may have gone through.
      if (mapped.code === 'UNKNOWN' && !(error as { code?: unknown }).code) return outcomeUnknown();
      return rateFailure(mapped.code, mapped.message);
    }

    const response = unwrapArrayResponse(data) as
      | {
          success?: unknown;
          error_code?: unknown;
          data?: { index?: unknown; field?: unknown; earliest?: unknown; later?: unknown; ended?: unknown; added?: unknown; kept_end?: unknown } | null;
        }
      | null;

    if (!response || typeof response !== 'object') {
      return rateFailure('UNKNOWN', t('pricing.error.generic'));
    }

    if (response.success !== true) {
      handleGlobalAuthError(response);
      const code = String(response.error_code ?? '') as RateErrorCode;
      const key = RATE_ERROR_KEYS[code];
      const details = response.data ?? {};
      const extra: Partial<ReplaceRatesResult> = {};
      if (typeof details.index === 'number') extra.bandIndex = details.index;
      if (typeof details.field === 'string' && (RATE_FIELDS as readonly string[]).includes(details.field)) {
        extra.field = details.field as ReplaceRatesResult['field'];
      }
      if (typeof details.earliest === 'string' && /^\d{4}-\d{2}-\d{2}/.test(details.earliest)) extra.earliest = details.earliest.slice(0, 10);
      if (Array.isArray(details.later)) extra.later = details.later as ReplaceRatesResult['later'];
      if (code === 'LATER_RATES_EXIST') return rateFailure(code, undefined, extra);
      if (code === 'INVALID_DATE') return rateFailure(code, invalidDateText(details, input.starts_on), extra);
      if (code === 'PERMISSION_DENIED') return rateFailure(code, t('errors.parsed.noPermission'), extra);
      if (key) return rateFailure(code, t(key), extra);
      return rateFailure('UNKNOWN', t('pricing.error.generic'), extra);
    }

    const details = response.data ?? {};
    return {
      success: true,
      // null is the server saying "no stop is kept"; a missing key is the server not saying.
      ...(typeof details.kept_end === 'string' && details.kept_end
        ? { keptEnd: details.kept_end.slice(0, 10) }
        : 'kept_end' in details && details.kept_end === null
          ? { keptEnd: null }
          : {}),
      ...(Array.isArray(details.ended) ? { ended: details.ended as ReplaceRatesResult['ended'] } : {}),
      ...(Array.isArray(details.added) ? { added: details.added as ReplaceRatesResult['added'] } : {}),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in replaceItemRates:', { error: errorMessage });
    handleGlobalAuthError(err);
    if (isMissingFunction({ code: (err as { code?: unknown } | null)?.code, message: errorMessage }, 'replace_item_rates')) {
      return rateFailure('SERVER_NEEDS_UPDATE', t('pricing.error.serverNeedsUpdate'));
    }
    // A timeout or a lost answer: the server may have committed the change.
    return outcomeUnknown();
  }
};

/**
 * Undo the change that starts on `startsOn` for one scope (backend migration 76): the rows
 * starting that day are removed and the rows that ended the day before run on again. Used by
 * "Cancel new rate" and "Undo stop". A failure carries `errorCode` and the app's own `message`.
 */
export const undoRateChange = async (input: UndoRateChangeInput): Promise<UndoRateChangeResult> => {
  const failure = (errorCode: RateErrorCode, message: string): UndoRateChangeResult => ({ success: false, errorCode, message });
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await withTimeout(
      Promise.resolve(client.rpc('undo_rate_change', {
        p_item_id: input.itemId,
        p_customer_id: input.customerId,
        p_price_type: input.priceType,
        p_starts_on: input.startsOn,
        // Every row of the scope the screen loaded (ended and planned too): the server answers STALE_RATES when another phone changed the scope since.
        ...(input.seenRows ? { p_seen_rows: input.seenRows } : {}),
      })),
      RPC_TIMEOUT_MS,
      'Rate change'
    );

    if (error) {
      itemPricingLogger.error('undo_rate_change RPC error:', error);
      handleGlobalAuthError(error);
      const mapped = mapRateError(error, 'undo_rate_change');
      return failure(mapped.code, mapped.message);
    }

    const response = unwrapArrayResponse(data) as
      | { success?: unknown; error_code?: unknown; data?: { removed?: unknown; reopened?: unknown; earliest?: unknown } | null }
      | null;
    if (!response || typeof response !== 'object') return failure('UNKNOWN', t('pricing.error.generic'));

    if (response.success !== true) {
      handleGlobalAuthError(response);
      const code = String(response.error_code ?? '') as RateErrorCode;
      if (code === 'PERMISSION_DENIED') return failure(code, t('errors.parsed.noPermission'));
      if (code === 'INVALID_DATE') return failure(code, invalidDateText(response.data ?? {}, input.startsOn));
      const key = RATE_ERROR_KEYS[code];
      return key ? failure(code, t(key)) : failure('UNKNOWN', t('pricing.error.generic'));
    }

    const details = response.data ?? {};
    return {
      success: true,
      ...(Array.isArray(details.removed) ? { removed: details.removed as UndoRateChangeResult['removed'] } : {}),
      ...(Array.isArray(details.reopened) ? { reopened: details.reopened as UndoRateChangeResult['reopened'] } : {}),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in undoRateChange:', { error: errorMessage });
    handleGlobalAuthError(err);
    if (isMissingFunction({ code: (err as { code?: unknown } | null)?.code, message: errorMessage }, 'undo_rate_change')) {
      return failure('SERVER_NEEDS_UPDATE', t('pricing.error.serverNeedsUpdate'));
    }
    return failure('UNKNOWN', t('pricing.error.generic'));
  }
};

// ---------------------------------------------------------------------------
// Reads for the rate screens (list, item page, editor): every rate of the facility,
// the rates of one item, and the active items. They throw when the facility cannot be
// reached; the screens show the load error state and keep older data they already have.
// ---------------------------------------------------------------------------

/** The server returns at most this many rows per call. */
const RATES_PAGE_SIZE = 500;

/** Rates (ended ones too) page by page, until the server says there are no more. */
async function readRates(filters: ItemPricingFilters): Promise<ItemStoragePrice[]> {
  const seen = new Set<string>();
  const rows: ItemStoragePrice[] = [];
  let offset = 0;
  for (;;) {
    const page = await getItemStoragePrices({
      p_filters: { ...filters, include_expired: true },
      p_limit: RATES_PAGE_SIZE,
      p_offset: offset,
    });
    if (!page.success) throw new Error(page.message || page.error || 'Rates could not be loaded');
    for (const row of page.data) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
    if (!page.pagination.has_more || page.data.length === 0) break;
    offset += RATES_PAGE_SIZE;
  }
  return rows;
}

/** Every rate of the facility, ended ones included. Fails as a whole if any page fails. */
export const listAllRates = (): Promise<ItemStoragePrice[]> => readRates({});

/** Every rate of one item (one item never has more than a page). */
export const listItemRates = (itemId: string): Promise<ItemStoragePrice[]> => readRates({ item_ids: [itemId] });

/** Every rate (ended ones too) of these items, for the rates of a GRN. */
export const listRatesOfItems = (itemIds: string[]): Promise<ItemStoragePrice[]> =>
  itemIds.length === 0 ? Promise.resolve([]) : readRates({ item_ids: itemIds });

/** The items table is read this many rows at a time: the server cuts a single read at its row cap. */
const ITEMS_PAGE_SIZE = 500;

/** The active items, by name (the items table, as the item pickers read it), page after page so none is cut. */
export const listActiveItems = async (): Promise<ActiveItem[]> => {
  const client = await getAuthenticatedClient();
  const out: ActiveItem[] = [];
  for (let from = 0; ; from += ITEMS_PAGE_SIZE) {
    const { data, error } = await client
      .from('items')
      .select('id, name, packaging, description')
      .eq('active', true)
      .order('name')
      .order('id')
      .range(from, from + ITEMS_PAGE_SIZE - 1);
    if (error) {
      handleGlobalAuthError(error);
      throw new Error(error.message || 'Items could not be loaded');
    }
    const page = (data ?? []) as { id: string; name: string; packaging: string | null; description?: string | null }[];
    for (const row of page) {
      out.push({ id: row.id, name: row.name, packaging: row.packaging ?? null, description: row.description ?? null });
    }
    if (page.length < ITEMS_PAGE_SIZE) break;
  }
  return out;
};

// ---------------------------------------------------------------------------
// The standard rate (backend migration 85): get_standard_rate, set_standard_rate.
// ---------------------------------------------------------------------------

const toTier = (raw: unknown): StandardTier | null => {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const tier = {
    weight_min: n(r.weight_min),
    weight_max: n(r.weight_max),
    unit_price: n(r.unit_price),
    labour_rate: n(r.labour_rate),
    tax_percent: n(r.tax_percent),
  };
  return Object.values(tier).every(Number.isFinite) ? tier : null;
};

const toTiers = (raw: unknown): StandardTier[] =>
  (Array.isArray(raw) ? raw : []).map(toTier).filter((t): t is StandardTier => t !== null).sort((a, b) => a.weight_min - b.weight_min);

/** The standard rate. Throws when the facility cannot be reached or refuses, like the other rate reads. */
export const getStandardRate = async (): Promise<StandardRate> => {
  const client = await getAuthenticatedClient();
  const { data, error } = await withTimeout(Promise.resolve(client.rpc('get_standard_rate')), RPC_TIMEOUT_MS, 'Standard rate');
  if (error) {
    itemPricingLogger.error('get_standard_rate RPC error:', error);
    handleGlobalAuthError(error);
    if (isMissingFunction(error, 'get_standard_rate')) throw Object.assign(new Error(t('pricing.standard.error.serverNeedsUpdate')), { code: 'SERVER_NEEDS_UPDATE' });
    throw new Error(typeof error.message === 'string' && error.message ? error.message : 'The standard rate could not be loaded');
  }
  const response = unwrapArrayResponse(data) as { success?: unknown; data?: { tiers?: unknown; updated_at?: unknown; updated_by_name?: unknown } | null } | null;
  if (!response || typeof response !== 'object' || response.success !== true) {
    handleGlobalAuthError(response);
    throw new Error('The standard rate could not be loaded');
  }
  const details = response.data ?? {};
  return {
    tiers: toTiers(details.tiers),
    updatedAt: typeof details.updated_at === 'string' ? details.updated_at : null,
    updatedByName: typeof details.updated_by_name === 'string' ? details.updated_by_name : null,
  };
};

export interface SetStandardRateOptions {
  /**
   * The `updated_at` string of the standard rate the draft was built from (get_standard_rate, or the last save's answer);
   * '-infinity' when no tiers were loaded; undefined sends nothing (the server skips the check).
   */
  expectedUpdatedAt?: string | null;
  /** Check everything and count the items that would be priced; nothing is written. */
  dryRun?: boolean;
}

/**
 * Save the standard rate (administrators and supervisors). The server also gives the tiers to every
 * active item that has no default rate yet and says how many (`itemsPriced`). A failure carries
 * `errorCode` and the app's own `message`; the server's English text is never shown.
 */
export const setStandardRate = async (tiers: StandardTier[], options: SetStandardRateOptions = {}): Promise<SetStandardRateResult> => {
  const unconfirmed = (): SetStandardRateResult => ({ success: false, errorCode: 'UNKNOWN', message: t('pricing.standard.error.unconfirmed'), outcomeUnknown: true });
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await withTimeout(
      Promise.resolve(client.rpc('set_standard_rate', {
        p_tiers: tiers,
        // The version the draft was built from, as the exact string the server sent (never through a Date: it would cut the microseconds).
        ...(options.expectedUpdatedAt !== undefined ? { p_expected_updated_at: options.expectedUpdatedAt } : {}),
        ...(options.dryRun ? { p_dry_run: true } : {}),
      })),
      RPC_TIMEOUT_MS,
      'Standard rate'
    );

    if (error) {
      itemPricingLogger.error('set_standard_rate RPC error:', error);
      handleGlobalAuthError(error);
      const mapped = mapRateError(error, 'set_standard_rate');
      if (mapped.code === 'SERVER_NEEDS_UPDATE') return { success: false, errorCode: mapped.code, message: t('pricing.standard.error.serverNeedsUpdateSave') };
      // An error with no database code is the connection failing: the save may have gone through (a dry run writes nothing).
      if (mapped.code === 'UNKNOWN' && !(error as { code?: unknown }).code) return options.dryRun ? { success: false, errorCode: 'UNKNOWN', message: transportText(error, { write: false }) ?? t('pricing.error.generic') } : unconfirmed();
      return { success: false, errorCode: mapped.code, message: mapped.message };
    }

    const response = unwrapArrayResponse(data) as
      | { success?: unknown; error_code?: unknown; data?: { index?: unknown; field?: unknown; tiers?: unknown; items_priced?: unknown; updated_at?: unknown } | null }
      | null;
    if (!response || typeof response !== 'object') return { success: false, errorCode: 'UNKNOWN', message: t('pricing.error.generic') };

    const details = response.data ?? {};
    if (response.success !== true) {
      handleGlobalAuthError(response);
      const code = String(response.error_code ?? '') as RateErrorCode;
      const key = RATE_ERROR_KEYS[code];
      const extra: Partial<SetStandardRateResult> = {};
      if (typeof details.index === 'number') extra.tierIndex = details.index;
      if (typeof details.field === 'string' && (RATE_FIELDS as readonly string[]).includes(details.field)) {
        extra.field = details.field as SetStandardRateResult['field'];
      }
      if (code === 'PERMISSION_DENIED') return { success: false, errorCode: code, message: t('errors.parsed.noPermission'), ...extra };
      if (key) return { success: false, errorCode: code, message: t(key), ...extra };
      return { success: false, errorCode: 'UNKNOWN', message: t('pricing.error.generic'), ...extra };
    }

    return {
      success: true,
      tiers: toTiers(details.tiers),
      itemsPriced: Number(details.items_priced ?? 0) || 0,
      // The new version, exactly as the server wrote it.
      updatedAt: typeof details.updated_at === 'string' ? details.updated_at : null,
      dryRun: options.dryRun === true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    itemPricingLogger.error('Exception in setStandardRate:', { error: errorMessage });
    handleGlobalAuthError(err);
    if (isMissingFunction({ code: (err as { code?: unknown } | null)?.code, message: errorMessage }, 'set_standard_rate')) {
      return { success: false, errorCode: 'SERVER_NEEDS_UPDATE', message: t('pricing.standard.error.serverNeedsUpdateSave') };
    }
    // A dry run writes nothing, so a lost answer to one is only a failure to ask.
    if (options.dryRun) return { success: false, errorCode: 'UNKNOWN', message: transportText(err, { write: false }) ?? t('pricing.error.generic') };
    // A timeout or a lost answer: the server may have committed the change.
    return unconfirmed();
  }
};

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * The rate each lot of a GRN is invoiced at (backend migration 88), in the order of the GRN's items. Null
 * when the server lacks the function (an older one). Throws when the facility cannot be reached or refuses.
 */
export const getGrnItemRates = async (grnId: string): Promise<RpcGrnItemRates | null> => {
  const client = await getAuthenticatedClient();
  const { data, error } = await withTimeout(Promise.resolve(client.rpc('get_grn_item_rates', { p_grn_id: grnId })), RPC_TIMEOUT_MS, 'GRN item rates');
  if (error) {
    handleGlobalAuthError(error);
    if (isMissingFunction(error, 'get_grn_item_rates')) return null;
    throw new Error(typeof error.message === 'string' && error.message ? error.message : 'The rates of the GRN could not be loaded');
  }
  const response = unwrapArrayResponse(data) as { success?: unknown; data?: Record<string, unknown> | null } | null;
  if (!response || response.success !== true || !response.data) {
    handleGlobalAuthError(response);
    throw new Error('The rates of the GRN could not be loaded');
  }
  const d = response.data;
  const rows = Array.isArray(d.rates) ? (d.rates as Array<Record<string, unknown>>) : [];
  const sources = ['invoice', 'grn', 'customer', 'item'];
  return {
    gr_id: String(d.gr_id ?? grnId),
    grn_date: String(d.grn_date ?? '').slice(0, 10),
    price_type: d.price_type === 'one_time' ? 'one_time' : 'monthly',
    invoiced: d.invoiced === true,
    rates: rows.map(r => ({
      grn_item_id: String(r.grn_item_id),
      item_id: String(r.item_id),
      item_name: String(r.item_name ?? ''),
      weight: Number(r.weight) || 0,
      source: sources.includes(r.source as string) ? (r.source as RpcGrnItemRate['source']) : null,
      unit_price: numOrNull(r.unit_price),
      labour_rate: numOrNull(r.labour_rate),
      tax_percent: numOrNull(r.tax_percent),
      weight_min: numOrNull(r.weight_min),
      weight_max: numOrNull(r.weight_max),
      varies: r.varies === true,
    })),
  };
};
