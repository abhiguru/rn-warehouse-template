/**
 * Quick date ranges (docs/STYLE_GUIDE.md §13.3: "quick ranges are chips").
 * All dates are local calendar days as YYYY-MM-DD.
 */
import { t } from '@/i18n';
import { toLocalISODate } from '@/utils/formatters';
import type { DatePreset, DatePresetId, DateRangeValue } from './types';

/** The labels are getters, so they follow the app's language (docs/I18N.md rule 2). */
export const DATE_PRESETS: DatePreset[] = [
  { id: 'today', get label() { return t('filters.preset.today'); } },
  { id: 'yesterday', get label() { return t('filters.preset.yesterday'); } },
  { id: 'last7', get label() { return t('filters.preset.last7'); } },
  { id: 'thisMonth', get label() { return t('filters.preset.thisMonth'); } },
  { id: 'lastMonth', get label() { return t('filters.preset.lastMonth'); } },
];

/** Days in each "last N days" period of a report. */
const LAST_DAYS = { last120: 120, last240: 240, last364: 364, last420: 420 } as const;

/**
 * A report's periods (docs/STYLE_GUIDE.md §14.10): the four storage periods,
 * then the calendar ones. The financial year runs from April to March.
 */
export const REPORT_DATE_PRESETS: DatePreset[] = [
  { id: 'last120', get label() { return t('reports.period.lastDays', { count: LAST_DAYS.last120 }); } },
  { id: 'last240', get label() { return t('reports.period.lastDays', { count: LAST_DAYS.last240 }); } },
  { id: 'last364', get label() { return t('reports.period.lastDays', { count: LAST_DAYS.last364 }); } },
  { id: 'last420', get label() { return t('reports.period.lastDays', { count: LAST_DAYS.last420 }); } },
  { id: 'thisMonth', get label() { return t('filters.preset.thisMonth'); } },
  { id: 'lastMonth', get label() { return t('filters.preset.lastMonth'); } },
  { id: 'thisFinancialYear', get label() { return t('filters.preset.thisFinancialYear'); } },
];

/** The label of a quick range, whichever set offers it. */
export function presetLabel(id: DatePresetId): string | undefined {
  return (DATE_PRESETS.find(preset => preset.id === id) ?? REPORT_DATE_PRESETS.find(preset => preset.id === id))?.label;
}

const day = (base: Date, offset: number) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);

export function presetRange(id: DatePresetId, today: Date = new Date()): { from: string; to: string } {
  switch (id) {
    case 'today':
      return { from: toLocalISODate(today), to: toLocalISODate(today) };
    case 'yesterday':
      return { from: toLocalISODate(day(today, -1)), to: toLocalISODate(day(today, -1)) };
    case 'last7':
      return { from: toLocalISODate(day(today, -6)), to: toLocalISODate(today) };
    case 'thisMonth':
      return {
        from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: toLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case 'lastMonth':
      return {
        from: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'last120':
    case 'last240':
    case 'last364':
    case 'last420':
      // Today counts as one of the days, as in reportDates.getDateDaysAgo.
      return { from: toLocalISODate(day(today, 1 - LAST_DAYS[id])), to: toLocalISODate(today) };
    case 'thisFinancialYear': {
      const start = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      return { from: toLocalISODate(new Date(start, 3, 1)), to: toLocalISODate(new Date(start + 1, 2, 31)) };
    }
  }
}

/** The dates a stored value stands for today. Either end may be missing. */
export function resolveDateRange(
  value: DateRangeValue | undefined,
  today: Date = new Date()
): { from?: string; to?: string } {
  if (!value) return {};
  if (value.preset) return presetRange(value.preset, today);
  return { from: value.from, to: value.to };
}
