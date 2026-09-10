/**
 * Report Types
 *
 * Type definitions for the reporting system including:
 * - Stock Summary (C1)
 * - Dispatch Activity (C3)
 * - Operations Dashboard (S1)
 */

import { ServiceResponse } from './service.types';

// ============================================================
// Common Report Types
// ============================================================

/**
 * Standard date range parameters for reports
 */
export interface ReportDateRange {
  fromDate: string; // ISO date string
  toDate: string; // ISO date string
}

/**
 * Period presets for quick selection
 * Standardized across all reports: 120d, 240d, 364d, 420d
 */
export type ReportPeriod = 'last120days' | 'last240days' | 'last364days' | 'last420days' | 'custom';

// ============================================================
// C1: Stock Summary Types
// ============================================================

/**
 * Individual GRN within item stock details
 */
export interface StockGRNDetail {
  grn_id: string;
  gr_no: string;
  date: string;
  orig_qty: number;
  stock: number;
  item_weight: number; // Per-unit weight, not aggregate
  rack: string;
  packaging: string;
  package_mark?: string;
  emptied_date?: string; // Date when stock became 0 (for out-of-stock items)
}

/**
 * Item-level stock summary
 */
export interface StockItemSummary {
  item_id: string;
  item_name: string;
  total_stock: number;
  total_weight: number;
  grn_count: number;
  grns: StockGRNDetail[];
}

/**
 * Overall stock summary KPIs
 */
export interface StockSummaryKPIs {
  total_items: number;
  total_quantity: number;
  total_weight_kg: number;
  oldest_stock_date: string | null;
  grn_count: number;
  grn_count_empty: number;
}

/**
 * Full stock summary response from RPC
 */
export interface StockSummaryData {
  summary: StockSummaryKPIs;
  items: StockItemSummary[];
  out_of_stock_items?: StockItemSummary[]; // Items with no remaining stock (last 360 days)
}

/**
 * Service response for stock summary
 */
export type StockSummaryResponse = ServiceResponse<StockSummaryData>;

// ============================================================
// C1b: All-Customers Stock Summary Types (Staff View)
// ============================================================

/**
 * Overall KPIs for all-customers stock summary
 */
export interface AllStockSummaryKPIs {
  total_customers_with_stock: number;
  total_items: number;
  total_quantity: number;
  total_weight_kg: number;
}

/**
 * Per-customer stock row in all-customers view
 */
export interface CustomerStockRow {
  customer_id: string;
  customer_name: string;
  total_stock: number;
  total_weight: number;
  item_count: number;
  grn_count: number;
}

/**
 * Full all-customers stock summary response from RPC
 */
export interface AllStockSummaryData {
  summary: AllStockSummaryKPIs;
  customers: CustomerStockRow[];
}

/**
 * Service response for all-customers stock summary
 */
export type AllStockSummaryResponse = ServiceResponse<AllStockSummaryData>;

// ============================================================
// C3: Dispatch Activity Types
// ============================================================

/**
 * Individual item within a dispatch
 */
export interface DispatchItemDetail {
  item_name: string;
  qty: number;
  source_grn: string;
  source_grn_id?: string; // GRN ID for navigation
  weight?: number;
  orig_qty?: number; // Original quantity from source GRN
  package_mark?: string; // Package mark from source GRN
  rack?: string; // Rack location from source GRN
}

/**
 * Dispatch record for activity report
 */
export interface DispatchActivityRecord {
  disp_id: string;
  disp_no: string;
  disp_date: string;
  supervisor_name: string;
  total_qty: number;
  total_weight: number;
  items: DispatchItemDetail[];
}

/**
 * Dispatch activity summary KPIs
 */
export interface DispatchActivityKPIs {
  total_dispatches: number;
  total_quantity: number;
  total_weight: number;
}

/**
 * Full dispatch activity response from RPC
 */
export interface DispatchActivityData {
  summary: DispatchActivityKPIs;
  dispatches: DispatchActivityRecord[];
}

/**
 * Service response for dispatch activity
 */
export type DispatchActivityResponse = ServiceResponse<DispatchActivityData>;

// ============================================================
// C3b: All-Customers Dispatch Activity Types (Staff View)
// ============================================================

/**
 * Overall KPIs for all-customers dispatch activity
 */
export interface AllDispatchActivityKPIs {
  total_dispatches: number;
  total_customers: number;
  total_quantity: number;
  total_weight: number;
}

/**
 * Per-customer dispatch summary in all-customers view
 */
export interface CustomerDispatchRow {
  customer_id: string;
  customer_name: string;
  dispatch_count: number;
  total_quantity: number;
  total_weight: number;
}

/**
 * Full all-customers dispatch activity response from RPC
 */
export interface AllDispatchActivityData {
  summary: AllDispatchActivityKPIs;
  by_customer: CustomerDispatchRow[];
}

/**
 * Service response for all-customers dispatch activity
 */
export type AllDispatchActivityResponse = ServiceResponse<AllDispatchActivityData>;

// ============================================================
// S1: Operations Dashboard Types
// ============================================================

/**
 * Operations KPIs for dashboard
 */
export interface OperationsKPIs {
  total_grns: number;
  total_dispatches: number;
  pending_orders: number;
  active_customers: number;
  total_stock_qty: number;
  total_stock_weight: number;
}

/**
 * Daily trend data point
 */
export interface DailyTrendPoint {
  date: string;
  count: number;
}

/**
 * Trend data for charts
 */
export interface OperationsTrends {
  grn_daily: DailyTrendPoint[];
  dispatch_daily: DailyTrendPoint[];
}

/**
 * Recent activity item
 */
export interface RecentActivityItem {
  type: 'grn' | 'dispatch';
  ref: string;
  customer: string;
  time: string;
}

/**
 * Full operations dashboard response from RPC
 */
export interface OperationsDashboardData {
  kpis: OperationsKPIs;
  trends: OperationsTrends;
  recent_activity: RecentActivityItem[];
}

/**
 * Service response for operations dashboard
 */
export type OperationsDashboardResponse = ServiceResponse<OperationsDashboardData>;

// ============================================================
// Report Menu/Navigation Types
// ============================================================

/**
 * Report definition for menu display
 */
export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  staffOnly: boolean;
  category: 'stock' | 'movement' | 'financial' | 'operations';
}

/**
 * Report category grouping
 */
export interface ReportCategory {
  id: string;
  title: string;
  reports: ReportDefinition[];
}

// ============================================================
// C5: Stock Aging Types
// ============================================================

/**
 * Stock aging summary KPIs
 */
export interface StockAgingKPIs {
  total_items: number;
  total_quantity: number;
  total_weight_kg: number;
  oldest_stock_days: number;
  average_age_days: number;
  items_over_365_days: number;
  qty_over_365_days: number;
  avg_dispatch_velocity_days: number | null;
  items_no_recent_dispatch: number;
}

/**
 * Aging bucket data
 */
export interface AgingBucketData {
  item_count: number;
  total_quantity: number;
  total_weight: number;
  percentage: number;
}

/**
 * Dispatch info for stock aging item
 */
export interface StockAgingDispatchInfo {
  total_dispatched: number;
  dispatch_count: number;
  last_dispatch_date: string | null;
  days_since_last_dispatch: number | null;
  avg_days_between_dispatches: number | null;
}

/**
 * Individual item in stock aging report
 */
export interface StockAgingItem {
  grn_id: string;
  gr_no: string;
  item_name: string;
  packaging: string;
  current_stock: number;
  original_qty: number;
  weight: number;
  rack: string;
  package_mark: string;
  grn_date: string;
  aging_days: number;
  aging_bucket: string;
  dispatch_info: StockAgingDispatchInfo;
}

/**
 * Full stock aging response for single customer
 */
export interface StockAgingData {
  summary: StockAgingKPIs;
  by_bucket: Record<string, AgingBucketData>;
  items: StockAgingItem[];
}

/**
 * All-customers stock aging summary KPIs
 */
export interface AllStockAgingKPIs {
  total_customers: number;
  total_items: number;
  total_quantity: number;
  oldest_stock_days: number;
  average_age_days: number;
  items_over_365_days: number;
  qty_over_365_days: number;
}

/**
 * Per-customer aging summary
 */
export interface CustomerAgingSummary {
  customer_id: string;
  customer_name: string;
  total_stock: number;
  average_age_days: number;
  oldest_stock_days: number;
  items_over_365_days: number;
  aging_distribution: Record<string, number>;
}

/**
 * Full stock aging response for all customers (staff view)
 */
export interface AllStockAgingData {
  summary: AllStockAgingKPIs;
  by_bucket: Record<string, { item_count: number; total_quantity: number; percentage: number }>;
  by_customer: CustomerAgingSummary[];
}

/**
 * Service response for stock aging
 */
export type StockAgingResponse = ServiceResponse<StockAgingData>;
export type AllStockAgingResponse = ServiceResponse<AllStockAgingData>;

// ============================================================
// C2: GRN Activity Types
// ============================================================

/**
 * GRN activity summary KPIs
 */
export interface GRNActivityKPIs {
  total_grns: number;
  total_items: number;
  total_quantity: number;
  total_weight_kg: number;
  total_invoiced_grns: number;
  total_images: number;
}

/**
 * Invoice status for GRN
 */
export interface GRNInvoiceStatus {
  is_invoiced: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
}

/**
 * Dispatch summary for GRN
 */
export interface GRNDispatchSummary {
  total_dispatched: number;
  current_stock: number;
  dispatch_count: number;
  last_dispatch_date: string | null;
  is_fully_dispatched: boolean;
}

/**
 * GRN item in activity report
 */
export interface GRNActivityItem {
  item_name: string;
  packaging: string;
  quantity: number;
  current_stock: number;
  dispatched_qty: number;
  weight: number;
  rack: string;
  package_mark: string;
}

/**
 * Individual GRN record in activity report
 */
export interface GRNActivityRecord {
  grn_id: string;
  gr_no: string;
  grn_date: string;
  registration: string;
  sender_name: string;
  supervisor_name: string;
  note: string | null;
  total_items: number;
  total_qty: number;
  total_weight: number;
  image_count: number;
  invoice_status: GRNInvoiceStatus;
  dispatch_summary: GRNDispatchSummary;
  items: GRNActivityItem[];
}

/**
 * Full GRN activity response for single customer
 */
export interface GRNActivityData {
  summary: GRNActivityKPIs;
  grns: GRNActivityRecord[];
}

/**
 * All-customers GRN activity summary KPIs
 */
export interface AllGRNActivityKPIs {
  total_grns: number;
  total_customers: number;
  total_items: number;
  total_quantity: number;
  total_weight_kg: number;
}

/**
 * Per-customer GRN summary
 */
export interface CustomerGRNSummary {
  customer_id: string;
  customer_name: string;
  grn_count: number;
  total_quantity: number;
  total_weight: number;
  latest_grn_date: string;
}

/**
 * Full GRN activity response for all customers (staff view)
 */
export interface AllGRNActivityData {
  summary: AllGRNActivityKPIs;
  by_customer: CustomerGRNSummary[];
}

/**
 * Service response for GRN activity
 */
export type GRNActivityResponse = ServiceResponse<GRNActivityData>;
export type AllGRNActivityResponse = ServiceResponse<AllGRNActivityData>;

// ============================================================
// C4: Invoice History Types
// ============================================================

/**
 * Invoice history summary KPIs
 */
export interface InvoiceHistoryKPIs {
  total_invoices: number;
  total_amount: number;
  total_labour: number;
  total_tax: number;
  total_discount: number;
  net_amount: number;
  paid_count: number;
  pending_count: number;
  paid_amount: number;
  pending_amount: number;
}

/**
 * Payment status for invoice
 */
export interface InvoicePaymentStatus {
  status: 'paid' | 'pending';
  paid_date: string | null;
  payment_ref: string | null;
  amount?: number;
  payment_mode?: string;
}

/**
 * GRN item reference in invoice line item
 */
export interface InvoiceGRNItemRef {
  gr_no: string;
  rack: string;
  package_mark: string;
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  item_id: string;
  item_name: string;
  packaging: string;
  quantity: number;
  rate: number;
  no_of_days: number;
  charge: number;
  labour_rate: number;
  labour_amount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  grn_item_ref: InvoiceGRNItemRef;
}

/**
 * Individual invoice record in history report
 */
export interface InvoiceHistoryRecord {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  financial_year: string;
  grn_ref: string;
  grn_id: string;
  total: number;
  labour: number;
  discount: number;
  tax_amount: number;
  net_total: number;
  item_count: number;
  total_quantity: number;
  notes: string | null;
  payment_status: InvoicePaymentStatus;
  line_items: InvoiceLineItem[];
}

/**
 * Monthly breakdown for invoice history
 */
export interface InvoiceMonthlyBreakdown {
  month: string;
  invoice_count: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
}

/**
 * Full invoice history response for single customer
 */
export interface InvoiceHistoryData {
  summary: InvoiceHistoryKPIs;
  invoices: InvoiceHistoryRecord[];
  by_month: InvoiceMonthlyBreakdown[];
}

/**
 * All-customers invoice history summary KPIs
 */
export interface AllInvoiceHistoryKPIs {
  total_invoices: number;
  total_customers: number;
  total_amount: number;
  total_tax: number;
  net_amount: number;
}

/**
 * Per-customer invoice summary
 */
export interface CustomerInvoiceSummary {
  customer_id: string;
  customer_name: string;
  invoice_count: number;
  total_amount: number;
  net_amount: number;
  latest_invoice_date: string;
}

/**
 * All-customers monthly breakdown (simplified)
 */
export interface AllInvoiceMonthlyBreakdown {
  month: string;
  invoice_count: number;
  total_amount: number;
}

/**
 * Full invoice history response for all customers (staff view)
 */
export interface AllInvoiceHistoryData {
  summary: AllInvoiceHistoryKPIs;
  by_customer: CustomerInvoiceSummary[];
  by_month: AllInvoiceMonthlyBreakdown[];
}

/**
 * Service response for invoice history
 */
export type InvoiceHistoryResponse = ServiceResponse<InvoiceHistoryData>;
export type AllInvoiceHistoryResponse = ServiceResponse<AllInvoiceHistoryData>;

// ============================================================
// C6: Customer Activity Types
// ============================================================

/**
 * Customer Activity period extended options
 */
/**
 * Customer Activity period - now uses standardized ReportPeriod
 * @deprecated Use ReportPeriod instead
 */
export type CustomerActivityPeriod = ReportPeriod;

/**
 * Customer Activity summary KPIs (Level 1 - list view)
 */
export interface CustomerActivityListKPIs {
  total_customers: number;
  total_current_stock: number;
  total_grns: number;
  total_dispatches: number;
  total_invoice_amount: number;
}

/**
 * Customer row in activity list (Level 1)
 */
export interface CustomerActivityRow {
  customer_id: string;
  customer_name: string;
  customer_city: string;
  current_stock: number; // Primary KPI (highlighted)
  total_grns: number;
  total_dispatches: number;
  total_invoice_amount: number;
  last_activity_date: string;
  last_activity_type: 'grn' | 'dispatch' | null;
}

/**
 * Level 1 response - All customers list
 */
export interface AllCustomerActivityData {
  summary: CustomerActivityListKPIs;
  customers: CustomerActivityRow[];
}

/**
 * Monthly trend data point for charts
 */
export interface MonthlyTrendPoint {
  month: string; // 'YYYY-MM'
  grn_count: number;
  grn_quantity: number;
  dispatch_count: number;
  dispatch_quantity: number;
  invoice_amount: number;
  stock_level_end: number;
}

/**
 * Recent GRN preview (for quick access cards)
 */
export interface RecentGRNPreview {
  grn_id: string;
  gr_no: string;
  grn_date: string;
  total_qty: number;
  current_stock: number;
  is_invoiced: boolean;
}

/**
 * Recent dispatch preview
 */
export interface RecentDispatchPreview {
  dispatch_id: string;
  dispatch_no: string;
  dispatch_date: string;
  total_qty: number;
  supervisor_name: string;
}

/**
 * Stock item preview (top items by stock)
 */
export interface StockItemPreview {
  item_name: string;
  total_stock: number;
  grn_count: number;
}

/**
 * Recent invoice preview
 */
export interface RecentInvoicePreview {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  net_total: number;
  status: 'paid' | 'pending';
}

/**
 * Customer Activity detail KPIs (Level 2 - single customer)
 */
export interface CustomerActivityDetailKPIs {
  current_stock: number;
  total_grns: number;
  total_grn_quantity: number;
  total_dispatches: number;
  total_dispatch_quantity: number;
  total_invoice_amount: number;
  total_paid_amount: number;
  total_pending_amount: number;
  average_stock_age_days: number;
}

/**
 * Level 2 response - Single customer detail
 */
export interface CustomerActivityDetailData {
  customer_id: string;
  customer_name: string;
  customer_city: string;
  summary: CustomerActivityDetailKPIs;
  monthly_trends: MonthlyTrendPoint[];
  by_bucket: Record<string, { item_count: number; total_quantity: number; percentage: number }>;
  recent_grns: RecentGRNPreview[];
  recent_dispatches: RecentDispatchPreview[];
  top_stock_items: StockItemPreview[];
  recent_invoices: RecentInvoicePreview[];
}

/**
 * Service response for customer activity
 */
export type AllCustomerActivityResponse = ServiceResponse<AllCustomerActivityData>;
export type CustomerActivityDetailResponse = ServiceResponse<CustomerActivityDetailData>;
