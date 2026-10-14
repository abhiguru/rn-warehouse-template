/**
 * The "Replace the rate from ...?" question of the rate editor and the stop screen.
 *
 * replace_item_rates answers LATER_RATES_EXIST with every row that starts after the new rate's
 * first day, and "Replace" deletes all of them, so the question names every planned rate. The
 * server also deletes (without asking) a planned rate that starts ON the first day, so the
 * screens ask about that one themselves before they send.
 */
import { t } from '@/i18n';
import type { ItemStoragePrice, PriceType, ReplaceRatesResult } from '@/types/item-pricing.types';
import { dateText, money } from './rateText';

export type LaterRow = NonNullable<ReplaceRatesResult['later']>[number];

const day = (value: string): string => value.slice(0, 10);

/** The planned rates of one scope that start exactly on `startsOn`, which is after today (the server deletes them silently). */
export function plannedOnDay(
  rows: ItemStoragePrice[],
  scope: { customerId: string | null; priceType: PriceType },
  startsOn: string,
  today: string,
  excludeIds: string[] = []
): LaterRow[] {
  if (startsOn <= today) return [];
  return rows
    .filter(
      r => (r.customer_id ?? null) === scope.customerId && r.price_type === scope.priceType &&
        day(r.effective_from) === startsOn && !excludeIds.includes(r.id)
    )
    .sort((a, b) => a.weight_min - b.weight_min)
    .map(r => ({ effective_from: day(r.effective_from), weight_min: r.weight_min, weight_max: r.weight_max, unit_price: r.unit_price }));
}

interface Group {
  from: string;
  amount: string;
}

/** One entry per start day, earliest first, with the rent (or the range of rents) of its bands. */
export function laterGroups(later: LaterRow[]): Group[] {
  const byDay = new Map<string, number[]>();
  for (const row of later) {
    const from = day(row.effective_from);
    byDay.set(from, [...(byDay.get(from) ?? []), Number(row.unit_price)]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, rents]) => {
      const low = Math.min(...rents);
      const high = Math.max(...rents);
      return { from, amount: low === high ? money(low) : `${money(low)}–${money(high)}` };
    });
}

/** Title and message of the question; `startsOn` is the first day of the new rate (or the day after the last day). */
export function laterDialogText(later: LaterRow[], startsOn: string, today: string): { title: string; message: string } {
  const groups = laterGroups(later);
  const first = groups[0];
  if (!first) return { title: '', message: '' };
  const inForce = groups.some(g => g.from <= today) ? t('pricing.edit.laterInForce') : '';
  if (groups.length > 1) {
    const list = groups.map(g => `${dateText(g.from)} (${g.amount})`).join(', ');
    return {
      title: t('pricing.edit.laterTitleMany', { count: groups.length }),
      message: [t('pricing.edit.laterMessageMany', { list }), inForce].filter(Boolean).join(' '),
    };
  }
  const base = first.from === startsOn
    ? t('pricing.edit.laterMessageSame', { date: dateText(first.from), amount: first.amount })
    : t('pricing.edit.laterMessage', { date: dateText(first.from), amount: first.amount });
  return {
    title: t('pricing.edit.laterTitle', { date: dateText(first.from) }),
    message: [base, inForce].filter(Boolean).join(' '),
  };
}
