// Stock Management Type Definitions

// Re-export shared pagination types from service.types.ts
// @see J7 - DRY Violation: Pagination Types Duplicated
import {
  PaginationInfo,
  PaginationInfoSnakeCase,
  SimplePagination,
} from './service.types';

// Re-export for backward compatibility
export { PaginationInfo, PaginationInfoSnakeCase, SimplePagination };

export interface StockAnalysisItem {
  item_id: string;
  item_name: string;
  packaging: string;
  description?: string;
  total_grn_qty: number;
  total_dispatch_qty: number;
  calculated_stock: number;
  has_negative_stock: boolean;
  as_of_date?: string;
}

export interface StockAnalysisAggregations {
  total_grn_qty: number;
  total_dispatch_qty: number;
  calculated_stock: number;
  itemCount: number;
  itemsWithNegativeStock: number;
  as_of_date: string;
  hasDataIntegrityIssues: boolean;
}

export interface StockAnalysisResponse {
  items: StockAnalysisItem[];
  aggregations: StockAnalysisAggregations;
}

export interface CustomerGRNItem {
  id: string;
  grn_id: string;
  gr_no: string;
  item_id: string;
  item_name: string;
  qty: number;
  stock: number;
  weight?: number;
  packaging?: string;
  package_mark?: string;
  rack?: string;
  date: string;
  supervisorName?: string;
  registration?: string;
  note?: string;
  customer_id: string;
  customer_name: string;
  image_url?: string;
  total_dispatched: number;
  dispatch_count: number;
  last_dispatch_date?: string;
  is_fully_dispatched: boolean;
}

export interface GRNItemsAggregations {
  total_qty: number;
  total_stock: number;
  total_count: number;
}

// GRNItemsPagination is now an alias for PaginationInfo
export type GRNItemsPagination = PaginationInfo;

export interface CustomerGRNItemsResponse {
  items: CustomerGRNItem[];
  pagination: GRNItemsPagination;
  aggregations: GRNItemsAggregations;
}

export interface StockFilters {
  item_name?: string;
  item_id?: string;
  gr_no?: string;
  package_mark?: string;
  rack?: string;
}

export interface CustomerStockSummary {
  customer_id: string;
  customer_name: string;
  mobile?: string;
  email?: string;
  address?: string;
  current_stock_qty: number;
  total_grn_qty: number;
  total_dispatch_qty: number;
  unique_items_count: number;
  latest_grn_date?: string;
  latest_dispatch_date?: string;
}

// StockPagination is now an alias for PaginationInfoSnakeCase
export type StockPagination = PaginationInfoSnakeCase;

// SimplePagination is imported from service.types.ts (see top of file)

export interface CustomerListItem {
  id: string;
  name: string;
  mobile?: string;
  city?: string;
  email?: string;
  address?: string;
}

export interface CustomerListResponse {
  data: CustomerListItem[];
  pagination: SimplePagination;
}

export interface StockMetadata {
  as_of_date: string;
  financial_year?: number;
  calculation_method: string;
  description: string;
}

export interface CustomersWithStockResponse {
  data: CustomerStockSummary[];
  pagination: SimplePagination;
}

export interface StockServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export type StockSortBy = 'date' | 'item_name' | 'qty' | 'stock' | 'weight';
export type SortOrder = 'asc' | 'desc';

export interface StockItemFilter {
  item_name?: string;
  item_id?: string;
}

export interface GRNItemFilter extends StockItemFilter {
  gr_no?: string;
  package_mark?: string;
  rack?: string;
}

// Item-wise stock types for ItemWiseStockList component
export interface ItemGRNDetail {
  id: string;
  gr_no: string;
  grn_id: string;
  date: string;
  grn_date?: string;  // Alternative property name
  qty: number;
  stock: number;
  weight?: number;
  packaging?: string;
  package_mark?: string;
  rack?: string;
  customer_id?: string;
  customer_name?: string;
  grn_customer_name?: string;  // Alternative property name
}

export interface ItemWiseStockItem {
  item_id: string;
  item_name: string;
  packaging?: string;
  total_qty: number;
  total_stock: number;
  grn_count: number;
  grns?: ItemGRNDetail[];
  // Alternative property names used in ItemWiseStockList component
  grn?: ItemGRNDetail;
  grn_qty?: number;
  grn_stock?: number;
  weight?: number;
  grn_packaging_mark?: string;
  rack?: string;
  customer?: {
    id: string;
    name: string;
  };
}

export interface GroupedStockItem extends ItemWiseStockItem {
  is_expanded?: boolean;
  grn_details?: ItemGRNDetail[];
}