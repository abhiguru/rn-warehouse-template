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
