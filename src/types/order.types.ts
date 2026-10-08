// Order System Type Definitions
// Using "Order" terminology in frontend while mapping to "cart" in backend

export interface Customer {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  mobile?: string;
  email?: string;
  gst?: string;
  pan?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Catalog {
  id: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface GRNItem {
  id: string;
  name: string;
  packaging: string;
  package_mark?: string;
  current_stock: number;
  original_quantity: number;
  catalog_id?: string | null;
  catalog?: Catalog;
  rack?: string;
  weight?: number;
  gr_id: string;
  grn_number?: string;
  grn_date?: string;
  image_url?: string;
  pricing_mode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;  // Maps to backend cart_id
  grn_item_id: string;
  grn_item?: GRNItem;
  requested_quantity: number;
  dispatched_quantity?: number;
  fulfilled_quantity?: number;
  item_status?: string;  // 'pending' | 'fulfilled' | 'partial' etc.
  created_at: string;
  updated_at?: string;
}

export interface Order {
  id: string;  // Maps to backend cart_id
  customer_id: string;
  customer?: Customer;
  items?: OrderItem[];
  note?: string;
  status?: string;  // Order status: 'PENDING', 'DISPATCHED', etc.
  created_at: string;
  updated_at?: string;
  updated_by?: string;  // User ID who last updated the order
  updated_by_name?: string;  // Real name of the person who last updated the order
  updated_by_display_name?: string;  // Display name of the person who last updated the order
  // Computed fields (from different RPC endpoints - use both for compatibility)
  total_items?: number;  // Legacy field name
  total_quantity?: number;  // Legacy field name
  item_count?: number;  // From get_orders_list (MV-backed)
  quantity_sum?: number;  // From get_orders_list (MV-backed)
}

export interface Dispatch {
  dispatch_id: string;
  dispatch_no: string;
  dispatch_date: string;
  customer_id?: string;
  customer?: Customer;
  items?: DispatchItem[];
  total_quantity: number;
  created_at?: string;
}

export interface DispatchItem {
  id: string;
  dispatch_id: string;
  grn_item_id: string;
  grn_item?: GRNItem;
  quantity: number;
  created_at?: string;
}

// Service Response Types
export interface OrderServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  metadata?: {
    total_count?: number;
    current_count?: number;
    has_more?: boolean;
  };
}

export interface GetOrCreateOrderResponse {
  cart_id: string;  // Maps to order.id
  is_new: boolean;
}

export interface AddToOrderResponse {
  success: boolean;
  message: string;
  new_quantity: number;
  item_id: string;
}

export interface CreateDispatchResponse {
  success: boolean;
  dispatch_id: string;
  dispatch_no: string;
  message: string;
  items_dispatched: number;
  items_remaining: number;
}

export interface OrderSummary {
  item_count: number;
  total_quantity: number;
}

// Filter types
export interface OrderFilters {
  customer_id?: string;
  customer_name?: string;
  has_items?: boolean;
  date_from?: Date;
  date_to?: Date;
}

export interface ItemFilters {
  in_stock_only?: boolean;
  catalog_id?: string;
  search?: string;
  grn_id?: string;
}

// Enhanced search interfaces
export interface EnhancedSearchFilters {
  customer_id: string;
  search_query?: string;
  search_type?: 'auto' | 'weight' | 'text';
  weight_min?: number;
  weight_max?: number;
  page_size?: number;
  offset?: number;
  stock_filter_min?: number;
  catalog_id?: string;
}

export interface SearchMetadata {
  search_type: 'weight' | 'text' | 'weight_range';
  match_type: 'weight' | 'name' | 'package_mark' | 'combined';
  total_count: number;
  current_count: number;
  has_more: boolean;
}

export interface EnhancedGRNItem extends GRNItem {
  // Additional customer context fields
  customer_id?: string;
  customer_name?: string;
  
  // Additional fields from enhanced search
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
  search_match_type?: 'weight' | 'name' | 'package_mark' | 'combined';
}

// Customer dispatch types
export interface CustomerDispatchItem {
  id: string;
  dispatch_id: string;
  disp_quantity: number;
  disp_date: string;
  disp_no: string;
  registration?: string;
  note?: string;
  image_url?: string;

  // GRN Information
  grns_id: string;
  grns_gr_no: string;
  grns_customer_id: string;
  grns_customer_name: string;
  grns_date: string;
  grns_registration?: string;
  grns_sender_name?: string;
  grns_supervisor_name?: string;
  grns_note?: string;
  grns_leon?: boolean;
  grns_out_of_stock?: boolean;
  grns_invoiced?: boolean;

  // Item Information
  grnItems_id: string;
  grnItems_item_id: string;
  grnItems_item_name: string;
  grnItems_packaging?: string;
  grnItems_quantity: number;
  grnItems_stock: number;
  grnItems_weight?: number;
  grnItems_rack?: string;
  grnItems_package_mark?: string;
}

export interface CustomerDispatchAggregations {
  total_initial_qty: number;
  total_dispatch_qty: number;
  total_weight: number;
  total_count: number;
}

export interface CustomerDispatchPagination {
  total_count: number;
  has_more: boolean;
}

export interface CustomerDispatchResponse {
  items: CustomerDispatchItem[];
  pagination: CustomerDispatchPagination;
  aggregations: CustomerDispatchAggregations;
}

export interface CustomerSummary {
  id: string;
  name: string;
  mobile?: string;
  active_order_id?: string;
  total_active_items: number;
  total_active_quantity: number;
  last_activity_at: string;
  last_updated_by?: string;
}

export interface ChangeLogEntry {
  change_id: string;
  change_category: 'item_level' | 'order_level' | 'dispatch_level';
  change_type: string;
  order_id: string;
  order_no?: string;
  customer_name?: string;
  item_name?: string;
  grn_no?: string;
  package_mark?: string;
  change_details: {
    action: string;
    item_details?: {
      item_name: string;
      grn_no: string;
      package_mark?: string;
      rack?: string;
      weight?: number;
      packaging?: string;
      grn_quantity?: number;
      grn_qty?: number;
      original_quantity?: number;
      qty?: number;
    };
    quantity_change?: {
      previous_quantity: number;
      new_quantity: number;
      change_amount: number;
    };
    stock_info?: {
      available_stock: number;
      stock_at_time: number;
    };
    reason?: string;
    [key: string]: any;
  };
  change_timestamp: string;
  changed_by_name: string;
  changed_by_display_name?: string;
  relative_time: string;
  formatted_timestamp?: string;
  is_recent?: boolean;
}

export interface ChangeLogAnalytics {
  total_changes: number;
  breakdown: {
    item_changes: number;
    order_changes: number;
    dispatch_changes: number;
  };
  change_types: {
    quantity_updates: number;
    item_additions: number;
    item_removals: number;
  };
  activity_summary: {
    unique_editors: number;
    first_change: string;
    last_change: string;
    recent_changes_24h: number;
  };
}

export interface ChangeLogPagination {
  total_count: number;
  has_more: boolean;
  current_page: number;
  total_pages: number;
}

export interface ChangeLogResponse {
  success: boolean;
  data: {
    changes: ChangeLogEntry[];
    pagination: ChangeLogPagination;
    analytics?: ChangeLogAnalytics;
  };
}