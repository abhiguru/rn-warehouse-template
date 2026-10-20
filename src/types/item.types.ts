/**
 * Item Types
 *
 * Type definitions for item master management feature.
 * Used across item list, create/edit forms, and service layer.
 */

// =============================================================================
// ENTITY TYPES
// =============================================================================

/**
 * Full item entity (matches database schema)
 */
export interface Item {
  id: string;
  name: string;
  packaging?: string;
  description?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Which rate a new item got (backend migration 85, create_item): the standard rate, a copy of another item's, or none. */
export type ItemRateSource = 'standard' | 'copied' | 'none';

/** An item as create_item answers: the item and which rate it got (absent from a server without migration 85). */
export type CreatedItem = Item & { rate_source?: ItemRateSource };

/**
 * Item list item (lightweight for list views)
 */
export interface ItemListItem {
  id: string;
  name: string;
  packaging?: string;
  description?: string;
  active: boolean;
}

// =============================================================================
// FORM TYPES
// =============================================================================

/**
 * Form data structure for create/edit item
 */
export interface ItemFormData {
  name: string;
  packaging: string;
  description: string;
  active: boolean;
}

/**
 * Initial form data (empty values)
 */
export const INITIAL_ITEM_FORM_DATA: ItemFormData = {
  name: '',
  packaging: '',
  description: '',
  active: true,
};

// =============================================================================
// VALIDATION ERROR TYPES
// =============================================================================

/**
 * Validation errors by field
 */
export interface ItemValidationErrors {
  name?: string;
  packaging?: string;
  description?: string;
}

// =============================================================================
// SERVICE RESPONSE TYPES
// =============================================================================

/**
 * Generic service response
 */
export interface ItemServiceResponse<T = Item> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  /** The failure's code (Postgres, PostgREST or the server's own), before any translation. */
  code?: string;
  /** update_item: 'standard' when activating gave the item the standard rate (backend Items screens 2026-10-20). */
  rateSource?: string;
}

/**
 * Item list response with pagination
 */
export interface ItemListResponse {
  success: boolean;
  message: string;
  data: ItemListItem[];
  pagination?: ItemPagination;
  /** The failure's code, as in ItemServiceResponse. */
  code?: string;
  error?: string;
}

/**
 * Pagination info
 */
export interface ItemPagination {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// =============================================================================
// FILTER TYPES
// =============================================================================

/**
 * Filter options for item list
 */
export interface ItemFilters {
  search?: string;
  active?: boolean | null; // null = all, true = active only, false = inactive only
  /** Only the active items with no default rate in force today (a manager's filter, worked out on the phone from the rates). */
  noRate?: boolean;
  sortBy?: ItemSortField;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Sortable fields
 */
export type ItemSortField = 'name' | 'created_at' | 'packaging';

/**
 * Default filter values
 */
export const DEFAULT_ITEM_FILTERS: ItemFilters = {
  search: '',
  active: null, // Show all items (active + inactive) so admins can reactivate
  noRate: false,
  sortBy: 'name',
  sortOrder: 'asc',
};

// =============================================================================
// RPC REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Create item RPC request parameters
 */
export interface CreateItemParams {
  p_name: string;
  p_packaging?: string;
  p_description?: string;
  p_active?: boolean;
  /** Copy the default rates in force today of this item (backend migration 85); omitted: the standard rate. */
  p_rate_from_item?: string;
}

/**
 * Update item RPC request parameters
 */
export interface UpdateItemParams {
  p_item_id: string;
  p_name: string;
  p_packaging?: string;
  p_description?: string;
  p_active?: boolean;
}

/**
 * Get items list RPC request parameters
 */
export interface GetItemsParams {
  p_search_query?: string;
  p_active_only?: boolean;
  p_limit?: number;
  p_offset?: number;
}

/**
 * Delete item response with reference info
 */
export interface DeleteItemResponse {
  success: boolean;
  message: string;
  /** The server's error_code on a refusal (NOT_FOUND when the item no longer exists). */
  code?: string;
  /** The server's own text on a refusal, before translation (an older server has no code, only text). */
  serverMessage?: string;
  references?: {
    /** Where the server found the item (delete_item_safe): GRN lines, order lines and prices. */
    grn_items_count: number;
    order_items_count: number;
    /** Rates set on single GRNs (grn_rates); the server also refuses on these. */
    grn_rates_count?: number;
    pricing_count: number;
  };
}

/** Where an item is used (get_item_usage, administrators and supervisors). */
export interface ItemUsage {
  item_id: string;
  name: string;
  active: boolean;
  grn_lines: number;
  order_lines: number;
  /** Rates set on single GRNs. */
  grn_rates: number;
  price_rows: number;
  /** The item's rates as the Item pricing screens count them. */
  rate_count: number;
  in_use: boolean;
  can_delete: boolean;
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * Item form mode
 */
export type ItemFormMode = 'create' | 'edit';
