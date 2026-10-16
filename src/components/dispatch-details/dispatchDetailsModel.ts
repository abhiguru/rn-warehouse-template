/**
 * The rows of the dispatch page's Items, GRNs and Invoices tables, built from the
 * get_dispatch_details answer (RpcDispatchItemDetails, checked against the live function).
 *
 * - One item row per dispatch line: two lots of the same item stay two rows.
 * - GRN groups are keyed by the GRN's id. A line without one becomes its own group, so
 *   records that cannot be told apart are never merged; it cannot be opened.
 * - Invoice rows come from the invoice each line carries (id, number, date, whole total).
 *   When those do not account for every invoice in the summary, the rows fall back to the
 *   summary's numbers with no date, amount or link, and only the summary total is shown.
 */

import type {
  RpcDispatchInvoicesSummary,
  RpcDispatchItemDetails,
} from '@/types/rpc-canonical.types';

export interface DispatchItem {
  /** The dispatch line's id: stable, and unique within the dispatch. */
  id: string;
  item_name: string;
  dispatch_quantity: number;
  /** Null when the line has no GRN number. */
  grn_no: string | null;
  /** Null when the GRN has no date; never replaced by today. */
  grn_date: string | null;
  /** Null when the GRN cannot be identified; such a line is not linked. */
  grn_id: string | null;
  /** Bags received on the lot. */
  original_quantity?: number;
  /** Weight of one bag of the lot, in kg. */
  weight?: number | null;
  package_mark?: string | null;
}

export interface GrnGroup {
  /** The GRN id, or `line:<line id>` for a line whose GRN has no id. */
  key: string;
  grn_id: string | null;
  grn_no: string | null;
  grn_date: string | null;
  lines: DispatchItem[];
  bags: number;
}

export interface InvoiceRow {
  key: string;
  /** Null in the fallback: the row then cannot be opened. */
  invoice_id: string | null;
  invoice_no: number;
  invoice_date: string | null;
  /** The whole invoice's total; null in the fallback. */
  total: number | null;
}

export interface InvoiceTable {
  rows: InvoiceRow[];
  /** Each linked invoice's whole total added once (invoices_summary.total_amount). */
  total: number;
  count: number;
  /** False when the rows are the summary's invoice numbers only. */
  detailed: boolean;
}

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const optionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** The table rows of a dispatch's lines, in the order the server sent them. */
export function mapDispatchItems(lines: readonly RpcDispatchItemDetails[] | null | undefined, unknownItem: string): DispatchItem[] {
  return (lines ?? []).map((line, index) => ({
    id: text(line.id) ?? `line-${index}`,
    item_name: text(line.item_details?.name) ?? text(line.grn_item_details?.item_name) ?? unknownItem,
    dispatch_quantity: count(line.disp_qty),
    grn_no: text(line.grn_details?.gr_no),
    grn_date: text(line.grn_details?.date),
    grn_id: text(line.grn_details?.id) ?? text(line.grn_id),
    original_quantity: optionalNumber(line.grn_item_details?.qty),
    weight: line.grn_item_details?.weight ?? null,
    package_mark: text(line.grn_item_details?.package_mark),
  }));
}

const time = (date: string | null): number => {
  if (!date) return Number.NEGATIVE_INFINITY;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

const compareText = (a: string | null, b: string | null) =>
  (a ?? '').localeCompare(b ?? '', 'en', { numeric: true, sensitivity: 'base' });

/**
 * Newest GRN first (a GRN without a date last), then GRN number, then item name, then the
 * line id. The server sends lines in line-id order, which is no order a person can follow.
 */
function compareLines(a: DispatchItem, b: DispatchItem): number {
  return (
    time(b.grn_date) - time(a.grn_date) ||
    compareText(b.grn_no, a.grn_no) ||
    compareText(a.item_name, b.item_name) ||
    a.id.localeCompare(b.id)
  );
}

export const sortDispatchItems = (items: readonly DispatchItem[]): DispatchItem[] => [...items].sort(compareLines);

/** The source GRNs of a dispatch, newest first, each with its lines. */
export function groupBySourceGrn(items: readonly DispatchItem[]): GrnGroup[] {
  const groups = new Map<string, GrnGroup>();
  for (const item of sortDispatchItems(items)) {
    const key = item.grn_id ?? `line:${item.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, grn_id: item.grn_id, grn_no: item.grn_no, grn_date: item.grn_date, lines: [], bags: 0 };
      groups.set(key, group);
    }
    group.lines.push(item);
    group.bags += item.dispatch_quantity;
  }
  return Array.from(groups.values());
}

export interface ItemTotals {
  bags: number;
  lines: number;
  /** Distinct source GRNs, a line without a GRN id counted on its own. */
  grns: number;
}

export function itemTotals(items: readonly DispatchItem[]): ItemTotals {
  return {
    bags: items.reduce((sum, item) => sum + item.dispatch_quantity, 0),
    lines: items.length,
    grns: new Set(items.map((item) => item.grn_id ?? `line:${item.id}`)).size,
  };
}

/** The invoice rows of the Invoices tab; see the file header for the fallback. */
export function buildInvoiceTable(
  lines: readonly RpcDispatchItemDetails[] | null | undefined,
  summary: RpcDispatchInvoicesSummary | null | undefined
): InvoiceTable {
  const total = count(summary?.total_amount);
  const invoiceCount = count(summary?.total_invoices);
  const byId = new Map<string, InvoiceRow>();
  for (const line of lines ?? []) {
    const invoice = line.invoice_details;
    const id = text(invoice?.invoice_id);
    const number = optionalNumber(invoice?.invoice_no);
    if (!invoice || !id || number === undefined || byId.has(id)) continue;
    byId.set(id, {
      key: id,
      invoice_id: id,
      invoice_no: number,
      invoice_date: text(invoice.invoice_date),
      total: optionalNumber(invoice.total) ?? null,
    });
  }
  const detailed = Array.from(byId.values());
  if (invoiceCount > 0 && detailed.length === invoiceCount && detailed.every((row) => row.total !== null)) {
    detailed.sort((a, b) => time(a.invoice_date) - time(b.invoice_date) || a.invoice_no - b.invoice_no);
    return { rows: detailed, total, count: invoiceCount, detailed: true };
  }
  const numbers = (summary?.invoice_numbers ?? []).filter((n): n is number => Number.isFinite(Number(n)));
  return {
    rows: numbers.map((n, index) => ({ key: `number:${n}:${index}`, invoice_id: null, invoice_no: Number(n), invoice_date: null, total: null })),
    total,
    count: invoiceCount,
    detailed: false,
  };
}
