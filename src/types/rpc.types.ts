/**
 * RPC Response Types (Legacy)
 *
 * @deprecated This file contains legacy types with dual camelCase/snake_case support.
 * For new code, use types from rpc-canonical.types.ts which use snake_case only.
 *
 * Type definitions for raw Supabase RPC responses.
 * These types represent the exact shape of data returned from backend RPC functions.
 * They include both camelCase and snake_case field variants for backward compatibility
 * during the migration period.
 *
 * Migration Guide:
 * - Use RpcGrnListItem from rpc-canonical.types.ts instead of RpcGrnListItem here
 * - Use RpcDispatchListItem from rpc-canonical.types.ts instead of RpcDispatchListItem here
 * - Use RpcPagination from rpc-canonical.types.ts instead of RpcPaginatedResponse here
 *
 * Usage: Import these types in service files to replace `any` types.
 */

// ============================================================================
// Common/Shared Types
// ============================================================================

/**
 * User details returned in RPC responses (createdBy, updatedBy, etc.)
 */
export interface RpcUserDetails {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

/**
 * Customer details from RPC responses
 */
export interface RpcCustomerDetails {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Sender details from RPC responses
 */
export interface RpcSenderDetails {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Supervisor details from RPC responses
 */
export interface RpcSupervisorDetails {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

// ============================================================================
// Image Types
// ============================================================================

/**
 * Raw image data from RPC responses (before signed URL processing)
 */
export interface RpcRawImage {
  id: string;
  imageUrl?: string;
  image_url?: string;
  storagePath?: string;
  storage_path?: string;
  originalFilename?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
  uploadedAt?: string;
  imageType?: 'header' | 'item';
  grnItemId?: string;
  itemId?: string;
}

// ============================================================================
// Item Types
// ============================================================================

/**
 * Item (product) details from RPC responses
 * Used in itemDetails fields across GRN, Dispatch, Order services
 */
export interface RpcItemDetails {
  id: string;
  name: string;
  item_name?: string;
  code?: string;
  unit?: string;
  category?: string;
  description?: string;
}

/**
 * GRN Item details used in change logs and dispatch items
 */
export interface RpcGrnItemDetails {
  id: string;
  grn_no: string;
  item_name: string;
  grn_qty?: number;
  original_quantity?: number;
  qty?: number;
  stock?: number;
  weight?: number;
  packaging?: string;
  rack?: string;
  package_mark?: string;
  chamber?: string;
}

// ============================================================================
// GRN Types
// ============================================================================

/**
 * GRN details from RPC responses (used in dispatch items, invoices)
 */
export interface RpcGrnDetails {
  id: string;
  grNo: string;
  gr_no?: string;
  number?: string;
  date: string;
  registration?: string;
  customerName?: string;
  customer_name?: string;
  supervisor_name?: string;
  note?: string;
}

/**
 * Raw GRN item from get_grn_details RPC
 */
export interface RpcGrnItem {
  id: string;
  itemName: string;
  item_name?: string;
  qty: number;
  stock: number;
  weight?: number;
  packaging?: string;
  rack?: string;
  chamber?: string;
  packageMark?: string;
  package_mark?: string;
  itemDetails?: RpcItemDetails;
  itemImages?: RpcRawImage[];
  item_images?: RpcRawImage[];
  images?: RpcRawImage[]; // Processed images added after fetch
  dispatchSummary?: {
    totalDispatched: number;
    dispatchCount: number;
  };
}

/**
 * Raw GRN data from get_grn_details RPC
 */
export interface RpcGrnData {
  id: string;
  grNo: string;
  gr_no?: string;
  date: string;
  registration?: string;
  note?: string;
  pricingMode?: string;
  pricing_mode?: string;
  isActive?: boolean;
  is_active?: boolean;
  isDeleted?: boolean;
  is_deleted?: boolean;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
  customerDetails?: RpcCustomerDetails;
  customer_details?: RpcCustomerDetails;
  supervisorDetails?: RpcSupervisorDetails;
  supervisor_details?: RpcSupervisorDetails;
  senderDetails?: RpcSenderDetails;
  sender_details?: RpcSenderDetails;
  createdBy?: RpcUserDetails;
  created_by?: RpcUserDetails;
  updatedBy?: RpcUserDetails;
  updated_by?: RpcUserDetails;
  items?: RpcGrnItem[];
  headerImages?: RpcRawImage[];
  header_images?: RpcRawImage[];
  statistics?: {
    totalItems: number;
    totalQty: number;
    totalStock: number;
    totalDispatched: number;
    totalWeight: number;
    hasOutOfStock?: boolean;
  };
  invoicesSummary?: {
    totalInvoices: number;
    totalAmount: number;
    totalWithTax: number;
    invoiceNumbers: string[];
  };
  dispatchesSummary?: {
    totalDispatches: number;
    dispatchNumbers: string[];
  };
}

// ============================================================================
// Dispatch Types
// ============================================================================

/**
 * Invoice details from dispatch items
 */
export interface RpcInvoiceDetails {
  id: string;
  invoiceNo: string;
  invoice_no?: string;
  invoiceNumber?: number;
  invoice_number?: number;
  date?: string;
  amount?: number;
  totalAmount?: number;
  total_amount?: number;
}

/**
 * Raw dispatch item from RPC
 */
export interface RpcDispatchItem {
  id: string;
  dispQty: number;
  disp_qty?: number;
  grnId: string;
  grn_id?: string;
  grnItemId: string;
  grn_item_id?: string;
  grnItemDetails?: RpcGrnItemDetails;
  grn_item_details?: RpcGrnItemDetails;
  grnDetails?: RpcGrnDetails;
  grn_details?: RpcGrnDetails;
  itemDetails?: RpcItemDetails;
  item_details?: RpcItemDetails;
  invoiceDetails?: RpcInvoiceDetails;
  invoice_details?: RpcInvoiceDetails;
}

/**
 * Raw dispatch data from get_dispatch_details RPC
 */
export interface RpcDispatchData {
  id: string;
  dispNo: string;
  disp_no?: string;
  dispDate: string;
  disp_date?: string;
  registration?: string;
  note?: string;
  dispImageUrl?: string;
  disp_image_url?: string;
  sourceOrderId?: string;
  source_order_id?: string;
  sourceOrderNo?: string;
  source_order_no?: string;
  customerDetails?: RpcCustomerDetails;
  customer_details?: RpcCustomerDetails;
  supervisorDetails?: RpcSupervisorDetails;
  supervisor_details?: RpcSupervisorDetails;
  items?: RpcDispatchItem[];
  images?: RpcRawImage[];
  statistics?: {
    totalItems: number;
    totalDispatchedQty: number;
    uniqueGRNs: number;
    totalInvoicedItems: number;
    totalInvoiceAmount: number;
    avgDuration: number;
    avgNoOfDays: number;
  };
  grnsSummary?: {
    totalGRNs: number;
    grnNumbers: string[];
  };
  invoicesSummary?: {
    totalInvoices: number;
    totalAmount: number;
    invoiceNumbers: number[];
  };
}

// ============================================================================
// Order Types
// ============================================================================

/**
 * Raw order item from RPC
 */
export interface RpcOrderItem {
  id: string;
  itemId: string;
  item_id?: string;
  itemName: string;
  item_name?: string;
  qty: number;
  weight?: number;
  packaging?: string;
  rack?: string;
  chamber?: string;
  note?: string;
  status?: string;
}

/**
 * Raw order data from RPC
 */
export interface RpcOrderData {
  id: string;
  orderNo: string;
  order_no?: string;
  orderDate: string;
  order_date?: string;
  registration?: string;
  note?: string;
  status?: string;
  customerDetails?: RpcCustomerDetails;
  customer_details?: RpcCustomerDetails;
  items?: RpcOrderItem[];
}

/**
 * Raw order list item from get_orders_list RPC
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
  created_at: string;
  updated_at: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_by_display_name?: string;
}

/**
 * Raw order item detail from get_order_details RPC
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
 * Raw GRN item from enhanced search RPC
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
 * Search response metadata from RPC
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

// ============================================================================
// Invoice Types
// ============================================================================

/**
 * Raw invoice item from RPC
 */
export interface RpcInvoiceItem {
  id: string;
  invoiceId: string;
  invoice_id?: string;
  grnItemId?: string;
  grn_item_id?: string;
  dispatchItemId?: string;
  dispatch_item_id?: string;
  itemName: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
  charge?: number;
  totalAmount?: number;
  total_amount?: number;
  dispatchQty?: number;
  dispatch_qty?: number;
}

/**
 * Raw invoice item from get_invoice_items RPC (detailed)
 */
export interface RpcInvoiceItemRaw {
  id?: string;
  item_id?: string;
  duration?: string | number;
  no_of_days?: number;
  noOfDays?: number;
  charge?: number;
  total_charge?: number;
  total_amount?: number;
  tax?: number;
  tax_amount?: number;
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

/**
 * Raw GRN list item from get_grns RPC
 */
export interface RpcGrnListItem {
  id: string;
  grnId?: string;
  grn_item_id?: string;
  grnItemId?: string;
  gr_no?: string;
  grNo?: string;
  date?: string;
  customer_name?: string;
  customerName?: string;
  status?: string;
  total_items?: number;
  total_qty?: number;
  [key: string]: unknown; // Allow additional fields from RPC
}

/**
 * Raw dispatch list item from RPC
 */
export interface RpcDispatchListItem {
  id: string;
  disp_no?: string;
  dispNo?: string;
  disp_date?: string;
  dispDate?: string;
  customer_name?: string;
  customerName?: string;
  registration?: string;
  items?: unknown[];
  total_items?: number;
  status?: string;
}

// ============================================================================
// Change Log Types
// ============================================================================

/**
 * Raw change log entry from RPC
 */
export interface RpcChangeLogEntry {
  id: string;
  entityType: string;
  entity_type?: string;
  entityId: string;
  entity_id?: string;
  changeCategory: string;
  change_category?: string;
  changeType: string;
  change_type?: string;
  fieldName?: string;
  field_name?: string;
  oldValue?: string | number | null;
  old_value?: string | number | null;
  newValue?: string | number | null;
  new_value?: string | number | null;
  changedBy?: RpcUserDetails;
  changed_by?: RpcUserDetails;
  changedAt: string;
  changed_at?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Customer list item from RPC
 */
export interface RpcCustomerListItem {
  id: string;
  name: string;
  mobile?: string;
  city?: string;
  email?: string;
  address?: string;
}

/**
 * Customer search result from RPC
 */
export interface RpcCustomerSearchResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Item search result from RPC
 */
export interface RpcItemSearchResult {
  id: string;
  name: string;
  code?: string;
  unit?: string;
  category?: string;
}

/**
 * GRN search result from RPC
 */
export interface RpcGrnSearchResult {
  id: string;
  grNo: string;
  gr_no?: string;
  date: string;
  customerName?: string;
  customer_name?: string;
  status?: string;
}

/**
 * Dispatch search result from RPC
 */
export interface RpcDispatchSearchResult {
  id: string;
  dispNo: string;
  disp_no?: string;
  date: string;
  customerName?: string;
  customer_name?: string;
  status?: string;
}

// ============================================================================
// Generic RPC Response Wrapper
// ============================================================================

/**
 * Standard RPC response wrapper
 */
export interface RpcResponse<T> {
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: string;
  };
}

/**
 * Paginated RPC response
 */
export interface RpcPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
