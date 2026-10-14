/** What the item page shows for one scope (the default rate, or one customer's own): a card per price type. */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import { scopeView, type ScopeView } from './rateModel';

export interface TypePlan {
  priceType: PriceType;
  view: ScopeView;
}

export interface ScopePlan {
  /** Types that have a rate in force or one that comes later, monthly first. */
  plans: TypePlan[];
  /** Every old rate of the scope, newest first. */
  ended: ItemStoragePrice[];
  /** Nothing in force or coming, but an old rate exists (the rate ended). */
  endedOnly: boolean;
  /** The last day of the most recent old rate. */
  lastEnded: string | null;
}

const ORDER: PriceType[] = ['monthly', 'one_time'];

export function planScope(rows: ItemStoragePrice[], day: string): ScopePlan {
  const plans: TypePlan[] = [];
  const ended: ItemStoragePrice[] = [];
  for (const priceType of ORDER) {
    const view = scopeView(rows.filter(r => r.price_type === priceType), day);
    ended.push(...view.ended);
    if (view.inForce.length > 0 || view.upcoming) plans.push({ priceType, view });
  }
  ended.sort((a, b) => (b.effective_to ?? '').localeCompare(a.effective_to ?? '') || b.effective_from.localeCompare(a.effective_from));
  return { plans, ended, endedOnly: plans.length === 0 && ended.length > 0, lastEnded: ended[0]?.effective_to ?? null };
}
