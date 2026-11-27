/**
 * The dispatch form's six GRN reads, answered from the phone copy (WH-161, product/tech/app-offline-new-records.md 7).
 * `grnDetailService.ts` asks each of these first; `null` means the copy does not answer and today's server path runs,
 * unchanged. All six read with the same need, so one form never mixes copy and server answers.
 */
import { readVia } from '@/features/phone-copy/readRoute';
import {
  readCustomerGrnsWithStock,
  readGrnForDispatchById,
  readGrnForDispatchByNumber,
  readGrnNumberSearch,
  readGrnPrefixes,
  type GrnForDispatch,
} from '@/features/phone-copy/reads/dispatchGrnPicker';
import type { Row } from '@/features/phone-copy/reads/rows';
import { numberOf, textOf } from '@/features/phone-copy/reads/rows';
import type { GRNAutocompleteItem, GRNDetailHeader, GRNDetailItem } from '@/types/dispatch.types';

export interface CopyCustomerGrn {
  grnId: string;
  grNo: string;
  grnDate: string;
  customerName: string;
  totalStock: number;
  itemCount: number;
  lastDispatchDate: string | null;
  unsent?: boolean;
}

const asRow = (value: unknown): Row => (typeof value === 'object' && value !== null ? (value as Row) : {});
const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? (value as unknown[]).map(asRow) : []);

export async function copyGrnSearch(pattern: string, customerId: string | undefined): Promise<GRNAutocompleteItem[] | null> {
  const copy = await readVia('all', q => readGrnNumberSearch(q, pattern, customerId));
  return copy ? copy.value : null;
}

export async function copyGrnPrefixes(customerId: string | null | undefined): Promise<{ prefix: string; grnCount: number }[] | null> {
  const copy = await readVia('all', q => readGrnPrefixes(q, customerId));
  return copy ? copy.value.map(item => ({ prefix: item.prefix, grnCount: item.grn_count })) : null;
}

export async function copyCustomerGrns(customerId: string, limit: number, offset: number): Promise<CopyCustomerGrn[] | null> {
  const copy = await readVia('all', q => readCustomerGrnsWithStock(q, customerId, limit, offset));
  if (!copy) return null;
  return copy.value.map(item => ({
    grnId: item.grn_id,
    grNo: item.gr_no,
    grnDate: item.grn_date,
    customerName: item.customer_name,
    totalStock: item.total_stock,
    itemCount: item.item_count,
    lastDispatchDate: item.last_dispatch_date,
    ...(item.unsent ? { unsent: true } : {}),
  }));
}

/** A GRN as the dispatch form reads it: null when the copy does not answer; `missing` when it answers that there is none. */
export type CopyGrn = { missing: true } | { missing: false; header: GRNDetailHeader; items: Row[] };

const toCopyGrn = (answer: GrnForDispatch): CopyGrn => {
  if (answer.kind === 'not-found') return { missing: true };
  const grn = answer.grn;
  const customer = asRow(grn.customer_details);
  return {
    missing: false,
    header: {
      id: String(grn.id),
      gr_no: textOf(grn.gr_no) ?? '',
      date: textOf(grn.date) ?? '',
      customer_name: textOf(customer.name) ?? textOf(grn.customer_name) ?? '',
      customer_id: textOf(customer.id) ?? '',
    },
    items: rowsOf(grn.items),
  };
};

export async function copyGrnByNumber(grNo: string): Promise<CopyGrn | null> {
  const copy = await readVia('all', q => readGrnForDispatchByNumber(q, grNo));
  return copy ? toCopyGrn(copy.value) : null;
}

export async function copyGrnById(grnId: string): Promise<CopyGrn | null> {
  const copy = await readVia('all', q => readGrnForDispatchById(q, grnId));
  return copy ? toCopyGrn(copy.value) : null;
}

/** A lot as `GRNDetailItem`, with the server's fallbacks for a missing text or number. */
export const lotOfCopy = (item: Row): GRNDetailItem => ({
  id: String(item.id),
  item_id: textOf(item.item_id) ?? '',
  item_name: textOf(item.item_name) ?? '',
  quantity: numberOf(item.qty) ?? 0,
  stock: numberOf(item.stock) ?? 0,
  package_mark: textOf(item.package_mark) ?? '',
  packaging: textOf(item.packaging) ?? '',
  rack: textOf(item.rack) ?? '',
  weight: numberOf(item.weight) ?? 0,
});
