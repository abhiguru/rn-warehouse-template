// Item Storage Pricing Type Definitions

export type PriceType = 'one_time' | 'monthly';

export interface ItemStoragePrice {
  id: string;
  item_id: string;
  item_name: string;
  customer_id: string | null;
  customer_name: string | null;
  price_type: PriceType;
  unit_price: number;
  weight_min: number;
  weight_max: number;
  labour_rate: number;
  tax_percent: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string;
}

export interface ItemPricingFilters {
  price_ids?: string[];
  item_ids?: string[];
  customer_ids?: string[];
  price_type?: PriceType;
  weight_min?: number;
  weight_max?: number;
  effective_from?: string;
  effective_to?: string;
  include_expired?: boolean;
}

export interface ItemPricingListParams {
  p_filters?: ItemPricingFilters;
  p_sort_by?:
    | 'item_name'
    | 'customer_name'
    | 'price_type'
    | 'unit_price'
    | 'weight_min'
    | 'weight_max'
    | 'effective_from'
    | 'effective_to'
    | 'created_at';
  p_sort_order?: 'asc' | 'desc';
  p_limit?: number;
  p_offset?: number;
}

export interface ItemPricingListResponse {
  success: boolean;
  data: ItemStoragePrice[];
  pagination: {
    total_count: number;
    /** Same as total_count (the server sends either name); the service always sets it. */
    total?: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  message?: string;
  error?: string;
}

export interface CreateItemPricingPayload {
  item_id: string;
  customer_id?: string | null;
  price_type: PriceType;
  unit_price: number;
  weight_min: number;
  weight_max: number;
  labour_rate: number;
  tax_percent: number;
  effective_from: string;
  effective_to?: string | null;
}

export interface UpdateItemPricingPayload {
  price_type?: PriceType;
  unit_price?: number;
  weight_min?: number;
  weight_max?: number;
  labour_rate?: number;
  tax_percent?: number;
  effective_from?: string;
  effective_to?: string | null;
}

export interface ItemPricingMutationResponse {
  success: boolean;
  data?: ItemStoragePrice;
  message: string;
  error?: string;
}

export interface ItemPricingDeleteResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Price history (backend migration 48, get_item_price_history): administrators and supervisors only.

export type ItemPriceHistoryAction = 'insert' | 'update' | 'delete' | 'truncate';

/** A price as the history keeps it. Every key can be missing or null in an old or hand-made row. */
export interface ItemPriceHistoryValues {
  price_type?: string | null;
  unit_price?: number | null;
  unit_price_monthly?: number | null;
  unit_price_one_time?: number | null;
  labour_rate?: number | null;
  tax_percent?: number | null;
  weight_min?: number | null;
  weight_max?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  /** A truncate only: how many prices were removed. */
  rows?: number | null;
}

export interface ItemPriceHistoryEntry {
  id: number;
  changed_at: string;
  action: ItemPriceHistoryAction;
  price_id: string | null;
  item_id: string | null;
  /** Null for a truncate, and when the item has since been deleted. */
  item_name: string | null;
  /** Null for a default price (and for a truncate). */
  customer_id: string | null;
  customer_name: string | null;
  old_values: ItemPriceHistoryValues | null;
  new_values: ItemPriceHistoryValues | null;
  /** Null when the change was not made by an app user (service key, database). */
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
}

export interface ItemPriceHistoryPagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ItemPriceHistoryResponse {
  success: boolean;
  data: ItemPriceHistoryEntry[];
  pagination: ItemPriceHistoryPagination;
  /** On a failure: text the screen can show, in the app's language. */
  message?: string;
  error?: string;
}

// Replacing the rates of one scope from a day (backend migration 76, replace_item_rates).

export type RateErrorCode =
  | 'INVALID_PRICE_TYPE' | 'INVALID_DATE' | 'PAST_DATE_NOT_ALLOWED' | 'RATE_IN_FORCE_MANAGER_ONLY'
  | 'ITEM_NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'INVALID_BANDS' | 'INVALID_BAND' | 'INVALID_AMOUNT'
  | 'BANDS_OVERLAP' | 'BANDS_GAP' | 'LATER_RATES_EXIST' | 'NOTHING_TO_STOP' | 'NOTHING_TO_UNDO' | 'PERMISSION_DENIED'
  | 'INVALID_MODE' | 'NOT_A_RATE_START' | 'NOTHING_TO_MOVE' | 'STALE_RATES'
  | 'SERVER_NEEDS_UPDATE' | 'UNKNOWN';

export interface RateBandInput {
  weight_min: number;
  weight_max: number;
  unit_price: number;
  labour_rate: number;
  tax_percent: number;
}

export interface ReplaceRatesInput {
  item_id: string;
  customer_id: string | null;
  price_type: PriceType;
  /** YYYY-MM-DD */
  starts_on: string;
  /** [] stops the rate from starts_on. */
  bands: RateBandInput[];
  /** Default false. Ignored in mode 'correct'. */
  replace_later?: boolean;
  /** Ids of the rows of this scope the screen loaded; the server answers STALE_RATES when it would change another. */
  seen_rows?: string[];
  /**
   * 'change' (default): rates from starts_on on. 'correct': starts_on must be the start of the rate
   * in force; only the rows starting that day are replaced and later rates are never touched.
   */
  mode?: 'change' | 'correct';
  /** Only with mode 'change': first undo the change that starts on this day (moves a planned rate). */
  move_from?: string;
}

export interface UndoRateChangeInput {
  itemId: string;
  customerId: string | null;
  priceType: PriceType;
  /** The day the change to undo starts (a stop's last day plus one). */
  startsOn: string;
}

export interface UndoRateChangeResult {
  success: boolean;
  errorCode?: RateErrorCode;
  /** Text for the screen, in the app's language, already mapped. */
  message?: string;
  removed?: { id: string; effective_from: string }[];
  reopened?: { id: string; effective_from: string; effective_to: string | null }[];
}

export interface ReplaceRatesResult {
  success: boolean;
  errorCode?: RateErrorCode;
  /** Text for the screen, in the app's language, already mapped. */
  message?: string;
  /** INVALID_BAND / INVALID_AMOUNT: which band and field the server named. */
  bandIndex?: number;
  field?: 'unit_price' | 'labour_rate' | 'tax_percent';
  /** LATER_RATES_EXIST: the later rates the server found. */
  later?: { effective_from: string; weight_min: number; weight_max: number; unit_price: number }[];
  /** Success: the last day the server kept for the new rates (a scheduled stop); null when it kept none; absent when it did not say. */
  keptEnd?: string | null;
  /** Failure: the answer never came (timeout, lost connection), so the change may have been saved. */
  outcomeUnknown?: boolean;
  /** Success: as returned. */
  ended?: { id: string; effective_from: string; effective_to: string }[];
  added?: { id: string; weight_min: number; weight_max: number; unit_price: number; labour_rate: number; tax_percent: number }[];
}

export interface ItemPriceHistoryParams {
  limit?: number;
  offset?: number;
  itemId?: string;
  customerId?: string;
}

/** An active item as the rate list shows it (items table: id, name, packaging). */
export interface ActiveItem {
  id: string;
  name: string;
  packaging: string | null;
}
