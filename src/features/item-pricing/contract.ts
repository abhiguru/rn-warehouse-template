import type { PriceType } from '@/types/item-pricing.types';

/**
 * How a rate form opens. The rate boxes (useRateEditor) use every mode; the edit screen (/item-rates/edit) is
 * opened with 'invoice' only, by the price pencil of an invoice line, and resolves it to a mode itself (section 10).
 */
export type EditorMode = 'change' | 'add' | 'addCustomer' | 'correct' | 'upcoming' | 'invoice';

/** What a rate form needs to open. Router params are strings; snake_case names are the ones the invoice screen sends. */
export type EditorParams = {
  mode: EditorMode;
  item_id: string;
  item_name?: string;
  /** Missing = the default rate (all customers); for 'addCustomer' missing = the edit screen cannot open. */
  customer_id?: string;
  customer_name?: string;
  price_type?: PriceType;
  /** 'correct' and 'upcoming': the start (YYYY-MM-DD) of the rate being corrected or edited. 'change'/'add'/'addCustomer': a start to preselect. */
  starts_on?: string;
  /** '1': the form opens with one empty band added after the last (the Add button of the Item pricing list). */
  add_band?: '1';
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

/** The item page. `on` opens it on another day (read-only); `addBand` opens the default box with one more empty band. */
export const itemRatesPath = (itemId: string, on?: string, addBand?: boolean) =>
  ({
    pathname: '/item-rates/[itemId]',
    params: { itemId, ...(on ? { on } : {}), ...(addBand ? { add_band: '1' } : {}) },
  }) as const;
/** The customers who have their own rate for the item (`on`: the day the item page was looking at). */
export const customerListPath = (itemId: string, on?: string) =>
  ({ pathname: '/item-rates/[itemId]/customers', params: on ? { itemId, on } : { itemId } }) as const;
/** The rates typed on single GRNs for the item. */
export const grnListPath = (itemId: string) => ({ pathname: '/item-rates/[itemId]/grns', params: { itemId } }) as const;
/** The Pricing tab of a customer, on the box of one item when `itemId` is given. */
export const customerPricingPath = (customerId: string, itemId?: string) =>
  ({ pathname: '/customer/[id]', params: { id: customerId, tab: 'pricing', ...(itemId ? { item: itemId } : {}) } }) as const;
/** The box of one customer's own rate for one item. `add` opens the box for a new rate at once (the Pricing tab's "+ Add item"). */
export const customerRatePath = (itemId: string, customerId: string, on?: string, customerName?: string, add?: boolean) =>
  ({
    pathname: '/item-rates/[itemId]/customer/[customerId]',
    params: {
      itemId,
      customerId,
      ...(on ? { on } : {}),
      ...(customerName ? { customer_name: customerName } : {}),
      ...(add ? { add: '1' } : {}),
    },
  }) as const;
/** The full-screen form that adds a customer's own rate for one item (owner, 2026-10-17). */
export const customerRateAddPath = (itemId: string, customerId: string, customerName?: string) =>
  ({
    pathname: '/item-rates/[itemId]/customer-add/[customerId]',
    params: { itemId, customerId, ...(customerName ? { customer_name: customerName } : {}) },
  }) as const;
/** What the edit screen is opened with: the price pencil of an invoice line, nothing else. */
export type InvoiceEditorParams = EditorParams & { mode: 'invoice' };
export const editorPath = (params: InvoiceEditorParams) => ({ pathname: '/item-rates/edit', params }) as const;
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
