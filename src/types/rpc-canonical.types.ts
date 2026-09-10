/**
 * RPC Canonical Types
 *
 * Canonical TypeScript types matching the RPC_DOCUMENTATION.md exactly.
 * All types use snake_case field names as returned by the backend.
 *
 * Source: docs/RPC_DOCUMENTATION.md
 * Last Updated: 2025-12-30
 */

// ============================================================================
// Standard Response Format
// ============================================================================

/**
 * Standard RPC response wrapper for all endpoints
 */
export interface RpcResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  error?: RpcError;
}

/**
 * RPC error details
 */
export interface RpcError {
  code: string;
  details?: string;
  field?: string;
}

/**
 * Standard error codes
 */
export type RpcErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'DUPLICATE_ENTRY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DATABASE_ERROR'
  | 'GRN_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'DISPATCH_NOT_FOUND'
  | 'INVOICE_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'DUPLICATE_MOBILE'
  | 'STOCK_INSUFFICIENT'
  | 'OTP_EXPIRED'
  | 'OTP_INVALID'
  | 'OTP_MAX_ATTEMPTS';

// ============================================================================
// Pagination
// ============================================================================

/**
 * Pagination info returned with list responses
 * Single source of truth - replaces all duplicate pagination types
 */
export interface RpcPagination {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Paginated list response wrapper
 */
export interface RpcPaginatedResponse<T> extends RpcResponse<T[]> {
  pagination: RpcPagination;
}

// ============================================================================
// Shared Schemas
// ============================================================================

/**
 * Customer details embedded in RPC responses
 * Source: RPC_DOCUMENTATION.md - CustomerDetails schema
 */
export interface RpcCustomerDetails {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst: string | null;
  active: boolean;
  auto_invoice_generation: boolean | null;
}

/**
 * Supervisor details embedded in RPC responses
 * Source: RPC_DOCUMENTATION.md - SupervisorDetails schema
 */
export interface RpcSupervisorDetails {
  id: string;
  name: string;
  mobile: string | null;
  role: 'admin' | 'supervisor' | 'staff';
  display_name: string | null;
}

/**
 * Sender details (similar structure to supervisor)
 */
export interface RpcSenderDetails {
  id: string;
  name: string;
  mobile: string | null;
}

/**
 * Image info embedded in RPC responses
 * Source: RPC_DOCUMENTATION.md - ImageInfo schema
 */
export interface RpcImageInfo {
  id: string;
  storage_path: string;
  image_url: string;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  display_order: number | null;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * GRN item details embedded in RPC responses
 * Source: RPC_DOCUMENTATION.md - GRNItemDetails schema
 */
export interface RpcGrnItemDetails {
  id: string;
  qty: number;
  stock: number;
  weight: number | null;
  rack: string | null;
  package_mark: string | null;
  item_name: string;
  packaging: string | null;
  pricing_mode: 'monthly' | 'one_time' | null;
  trl_img_url: string | null;
}

/**
 * Item catalog details embedded in RPC responses
 * Source: RPC_DOCUMENTATION.md - ItemDetails schema
 */
export interface RpcItemDetails {
  id: string;
  name: string;
  packaging: string | null;
  description: string | null;
  active: boolean;
}

/**
 * User details embedded in RPC responses
 */
export interface RpcUserDetails {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: 'admin' | 'supervisor' | 'staff' | 'customer';
}

// ============================================================================
// GRN Types
// ============================================================================

/**
 * GRN list item from get_grn_list RPC (summary view)
 * Source: RPC_DOCUMENTATION.md - GRNListItem schema
 */
export interface RpcGrnListItem {
  id: string;
  gr_no: string;
  date: string; // ISO 8601 date
  customer_id: string;
  customer_name: string;
  supervisor_name: string | null;
  registration: string | null;
  note: string | null;
  invoiced: boolean;
  out_of_stock: boolean;
  leon: boolean;
  pricing_mode: 'monthly' | 'one_time' | null;
  item_count: number;
  total_qty: number;
  total_stock: number;
  total_weight: number | null;
  has_images: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GRN item from get_all_grn_items RPC (item-level view)
 * This is the individual item-level data returned by get_all_grn_items
 * Includes both GRN header fields and item-specific fields
 */
export interface RpcGrnItemRow {
  // GRN header identification
  id: string;
  grn_id?: string;
  grn_item_id?: string;
  gr_no: string;
  date: string;

  // Customer info
  customer_id: string;
  customer_name: string;

  // Supervisor/Sender info
  supervisor_id?: string;
  supervisor_name: string | null;

  // Vehicle info
  registration: string | null;

  // Item-specific fields
  item_id?: string;
  item_name: string;
  packaging: string | null;
  qty: number;
  stock: number;
  weight: number | null;
  rack: string | null;
  package_mark: string | null;

  // Status flags
  invoiced?: boolean;
  out_of_stock?: boolean;
  leon?: boolean;
  pricing_mode?: 'monthly' | 'one_time' | null;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * GRN statistics object
 */
export interface RpcGrnStatistics {
  total_items: number;
  total_qty: number;
  total_stock: number;
  total_weight: number | null;
  total_dispatched: number;
  has_out_of_stock: boolean;
}

/**
 * GRN invoices summary object
 */
export interface RpcGrnInvoicesSummary {
  total_invoices: number;
  total_amount: number;
  invoice_numbers: string[];
}

/**
 * GRN dispatches summary object
 */
export interface RpcGrnDispatchesSummary {
  total_dispatches: number;
  dispatch_numbers: string[];
}

/**
 * GRN item with full details from get_grn_details
 */
export interface RpcGrnItemFull extends RpcGrnItemDetails {
  item_images: RpcImageInfo[];
  item_details: RpcItemDetails | null;
}

/**
 * Full GRN details from get_grn_details RPC
 * Source: RPC_DOCUMENTATION.md - GRNDetails schema
 */
export interface RpcGrnDetails {
  id: string;
  gr_no: string;
  date: string; // ISO 8601 timestamptz
  registration: string | null;
  note: string | null;
  gr_image_url: string | null;
  invoiced: boolean;
  leon: boolean;
  out_of_stock: boolean;
  pricing_mode: 'monthly' | 'one_time' | null;
  created_at: string;
  updated_at: string;
  header_images: RpcImageInfo[];
  customer_details: RpcCustomerDetails | null;
  supervisor_details: RpcSupervisorDetails | null;
  sender_details: RpcSenderDetails | null;
  items: RpcGrnItemFull[];
  statistics: RpcGrnStatistics;
  invoices_summary: RpcGrnInvoicesSummary;
  dispatches_summary: RpcGrnDispatchesSummary;
}

/**
 * Item mapping in save_grn response
 */
export interface RpcItemMapping {
  temp_id: string;
  db_id: string;
}

/**
 * save_grn RPC response data
 * Source: RPC_DOCUMENTATION.md - SaveGRNResponse schema
 */
export interface RpcSaveGrnResponseData {
  grn_id: string;
  gr_no: string;
  items_created: number;
  images_saved: number;
  item_ids: string[];
  item_mapping: RpcItemMapping[];
}

/**
 * GRN existence check response
 */
export interface RpcGrnExistsData {
  exists: boolean;
  grn_id?: string;
  customer_name?: string;
  date?: string;
}

/**
 * GRN activity item
 */
export interface RpcGrnActivityItem {
  grn_id: string;
  gr_no: string;
  date: string;
  customer_name: string;
  total_qty: number;
  current_stock: number;
  invoiced: boolean;
  dispatch_count: number;
  image_count: number;
}

/**
 * GRN activity response data
 */
export interface RpcGrnActivityData {
  items: RpcGrnActivityItem[];
  total_grns: number;
  total_qty: number;
  total_stock: number;
}

/**
 * GRN prefix with stock count
 */
export interface RpcGrnPrefixItem {
  prefix: string;
  grn_count: number;
}

// ============================================================================
// Dispatch Types
// ============================================================================

/**
 * Stock update info in dispatch response
 */
export interface RpcStockUpdate {
  gr_trl_id: string;
  old_stock: number;
  new_stock: number;
}

/**
 * Create dispatch response data
 * Source: RPC_DOCUMENTATION.md - CreateDispatchResponse schema
 */
export interface RpcCreateDispatchResponseData {
  dispatch_id: string;
  disp_no: string;
  items_created: number;
  total_qty: number;
  stock_updates: RpcStockUpdate[];
  invoice_generated: boolean;
  invoice_id: string | null;
}

/**
 * Dispatch list item from get_dispatch_list RPC
 * Source: RPC_DOCUMENTATION.md - DispatchListItem schema
 */
export interface RpcDispatchListItem {
  id: string;
  dispatch_id: string;
  disp_no: string;
  disp_date: string; // ISO 8601 timestamptz
  customer_id: string;
  customer_name: string;
  supervisor_id: string | null;
  supervisor_name: string | null;
  registration: string | null;
  note: string | null;
  total_items: number;
  total_qty: number;
  total_weight: number | null;
  unique_grns: number;
  grn_numbers: string[];
  items: unknown[]; // jsonb array of items
  source_order_id: string | null;
  source_order_no: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Dispatch item details in dispatch details response
 */
export interface RpcDispatchItemDetails {
  id: string;
  disp_qty: number;
  grn_id: string;
  grn_item_id: string;
  grn_item_details: {
    id: string;
    qty: number;
    stock: number;
    item_name: string;
    packaging: string | null;
  } | null;
  grn_details: {
    id: string;
    gr_no: string;
    date: string;
  } | null;
  item_details: RpcItemDetails | null;
  invoice_details: {
    id: string;
    invoice_no: string;
    invoice_number: number;
  } | null;
}

/**
 * Dispatch statistics
 */
export interface RpcDispatchStatistics {
  total_items: number;
  total_dispatched_qty: number;
  unique_grns: number;
  total_invoiced_items?: number;
  total_invoice_amount?: number;
}

/**
 * Dispatch GRN summary
 */
export interface RpcDispatchGrnsSummary {
  total_grns: number;
  grn_numbers: string[];
}

/**
 * Dispatch invoices summary
 */
export interface RpcDispatchInvoicesSummary {
  total_invoices: number;
  total_amount: number;
  invoice_numbers?: number[];
}

/**
 * Full dispatch details from get_dispatch_details RPC
 * Source: RPC_DOCUMENTATION.md - DispatchDetails schema
 */
export interface RpcDispatchDetails {
  id: string;
  disp_no: string;
  disp_date: string; // ISO 8601 timestamptz
  registration: string | null;
  note: string | null;
  disp_image_url: string | null;
  source_order_id: string | null;
  source_order_no: string | null;
  created_at: string;
  updated_at: string;
  images: RpcImageInfo[];
  customer_details: RpcCustomerDetails | null;
  supervisor_details: RpcSupervisorDetails | null;
  items: RpcDispatchItemDetails[];
  statistics: RpcDispatchStatistics;
  grns_summary: RpcDispatchGrnsSummary;
  invoices_summary: RpcDispatchInvoicesSummary;
}

/**
 * Delete dispatch response data
 */
export interface RpcDeleteDispatchResponseData {
  dispatch_no: string;
  items_restored: number;
  total_qty_restored: number;
  restored_items: Array<{
    gr_trl_id: string;
    restored_qty: number;
    new_stock: number;
  }>;
}

/**
 * Vehicle suggestion item
 */
export interface RpcVehicleSuggestion {
  registration: string;
  usage_count: number;
}

// ============================================================================
// Type Aliases for Common Response Patterns
// ============================================================================

/** GRN list response */
export type RpcGrnListResponse = RpcPaginatedResponse<RpcGrnListItem>;

/** GRN details response */
export type RpcGrnDetailsResponse = RpcResponse<{ grn: RpcGrnDetails }>;

/** Save GRN response */
export type RpcSaveGrnResponse = RpcResponse<RpcSaveGrnResponseData>;

/** GRN exists response */
export type RpcGrnExistsResponse = RpcResponse<RpcGrnExistsData>;

/** GRN activity response */
export type RpcGrnActivityResponse = RpcResponse<RpcGrnActivityData>;

/** GRN prefixes response */
export type RpcGrnPrefixesResponse = RpcResponse<RpcGrnPrefixItem[]>;

/** Dispatch list response */
export type RpcDispatchListResponse = RpcPaginatedResponse<RpcDispatchListItem>;

/** Dispatch details response */
export type RpcDispatchDetailsResponse = RpcResponse<{ dispatch: RpcDispatchDetails }>;

/** Create dispatch response */
export type RpcCreateDispatchResponse = RpcResponse<RpcCreateDispatchResponseData>;

/** Delete dispatch response */
export type RpcDeleteDispatchResponse = RpcResponse<RpcDeleteDispatchResponseData>;

/** Vehicle suggestions response */
export type RpcVehicleSuggestionsResponse = RpcResponse<{ suggestions: RpcVehicleSuggestion[] }>;

// ============================================================================
// Order Types
// ============================================================================

/**
 * Order list item from get_orders_list RPC
 * Source: RPC_DOCUMENTATION.md
 */
export interface RpcOrderListItem {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  status: string;
  total_items?: number;
  total_quantity?: number;
  item_count?: number;
  quantity_sum?: number;
  created_at: string;
  updated_at: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_by_display_name?: string;
}

/**
 * Order item detail from get_order_details RPC
 */
export interface RpcOrderItemDetail {
  id: string;
  order_id: string;
  grn_items_id: string;
  requested_quantity: number;
  fulfilled_quantity?: number;
  item_status: string;
  created_at: string;
  updated_at: string;
  grn_items_item_name: string;
  grn_items_packaging?: string;
  grn_items_package_mark?: string;
  grn_items_qty?: number;
  grn_items_rack?: string;
  grn_items_weight?: number;
  grn_items_image_url?: string;
  current_stock?: number;
  grns_id: string;
  grns_gr_no: string;
  grns_date: string;
}

/**
 * Enhanced GRN item from search RPC
 */
export interface RpcEnhancedGrnItem {
  id?: string;
  grn_item_id: string;
  item_name: string;
  stock: number;
  qty: number;
  packaging?: string;
  package_mark?: string;
  rack?: string;
  weight?: number;
  image_url?: string;
  grn_id: string;
  gr_no?: string;
  date?: string;
  grn_date?: string;
  customer_id?: string;
  customer_name?: string;
  // Enhanced search fields
  grns_id?: string;
  grns_gr_no?: string;
  grns_date?: string;
  grns_customer_name?: string;
  grns_registration?: string;
  grns_supervisor_name?: string;
  grns_sender_name?: string;
  grns_invoiced?: boolean;
  grns_leon?: boolean;
  grns_out_of_stock?: boolean;
  grns_note?: string;
  grns_image_url?: string;
  search_match_type?: 'name' | 'weight' | 'package_mark' | 'combined' | string;
  total_count?: number;
  grn_details?: {
    gr_no: string;
    date: string;
  };
  customer?: {
    id: string;
    name: string;
  };
}

/**
 * Search metadata from RPC
 */
export interface RpcSearchMetadata {
  total_count: number;
  has_more: boolean;
  search_type_detected?: string;
  pagination?: {
    page: number;
    page_size: number;
    total_pages: number;
  };
}
