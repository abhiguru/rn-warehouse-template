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

// States
export { ReportEmptyState } from './ReportEmptyState';

// Data Display
export { FioriDataTable, type DataTableColumn, type DataTableProps } from './FioriDataTable';

// List Items
export { ReportCustomerCard, type ReportCustomerCardProps } from './ReportCustomerCard';

export { FactLines, joinFacts, stacksFacts } from './FactLines';

// Search
export { ReportCustomerSearch, type ReportCustomerSearchProps } from './ReportCustomerSearch';
