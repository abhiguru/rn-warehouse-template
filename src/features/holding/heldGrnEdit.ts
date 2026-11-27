/**
 * A held edit of a GRN in the Edit GRN form (WH-304 slice A-4 for `grnEdit`; contract product/tech/app-offline-holding-list.md 5.2,
 * 11.4; edit body product/tech/app-offline-edit-grn.md 3.2). Correct is an online, manager action: the GRN is read from the server,
 * the held changes are put on top so the form shows what the recorder meant, and what the server holds now stays the baseline the
 * corrected body is compared with. Its Save is `decide_held_item` with that body.
 */
import { loadGRNData as loadServerGrn } from '@/features/grn/services/grnFormService';
import { diffGrnEdit, isGrnEditBody, type GrnEditBody, type Named } from '@/features/grn/offline-edit/grnEditChanges';
import type { GRNHeaderData, GRNItemData, GRNLoadedBaseline } from '@/store/slices/grnFormSlice';
import { getHeldItem, type HeldItemDetail } from './holdingApi';

type ServerGrn = NonNullable<Extract<Awaited<ReturnType<typeof loadServerGrn>>, { success: true }>['data']>;

export type LoadedHeldGrnEdit =
  | {
      kind: 'loaded';
      item: HeldItemDetail;
      held: GrnEditBody;
      /** What the server holds now, as the edit form reads it. */
      server: ServerGrn;
      /** The server's header and lines with the held changes on top: what the form opens with. */
      header: GRNHeaderData;
      items: GRNItemData[];
      /** The server's values without photos and locks: what the corrected body is compared with. */
      baseline: GRNLoadedBaseline;
    }
  | { kind: 'unavailable' }
  /** The GRN could not be read; the message is the read's own. */
  | { kind: 'failed'; message: string };

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const numberOf = (value: unknown, otherwise: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : otherwise);
const namedOf = (value: unknown): Named | null =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
    ? { id: (value as Named).id, name: textOf((value as { name?: unknown }).name) }
    : null;

/** The server's header with the held header changes written into it. */
function applyHeader(body: GrnEditBody, header: GRNHeaderData): GRNHeaderData {
  const next: GRNHeaderData = { ...header };
  const changes = body.header ?? {};
  if (changes.date) next.date = textOf(changes.date.to) || next.date;
  if (changes.customer_id) {
    const named = namedOf(changes.customer_id.to);
    next.customer_id = named?.id ?? '';
    next.customer_name = named?.name ?? '';
  }
  if (changes.sender) {
    const named = namedOf(changes.sender.to);
    next.sender_id = named?.id ?? '';
    next.sender_name = named?.name ?? '';
  }
  if (changes.supervisor) {
    const named = namedOf(changes.supervisor.to);
    next.supervisor_id = named?.id ?? '';
    next.supervisor_name = named?.name ?? '';
  }
  if (changes.registration) next.registration = textOf(changes.registration.to);
  if (changes.note) next.note = textOf(changes.note.to);
  if (changes.leon) next.leon = changes.leon.to === true;
  if (changes.pricing_mode) next.pricing_mode = changes.pricing_mode.to === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY';
  return next;
}

/** The server's lines with the held changes: lot fields written in, removed lines dropped, added lines appended. */
function applyLines(body: GrnEditBody, lines: GRNItemData[]): GRNItemData[] {
  const removed = new Set((body.linesRemoved ?? []).map(line => line.lotId));
  const kept = lines
    .filter(line => !removed.has(line.grn_trl_id))
    .map((line): GRNItemData => {
      const changes = body.lots?.[line.grn_trl_id];
      if (!changes) return line;
      const next: GRNItemData = { ...line };
      if (changes.item) {
        const named = namedOf(changes.item.to);
        if (named) {
          next.item_table_id = named.id;
          next.item_name = named.name;
        }
      }
      if (changes.packaging) next.packaging = textOf(changes.packaging.to);
      if (changes.qty) next.qty = numberOf(changes.qty.to, line.qty);
      if (changes.weight) next.weight = numberOf(changes.weight.to, line.weight);
      if (changes.rack) next.rack = textOf(changes.rack.to);
      if (changes.package_mark) next.package_mark = textOf(changes.package_mark.to);
      return next;
    });
  const added = (body.linesAdded ?? []).map(
    (line): GRNItemData => ({
      grn_trl_id: line.clientLineId,
      item_table_id: line.item_id,
      item_name: line.item_name,
      packaging: line.packaging ?? '',
      qty: line.qty,
      stock: line.qty,
      weight: line.weight,
      rack: line.rack ?? '',
      package_mark: line.package_mark ?? '',
      trl_images: [],
    })
  );
  return [...kept, ...added];
}

/** The server's header and lines with a held edit's changes on top. Pure. */
export function applyGrnEdit(body: GrnEditBody, server: { header: GRNHeaderData; items: GRNItemData[] }): { header: GRNHeaderData; items: GRNItemData[] } {
  return { header: applyHeader(body, server.header), items: applyLines(body, server.items) };
}

/** The server's values the corrected body is compared with: no photos, no locks. */
function baselineOf(server: { header: GRNHeaderData; items: GRNItemData[] }): GRNLoadedBaseline {
  const header = Object.fromEntries(Object.entries(server.header).filter(([field]) => field !== 'gr_images')) as GRNLoadedBaseline['header'];
  return {
    header,
    items: server.items.map(line => ({
      grn_trl_id: line.grn_trl_id,
      item_table_id: line.item_table_id,
      item_name: line.item_name,
      packaging: line.packaging,
      qty: line.qty,
      stock: line.stock,
      weight: line.weight,
      rack: line.rack,
      package_mark: line.package_mark,
    })),
  };
}

/** The held edit read from an item already read, and the GRN it changes read from the server. Another kind or a decided item is `unavailable`. */
export async function loadHeldGrnEditOf(item: HeldItemDetail): Promise<LoadedHeldGrnEdit> {
  if (item.kind !== 'grnEdit' || item.state !== 'held' || !isGrnEditBody(item.body)) return { kind: 'unavailable' };
  const answer = await loadServerGrn(item.body.grnId);
  const server = answer.success ? answer.data : undefined;
  if (!answer.success || !server) return { kind: 'failed', message: answer.success ? '' : (answer.error ?? '') };
  return { kind: 'loaded', item, held: item.body, server, ...applyGrnEdit(item.body, server), baseline: baselineOf(server) };
}

export async function loadHeldGrnEdit(heldId: string): Promise<LoadedHeldGrnEdit> {
  return loadHeldGrnEditOf(await getHeldItem(heldId));
}

/**
 * The body "Accept with changes" sends for a held edit: the form's values against what the server holds, with the recorder's time
 * (the edit was made then) and the version token of the GRN as the form read it. Null when the form equals the server's values:
 * there is nothing left to accept.
 */
export function correctedGrnEditBody(
  held: GrnEditBody,
  baseline: GRNLoadedBaseline,
  form: { header: GRNHeaderData; items: GRNItemData[] },
  loadedAt: string | null
): GrnEditBody | null {
  return diffGrnEdit({ header: baseline.header, items: baseline.items }, form, { grnId: held.grnId, loadedAt: loadedAt ?? held.loadedAt, recordedAt: held.recordedAt });
}
