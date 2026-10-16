/**
 * The rates set for one GRN only (backend migration 86), as text and as groups: one line for an archived
 * one under Old rates, the figures of a band, and the bands of a GRN together. The list of them is the
 * screen app/item-rates/[itemId]/grns.tsx.
 */
import { formatIdentifier, localizeDigits, t } from '@/i18n';
import type { ItemGrnRate } from '@/types/item-pricing.types';
import { bandText, dateText, money } from './rateText';

/** One line for an archived GRN rate under Old rates. */
export const grnOnlyLine = (rate: ItemGrnRate): string =>
  t('pricing.item.grnOnlyRow', {
    number: formatIdentifier(rate.gr_no),
    customer: rate.customer_name ?? '',
    date: dateText(rate.grn_date),
  });

export const grnOnlyFigures = (rate: ItemGrnRate): string =>
  t(rate.price_type === 'one_time' ? 'grn.rates.figuresOneTime' : 'grn.rates.figures', {
    band: bandText(rate.weight_min, rate.weight_max),
    rent: money(rate.unit_price),
    labour: money(rate.labour_rate),
    tax: localizeDigits(String(rate.tax_percent)),
  });

/** The rates by GRN, in the order the server gave the GRNs, each GRN's bands by weight. */
export function groupByGrn(rates: ItemGrnRate[]): ItemGrnRate[][] {
  const groups = new Map<string, ItemGrnRate[]>();
  for (const rate of rates) groups.set(rate.gr_id, [...(groups.get(rate.gr_id) ?? []), rate]);
  return [...groups.values()].map(bands => [...bands].sort((a, b) => a.weight_min - b.weight_min));
}
