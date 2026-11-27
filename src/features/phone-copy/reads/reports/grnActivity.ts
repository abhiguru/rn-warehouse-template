/**
 * `get_customer_grn_activity` and `get_all_grn_activity` over the phone copy (WH-299, product/tech/
 * app-offline-read-from-copy.md sections 4 and 8; backend baseline). They answer the functions' own JSON.
 */
import type { CopyReader } from '@/features/phone-copy/readRoute';
import {
  compareIds, compareText, dayEndUs, dayStartUs, fromUnits, numberOf, parseRow, scalarText, textOf, weightSum, type Row,
} from './reportParts';

const BUSINESS_DAY = "date(g.date_us / 1000000 + 19800, 'unixepoch')";

interface Range {
  from: number;
  to: number;
}
const rangeOf = (fromDate: string, toDate: string): Range => ({ from: dayStartUs(fromDate), to: dayEndUs(toDate) });

const unitsOf = (weight: unknown, quantity: unknown): number =>
  typeof weight === 'number' ? Math.round(weight * 1_000_000) * numberOf(quantity) : 0;

interface DispatchLine {
  lot_id: string;
  disp_id: string;
  disp_qty: number | null;
  disp_date: string | null;
  disp_date_us: number | null;
}

export async function readCustomerGrnActivity(q: CopyReader, customerId: string, fromDate: string, toDate: string): Promise<Row> {
  const range = rangeOf(fromDate, toDate);
  const grns = await q.all<{ row: string }>(
    `SELECT row FROM goodsreceived WHERE customer_id = ? AND deleted_at IS NULL AND date_us >= ? AND date_us < ?`,
    [customerId, range.from, range.to]
  );
  const receipts = grns.map(record => parseRow(record.row));
  const ids = JSON.stringify(receipts.map(grn => grn.id));

  const lotRows = await q.all<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE gr_id IN (SELECT value FROM json_each(?)) ORDER BY id', [ids]);
  const lotsOf = new Map<string, Row[]>();
  for (const record of lotRows) {
    const lot = parseRow(record.row);
    const key = String(lot.gr_id ?? lot.grn_id);
    const list = lotsOf.get(key);
    if (list) list.push(lot);
    else lotsOf.set(key, [lot]);
  }

  // Dispatches of those lots, the ones not deleted.
  const sent = await q.all<DispatchLine>(
    `SELECT dt.gr_trl_id AS lot_id, d.id AS disp_id, dt.disp_qty AS disp_qty, json_extract(d.row, '$.disp_date') AS disp_date,
            d.disp_date_us AS disp_date_us
       FROM dispatch_trl dt JOIN dispatch d ON d.id = dt.disp_id AND d.deleted_at IS NULL
      WHERE dt.gr_id IN (SELECT value FROM json_each(?))`,
    [ids]
  );
  const perLot = new Map<string, { total: number; dispatches: Set<string>; lastUs: number | null; last: string | null }>();
  for (const line of sent) {
    const info = perLot.get(line.lot_id) ?? { total: 0, dispatches: new Set<string>(), lastUs: null, last: null };
    info.total += line.disp_qty ?? 0;
    info.dispatches.add(line.disp_id);
    if (line.disp_date_us !== null && (info.lastUs === null || line.disp_date_us > info.lastUs)) {
      info.lastUs = line.disp_date_us;
      info.last = line.disp_date;
    }
    perLot.set(line.lot_id, info);
  }

  const photos = await q.all<{ grn_id: string; n: number }>(
    'SELECT grn_id, COUNT(*) AS n FROM grn_images WHERE grn_id IN (SELECT value FROM json_each(?)) GROUP BY grn_id',
    [ids]
  );
  const photoCount = new Map(photos.map(photo => [photo.grn_id, photo.n]));

  // The newest invoice of each receipt, as the server picks it.
  const invoiceRows = await q.all<{ row: string }>(
    `SELECT row FROM invoice WHERE deleted_at IS NULL AND gr_id IN (SELECT value FROM json_each(?))`,
    [ids]
  );
  const invoices = new Map<string, Row[]>();
  for (const record of invoiceRows) {
    const invoice = parseRow(record.row);
    const list = invoices.get(String(invoice.gr_id));
    if (list) list.push(invoice);
    else invoices.set(String(invoice.gr_id), [invoice]);
  }
  const newestFirst = (a: Row, b: Row): number =>
    compareDesc(a.inv_date, b.inv_date) || compareDesc(a.inv_fin_year, b.inv_fin_year) || compareDesc(a.inv_no, b.inv_no) || compareDesc(a.id, b.id);

  // The supervisors' names: a person's profile (administrators, supervisors) or the people list (staff).
  const names = new Map<string, string | null>();
  if (q.role !== 'customer') {
    for (const table of ['people', 'user_profiles'] as const) {
      for (const record of await q.all<{ row: string }>(`SELECT row FROM ${table}`)) {
        const person = parseRow(record.row);
        names.set(String(person.id), textOf(person.name));
      }
    }
  }

  const rows = receipts.map(grn => {
    const lots = lotsOf.get(String(grn.id)) ?? [];
    const totalQty = lots.reduce((sum, lot) => sum + numberOf(lot.qty), 0);
    const stock = lots.reduce((sum, lot) => sum + numberOf(lot.stock), 0);
    const infos = lots.map(lot => perLot.get(String(lot.id)));
    const lastUs = infos.reduce<number | null>((best, info) => (info?.lastUs !== null && info?.lastUs !== undefined && (best === null || info.lastUs > best) ? info.lastUs : best), null);
    const last = infos.find(info => info?.lastUs === lastUs && lastUs !== null)?.last ?? null;
    const list = [...(invoices.get(String(grn.id)) ?? [])].sort(newestFirst);
    const newest = list[0];
    return {
      grn,
      units: lots.reduce((sum, lot) => sum + unitsOf(lot.weight, lot.qty), 0),
      lots,
      totalQty,
      images: photoCount.get(String(grn.id)) ?? 0,
      invoiced: newest !== undefined,
      view: {
        grn_id: grn.id,
        gr_no: grn.gr_no ?? null,
        grn_date: grn.date ?? null,
        registration: grn.registration ?? null,
        sender_name: grn.sender_name ?? null,
        // A customer account's copy holds no people and no supervisor id: the name the receipt carries.
        supervisor_name: q.role === 'customer' ? (textOf(grn.supervisor_name) ?? null) : (names.get(scalarText(grn.supervisor_id) ?? '') ?? null),
        note: grn.note ?? null,
        total_items: lots.length,
        total_qty: totalQty,
        total_weight: fromUnits(lots.reduce((sum, lot) => sum + unitsOf(lot.weight, lot.qty), 0)) ?? 0,
        image_count: photoCount.get(String(grn.id)) ?? 0,
        invoice_status: newest
          ? {
              is_invoiced: true,
              invoice_id: newest.id ?? null,
              invoice_number:
                scalarText(newest.inv_fin_year) === null || scalarText(newest.inv_no) === null
                  ? null
                  : `${scalarText(newest.inv_fin_year)}-${scalarText(newest.inv_no)}`,
              invoice_count: list.length,
            }
          : { is_invoiced: false, invoice_id: null, invoice_number: null, invoice_count: 0 },
        dispatch_summary: {
          total_dispatched: infos.reduce((sum, info) => sum + (info?.total ?? 0), 0),
          current_stock: stock,
          dispatch_count: infos.reduce((best, info) => Math.max(best, info?.dispatches.size ?? 0), 0),
          last_dispatch_date: last,
          is_fully_dispatched: lots.length > 0 && stock === 0,
        },
        items: lots.map(lot => ({
          item_name: lot.item_name ?? null,
          packaging: lot.packaging ?? null,
          quantity: lot.qty ?? null,
          current_stock: lot.stock ?? null,
          dispatched_qty: typeof lot.qty === 'number' && typeof lot.stock === 'number' ? lot.qty - lot.stock : null,
          weight: lot.weight ?? null,
          rack: lot.rack ?? null,
          package_mark: lot.package_mark ?? null,
        })),
      } satisfies Row,
    };
  });
  rows.sort((a, b) => compareDesc(a.grn.date, b.grn.date) || compareIds(a.grn.id, b.grn.id));

  return {
    success: true,
    data: {
      summary: {
        total_grns: rows.length,
        total_items: rows.reduce((sum, row) => sum + row.lots.length, 0),
        total_quantity: rows.reduce((sum, row) => sum + row.totalQty, 0),
        total_weight_kg: weightSum(rows.reduce((sum, row) => sum + row.units, 0)),
        total_invoiced_grns: rows.filter(row => row.invoiced).length,
        total_images: rows.reduce((sum, row) => sum + row.images, 0),
      },
      grns: rows.map(row => row.view),
    },
    metadata: { retrieved_at: q.asOf, customer_id: customerId, from_date: fromDate, to_date: toDate },
  };
}

/** Newest first for texts that are times or numbers: positive when `b` is newer. */
function compareDesc(a: unknown, b: unknown): number {
  const left = typeof a === 'number' ? a : (textOf(a) ?? '');
  const right = typeof b === 'number' ? b : (textOf(b) ?? '');
  return left < right ? 1 : left > right ? -1 : 0;
}

export async function readAllGrnActivity(q: CopyReader, fromDate: string, toDate: string): Promise<Row> {
  const range = rangeOf(fromDate, toDate);
  const within = 'g.deleted_at IS NULL AND g.date_us >= ? AND g.date_us < ?';
  const total = await q.get<{ grns: number; customers: number; quantity: number | null; units: number | null }>(
    `SELECT COUNT(DISTINCT g.id) AS grns, COUNT(DISTINCT g.customer_id) AS customers, SUM(t.qty) AS quantity,
            SUM(CAST(round(t.weight * 1000000) AS INTEGER) * t.qty) AS units
       FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id WHERE ${within}`,
    [range.from, range.to]
  );
  const customers = await q.all<{ customer_id: string; name: string | null; grns: number; quantity: number | null; units: number | null; latest: number | null }>(
    `SELECT c.id AS customer_id, json_extract(c.row, '$.name') AS name, COUNT(DISTINCT g.id) AS grns, SUM(t.qty) AS quantity,
            SUM(CAST(round(t.weight * 1000000) AS INTEGER) * t.qty) AS units, MAX(g.date_us) AS latest
       FROM customers c JOIN goodsreceived g ON g.customer_id = c.id AND g.deleted_at IS NULL
       JOIN goodsreceived_trl t ON t.gr_id = g.id
      WHERE g.date_us >= ? AND g.date_us < ? GROUP BY c.id`,
    [range.from, range.to]
  );
  customers.sort((a, b) => numberOf(b.quantity) - numberOf(a.quantity) || compareText(a.name, b.name) || compareIds(a.customer_id, b.customer_id));
  const dates = await q.all<{ day: string; grns: number; quantity: number | null; customers: number }>(
    `SELECT ${BUSINESS_DAY} AS day, COUNT(DISTINCT g.id) AS grns, SUM(t.qty) AS quantity, COUNT(DISTINCT g.customer_id) AS customers
       FROM goodsreceived g JOIN goodsreceived_trl t ON t.gr_id = g.id WHERE ${within} GROUP BY day ORDER BY day DESC`,
    [range.from, range.to]
  );
  const latestDay = async (us: number | null): Promise<string | null> =>
    us === null ? null : ((await q.get<{ day: string }>("SELECT date(? / 1000000 + 19800, 'unixepoch') AS day", [us]))?.day ?? null);
  const byCustomer: Row[] = [];
  for (const customer of customers) {
    byCustomer.push({
      customer_id: customer.customer_id,
      customer_name: customer.name,
      grn_count: customer.grns,
      total_qty: customer.quantity,
      total_weight: fromUnits(customer.units),
      latest_grn: await latestDay(customer.latest),
    });
  }
  return {
    success: true,
    summary: {
      total_grns: total?.grns ?? 0,
      total_customers: total?.customers ?? 0,
      total_quantity: total?.quantity ?? 0,
      total_weight: weightSum(total?.units),
      from_date: fromDate,
      to_date: toDate,
    },
    by_customer: byCustomer,
    by_date: dates.map(row => ({ date: row.day, grn_count: row.grns, total_qty: row.quantity, customer_count: row.customers })),
  };
}

