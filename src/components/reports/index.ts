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
