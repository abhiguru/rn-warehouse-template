/**
 * Operations dashboard: the facility's figures for a period. The period is its
 * only control: no search, no sort, no customer. It has no rows to narrow in
 * the app, so it has no view function and is not one of REPORT_VIEW_CONFIGS.
 */
import { t } from '@/i18n';
import { todayInIST } from '@/utils/formatters';
import type { FilterListConfig } from '../../types';
import { PERIOD_FIELD, reportPeriod, type PeriodReportRequest } from './shared';

export type OperationsDashboardRequest = PeriodReportRequest;

export const OPERATIONS_DASHBOARD: FilterListConfig<OperationsDashboardRequest> = {
  listKey: 'report-operations-dashboard',
  get title() { return t('reports.titles.operationsDashboard'); },
  noun: ['GRN', 'GRNs'],
  fields: [PERIOD_FIELD],
  fastFilters: [],
  toRequest: (values, _sort, _ctx, today = todayInIST()) => ({
    period: reportPeriod(values, today),
    view: { words: [] },
  }),
};
