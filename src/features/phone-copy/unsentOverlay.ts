/**
 * What this phone's unsent work changes on screen (WH-299's seam, built in WH-301; product/tech/app-offline-unsent-work.md
 * section 7 and 2.1b, 2.1c). The readers apply it last: what the phone has written replaces what the copy holds, and
 * stock is the copy's less what is dispatched but not sent and what is held. It is built from the unsent-work store, rebuilt
 * when the store changes, and read synchronously.
 *
 * - The signed-in person's own items (not sent, sending) give values and markers. A refused or held item gives none (the server
 *   refused it, so the screen shows the server's value; WH-304): its dispatch bags are "held" (`lessHeld`) instead, with the copy's
 *   held dispatches, each held item once. A sent item that changes fields
 *   keeps its values, with no marker, until the first sync run that ends after its send (the copy then has them).
 * - Another person's unsent dispatches on this phone take their bags off the stock (`lessOthersUnsent`) and show nothing else.
 * - Items of another facility are not read at all (Product PQ4a).
 */
import { heldBagsByLot, heldCopyRows, subscribeHeldRows } from '@/features/holding/heldRows';
import { getSendKind } from '@/features/unsent/sendKinds';
import { currentUnsentScope, loadedUnsentRows, subscribeUnsent } from '@/features/unsent/unsentStore';
import type { ItemRow } from '@/features/unsent/unsentRows';
import { createLogger, loggableError } from '@/utils/logger';
import { noteCopyChange, publishCopyChanges } from './copyChanges';
import type { EntityName } from './copySchema';
import { subscribeSyncRunEnd } from './syncEngine';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

const logger = createLogger('[unsent-overlay]');

type Fields = Record<string, unknown>;
type Row = Record<string, unknown>;

/** A document that exists only on this phone (WH-161): the row a list or picker shows for it. */
export type NewDocRow = Row & { kind: 'grn' | 'dispatch' };

/** One line of an unsent new GRN, as a lot the copy's stock totals add (WH-161, 7a). Bags and weight only, never money. */
export interface NewLotRow {
  lot_id: string;
  grn_id: string;
  customer_id: string | null;
  customer_name: string | null;
  item_id: string | null;
  item_name: string | null;
  packaging: string | null;
  qty: number;
  stock: number;
  weight: number | null;
  date: string | null;
  rack: string | null;
  package_mark: string | null;
}

/** What one item contributes (a kind's `overlay(body, state)`). */
export interface OverlayPart {
  /** Lot id to the bags this item takes off it. */
  lessUnsent?: Record<string, number>;
  grn?: Record<string, Fields>;
  lot?: Record<string, Fields>;
  dispatch?: Record<string, Fields>;
  changedFields?: { kind: 'grn' | 'dispatch'; id: string; fields: string[] }[];
  /**
   * Changes of one field of one lot (WH-302). The marks of a lot and its GRN come from these, and only for a field whose
   * last value still differs from the first `from` of the unsent items (Design 5.8 DQ5: a value put back shows nothing).
   */
  lotChanges?: { lotId: string; grnId: string; field: string; label: string; from: unknown; to: unknown }[];
  newDocuments?: NewDocRow[];
  /** Lines an unsent edit adds to a GRN (grn id to rows; a row's id is its `clientLineId`). */
  lotsAdded?: Record<string, Row[]>;
  /** Lot ids an unsent edit removes from a GRN. */
  lotsRemoved?: Record<string, string[]>;
}

export interface UnsentOverlay {
  /** Fields of a GRN this phone has changed and not sent, or null. */
  grn(grnId: string): Fields | null;
  /** Fields of a lot this phone has changed and not sent, or null. */
  lot(lotId: string): Fields | null;
  /** Fields of a dispatch this phone has changed and not sent, or null. */
  dispatch(dispatchId: string): Fields | null;
  /** Bags of the lot in this person's dispatches not sent yet. */
  lessUnsent(lotId: string): number;
  /** Bags of the lot in held dispatches (WH-304; 0 until then). */
  lessHeld(lotId: string): number;
  /** Bags of the lot in another person's dispatches not sent yet, on this phone (Product PQ4b). */
  lessOthersUnsent?(lotId: string): number;
  /** Lot id to the bags taken off it (all three above), only the lots above 0 (WH-300). */
  deductions(): ReadonlyMap<string, number>;
  /** Lot id to its overlaid fields, for the readers' search and filters (WH-302). */
  lotValues?(): ReadonlyMap<string, Fields>;
  /** "Not sent yet" or "Sending…" for a record this person changed and has not sent; null otherwise (Design 2.2, 2.3). */
  marker(kind: 'grn' | 'lot' | 'dispatch', id: string): 'notSent' | 'sending' | null;
  /** The field labels' locale keys of what this person changed on a GRN or dispatch and has not sent. */
  changedFields(kind: 'grn' | 'dispatch', id: string): string[];
  /** Documents that exist only on this phone, newest first. */
  newDocuments(kind: 'grn' | 'dispatch'): readonly NewDocRow[];
  /** The lines of this person's unsent new GRNs that the copy does not hold yet; refused ones give none (WH-161, 7a). */
  newLots(): readonly NewLotRow[];
  /** Lines an unsent edit adds to a GRN, and the lot ids it removes. */
  lotsAdded(grnId: string): readonly Row[];
  lotsRemoved(grnId: string): readonly string[];
  /** Lot ids an edit removed that is sent: the row is gone from the screen until the copy has the delete (WH-303). */
  lotsGone?(grnId: string): readonly string[];
}

const EMPTY_FIELDS: ReadonlyMap<string, Fields> = new Map();
const EMPTY_NUMBERS: ReadonlyMap<string, number> = new Map();

const NOTHING: UnsentOverlay = {
  grn: () => null,
  lot: () => null,
  dispatch: () => null,
  lessUnsent: () => 0,
  lessHeld: () => 0,
  lessOthersUnsent: () => 0,
  deductions: () => EMPTY_NUMBERS,
  lotValues: () => EMPTY_FIELDS,
  marker: () => null,
  changedFields: () => [],
  newDocuments: () => [],
  newLots: () => [],
  lotsAdded: () => [],
  lotsRemoved: () => [],
  lotsGone: () => [],
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** What a kind says an item changes; anything that is not an object, or a kind without an overlay, changes nothing. */
function partOf(row: ItemRow): OverlayPart {
  const kind = getSendKind(row.kind);
  if (!kind?.overlay) return {};
  try {
    const body: unknown = JSON.parse(row.body);
    const result: unknown = row.result === null ? null : JSON.parse(row.result);
    const part: unknown = kind.overlay(body as never, row.state, { id: row.id, recordedAt: row.recorded_at, result });
    return isRecord(part) ? part : {};
  } catch (error) {
    logger.warn('An unsent item could not be read for the overlay', loggableError(error));
    return {};
  }
}

// The time the last sync run ended: a sent item's values are dropped once a run has ended after its send.
let lastSyncEnd = 0;

const sameServer = (a: string, b: string): boolean => {
  try {
    const [originA, instanceA] = JSON.parse(a) as string[];
    const [originB, instanceB] = JSON.parse(b) as string[];
    return originA === originB && instanceA === instanceB;
  } catch {
    return false;
  }
};

/** The entities a part touches, for re-reading what shows them. */
function entitiesOf(part: OverlayPart): EntityName[] {
  const out: EntityName[] = [];
  if (part.grn || part.lotChanges || part.lotsAdded || part.lotsRemoved || part.newDocuments?.some(doc => doc.kind === 'grn')) out.push('goodsreceived');
  if (part.lot || part.lessUnsent || part.lotsAdded || part.lotsRemoved) out.push('goodsreceived_trl');
  if (part.dispatch || part.newDocuments?.some(doc => doc.kind === 'dispatch')) out.push('dispatch');
  if (part.lessUnsent) out.push('dispatch_trl');
  return out;
}

function mergeInto(target: Map<string, Fields>, source: Record<string, Fields> | undefined): void {
  if (!source) return;
  for (const [id, fields] of Object.entries(source)) target.set(id, { ...target.get(id), ...fields });
}

function add(target: Map<string, number>, source: Record<string, number> | undefined): void {
  if (!source) return;
  for (const [id, bags] of Object.entries(source)) if (bags > 0) target.set(id, (target.get(id) ?? 0) + bags);
}

/** The lots of the new GRNs in `documents` that were not refused. */
function lotsOf(documents: readonly NewDocRow[]): NewLotRow[] {
  const out: NewLotRow[] = [];
  for (const doc of documents) {
    if (doc.kind !== 'grn' || doc.refused === true) continue;
    const header = isRecord(doc.header) ? doc.header : {};
    const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
    const lines = Array.isArray(doc.lines) ? (doc.lines as unknown[]) : [];
    for (const line of lines) {
      if (!isRecord(line)) continue;
      const qty = typeof line.qty === 'number' ? line.qty : 0;
      out.push({
        lot_id: String(line.id), grn_id: String(doc.localId), customer_id: text(header.customer_id), customer_name: text(header.customer_name),
        item_id: text(line.item_id), item_name: text(line.item_name), packaging: text(line.packaging), qty, stock: qty,
        weight: typeof line.weight === 'number' ? line.weight : null, date: text(header.date), rack: text(line.rack), package_mark: text(line.package_mark),
      });
    }
  }
  return out;
}

interface Built {
  overlay: UnsentOverlay;
  touched: Set<EntityName>;
}

function build(rows: readonly ItemRow[], scope: string | null): Built {
  const touched = new Set<EntityName>();
  const copyHeld = heldBagsByLot();
  if (copyHeld.size > 0) {
    touched.add('goodsreceived_trl');
    touched.add('dispatch_trl');
  }
  if (scope === null || (rows.length === 0 && copyHeld.size === 0)) return { overlay: NOTHING, touched };
  const copyIds = new Set(heldCopyRows().map(row => row.id));
  // Bags of this person's refused and held dispatches the copy does not hold yet (the copy's row, once it has it, counts them).
  const fileHeld = new Map<string, number>();
  const grns = new Map<string, Fields>();
  const lots = new Map<string, Fields>();
  const dispatches = new Map<string, Fields>();
  const own = new Map<string, number>();
  const others = new Map<string, number>();
  const markers = new Map<string, 'notSent' | 'sending'>();
  const changed = new Map<string, Set<string>>();
  const documents: NewDocRow[] = [];
  const added = new Map<string, Row[]>();
  const removed = new Map<string, string[]>();
  const gone = new Map<string, string[]>();
  const lotFields = new Map<string, { lotId: string; grnId: string; label: string; from: unknown; to: unknown; state: 'notSent' | 'sending' }>();
  // One row, one marker: "not sent" wins over "sending" when two items change the same record.
  const mark = (key: string, state: 'notSent' | 'sending') => {
    if (markers.get(key) !== 'notSent') markers.set(key, state);
  };
  for (const row of rows) {
    if (!sameServer(row.scope, scope)) continue;
    const mine = row.scope === scope;
    if (mine && (row.state === 'refused' || row.state === 'held')) {
      const part = partOf(row);
      if (part.lessUnsent && !(row.held_id && copyIds.has(row.held_id))) add(fileHeld, part.lessUnsent);
      for (const entity of entitiesOf(part)) touched.add(entity);
      continue;
    }
    const unsent = row.state === 'saved' || row.state === 'sending' || row.state === 'refused' || row.state === 'waiting';
    // A sent item keeps its field values until a sync run has ended after its send.
    const holding = mine && row.state === 'sent' && lastSyncEnd < (row.last_sent_at ?? 0);
    if (!unsent && !holding) continue;
    const part = partOf(row);
    for (const entity of entitiesOf(part)) touched.add(entity);
    if (!mine) {
      // Another person's items: their bags only; no values, no markers (contract 2.1b).
      if (unsent) add(others, part.lessUnsent);
      continue;
    }
    mergeInto(grns, part.grn);
    mergeInto(lots, part.lot);
    mergeInto(dispatches, part.dispatch);
    for (const [grnId, rowsAdded] of Object.entries(part.lotsAdded ?? {})) added.set(grnId, [...(added.get(grnId) ?? []), ...rowsAdded]);
    for (const [grnId, ids] of Object.entries(part.lotsRemoved ?? {})) {
      const into = unsent ? removed : gone;
      into.set(grnId, [...(into.get(grnId) ?? []), ...ids]);
    }
    // A new document is shown, with its number and no marker, until a sync run has ended after its send (WH-161).
    documents.push(...(part.newDocuments ?? []));
    if (!unsent) continue;
    add(own, part.lessUnsent);
    for (const rowsAdded of Object.values(part.lotsAdded ?? {})) for (const lot of rowsAdded) mark(`lot:${String(lot.id)}`, row.state === 'sending' ? 'sending' : 'notSent');
    for (const ids of Object.values(part.lotsRemoved ?? {})) for (const lotId of ids) mark(`lot:${lotId}`, row.state === 'sending' ? 'sending' : 'notSent');
    const state = row.state === 'sending' ? 'sending' : 'notSent';
    for (const id of Object.keys(part.grn ?? {})) mark(`grn:${id}`, state);
    for (const id of Object.keys(part.lot ?? {})) if (!part.lotChanges) mark(`lot:${id}`, state);
    for (const id of Object.keys(part.dispatch ?? {})) mark(`dispatch:${id}`, state);
    for (const doc of part.newDocuments ?? []) mark(`${doc.kind}:${String(doc.localId)}`, state);
    for (const change of part.lotChanges ?? []) {
      const key = `${change.lotId}:${change.field}`;
      const seen = lotFields.get(key);
      lotFields.set(key, { ...change, from: seen ? seen.from : change.from, state: seen?.state === 'notSent' ? 'notSent' : state });
    }
    for (const entry of part.changedFields ?? []) {
      const key = `${entry.kind}:${entry.id}`;
      const set = changed.get(key) ?? new Set<string>();
      for (const field of entry.fields) set.add(field);
      changed.set(key, set);
    }
  }
  for (const entry of lotFields.values()) {
    if ((entry.from ?? null) === (entry.to ?? null)) continue;
    mark(`lot:${entry.lotId}`, entry.state);
    mark(`grn:${entry.grnId}`, entry.state);
    const key = `grn:${entry.grnId}`;
    changed.set(key, (changed.get(key) ?? new Set<string>()).add(entry.label));
  }
  const heldTotal = new Map<string, number>(copyHeld);
  add(heldTotal, Object.fromEntries(fileHeld));
  if (grns.size + lots.size + dispatches.size + own.size + others.size + heldTotal.size + documents.length + added.size + removed.size + gone.size === 0) {
    return { overlay: NOTHING, touched };
  }
  const deductions = new Map<string, number>();
  for (const source of [own, others, heldTotal]) for (const [id, bags] of source) deductions.set(id, (deductions.get(id) ?? 0) + bags);
  const overlay: UnsentOverlay = {
    grn: id => grns.get(id) ?? null,
    lot: id => lots.get(id) ?? null,
    dispatch: id => dispatches.get(id) ?? null,
    lessUnsent: id => own.get(id) ?? 0,
    lessHeld: id => heldTotal.get(id) ?? 0,
    lessOthersUnsent: id => others.get(id) ?? 0,
    deductions: () => deductions,
    lotValues: () => lots,
    marker: (kind, id) => markers.get(`${kind}:${id}`) ?? null,
    changedFields: (kind, id) => [...(changed.get(`${kind}:${id}`) ?? [])],
    newDocuments: kind => documents.filter(doc => doc.kind === kind),
    newLots: () => lotsOf(documents),
    lotsAdded: id => added.get(id) ?? [],
    lotsRemoved: id => removed.get(id) ?? [],
    lotsGone: id => gone.get(id) ?? [],
  };
  return { overlay, touched };
}

// The overlay is rebuilt when the store's rows change (a new array each load) or a sync run ends.
const cache: { rows: readonly ItemRow[] | null; scope: string | null; syncEnd: number; held: readonly unknown[] | null; built: Built } = {
  rows: null,
  scope: null,
  syncEnd: -1,
  held: null,
  built: { overlay: NOTHING, touched: new Set() },
};
let installed = false;
registerSessionScoped('unsent-overlay-cache', () => {
  cache.rows = null;
  cache.scope = null;
  cache.syncEnd = -1;
  cache.held = null;
  cache.built = { overlay: NOTHING, touched: new Set() };
});

function current(): Built {
  const rows = loadedUnsentRows();
  const scope = currentUnsentScope();
  const held = heldCopyRows();
  if (cache.rows !== rows || cache.scope !== scope || cache.syncEnd !== lastSyncEnd || cache.held !== held) {
    cache.held = held;
    cache.rows = rows;
    cache.scope = scope;
    cache.syncEnd = lastSyncEnd;
    cache.built = build(rows, scope);
  }
  return cache.built;
}

/** Tells the screens that show these entities to read again (as a sync that changed them would). */
function publish(before: Set<EntityName>): void {
  const after = current().touched;
  noteCopyChange([...before, ...after]);
  publishCopyChanges();
}

function install(): void {
  if (installed) return;
  installed = true;
  let known = new Set(current().touched);
  const changed = () => {
    const before = known;
    known = new Set(current().touched);
    publish(before);
  };
  subscribeUnsent(changed);
  subscribeHeldRows(changed);
  subscribeSyncRunEnd(() => {
    lastSyncEnd = Date.now();
    changed();
  });
}

export function getUnsentOverlay(): UnsentOverlay {
  install();
  return current().overlay;
}

/** The stock a lot shows: the copy's less what is not sent and what is held. */
export function netStock(overlay: UnsentOverlay, lotId: string, copyStock: number | null): number | null {
  if (copyStock === null) return null;
  return copyStock - overlay.lessUnsent(lotId) - overlay.lessHeld(lotId) - (overlay.lessOthersUnsent?.(lotId) ?? 0);
}
