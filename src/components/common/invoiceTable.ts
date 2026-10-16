/**
 * The rows of an object page's Invoices table (Dispatch and GRN pages).
 *
 * Rows are invoices with their id, number, date and whole total. They are used only when they
 * account for every invoice in the page's summary (same count, each with a total); otherwise
 * the table falls back to the summary's invoice numbers with no date, amount or link, and only
 * the summary total is shown. A total is never split across rows and no date is made up.
 */

export interface InvoiceRow {
  key: string;
  /** Null in the fallback: the row then cannot be opened. */
  invoice_id: string | null;
  invoice_no: number;
  invoice_date: string | null;
  /** The whole invoice's total (with tax, less discount); null in the fallback. */
  total: number | null;
}

export interface InvoiceTable {
  rows: InvoiceRow[];
  /** The summary's total: each linked invoice's whole total added once. */
  total: number;
  count: number;
  /** False when the rows are the summary's invoice numbers only. */
  detailed: boolean;
}

/** What a page's summary says about its invoices (invoices_summary). */
export interface InvoiceSummaryLike {
  total_invoices?: number | null;
  total_amount?: number | null;
  invoice_numbers?: ReadonlyArray<number | string> | null;
}

/** A candidate row read from a server answer, before it is checked. */
export interface InvoiceCandidate {
  invoice_id?: string | null;
  invoice_no?: number | string | null;
  invoice_date?: string | null;
  total?: number | string | null;
}

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const finite = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const time = (date: string | null): number => {
  if (!date) return Number.NEGATIVE_INFINITY;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/**
 * The table for a summary and the candidate rows found for it (null when none could be read).
 * Each invoice id is taken once; rows are ordered oldest first, then by number.
 */
export function invoiceTableFrom(
  candidates: readonly InvoiceCandidate[] | null | undefined,
  summary: InvoiceSummaryLike | null | undefined
): InvoiceTable {
  const total = finite(summary?.total_amount) ?? 0;
  const count = finite(summary?.total_invoices) ?? 0;
  const byId = new Map<string, InvoiceRow>();
  for (const candidate of candidates ?? []) {
    const id = text(candidate.invoice_id);
    const number = finite(candidate.invoice_no);
    if (!id || number === undefined || byId.has(id)) continue;
    byId.set(id, {
      key: id,
      invoice_id: id,
      invoice_no: number,
      invoice_date: text(candidate.invoice_date),
      total: finite(candidate.total) ?? null,
    });
  }
  const rows = Array.from(byId.values());
  if (count > 0 && rows.length === count && rows.every((row) => row.total !== null)) {
    rows.sort((a, b) => time(a.invoice_date) - time(b.invoice_date) || a.invoice_no - b.invoice_no);
    return { rows, total, count, detailed: true };
  }
  const numbers = (summary?.invoice_numbers ?? []).map(Number).filter((n) => Number.isFinite(n));
  return {
    rows: numbers.map((n, index) => ({ key: `number:${n}:${index}`, invoice_id: null, invoice_no: n, invoice_date: null, total: null })),
    total,
    count,
    detailed: false,
  };
}
