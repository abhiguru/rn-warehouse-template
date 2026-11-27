/**
 * The field changes of an Edit GRN made on the phone (WH-303, product/tech/app-offline-edit-grn.md sections 3.1 to 3.3 and
 * 14.1). Pure: the diff of the form against what it was loaded with, the merge of two unsent bodies, the labels of what
 * changed, and what a body shows on screen until it is sent.
 *
 * A body holds only the fields that changed, each as `{ from, to }` where `from` is the value the phone expects the server
 * to hold. It never holds the GRN number, the rates or a photo list.
 */
import type { OverlayPart } from '@/features/phone-copy/unsentOverlay';
import type { TranslationKey } from '@/i18n';
import type { GRNHeaderData, GRNItemData } from '@/store/slices/grnFormSlice';

export interface Change<V> {
  from: V;
  to: V;
}
export interface Named {
  id: string;
  name: string;
}
export type HeaderField = 'date' | 'customer_id' | 'sender' | 'supervisor' | 'registration' | 'note' | 'leon' | 'pricing_mode';
export type LotField = 'item' | 'packaging' | 'qty' | 'weight' | 'rack' | 'package_mark';
type Value = string | number | boolean | Named | null;

export interface LineAdded {
  clientLineId: string;
  item_id: string;
  item_name: string;
  packaging: string | null;
  qty: number;
  weight: number;
  rack: string | null;
  package_mark: string | null;
}
export interface LineRemoved {
  lotId: string;
  item_name: string;
  qty: number;
}

export interface GrnEditBody {
  v: 1;
  grnId: string;
  /** The GRN's version token when the form loaded, or null. */
  loadedAt: string | null;
  /** Phone time of the latest Save into this body, ISO. */
  recordedAt: string;
  header?: Partial<Record<HeaderField, Change<Value>>>;
  lots?: Record<string, Partial<Record<LotField, Change<Value>>>>;
  linesAdded?: LineAdded[];
  linesRemoved?: LineRemoved[];
}

/** What the form holds, as `loadGRNData` answers it: the header and the lines. */
export interface GrnEditForm {
  header: Pick<GRNHeaderData, 'registration' | 'date' | 'sender_id' | 'sender_name' | 'customer_id' | 'customer_name' | 'supervisor_id' | 'supervisor_name' | 'note' | 'leon' | 'pricing_mode'>;
  items: Pick<GRNItemData, 'grn_trl_id' | 'item_table_id' | 'item_name' | 'packaging' | 'qty' | 'weight' | 'rack' | 'package_mark'>[];
}
export interface GrnEditMeta {
  grnId: string;
  loadedAt: string | null;
  recordedAt: string;
}

/** The header fields in the order of the form, and the lot fields in the order of the line. */
export const HEADER_FIELDS: readonly HeaderField[] = ['date', 'customer_id', 'sender', 'supervisor', 'registration', 'pricing_mode', 'leon', 'note'];
export const LOT_FIELDS: readonly LotField[] = ['item', 'packaging', 'qty', 'weight', 'rack', 'package_mark'];

/** The locale key of each field's label: the form's own words. */
export const HEADER_FIELD_LABELS: Readonly<Record<HeaderField, TranslationKey>> = {
  date: 'common.date',
  customer_id: 'common.customer',
  sender: 'grn.header.sender',
  supervisor: 'grn.header.supervisor',
  registration: 'grn.header.vehicleRegistration',
  pricing_mode: 'grn.header.pricingMode',
  leon: 'grn.header.leon',
  // The contract's example reads "GRN B1: Note, Rack changed" (the form's own label is "Notes").
  note: 'payments.form.note',
};
export const LOT_FIELD_LABELS: Readonly<Record<LotField, TranslationKey>> = {
  item: 'common.item',
  packaging: 'common.packaging',
  qty: 'grn.item.quantity',
  weight: 'common.weight',
  rack: 'common.rack',
  package_mark: 'grn.item.mark',
};

const blankToNull = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};
const pair = (id: string | null | undefined, name: string | null | undefined): Named | null => (id ? { id, name: name ?? '' } : null);
const same = (a: Value, b: Value): boolean => {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) return a.id === b.id;
  return a === b;
};

function headerValues(header: GrnEditForm['header']): Record<HeaderField, Value> {
  return {
    date: header.date,
    customer_id: pair(header.customer_id, header.customer_name),
    sender: pair(header.sender_id, header.sender_name),
    supervisor: pair(header.supervisor_id, header.supervisor_name),
    registration: blankToNull(header.registration),
    pricing_mode: header.pricing_mode,
    leon: header.leon === true,
    note: blankToNull(header.note),
  };
}
function lotValues(line: GrnEditForm['items'][number]): Record<LotField, Value> {
  return {
    item: pair(line.item_table_id, line.item_name),
    packaging: blankToNull(line.packaging),
    qty: Number(line.qty),
    weight: Number(line.weight),
    rack: blankToNull(line.rack),
    package_mark: blankToNull(line.package_mark),
  };
}

/** The body of what the form changed against what it loaded, or null when nothing changed. */
export function diffGrnEdit(baseline: GrnEditForm, form: GrnEditForm, meta: GrnEditMeta): GrnEditBody | null {
  const body: GrnEditBody = { v: 1, grnId: meta.grnId, loadedAt: meta.loadedAt, recordedAt: meta.recordedAt };
  const from = headerValues(baseline.header);
  const to = headerValues(form.header);
  const header: NonNullable<GrnEditBody['header']> = {};
  for (const field of HEADER_FIELDS) {
    if (!same(from[field], to[field])) header[field] = { from: from[field], to: to[field] };
  }
  if (Object.keys(header).length > 0) body.header = header;

  const known = new Map(baseline.items.map(line => [line.grn_trl_id, line]));
  const lots: NonNullable<GrnEditBody['lots']> = {};
  const linesAdded: LineAdded[] = [];
  const seen = new Set<string>();
  for (const line of form.items) {
    const old = known.get(line.grn_trl_id);
    if (!old) {
      const values = lotValues(line);
      linesAdded.push({
        clientLineId: line.grn_trl_id,
        item_id: line.item_table_id,
        item_name: line.item_name,
        packaging: values.packaging as string | null,
        qty: values.qty as number,
        weight: values.weight as number,
        rack: values.rack as string | null,
        package_mark: values.package_mark as string | null,
      });
      continue;
    }
    seen.add(line.grn_trl_id);
    const was = lotValues(old);
    const now = lotValues(line);
    const changes: Partial<Record<LotField, Change<Value>>> = {};
    for (const field of LOT_FIELDS) {
      if (!same(was[field], now[field])) changes[field] = { from: was[field], to: now[field] };
    }
    if (Object.keys(changes).length > 0) lots[line.grn_trl_id] = changes;
  }
  if (Object.keys(lots).length > 0) body.lots = lots;
  if (linesAdded.length > 0) body.linesAdded = linesAdded;
  const linesRemoved = baseline.items
    .filter(line => !seen.has(line.grn_trl_id))
    .map((line): LineRemoved => ({ lotId: line.grn_trl_id, item_name: line.item_name, qty: Number(line.qty) }));
  if (linesRemoved.length > 0) body.linesRemoved = linesRemoved;
  return isEmpty(body) ? null : body;
}

const isEmpty = (body: GrnEditBody): boolean =>
  !body.header && !body.lots && !(body.linesAdded?.length) && !(body.linesRemoved?.length);

/** Per field the earlier `from` and the later `to`. */
function mergeChanges<K extends string>(
  earlier: Partial<Record<K, Change<Value>>> | undefined,
  later: Partial<Record<K, Change<Value>>> | undefined
): Partial<Record<K, Change<Value>>> {
  const out: Partial<Record<K, Change<Value>>> = { ...earlier };
  for (const [field, change] of Object.entries(later ?? {}) as [K, Change<Value>][]) {
    const before = out[field];
    out[field] = { from: before ? before.from : change.from, to: change.to };
  }
  return out;
}

/** A change of an added line's field written into the line (the server never knew it). */
function applyToAdded(line: LineAdded, changes: Partial<Record<LotField, Change<Value>>>): LineAdded {
  const next = { ...line };
  for (const [field, change] of Object.entries(changes) as [LotField, Change<Value>][]) {
    if (field === 'item') {
      const named = change.to as Named | null;
      if (named) {
        next.item_id = named.id;
        next.item_name = named.name;
      }
    } else if (field === 'qty' || field === 'weight') next[field] = Number(change.to);
    else next[field] = typeof change.to === 'string' ? change.to : null;
  }
  return next;
}

/** Two unsent bodies of one GRN as one: earlier `from`, later `to`, the later Save's time; null when nothing is left. */
export function mergeGrnEdit(earlier: GrnEditBody, later: GrnEditBody): GrnEditBody | null {
  const out: GrnEditBody = { v: 1, grnId: earlier.grnId, loadedAt: earlier.loadedAt, recordedAt: later.recordedAt };
  const header = mergeChanges(earlier.header, later.header);
  if (Object.keys(header).length > 0) out.header = header;

  let added = [...(earlier.linesAdded ?? [])];
  const removed = [...(earlier.linesRemoved ?? [])];
  const dropped = new Set<string>();
  for (const line of later.linesRemoved ?? []) {
    if (added.some(each => each.clientLineId === line.lotId)) {
      dropped.add(line.lotId);
      added = added.filter(each => each.clientLineId !== line.lotId);
    } else if (!removed.some(each => each.lotId === line.lotId)) removed.push(line);
  }
  const removedIds = new Set(removed.map(line => line.lotId));

  const lots: NonNullable<GrnEditBody['lots']> = {};
  const laterLots = { ...later.lots };
  for (const [lotId, changes] of Object.entries(earlier.lots ?? {})) lots[lotId] = changes;
  for (const [lotId, changes] of Object.entries(laterLots)) {
    const addedIndex = added.findIndex(line => line.clientLineId === lotId);
    if (addedIndex >= 0) {
      added[addedIndex] = applyToAdded(added[addedIndex], changes);
      continue;
    }
    if (dropped.has(lotId)) continue;
    lots[lotId] = mergeChanges(lots[lotId], changes);
  }
  // A line removed by this body is no longer changed by it.
  for (const lotId of removedIds) delete lots[lotId];
  for (const lotId of Object.keys(lots)) if (Object.keys(lots[lotId] ?? {}).length === 0) delete lots[lotId];
  if (Object.keys(lots).length > 0) out.lots = lots;

  added.push(...(later.linesAdded ?? []));
  if (added.length > 0) out.linesAdded = added;
  if (removed.length > 0) out.linesRemoved = removed;
  return isEmpty(out) ? null : out;
}

/** The locale keys of what the body changes, in the form's order, then the lines added, then the lines removed. */
export function changedFieldLabels(body: GrnEditBody): TranslationKey[] {
  const keys: TranslationKey[] = [];
  for (const field of HEADER_FIELDS) if (body.header?.[field]) keys.push(HEADER_FIELD_LABELS[field]);
  const lotFields = new Set<LotField>();
  for (const changes of Object.values(body.lots ?? {})) for (const field of LOT_FIELDS) if (changes[field]) lotFields.add(field);
  for (const field of LOT_FIELDS) if (lotFields.has(field)) keys.push(LOT_FIELD_LABELS[field]);
  if (body.linesAdded?.length) keys.push('offline.linesAdded');
  if (body.linesRemoved?.length) keys.push('offline.linesRemoved');
  return keys;
}

/** The lot ids the body touches: the changed lots and the removed ones. */
export const lotIdsOf = (body: GrnEditBody): string[] => [...new Set([...Object.keys(body.lots ?? {}), ...(body.linesRemoved ?? []).map(line => line.lotId)])];

const toText = (value: Value): unknown => (typeof value === 'object' && value !== null ? value.name : value);

/** The columns of the GRN row that a header field writes. */
function headerColumns(field: HeaderField, to: Value): Record<string, unknown> {
  const named = typeof to === 'object' && to !== null ? to : null;
  if (field === 'customer_id') return { customer_id: named?.id ?? null, customer_name: named?.name ?? null };
  if (field === 'sender') return { sender_id: named?.id ?? null, sender_name: named?.name ?? null };
  if (field === 'supervisor') return { supervisor_id: named?.id ?? null, supervisor_name: named?.name ?? null };
  return { [field]: to };
}
function lotColumns(field: LotField, to: Value): Record<string, unknown> {
  const named = typeof to === 'object' && to !== null ? to : null;
  if (field === 'item') return { item_id: named?.id ?? null, item_name: named?.name ?? null };
  return { [field]: to };
}

const isBody = (value: unknown): value is GrnEditBody =>
  typeof value === 'object' && value !== null && (value as { v?: unknown }).v === 1 && typeof (value as { grnId?: unknown }).grnId === 'string';
export const isGrnEditBody = isBody;

/** What an unsent body changes on screen (C301 section 2.1b): the values, the added and removed lines, and the markers. */
export function overlayOf(body: GrnEditBody): OverlayPart {
  if (!isBody(body)) return {};
  const part: OverlayPart = {};
  const grn: Record<string, unknown> = {};
  const labels: TranslationKey[] = [];
  for (const field of HEADER_FIELDS) {
    const change = body.header?.[field];
    if (!change) continue;
    Object.assign(grn, headerColumns(field, change.to));
    if (!same(change.from, change.to)) labels.push(HEADER_FIELD_LABELS[field]);
  }
  const lot: Record<string, Record<string, unknown>> = {};
  const lotChanges: NonNullable<OverlayPart['lotChanges']> = [];
  for (const [lotId, changes] of Object.entries(body.lots ?? {})) {
    for (const field of LOT_FIELDS) {
      const change = changes[field];
      if (!change) continue;
      lot[lotId] = { ...lot[lotId], ...lotColumns(field, change.to) };
      lotChanges.push({ lotId, grnId: body.grnId, field, label: LOT_FIELD_LABELS[field], from: toText(change.from), to: toText(change.to) });
    }
  }
  if (body.linesAdded?.length) labels.push('offline.linesAdded');
  if (body.linesRemoved?.length) labels.push('offline.linesRemoved');
  if (Object.keys(grn).length > 0 || body.linesAdded?.length || body.linesRemoved?.length) part.grn = { [body.grnId]: grn };
  if (Object.keys(lot).length > 0) part.lot = lot;
  if (lotChanges.length > 0) part.lotChanges = lotChanges;
  if (labels.length > 0) part.changedFields = [{ kind: 'grn', id: body.grnId, fields: labels }];
  if (body.linesAdded?.length) {
    part.lotsAdded = {
      [body.grnId]: body.linesAdded.map(line => ({
        id: line.clientLineId,
        gr_id: body.grnId,
        item_id: line.item_id,
        item_name: line.item_name,
        packaging: line.packaging,
        qty: line.qty,
        stock: line.qty,
        weight: line.weight,
        rack: line.rack,
        package_mark: line.package_mark,
      })),
    };
  }
  if (body.linesRemoved?.length) part.lotsRemoved = { [body.grnId]: body.linesRemoved.map(line => line.lotId) };
  return part;
}
