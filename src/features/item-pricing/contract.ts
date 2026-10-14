import type { PriceType } from '@/types/item-pricing.types';

/** How the editor opens. 'invoice' is resolved by the editor itself (section 10). */
export type EditorMode = 'change' | 'add' | 'addCustomer' | 'correct' | 'upcoming' | 'invoice';

/** Router params are strings. snake_case names are the ones the invoice screen already sends. */
export type EditorParams = {
  mode: EditorMode;
  item_id: string;
  item_name?: string;
  /** Missing = the default rate (all customers); for 'addCustomer' missing = the editor cannot open (the picker comes first). */
  customer_id?: string;
  customer_name?: string;
  price_type?: PriceType;
  /** 'correct' and 'upcoming': the start (YYYY-MM-DD) of the rate being corrected or edited. 'change'/'add'/'addCustomer': a start to preselect. */
  starts_on?: string;
  // Invoice prefill (mode 'invoice'): the line as the invoice shows it.
  unit_price?: string;
  labour_rate?: string;
  tax_percent?: string;
  weight_min?: string;
  weight_max?: string;
  /** Goods-received date (YYYY-MM-DD) of the line. */
  grn_date?: string;
  /** '1' when the tapped invoice group holds lots of several received days (grn_date is the latest). */
  grn_dates_differ?: '1';
};

/** The stop screen. price_type and the scope decide what stops; the last day is chosen on the screen. */
export type StopParams = {
  item_id: string;
  item_name?: string;
  customer_id?: string;
  customer_name?: string;
  price_type: PriceType;
};

export const itemRatesPath = (itemId: string, on?: string) =>
  ({ pathname: '/item-rates/[itemId]', params: on ? { itemId, on } : { itemId } }) as const;
export const customerRatePath = (itemId: string, customerId: string, on?: string) =>
  ({ pathname: '/item-rates/[itemId]/customer/[customerId]', params: on ? { itemId, customerId, on } : { itemId, customerId } }) as const;
export const editorPath = (params: EditorParams) => ({ pathname: '/item-rates/edit', params }) as const;
export const stopPath = (params: StopParams) => ({ pathname: '/item-rates/stop', params }) as const;
export const historyPath = (p: { item_id?: string; customer_id?: string; item_name?: string } = {}) =>
  ({ pathname: '/item-price-history', params: p }) as const;

// A save in the editor, the stop screen or a delete tells the pages that show rates to refetch that item.
type Listener = (itemId: string) => void;
const listeners = new Set<Listener>();
export const subscribeRatesChanged = (fn: Listener): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** How many times each item was announced as changed: a read that began before the latest one is stale. */
const changeCounts = new Map<string, number>();
export const ratesChangeCount = (itemId: string): number => changeCounts.get(itemId) ?? 0;
export const notifyRatesChanged = (itemId: string): void => {
  changeCounts.set(itemId, ratesChangeCount(itemId) + 1);
  listeners.forEach(fn => fn(itemId));
};
