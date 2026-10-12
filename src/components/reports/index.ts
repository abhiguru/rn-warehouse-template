/**
 * Report Components
 *
 * Exports all reusable report components.
 */

// KPI Display
export { KPICard, type KPIVariant } from './KPICard';
export { KPIGrid, type KPIItem } from './KPIGrid';

// Layout & Navigation
export { ReportHeader, type ReportHeaderAction } from './ReportHeader';
export { PeriodSelector, getDateRangeForPeriod } from './PeriodSelector';

// The one layout every report uses
export { ReportScaffold, type ReportScaffoldProps } from './ReportScaffold';
export { ReportStatusLine, type ReportStatusLineProps } from './ReportStatusLine';

// The Reports tab
export { ReportHubRow, type ReportHubRowProps } from './ReportHubRow';
export {
  reportHubSections,
  mayOpenReport,
  HUB_RECENT_LIMIT,
  type ReportHubSection,
  type ReportHubSectionId,
} from './reportHubSections';

// States
export { ReportEmptyState } from './ReportEmptyState';

// Data Display
export { FioriDataTable, type DataTableColumn, type DataTableProps } from './FioriDataTable';

// List Items
export { ReportCustomerCard, type ReportCustomerCardProps } from './ReportCustomerCard';
export { ReportLastCustomer, type ReportLastCustomerProps } from './ReportLastCustomer';

export { FactLines, joinFacts, stacksFacts } from './FactLines';

// Search
export { ReportCustomerSearch, type ReportCustomerSearchProps } from './ReportCustomerSearch';

// Whose data a report shows (role and assigned customers)
export { ReportCustomerScope, type ReportScope, type ReportCustomerScopeProps } from './ReportCustomerScope';
export { ReportCustomerPicker, type ReportCustomerPickerProps } from './ReportCustomerPicker';

// Shared rows of the stock reports
export { AgingBucketBar, agingBucketsFrom, agingBucketIdFromKey, agingBucketLabel, AGING_BUCKET_IDS, AGING_BUCKET_STATUS, type AgingBucket, type AgingBucketId, type AgingBucketBarProps } from './AgingBucketBar';
export { StockItemCard, StockGRNRow, isLowStock, LOW_STOCK_PERCENT, EXPAND_ANIMATION, animateExpand } from './StockItemCard';
export type { StockItemCardProps, StockGRNRowData, StockGRNRowProps, StockGRNState } from './StockItemCard';

// Customer activity's stock trend (chart or table)
export { StockTrendChart, type StockTrendChartProps } from './StockTrendChart';

// The footer of a paged report (item stock summary)
export { ReportLoadMoreFooter, type ReportLoadMoreFooterProps, type ReportLoadMoreState } from './ReportLoadMoreFooter';
