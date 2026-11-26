/**
 * `get_standard_rate` over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0): the server's `data`,
 * key for key, for an administrator or a supervisor. Its text is the baseline function, as installed on temp1. Staff are
 * refused online (migration 90), so for them this read does not answer and the server's refusal is shown as today.
 */
import { copyToday, enCompare, parseTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareNullsLast, compareNumbers, compareText, numberOf, parseRows, pick, textOf, type Row } from './rows';

export interface StandardRateData {
  tiers: Row[];
  updated_at: string | null;
  updated_by_name: string | null;
}

export async function readStandardRate(q: CopyReader): Promise<StandardRateData> {
  if (q.role === 'staff') throw new Error('the standard rate is refused to staff');
  const tiers = parseRows(await q.all<{ row: string }>('SELECT row FROM standard_rate_tiers'));
  const at = (tier: Row): number | null => parseTimestampUs(textOf(tier.updated_at));
  const byMin = (a: Row, b: Row) => compareNullsLast(numberOf(a.weight_min), numberOf(b.weight_min), compareNumbers);
  // The newest change (ties by the lower band) names who made it; `max(updated_at)` is the stamp the editor sends back.
  const newest = [...tiers].sort((a, b) => compareNullsLast(at(b), at(a), compareNumbers) || byMin(a, b) || compareText(String(a.id), String(b.id)))[0];
  const authorId = textOf(newest?.updated_by);
  const by = authorId === null
    ? null
    : await q.get<{ name: string | null }>("SELECT json_extract(row, '$.name') AS name FROM user_profiles WHERE id = ?", [authorId]);
  const stamps = tiers.filter(tier => at(tier) !== null);
  const latest = stamps.length ? stamps.reduce((a, b) => ((at(b) ?? 0) > (at(a) ?? 0) ? b : a)) : null;
  return {
    tiers: [...tiers].sort(byMin).map(tier => ({
      weight_min: pick(tier, 'weight_min'), weight_max: pick(tier, 'weight_max'), unit_price: pick(tier, 'unit_price'),
      labour_rate: pick(tier, 'labour_rate'), tax_percent: pick(tier, 'tax_percent'),
    })),
    updated_at: latest ? pick(latest, 'updated_at') as string : null,
    updated_by_name: by?.name ?? null,
  };
}

export interface ItemRatesRequest {
  /** `p_filters`: item_ids, customer_ids, price_type, weight_min, weight_max, effective_from, effective_to, include_expired. */
  filters: Record<string, unknown>;
  sortBy: string;
  sortOrder: string;
  limit: number;
  offset: number;
}

export interface ItemRatesData {
  data: Row[];
  pagination: { total: number; limit: number; offset: number; has_more: boolean };
}

const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

/**
 * `get_item_storage_prices` for an administrator or a supervisor (staff are refused online, migration 90): the rows as the
 * function lists them, with its filters and sorts. Its text is the baseline function with migration 144's item_packaging. The
 * earliest day a rate may start (`earliest_start`) is not in the feed: it is left out, so a screen that needs it asks the server.
 * "Today", for the rates that have ended, is the phone's business day, never before the day the copy was confirmed.
 */
export async function readItemStoragePrices(q: CopyReader, request: ItemRatesRequest): Promise<ItemRatesData> {
  if (q.role === 'staff') throw new Error('the rates are refused to staff');
  const f = request.filters;
  const rows = parseRows(await q.all<{ row: string }>('SELECT row FROM item_storage_prices'));
  const items = new Map(parseRows(await q.all<{ row: string }>('SELECT row FROM items')).map(item => [String(item.id), item]));
  const customers = new Map(parseRows(await q.all<{ row: string }>('SELECT row FROM customers')).map(customer => [String(customer.id), customer]));
  const today = copyToday(q.asOf);
  const itemIds = idsOf(f.item_ids);
  const customerIds = idsOf(f.customer_ids);
  const priceType = f.price_type === 'one_time' || f.price_type === 'monthly' ? f.price_type : null;
  const wMin = numberOf(f.weight_min);
  const wMax = numberOf(f.weight_max);
  const from = textOf(f.effective_from);
  const to = textOf(f.effective_to);
  const includeExpired = f.include_expired === true;
  const matching = rows.filter(row => {
    const customer = textOf(row.customer_id);
    const end = textOf(row.effective_to);
    return (itemIds.length === 0 || itemIds.includes(String(row.item_id)))
      && (!Array.isArray(f.customer_ids) || (customerIds.length === 0 ? customer === null : customer !== null && customerIds.includes(customer)))
      && (priceType === null || row.price_type === priceType)
      && (wMin === null || (numberOf(row.weight_max) ?? 0) >= wMin)
      && (wMax === null || (numberOf(row.weight_min) ?? 0) <= wMax)
      && (from === null || (textOf(row.effective_from) ?? '') >= from)
      && (to === null || end === null || end <= to)
      && (includeExpired || end === null || end >= today);
  });
  const nameOf = (row: Row): string | null => textOf(items.get(String(row.item_id))?.name);
  const sign = request.sortOrder.toLowerCase() === 'desc' ? -1 : 1;
  // ORDER BY the chosen column then the server's secondary keys, missing values last whichever way it runs.
  const key = (row: Row): string | number | null => {
    switch (request.sortBy) {
      case 'customer_name': return textOf(customers.get(String(row.customer_id))?.name);
      case 'price_type': return textOf(row.price_type);
      case 'unit_price': return numberOf(row.unit_price);
      case 'weight_min': return numberOf(row.weight_min);
      case 'weight_max': return numberOf(row.weight_max);
      case 'effective_from': return textOf(row.effective_from);
      case 'effective_to': return textOf(row.effective_to);
      case 'created_at': return parseTimestampUs(textOf(row.created_at));
      default: return nameOf(row);
    }
  };
  const compareKeys = (x: string | number | null, y: string | number | null): number => {
    // A missing value comes last whichever way the sort runs (NULLS LAST).
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const base = typeof x === 'number' && typeof y === 'number' ? x - y : enCompare(String(x), String(y));
    return base * sign;
  };
  const byPriceType = (a: Row, b: Row): number => compareText(textOf(a.price_type) ?? '', textOf(b.price_type) ?? '');
  matching.sort((a, b) => {
    const main = compareKeys(key(a), key(b));
    if (main) return main;
    if (request.sortBy === 'price_type') return enCompare(nameOf(a), nameOf(b)) || compareText(String(a.id), String(b.id));
    if (request.sortBy === 'item_name' || !['customer_name', 'unit_price', 'weight_min', 'weight_max', 'effective_from', 'effective_to', 'created_at'].includes(request.sortBy)) {
      // effective_from DESC, missing last.
      return byPriceType(a, b) || compareNullsLast(textOf(b.effective_from), textOf(a.effective_from), compareText) || compareText(String(a.id), String(b.id));
    }
    return enCompare(nameOf(a), nameOf(b)) || byPriceType(a, b) || compareText(String(a.id), String(b.id));
  });
  const offset = Math.max(request.offset, 0);
  const page = matching.slice(offset, offset + request.limit).map(row => {
    const item = items.get(String(row.item_id));
    const customer = customers.get(String(row.customer_id));
    return {
      id: row.id, item_id: pick(row, 'item_id'), item_name: pick(item, 'name'), item_packaging: textOf(item?.packaging) ?? '', customer_id: pick(row, 'customer_id'),
      customer_name: pick(customer, 'name'), price_type: pick(row, 'price_type'), unit_price: pick(row, 'unit_price'), weight_min: pick(row, 'weight_min'),
      weight_max: pick(row, 'weight_max'), labour_rate: pick(row, 'labour_rate'), tax_percent: pick(row, 'tax_percent'),
      effective_from: pick(row, 'effective_from'), effective_to: pick(row, 'effective_to'), created_at: pick(row, 'created_at'), created_by: pick(row, 'created_by'),
    };
  });
  return { data: page, pagination: { total: matching.length, limit: request.limit, offset: request.offset, has_more: request.offset + request.limit < matching.length } };
}
