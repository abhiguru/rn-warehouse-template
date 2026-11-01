/**
 * The words and formats of a price-history entry, in the app's language: the same
 * labels and value formats as the price form and the price card.
 * Call while rendering (docs/I18N.md rule 2).
 */
import { localizeDigits, t, type TranslationKey } from '@/i18n';
import { formatCurrency, formatDate, formatSpokenDate } from '@/utils/formatters';
import { roleLabel } from '@/utils/roleLabel';
import { normalizeRole } from '@/config/roles';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';
import { priceTypeLabel, weightBandLabel } from './priceLabels';
import type { PriceHistoryField, PriceHistoryValue } from './priceHistory';

const FIELD_KEYS: Record<PriceHistoryField, TranslationKey> = {
  priceType: 'pricing.form.priceType',
  monthlyPrice: 'pricing.form.monthlyPrice',
  oneTimePrice: 'pricing.form.oneTimePrice',
  weightBand: 'pricing.form.weightRange',
  labourRate: 'pricing.form.labourRate',
  tax: 'pricing.form.tax',
  effectiveFrom: 'pricing.form.startDate',
  effectiveTo: 'pricing.form.endDate',
};

const ACTION_KEYS: Record<string, TranslationKey> = {
  insert: 'pricing.history.action.insert',
  update: 'pricing.history.action.update',
  delete: 'pricing.history.action.delete',
  truncate: 'pricing.history.action.truncate',
};

const MISSING = '—';

export const priceHistoryFieldLabel = (field: PriceHistoryField): string => t(FIELD_KEYS[field]);

/** "Price added", "Price changed", "Price deleted", "All prices removed". */
export const priceHistoryActionLabel = (action: string): string =>
  t(ACTION_KEYS[action] ?? 'pricing.history.action.update');

/** One value of a field as the pricing screens write it; "—" when it is not there. `spoken` writes dates in words for a screen reader. */
export function priceHistoryValueText(field: PriceHistoryField, value: PriceHistoryValue, spoken = false): string {
  // A screen reader is given a date in words ("9 Oct 2026"), never "09/10/26".
  const date = spoken ? formatSpokenDate : formatDate;
  switch (field) {
    case 'priceType':
      // A stored value is never shown itself (docs/I18N.md rule 9).
      return value === 'one_time' || value === 'monthly' ? priceTypeLabel(value) : MISSING;
    case 'weightBand':
      return typeof value === 'object' && value !== null && value.min !== null && value.max !== null
        ? weightBandLabel(value.min, value.max)
        : MISSING;
    case 'tax':
      return typeof value === 'number'
        ? t('pricing.history.percentValue', { percent: localizeDigits(String(value)) })
        : MISSING;
    case 'effectiveFrom':
      return typeof value === 'string' ? date(value) : MISSING;
    case 'effectiveTo':
      // A price with no end date runs until it is changed.
      return typeof value === 'string' ? date(value) : t('pricing.form.noEndDate');
    default:
      // Money always has two decimals: ₹3.50, ₹10.00 (never ₹3.5 or ₹10).
      return typeof value === 'number' ? formatCurrency(value, { minimumFractionDigits: 2 }) : MISSING;
  }
}

/** Who made the change: "Asha Mehta (Supervisor)", or "Not an app user" for the service key or the database. */
export function priceHistoryAuthor(
  entry: Pick<ItemPriceHistoryEntry, 'changed_by' | 'changed_by_name' | 'changed_by_role'>
): string {
  if (!entry.changed_by) return t('pricing.history.notAppUser');
  return t('pricing.history.nameWithRole', {
    name: entry.changed_by_name || t('users.unknownUser'),
    role: roleLabel(normalizeRole(entry.changed_by_role)),
  });
}
