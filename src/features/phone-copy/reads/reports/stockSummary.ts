/**
 * `get_customer_stock_summary` and `get_all_stock_summary` over the phone copy (WH-299, product/tech/
 * app-offline-read-from-copy.md sections 4, 6 and 8; backend cd9531e baseline). They answer the functions' own JSON.
 * "Today" for the 360 days of the emptied lots is `copyToday` (Product's PR4).
 */
import { copyToday } from '@/features/phone-copy/pgCompat';
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { sentHeldByCopy, unsentLotsOf, unsentStockOf } from '../newDocuments';
import {
  addDays, compareIds, compareText, dayOf, dayStartUs, fromUnits, numberOf, parseRow, textOf, weightSum, weightUnits, type Row,
} from './reportParts';

interface LotLine {
  grn: Row;
  lot: Row;
  /** The lot's `emptied_us`. */
  emptiedUs: number | null;
}

/** Newest receipt first: the order that names an item after its latest receipt. */
const newestFirst = (a: LotLine, b: LotLine): number => {
  const byDate = Number(b.grn.date_us ?? 0) - Number(a.grn.date_us ?? 0);
  if (byDate) return byDate;
  const created = (textOf(b.grn.created_at) ?? '').localeCompare(textOf(a.grn.created_at) ?? '');
  return created || -compareIds(a.lot.id, b.lot.id);
};

interface Record2 {
  grn_row: string;
  lot_row: string;
  date_us: number | null;
  emptied_us: number | null;
}

async function lotLines(q: CopyReader, where: string, params: (string | number)[]): Promise<LotLine[]> {
  const found = await q.all<Record2>(
    `SELECT g.row AS grn_row, t.row AS lot_row, g.date_us AS date_us, t.emptied_us AS emptied_us
       FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.deleted_at IS NULL AND ${where}`,
    params
  );
  return found.map(record => ({
    grn: { ...parseRow(record.grn_row), date_us: record.date_us },
    lot: parseRow(record.lot_row),
    emptiedUs: record.emptied_us,
  }));
}

function groupByItem(lines: LotLine[]): Map<string, LotLine[]> {
  const groups = new Map<string, LotLine[]>();
  for (const line of lines) {
    const key = String(line.lot.item_id);
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  }
  return groups;
}

const grnEntry = (line: LotLine, emptied: boolean): Row => ({
  grn_id: line.grn.id,
  gr_no: line.grn.gr_no ?? null,
  date: dayOf(line.grn.date),
  orig_qty: line.lot.qty ?? null,
  stock: line.lot.stock ?? null,
  item_weight: line.lot.weight ?? null,
  rack: line.lot.rack ?? null,
  packaging: line.lot.packaging ?? null,
  package_mark: line.lot.package_mark ?? null,
  ...(emptied ? { emptied_date: dayOf(line.lot.emptied_at) } : {}),
});

const itemName = (group: LotLine[]): unknown => [...group].sort(newestFirst)[0]?.lot.item_name ?? null;

export async function readCustomerStockSummary(q: CopyReader, customerId: string): Promise<Row> {
  const today = copyToday(q.asOf);
  const inStock = await lotLines(q, 'g.customer_id = ? AND t.stock > 0', [customerId]);

  const dates = inStock.map(line => Number(line.grn.date_us ?? 0));
  const oldest = inStock.length ? Math.min(...dates) : null;
  const oldestLine = oldest === null ? null : inStock.find(line => Number(line.grn.date_us ?? 0) === oldest);
  const weightRows = await q.get<{ units: number | null }>(
    `SELECT SUM(${weightUnits('t.stock')}) AS units FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.deleted_at IS NULL AND g.customer_id = ? AND t.stock > 0`,
    [customerId]
  );
  const empty = await q.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM goodsreceived g
      WHERE g.customer_id = ? AND g.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM goodsreceived_trl t WHERE t.gr_id = g.id AND t.stock > 0)`,
    [customerId]
  );
  const lastGrn = await q.get<{ row: string }>(
    `SELECT row FROM goodsreceived WHERE customer_id = ? AND deleted_at IS NULL
      ORDER BY date_us DESC, json_extract(row, '$.created_at') DESC LIMIT 1`,
    [customerId]
  );
  const lastGrnRow = lastGrn ? parseRow(lastGrn.row) : null;
  // `MAX(date)` is the newest of all, which the first row of that order is.
  const unsent = unsentStockOf(customerId, await sentHeldByCopy(q));
  const summary: Row = {
    total_items: new Set(inStock.map(line => line.lot.item_id)).size,
    total_quantity: inStock.reduce((sum, line) => sum + numberOf(line.lot.stock), 0) + unsent.bags,
    total_weight_kg: weightSum(weightRows?.units) + unsent.weight,
    oldest_stock_date: oldestLine ? dayOf(oldestLine.grn.date) : null,
    grn_count: new Set(inStock.map(line => line.grn.id)).size + unsent.receipts,
    grn_count_empty: empty?.n ?? 0,
    last_grn_date: lastGrnRow ? dayOf(lastGrnRow.date) : null,
    last_grn_no: lastGrnRow?.gr_no ?? null,
    // No dispatch is on the phone (WH-381); no screen draws these two offline.
    last_dispatch_date: null,
    last_dispatch_no: null,
    // The bags of this person's unsent new GRNs the figures above count (WH-161; 0 when none).
    ...(unsent.bags > 0 ? { includes_unsent: unsent.bags } : {}),
  };

  const items = [...groupByItem(inStock)].map(([itemId, group]) => ({
    name: itemName(group),
    row: {
      item_id: itemId,
      item_name: itemName(group),
      packaging: null,
      total_stock: group.reduce((sum, line) => sum + numberOf(line.lot.stock), 0),
      total_weight: weightOfGroup(group),
      grn_count: new Set(group.map(line => line.grn.id)).size,
      grns: [...group].sort((a, b) => Number(b.grn.date_us ?? 0) - Number(a.grn.date_us ?? 0) || newestFirst(a, b)).map(line => grnEntry(line, false)),
    } satisfies Row,
  }));
  items.sort((a, b) => compareText(a.name, b.name));

  // Emptied lots: stock gone, and emptied since the start of the day 360 days before today in India.
  const cutoff = dayStartUs(addDays(today, -360));
  const emptied = (await lotLines(q, 'g.customer_id = ? AND t.stock = 0 AND t.qty > 0', [customerId])).filter(
    line => line.emptiedUs !== null && line.emptiedUs >= cutoff
  );
  const outOfStock = [...groupByItem(emptied)].map(([itemId, group]) => ({
    name: itemName(group),
    row: {
      item_id: itemId,
      item_name: itemName(group),
      packaging: null,
      grn_count: new Set(group.map(line => line.grn.id)).size,
      grns: [...group].sort((a, b) => (b.emptiedUs ?? 0) - (a.emptiedUs ?? 0) || compareIds(a.lot.id, b.lot.id)).map(line => grnEntry(line, true)),
    } satisfies Row,
  }));
  outOfStock.sort((a, b) => compareText(a.name, b.name));

  return { summary, items: items.map(item => item.row), out_of_stock_items: outOfStock.map(item => item.row) };
}

/** Sum of `weight * stock` of a group, exact to a millionth. */
function weightOfGroup(group: LotLine[]): number {
  let units = 0;
  for (const line of group) {
    const weight = line.lot.weight;
    if (typeof weight === 'number') units += Math.round(weight * 1_000_000) * numberOf(line.lot.stock);
  }
  return units / 1_000_000;
}

interface CustomerStockRecord {
  customer_id: string;
  name: string | null;
  stock: number;
  units: number | null;
  items: number;
  grns: number;
  oldest_us: number | null;
  latest_us: number | null;
}

export async function readAllStockSummary(q: CopyReader): Promise<Row> {
  const total = await q.get<{
    customers: number; items: number; quantity: number | null; units: number | null; grns: number; oldest_us: number | null;
  }>(
    `SELECT COUNT(DISTINCT g.customer_id) AS customers, COUNT(DISTINCT t.item_id) AS items, SUM(t.stock) AS quantity,
            SUM(${weightUnits('t.stock')}) AS units, COUNT(DISTINCT g.id) AS grns, MIN(g.date_us) AS oldest_us
       FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.deleted_at IS NULL AND t.stock > 0`
  );
  const oldest = total?.oldest_us !== null && total?.oldest_us !== undefined
    ? await q.get<{ day: string }>("SELECT date(? / 1000000 + 19800, 'unixepoch') AS day", [total.oldest_us])
    : null;
  const found = await q.all<CustomerStockRecord>(
    `SELECT c.id AS customer_id, json_extract(c.row, '$.name') AS name, SUM(t.stock) AS stock,
            SUM(${weightUnits('t.stock')}) AS units, COUNT(DISTINCT t.item_id) AS items, COUNT(DISTINCT g.id) AS grns,
            MIN(g.date_us) AS oldest_us, MAX(g.date_us) AS latest_us
       FROM customers c JOIN goodsreceived g ON g.customer_id = c.id AND g.deleted_at IS NULL
       JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE c.deleted_at IS NULL AND t.stock > 0
      GROUP BY c.id`
  );
  const dates = new Map<number, string>();
  const dayOfUs = async (us: number | null): Promise<string | null> => {
    if (us === null) return null;
    const known = dates.get(us);
    if (known) return known;
    const row = await q.get<{ day: string }>("SELECT date(? / 1000000 + 19800, 'unixepoch') AS day", [us]);
    if (row) dates.set(us, row.day);
    return row?.day ?? null;
  };
  found.sort((a, b) => b.stock - a.stock || compareText(a.name, b.name) || compareIds(a.customer_id, b.customer_id));
  const customers: Row[] = [];
  for (const record of found) {
    customers.push({
      customer_id: record.customer_id,
      customer_name: record.name,
      total_stock: record.stock,
      total_weight: fromUnits(record.units),
      item_count: record.items,
      grn_count: record.grns,
      oldest_date: await dayOfUs(record.oldest_us),
      latest_date: await dayOfUs(record.latest_us),
    });
  }
  const held = await sentHeldByCopy(q);
  const unsent = unsentStockOf(undefined, held);
  const known = new Set(customers.map(customer => customer.customer_id));
  const unsentCustomers = new Set(unsentLotsOf(undefined, held).map(lot => lot.customer_id).filter((id): id is string => id !== null && !known.has(id)));
  for (const customer of customers) {
    const own = unsentStockOf(String(customer.customer_id), held);
    if (own.bags > 0) {
      customer.total_stock = Number(customer.total_stock) + own.bags;
      customer.total_weight = Number(customer.total_weight) + own.weight;
      customer.grn_count = Number(customer.grn_count) + own.receipts;
    }
  }
  return {
    success: true,
    summary: {
      total_customers_with_stock: (total?.customers ?? 0) + unsentCustomers.size,
      total_items: total?.items ?? 0,
      total_quantity: (total?.quantity ?? 0) + unsent.bags,
      total_weight_kg: weightSum(total?.units) + unsent.weight,
      oldest_stock_date: oldest?.day ?? null,
      grn_count: (total?.grns ?? 0) + unsent.receipts,
      ...(unsent.bags > 0 ? { includes_unsent: unsent.bags } : {}),
    },
    customers,
  };
}

