/**
 * Quick date ranges (docs/STYLE_GUIDE.md §13.3: "quick ranges are chips").
 * All dates are local calendar days as YYYY-MM-DD.
 */
import { toLocalISODate } from '@/utils/formatters';
import type { DatePresetId, DateRangeValue } from './types';

export const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
];

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
