/**
 * The one definition of what a filter value means: whether it is active, how
 * many filters are on, and what a chip says. Every list uses these, so counts
 * and wording cannot drift apart between screens.
 */
import { localizeDigits, normalizeDigits, t } from '@/i18n';
import { formatDate, formatNumber, parseLocalISODate } from '@/utils/formatters';
import { DATE_PRESETS, resolveDateRange } from './datePresets';
import { parseQuickSearch, type QuickSearchResult } from './parseQuickSearch';
import {
  SEARCH_KEY,
  SEARCH_LITERAL_KEY,
  type DateRangeValue,
  type FilterContext,
  type FilterFieldDef,
  type FilterListDefinition,
  type FilterValue,
  type FilterValues,
  type NumberRangeValue,
  type PickedOption,
  type SortFieldOption,
  type SortState,
  type TextRangeValue,
} from './types';

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** Whether a stored value filters anything. A default or an empty value does not. */
export function isFieldActive(field: FilterFieldDef, value: FilterValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  switch (field.kind) {
    case 'choice':
      return hasText(value) && value !== field.defaultValue;
    case 'toggle':
      return value === true;
    case 'text':
      return hasText(value);
    case 'picker':
      return Array.isArray(value) && value.length > 0;
    case 'dateRange': {
      const range = value as DateRangeValue;
      return Boolean(range.preset || range.from || range.to);
    }
    case 'numberRange': {
      const range = value as NumberRangeValue;
      return typeof range.min === 'number' || typeof range.max === 'number';
    }
    case 'textRange': {
      const range = value as TextRangeValue;
      return hasText(range.from) || hasText(range.to);
    }
  }
}

/** The fields this account may use, in config order. */
export function visibleFields(config: FilterListDefinition, ctx: FilterContext): FilterFieldDef[] {
  return config.fields.filter(field => !field.visibleTo || field.visibleTo(ctx));
}

/** Values with every inactive, unknown or hidden field removed. This is what gets stored. */
export function normalizeValues(config: FilterListDefinition, values: FilterValues, ctx: FilterContext): FilterValues {
  const result: FilterValues = {};
  for (const field of visibleFields(config, ctx)) {
    const value = values[field.key];
    if (!isFieldActive(field, value)) continue;
    result[field.key] = typeof value === 'string' ? value.trim() : value;
  }
  if (config.search && hasText(values[SEARCH_KEY])) {
    result[SEARCH_KEY] = (values[SEARCH_KEY] as string).trim();
    if (values[SEARCH_LITERAL_KEY] === true) result[SEARCH_LITERAL_KEY] = true;
  }
  return result;
}

/**
 * What the search field holds, read for this list. A date or range typed into
 * the search is only recognised when that filter is not already set by hand,
 * and never after the user dismissed the recognition.
 */
export function readSearch(config: FilterListDefinition, values: FilterValues, today: Date = new Date()): QuickSearchResult {
  const typed = values[SEARCH_KEY];
  if (!config.search || !hasText(typed)) return { text: '' };
  // ૦-૯ and 0-9 mean the same to the search (docs/I18N.md rule 6); parseQuickSearch does the same below.
  if (values[SEARCH_LITERAL_KEY] === true) return { text: normalizeDigits(typed).trim().split(/\s+/).join(' ') };
  const search = config.search;
  const fieldByKey = (key?: string) => config.fields.find(field => field.key === key);
  const dateField = fieldByKey(search.dateField);
  const rangeField = fieldByKey(search.rangeField);
  const yearField = fieldByKey(search.yearField);
  return parseQuickSearch(typed, {
    today,
    dates: search.dates && !(dateField && isFieldActive(dateField, values[dateField.key])),
    range: rangeField && isFieldActive(rangeField, values[rangeField.key]) ? null : search.range,
    financialYear: Boolean(search.financialYear) && !(yearField && isFieldActive(yearField, values[yearField.key])),
  });
}

/** Number of filters on: each active field once, plus what the search recognised. */
export function countActiveFilters(config: FilterListDefinition, values: FilterValues, ctx: FilterContext): number {
  const fields = visibleFields(config, ctx).filter(field => isFieldActive(field, values[field.key])).length;
  const search = readSearch(config, values);
  return fields + (search.date ? 1 : 0) + (search.range ? 1 : 0) + (search.financialYear !== undefined ? 1 : 0);
}

/** Whether anything narrows the list: a filter or a search. */
export function hasAnyFilter(config: FilterListDefinition, values: FilterValues, ctx: FilterContext): boolean {
  return countActiveFilters(config, values, ctx) > 0 || hasText(values[SEARCH_KEY]);
}

/** "2026-27" for the financial year that starts in April 2026 ("૨૦૨૬-૨૭" in Gujarati). */
export const financialYearLabel = (startYear: number) =>
  localizeDigits(`${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`);

/** The financial year (April to March) a date falls in, as its starting year. */
export const financialYearOf = (date: Date) => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

const dateText = (iso?: string) => (iso ? formatDate(parseLocalISODate(iso), 'short') : '');

export function describeDateRange(range: { from?: string; to?: string }): string {
  if (range.from && range.to) {
    return range.from === range.to
      ? dateText(range.from)
      : t('filters.chip.dateBetween', { from: dateText(range.from), to: dateText(range.to) });
  }
  if (range.from) return t('filters.chip.dateFrom', { date: dateText(range.from) });
  if (range.to) return t('filters.chip.dateUntil', { date: dateText(range.to) });
  return '';
}

/** Chip text for an active value: the value itself, short. */
export function describeValue(field: FilterFieldDef, value: FilterValue | undefined): string {
  if (!isFieldActive(field, value)) return field.label;
  switch (field.kind) {
    case 'choice':
      return field.options.find(option => option.value === value)?.label ?? field.label;
    case 'toggle':
      return field.label;
    case 'text':
      return t('filters.chip.text', { label: field.label, value: (value as string).trim() });
    case 'picker': {
      const picked = value as PickedOption[];
      return picked.length === 1 ? picked[0].label : t('filters.chip.pickedMore', { first: picked[0].label, more: picked.length - 1 });
    }
    case 'dateRange': {
      const range = value as DateRangeValue;
      if (range.preset) return DATE_PRESETS.find(preset => preset.id === range.preset)?.label ?? field.label;
      return describeDateRange(resolveDateRange(range));
    }
    case 'numberRange': {
      const { min, max } = value as NumberRangeValue;
      // Whole sentences, with and without a unit: the words around the numbers move in Gujarati.
      const unit = field.unit;
      if (typeof min === 'number' && typeof max === 'number') {
        return unit
          ? t('filters.chip.numberBetweenUnit', { min: formatNumber(min), max: formatNumber(max), unit })
          : t('filters.chip.numberBetween', { min: formatNumber(min), max: formatNumber(max) });
      }
      if (typeof min === 'number') {
        return unit ? t('filters.chip.atLeastUnit', { min: formatNumber(min), unit }) : t('filters.chip.atLeast', { min: formatNumber(min) });
      }
      return unit
        ? t('filters.chip.upToUnit', { max: formatNumber(max as number), unit })
        : t('filters.chip.upTo', { max: formatNumber(max as number) });
    }
    case 'textRange': {
      const { from, to } = value as TextRangeValue;
      // Document numbers are identifiers: shown as typed, never formatted.
      if (hasText(from) && hasText(to)) return t('filters.chip.textBetween', { from: from.trim(), to: to.trim() });
      if (hasText(from)) return t('filters.chip.textFrom', { from: from.trim() });
      return t('filters.chip.textUpTo', { to: (to as string).trim() });
    }
  }
}

type SortKind = SortFieldOption['kind'];
/** Both directions of one kind, read from the texts when asked for (docs/I18N.md rule 2). */
const directions = (table: 'sortDirection' | 'sortDirectionSpoken', kind: SortKind): Record<'asc' | 'desc', string> => ({
  get desc() { return t(`filters.${table}.${kind}.desc`); },
  get asc() { return t(`filters.${table}.${kind}.asc`); },
});

/** Visible name of a sort direction for a kind of field, in the app's language. */
export const SORT_DIRECTIONS: Record<SortKind, Record<'asc' | 'desc', string>> = {
  date: directions('sortDirection', 'date'),
  number: directions('sortDirection', 'number'),
  amount: directions('sortDirection', 'amount'),
  text: directions('sortDirection', 'text'),
};
/** The same inside a sentence: "newest first", but still "A to Z". */
const SORT_DIRECTIONS_SPOKEN: Record<SortKind, Record<'asc' | 'desc', string>> = {
  date: directions('sortDirectionSpoken', 'date'),
  number: directions('sortDirectionSpoken', 'number'),
  amount: directions('sortDirectionSpoken', 'amount'),
  text: directions('sortDirectionSpoken', 'text'),
};

export function currentSort(config: FilterListDefinition, sort: SortState | undefined): SortState | undefined {
  if (!config.sort) return undefined;
  const known = sort && config.sort.options.some(option => option.field === sort.field);
  return known ? sort : config.sort.default;
}

export function isDefaultSort(config: FilterListDefinition, sort: SortState | undefined): boolean {
  const active = currentSort(config, sort);
  const fallback = config.sort?.default;
  return !active || !fallback || (active.field === fallback.field && active.order === fallback.order);
}

/** "GRN no." for the chip; the direction is shown by its arrow. */
export function describeSort(
  config: FilterListDefinition,
  sort: SortState | undefined
): { label: string; direction: string; spoken: string } {
  const active = currentSort(config, sort);
  const option = config.sort?.options.find(candidate => candidate.field === active?.field);
  if (!active || !option) return { label: t('filters.sort.fallback'), direction: '', spoken: '' };
  const direction = SORT_DIRECTIONS[option.kind][active.order];
  // Inside a sentence the direction starts in lower case, except "A to Z" and "Z to A".
  const spoken = SORT_DIRECTIONS_SPOKEN[option.kind][active.order];
  return { label: option.chipLabel ?? option.label, direction, spoken };
}

/** Order-independent comparison of two sets of values, for "are there unsaved changes". */
export function valuesEqual(left: FilterValues, right: FilterValues): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonical(entry)])
      );
    }
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
