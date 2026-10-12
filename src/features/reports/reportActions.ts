/**
 * The actions every report offers in the same words (docs/STYLE_GUIDE.md §14.10):
 * the header's "Share PDF", and the button of a period report's empty state that
 * asks for the longest period.
 */
import type { ReportHeaderAction } from '@/components/reports/ReportHeader';
import type { ReportEmptyAction } from '@/components/reports/ReportScaffold';
import { PERIOD_KEY, isLongestPeriod, type ReportPeriod } from '@/features/filters/configs/reports/shared';
import type { DateRangeValue, FilterValue } from '@/features/filters/types';
import { t as tr } from '@/i18n';
import type { ReportExport } from './useReportExport';

/**
 * The header's "Share PDF": none once the facility's server has said it cannot
 * make report PDFs, so the header never offers what would fail.
 */
export const exportHeaderActions = ({ exportPdf, busy, available }: ReportExport): ReportHeaderAction[] =>
  available ? [{ icon: 'file-pdf-box', label: tr('reports.export.sharePdf'), busy, onPress: () => void exportPdf() }] : [];

/** The longest quick period of a report (REPORT_DATE_PRESETS). */
export const LONGEST_REPORT_PERIOD: DateRangeValue = { preset: 'last420' };
const LONGEST_REPORT_DAYS = 420;

/**
 * "Show last 420 days" under a period report's "nothing there", while a longer
 * period could still find something; none once the period is the longest.
 * Pressing it sets the period every report shares, as the period chip does.
 */
export function longestPeriodAction(
  period: ReportPeriod,
  setField: (field: string, value: FilterValue | undefined) => unknown,
  today?: Date
): ReportEmptyAction | undefined {
  if (isLongestPeriod(period, today)) return undefined;
  return {
    label: tr('reports.period.showLastDays', { count: LONGEST_REPORT_DAYS }),
    icon: 'calendar-range',
    onPress: () => void setField(PERIOD_KEY, LONGEST_REPORT_PERIOD),
  };
}
