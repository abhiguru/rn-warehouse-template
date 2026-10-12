/**
 * The report screens' configurations (docs/STYLE_GUIDE.md §14.10). Each entry
 * pairs a configuration with the function that applies its view to the rows
 * the server returned; `reportViews.test.ts` checks every pair.
 */
import type { FilterListConfig } from '../../types';
import { GRN_ACTIVITY_CUSTOMER, GRN_ACTIVITY_CUSTOMERS, grnCustomersView, grnRecordsView } from './grnActivity';
import type { ReportRequest } from './shared';
import { STOCK_SUMMARY_CUSTOMER, STOCK_SUMMARY_CUSTOMERS, stockSummaryCustomersView, stockSummaryItemsView } from './stockSummary';

export interface ReportViewConfig {
  config: FilterListConfig<ReportRequest<object>>;
  // The rows and the view are each configuration's own types; the test feeds each its own fixture.
  apply: (rows: readonly never[], view: never) => unknown[];
}
const pair = <TRow, TRequest extends ReportRequest<object>>(
  config: FilterListConfig<TRequest>,
  apply: (rows: readonly TRow[], view: TRequest['view']) => TRow[]
): ReportViewConfig => ({ config: config as unknown as FilterListConfig<ReportRequest<object>>, apply: apply as unknown as ReportViewConfig['apply'] });

export const REPORT_VIEW_CONFIGS: ReportViewConfig[] = [
  pair(GRN_ACTIVITY_CUSTOMERS, grnCustomersView),
  pair(GRN_ACTIVITY_CUSTOMER, grnRecordsView),
  pair(STOCK_SUMMARY_CUSTOMERS, stockSummaryCustomersView),
  pair(STOCK_SUMMARY_CUSTOMER, stockSummaryItemsView),
];

export * from './grnActivity';
export * from './shared';
