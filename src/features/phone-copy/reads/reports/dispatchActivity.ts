/**
 * `get_customer_dispatch_activity` and `get_all_dispatch_activity` over the phone copy (WH-299, product/tech/
 * app-offline-read-from-copy.md sections 4 and 8; backend baseline). They answer the functions' own JSON.
 */
import type { CopyReader } from '@/features/phone-copy/readRoute';
import { compareIds, compareText, dayEndUs, dayOf, dayStartUs, fromUnits, numberOf, parseRow, weightSum, type Row } from './reportParts';

const unitsOf = (weight: unknown, quantity: unknown): number =>
  typeof weight === 'number' ? Math.round(weight * 1_000_000) * numberOf(quantity) : 0;

interface Line {
  disp_row: string;
  line_row: string;
  lot_row: string | null;
  grn_row: string | null;
}

export async function readCustomerDispatchActivity(q: CopyReader, customerId: string, fromDate: string, toDate: string): Promise<Row> {
  const from = dayStartUs(fromDate);
  const to = dayEndUs(toDate);
  const lines = await q.all<Line>(
    `SELECT d.row AS disp_row, dt.row AS line_row, t.row AS lot_row, g.row AS grn_row
       FROM dispatch d LEFT JOIN dispatch_trl dt ON dt.disp_id = d.id
       LEFT JOIN goodsreceived_trl t ON t.id = dt.gr_trl_id LEFT JOIN goodsreceived g ON g.id = dt.gr_id
      WHERE d.customer_id = ? AND d.deleted_at IS NULL AND d.disp_date_us >= ? AND d.disp_date_us < ?
      ORDER BY d.id, dt.id`,
    [customerId, from, to]
  );
  const dispatches = new Map<string, { disp: Row; lines: { line: Row; lot: Row | null; grn: Row | null }[] }>();
  for (const record of lines) {
    const disp = parseRow(record.disp_row);
    const entry = dispatches.get(String(disp.id)) ?? { disp, lines: [] };
    if (record.line_row !== null) {
      entry.lines.push({
        line: parseRow(record.line_row),
        lot: record.lot_row === null ? null : parseRow(record.lot_row),
        grn: record.grn_row === null ? null : parseRow(record.grn_row),
      });
    }
    dispatches.set(String(disp.id), entry);
  }

  const list = [...dispatches.values()].map(entry => {
    // The summary joins each line to its lot; the dispatch's own total takes every line.
    const joined = entry.lines.filter(line => line.lot !== null);
    const withGrn = joined.filter(line => line.grn !== null);
    const items = [...withGrn].sort((a, b) => compareText(a.lot?.item_name, b.lot?.item_name) || compareIds(a.line.id, b.line.id));
    return {
      entry,
      joined,
      view: {
        disp_id: entry.disp.id,
        disp_no: entry.disp.disp_no ?? null,
        disp_date: dayOf(entry.disp.disp_date),
        supervisor_name: entry.disp.supervisor_name ?? null,
        total_qty: entry.lines.length ? entry.lines.reduce((sum, line) => sum + numberOf(line.line.disp_qty), 0) : null,
        total_weight: fromUnits(withGrn.reduce((sum, line) => sum + unitsOf(line.lot?.weight, line.line.disp_qty), 0)) ?? 0,
        items: items.length
          ? items.map(line => ({
              item_name: line.lot?.item_name ?? null,
              qty: line.line.disp_qty ?? null,
              source_grn: line.grn?.gr_no ?? null,
              source_grn_id: line.grn?.id ?? null,
              orig_qty: line.lot?.qty ?? null,
              package_mark: line.lot?.package_mark ?? null,
              rack: line.lot?.rack ?? null,
              weight: fromUnits(unitsOf(line.lot?.weight, line.line.disp_qty)) ?? 0,
            }))
          : null,
      } satisfies Row,
    };
  });
  list.sort((a, b) => {
    const left = String(a.view.disp_date ?? '');
    const right = String(b.view.disp_date ?? '');
    return left < right ? 1 : left > right ? -1 : compareIds(a.entry.disp.id, b.entry.disp.id);
  });
  const joinedLines = list.flatMap(row => row.joined);
  return {
    summary: {
      total_dispatches: list.filter(row => row.joined.length > 0).length,
      total_quantity: joinedLines.reduce((sum, line) => sum + numberOf(line.line.disp_qty), 0),
      total_weight: weightSum(joinedLines.reduce((sum, line) => sum + unitsOf(line.lot?.weight, line.line.disp_qty), 0)),
    },
    dispatches: list.map(row => row.view),
  };
}

export async function readAllDispatchActivity(q: CopyReader, fromDate: string, toDate: string): Promise<Row> {
  const from = dayStartUs(fromDate);
  const to = dayEndUs(toDate);
  const within = 'd.deleted_at IS NULL AND d.disp_date_us >= ? AND d.disp_date_us < ?';
  const total = await q.get<{ dispatches: number; customers: number; quantity: number | null }>(
    `SELECT COUNT(DISTINCT d.id) AS dispatches, COUNT(DISTINCT d.customer_id) AS customers, SUM(dt.disp_qty) AS quantity
       FROM dispatch d JOIN dispatch_trl dt ON dt.disp_id = d.id WHERE ${within}`,
    [from, to]
  );
  const customers = await q.all<{ customer_id: string; name: string | null; dispatches: number; quantity: number | null; latest: number | null }>(
    `SELECT c.id AS customer_id, json_extract(c.row, '$.name') AS name, COUNT(DISTINCT d.id) AS dispatches,
            SUM(dt.disp_qty) AS quantity, MAX(d.disp_date_us) AS latest
       FROM customers c JOIN dispatch d ON d.customer_id = c.id AND d.deleted_at IS NULL
       JOIN dispatch_trl dt ON dt.disp_id = d.id
      WHERE d.disp_date_us >= ? AND d.disp_date_us < ? GROUP BY c.id`,
    [from, to]
  );
  customers.sort((a, b) => numberOf(b.quantity) - numberOf(a.quantity) || compareText(a.name, b.name) || compareIds(a.customer_id, b.customer_id));
  const dates = await q.all<{ day: string; dispatches: number; quantity: number | null; customers: number }>(
    `SELECT date(d.disp_date_us / 1000000 + 19800, 'unixepoch') AS day, COUNT(DISTINCT d.id) AS dispatches,
            SUM(dt.disp_qty) AS quantity, COUNT(DISTINCT d.customer_id) AS customers
       FROM dispatch d JOIN dispatch_trl dt ON dt.disp_id = d.id WHERE ${within} GROUP BY day ORDER BY day DESC`,
    [from, to]
  );
  const byCustomer: Row[] = [];
  for (const customer of customers) {
    const latest = customer.latest === null ? null : await q.get<{ day: string }>("SELECT date(? / 1000000 + 19800, 'unixepoch') AS day", [customer.latest]);
    byCustomer.push({
      customer_id: customer.customer_id,
      customer_name: customer.name,
      dispatch_count: customer.dispatches,
      total_qty: customer.quantity,
      latest_dispatch: latest?.day ?? null,
    });
  }
  return {
    success: true,
    summary: {
      total_dispatches: total?.dispatches ?? 0,
      total_customers: total?.customers ?? 0,
      total_quantity: total?.quantity ?? 0,
      from_date: fromDate,
      to_date: toDate,
    },
    by_customer: byCustomer,
    by_date: dates.map(row => ({ date: row.day, dispatch_count: row.dispatches, total_qty: row.quantity, customer_count: row.customers })),
  };
}
