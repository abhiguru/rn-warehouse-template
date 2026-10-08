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
}

/**
 * Item list response with pagination
 */
export interface ItemListResponse {
  success: boolean;
  message: string;
  data: ItemListItem[];
  pagination?: ItemPagination;
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
  references?: {
    grn_count: number;
    dispatch_count: number;
    invoice_count: number;
  };
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * Item form mode
 */
export type ItemFormMode = 'create' | 'edit';
