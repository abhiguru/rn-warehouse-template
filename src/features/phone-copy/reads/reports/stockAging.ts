/**
 * `get_stock_aging_report` over the phone copy (WH-299, product/tech/app-offline-read-from-copy.md sections 4 and 8;
 * backend migration 119). The age of stock counts from `copyToday` (Product's PR4): the phone's day in India, never
 * before the day the copy was last confirmed.
 */
import { copyToday } from '@/features/phone-copy/pgCompat';
import type { CopyReader } from '@/features/phone-copy/readRoute';
import {
  compareIds, compareText, dayOf, daysBetween, fromUnits, numberOf, parseRow, percentage, roundedAverage, weightSum, weightUnits, type Row,
} from './reportParts';

const DEFAULT_BUCKETS = [120, 240, 364] as const;

interface Buckets {
  names: [string, string, string, string];
  /** The bucket a number of days falls in. */
  of: (days: number) => string;
}

function bucketsOf(requested: readonly number[] | undefined): Buckets {
  const first = requested?.[0] ?? DEFAULT_BUCKETS[0];
  const second = requested?.[1] ?? DEFAULT_BUCKETS[1];
  const third = requested?.[2] ?? DEFAULT_BUCKETS[2];
  const names: Buckets['names'] = [`0-${first}`, `${first + 1}-${second}`, `${second + 1}-${third}`, `${third}+`];
  return { names, of: days => (days <= first ? names[0] : days <= second ? names[1] : days <= third ? names[2] : names[3]) };
}

interface LotAge {
  grn: Row;
  lot: Row;
  days: number;
  bucket: string;
}

export async function readCustomerStockAging(q: CopyReader, customerId: string, requested: readonly number[] | undefined): Promise<Row> {
  const today = copyToday(q.asOf);
  const buckets = bucketsOf(requested);
  const found = await q.all<{ grn_row: string; lot_row: string }>(
    `SELECT g.row AS grn_row, t.row AS lot_row FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.customer_id = ? AND g.deleted_at IS NULL AND t.stock > 0`,
    [customerId]
  );
  const detailed: LotAge[] = found.map(record => {
    const grn = parseRow(record.grn_row);
    const days = daysBetween(dayOf(grn.date) ?? today, today);
    return { grn, lot: parseRow(record.lot_row), days, bucket: buckets.of(days) };
  });

  const total = detailed.length;
  const quantity = detailed.reduce((sum, entry) => sum + numberOf(entry.lot.stock), 0);
  const units = await q.get<{ units: number | null }>(
    `SELECT SUM(${weightUnits('t.stock')}) AS units FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.customer_id = ? AND g.deleted_at IS NULL AND t.stock > 0`,
    [customerId]
  );
  const over = detailed.filter(entry => entry.days > 365);
  const summary: Row = {
    total_items: total,
    total_quantity: quantity,
    total_weight_kg: weightSum(units?.units),
    oldest_stock_days: total ? Math.max(...detailed.map(entry => entry.days)) : 0,
    average_age_days: total ? roundedAverage(detailed.reduce((sum, entry) => sum + entry.days, 0), total) : 0,
    items_over_365_days: over.length,
    qty_over_365_days: over.reduce((sum, entry) => sum + numberOf(entry.lot.stock), 0),
    // No dispatch is on the phone (WH-381): the dispatch figures are not made up here, and the screen hides what it has none of.
    avg_dispatch_velocity_days: null,
    items_no_recent_dispatch: 0,
  };

  const byBucket: Record<string, Row> = {};
  for (const name of buckets.names) {
    const inBucket = detailed.filter(entry => entry.bucket === name);
    let bucketUnits = 0;
    for (const entry of inBucket) {
      if (typeof entry.lot.weight === 'number') bucketUnits += Math.round(entry.lot.weight * 1_000_000) * numberOf(entry.lot.stock);
    }
    byBucket[name] = {
      item_count: inBucket.length,
      total_quantity: inBucket.reduce((sum, entry) => sum + numberOf(entry.lot.stock), 0),
      total_weight: fromUnits(bucketUnits) ?? 0,
      percentage: percentage(inBucket.length, total),
    };
  }

  detailed.sort((a, b) => b.days - a.days || compareText(a.grn.gr_no, b.grn.gr_no) || compareIds(a.lot.id, b.lot.id));
  const items = detailed.map(entry => ({
    grn_id: entry.grn.id,
    gr_no: entry.grn.gr_no ?? null,
    item_name: entry.lot.item_name ?? null,
    packaging: entry.lot.packaging ?? null,
    current_stock: entry.lot.stock ?? null,
    original_qty: entry.lot.qty ?? null,
    weight: entry.lot.weight ?? null,
    rack: entry.lot.rack ?? null,
    package_mark: entry.lot.package_mark ?? null,
    grn_date: entry.grn.date ?? null,
    aging_days: entry.days,
    aging_bucket: entry.bucket,
  }));

  return {
    success: true,
    data: { summary, by_bucket: byBucket, items },
    metadata: { retrieved_at: q.asOf, customer_id: customerId, aging_buckets: requested ?? DEFAULT_BUCKETS },
  };
}

interface DayGroup {
  customer_id: string;
  name: string | null;
  day: string;
  lots: number;
  stock: number;
}

export async function readAllStockAging(q: CopyReader, requested: readonly number[] | undefined): Promise<Row> {
  const today = copyToday(q.asOf);
  const buckets = bucketsOf(requested);
  // One row per customer and day of receipt: the ages are the same within it.
  const groups = await q.all<DayGroup>(
    `SELECT g.customer_id AS customer_id, json_extract(c.row, '$.name') AS name,
            date(g.date_us / 1000000 + 19800, 'unixepoch') AS day, COUNT(*) AS lots, SUM(t.stock) AS stock
       FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id JOIN customers c ON c.id = g.customer_id
      WHERE g.deleted_at IS NULL AND t.stock > 0
      GROUP BY g.customer_id, c.id, day`
  );
  const aged = groups.map(group => {
    const days = daysBetween(group.day, today);
    return { ...group, days, bucket: buckets.of(days) };
  });
  const lots = aged.reduce((sum, group) => sum + group.lots, 0);
  const quantity = aged.reduce((sum, group) => sum + group.stock, 0);
  const daysSum = aged.reduce((sum, group) => sum + group.days * group.lots, 0);
  const over = aged.filter(group => group.days > 365);
  const summary: Row = {
    total_customers: new Set(aged.map(group => group.customer_id)).size,
    total_items: lots,
    total_quantity: quantity,
    oldest_stock_days: aged.length ? Math.max(...aged.map(group => group.days)) : 0,
    average_age_days: lots ? roundedAverage(daysSum, lots) : 0,
    items_over_365_days: over.reduce((sum, group) => sum + group.lots, 0),
    qty_over_365_days: over.reduce((sum, group) => sum + group.stock, 0),
  };
  const byBucket: Record<string, Row> = {};
  for (const name of buckets.names) {
    const inBucket = aged.filter(group => group.bucket === name);
    const count = inBucket.reduce((sum, group) => sum + group.lots, 0);
    byBucket[name] = {
      item_count: count,
      total_quantity: inBucket.reduce((sum, group) => sum + group.stock, 0),
      percentage: percentage(count, lots),
    };
  }

  const perCustomer = new Map<string, typeof aged>();
  for (const group of aged) {
    const list = perCustomer.get(group.customer_id);
    if (list) list.push(group);
    else perCustomer.set(group.customer_id, [group]);
  }
  const customers = [...perCustomer].map(([customerId, list]) => {
    const count = list.reduce((sum, group) => sum + group.lots, 0);
    const distribution: Record<string, number> = {};
    for (const name of buckets.names) {
      distribution[name] = list.filter(group => group.bucket === name).reduce((sum, group) => sum + group.stock, 0);
    }
    return {
      customer_id: customerId,
      customer_name: list[0]?.name ?? null,
      total_stock: list.reduce((sum, group) => sum + group.stock, 0),
      average_age_days: roundedAverage(list.reduce((sum, group) => sum + group.days * group.lots, 0), count),
      oldest_stock_days: Math.max(...list.map(group => group.days)),
      items_over_365_days: list.filter(group => group.days > 365).reduce((sum, group) => sum + group.lots, 0),
      aging_distribution: distribution,
    };
  });
  customers.sort(
    (a, b) => b.average_age_days - a.average_age_days || compareText(a.customer_name, b.customer_name) || compareIds(a.customer_id, b.customer_id)
  );
  return {
    success: true,
    data: { summary, by_bucket: byBucket, by_customer: customers },
    metadata: { retrieved_at: q.asOf, aging_buckets: requested ?? DEFAULT_BUCKETS },
  };
}
