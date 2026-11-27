/**
 * Edit of a new GRN that is still waiting on this phone (WH-161, product/tech/app-offline-new-records.md §8, Design 10.3 & 10.6
 * DQ4): loads the form from the queued item with no server call, and replaces the waiting item's body and photos in place
 * (keeping the same localId and request key). While the item is `sending` or already attempted (`attempts > 0`), Edit is disabled
 * with `offlineNew.beingSent`.
 */
import * as Crypto from 'expo-crypto';
import { buildSaveGrnArgs, type CreateGRNPayload } from '@/features/grn/services/saveGrnArgs';
import type { GRNHeaderData, GRNImageData, GRNItemData } from '@/store/slices/grnFormSlice';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { t } from '@/i18n';
import { isNewGrnBody, type NewGrnBody, type SaveGrnArgs } from './newGrnKind';
import type { NumberMode } from './offlineNew';
import { grnPhotosOf } from './queuedGrnSave';
import { useUnsentOverlay } from './UnsentMarkers';
import { photosOfItem, replaceItem } from './unsentQueue';
import { itemsOfScope, type ItemRow, type PhotoRow } from './unsentRows';
import { currentUnsentScope, loadedUnsentRows } from './unsentStore';

export type UnsentGrnEditState = 'not-new' | 'editable' | 'being-sent';

const parseObject = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const targetGrnIdOf = (row: ItemRow): string | null => {
  const target = parseObject(row.target_ref);
  return typeof target?.grnId === 'string' ? target.grnId : null;
};

/** Whether `id` is an unsent new GRN in the current scope, and whether it can still be edited in place. */
export function unsentGrnEditState(id: string): UnsentGrnEditState {
  if (!id) return 'not-new';
  const scope = currentUnsentScope();
  if (scope === null) return 'not-new';
  for (const row of loadedUnsentRows()) {
    if (row.scope !== scope || row.kind !== 'newGrn') continue;
    if (row.state === 'sent' || row.state === 'refused') continue;
    if (targetGrnIdOf(row) !== id) continue;
    return row.state === 'saved' && row.attempts === 0 ? 'editable' : 'being-sent';
  }
  return 'not-new';
}

/** Reactive version of `unsentGrnEditState`, updating whenever the unsent store or sync state changes. */
export function useUnsentGrnEditState(id: string): UnsentGrnEditState {
  useUnsentOverlay();
  return unsentGrnEditState(id);
}

/** "Edit, being sent": the screen-reader label when Edit is disabled because the unsent GRN is already being sent (DQ4). */
export function beingSentLabel(label: string): string {
  const firstSentence = t('offline.offlineNew.beingSent').split('.')[0]?.trim() ?? '';
  if (!firstSentence) return label;
  return `${label}, ${firstSentence.charAt(0).toLowerCase()}${firstSentence.slice(1)}`;
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const numberOf = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
};

function photoToFormImage(photo: PhotoRow): GRNImageData {
  const fileName = photo.file.slice(photo.file.lastIndexOf('/') + 1) || `${photo.client_photo_id}.jpg`;
  return {
    id: `temp_unsent_${photo.client_photo_id}`,
    fileName,
    imageUrl: photo.file,
    uploadStatus: 'completed',
  };
}

export interface LoadedUnsentGrn {
  header: GRNHeaderData;
  items: GRNItemData[];
  numberMode: NumberMode;
}

export type LoadUnsentGrnOutcome =
  | { kind: 'not-found' }
  | { kind: 'being-sent' }
  | { kind: 'loaded'; data: LoadedUnsentGrn };

/** The form's header, lines and number mode for a new GRN's body, with the photos kept for it (none for a held item: A-6). */
export function grnFormOfBody(parsed: NewGrnBody, photos: PhotoRow[]): LoadedUnsentGrn {
  const { args, lotLocalIds, show } = parsed;
  const headerImages = photos.filter(photo => photo.role === 'header').map(photoToFormImage);
  const header: GRNHeaderData = {
    gr_no: args.p_issue_number ? '' : textOf(args.p_gr_no),
    registration: textOf(args.p_registration),
    date: textOf(args.p_date),
    sender_id: textOf(args.p_sender_id),
    sender_name: textOf(args.p_sender_name),
    customer_id: textOf(args.p_customer_id),
    customer_name: textOf(args.p_customer_name) || textOf(show.customerName),
    supervisor_id: textOf(args.p_supervisor_id),
    supervisor_name: textOf(args.p_supervisor_name),
    note: textOf(args.p_note),
    leon: args.p_leon === true,
    pricing_mode: args.p_pricing_mode === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY',
    gr_images: headerImages,
  };
  const items: GRNItemData[] = args.p_items.map((raw, index) => {
    const qty = numberOf(raw.qty);
    const showLine = show.lines[index];
    const lineRef = `index:${index}`;
    const lineImages = photos.filter(photo => photo.role === 'item' && photo.line_ref === lineRef).map(photoToFormImage);
    return {
      grn_trl_id: lotLocalIds[index] ?? Crypto.randomUUID(),
      item_table_id: textOf(raw.item_id),
      item_name: showLine?.itemName ?? textOf(raw.item_name),
      packaging: showLine?.packaging ?? textOf(raw.packaging),
      qty,
      stock: qty,
      weight: numberOf(raw.weight),
      rack: textOf(raw.rack),
      package_mark: textOf(raw.package_mark),
      trl_images: lineImages,
    };
  });
  return { header, items, numberMode: parsed.args.p_issue_number ? 'pending' : 'typed' };
}

/** Finds the active `newGrn` item row for `localId` from SQLite. */
async function findUnsentGrnRow(localId: string): Promise<{ scope: string; row: ItemRow; photos: PhotoRow[] } | null> {
  const scope = await getSessionCacheScope();
  if (!scope) return null;
  const rows = await itemsOfScope(scope);
  const row = rows.find(
    entry => entry.kind === 'newGrn' && entry.state !== 'sent' && entry.state !== 'refused' && targetGrnIdOf(entry) === localId
  );
  if (!row) return null;
  const dep = rows.find(entry => entry.kind === 'photos' && entry.depends_on === row.id);
  const photos = dep ? await photosOfItem(dep.id) : [];
  return { scope, row, photos };
}

/** Reads an unsent new GRN from the phone's queue to fill the edit wizard, with zero server calls. */
export async function loadUnsentGrnForEdit(localId: string): Promise<LoadUnsentGrnOutcome> {
  const found = await findUnsentGrnRow(localId);
  if (!found) return { kind: 'not-found' };
  const { row, photos } = found;
  if (row.state !== 'saved' || row.attempts > 0) return { kind: 'being-sent' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.body) as unknown;
  } catch {
    return { kind: 'not-found' };
  }
  if (!isNewGrnBody(parsed)) return { kind: 'not-found' };
  return { kind: 'loaded', data: grnFormOfBody(parsed, photos) };
}

export type SaveEditedUnsentGrnOutcome = 'not-found' | 'being-sent' | 'replaced';

/**
 * Replaces the waiting `newGrn` item and its photos in place, keeping the same `localId`, `request_key` and `p_recorded_at`.
 * No server call is made. Returns `'being-sent'` if the item started sending before the replacement committed.
 */
export async function saveEditedUnsentGrn(
  localId: string,
  request: CreateGRNPayload,
  context: { ratesNotOnPhone: boolean; lineIds?: readonly (string | undefined)[] }
): Promise<SaveEditedUnsentGrnOutcome> {
  const found = await findUnsentGrnRow(localId);
  if (!found) return 'not-found';
  const { row } = found;
  if (row.state !== 'saved' || row.attempts > 0) return 'being-sent';
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.body) as unknown;
  } catch {
    return 'not-found';
  }
  if (!isNewGrnBody(parsed)) return 'not-found';

  const issueNumber = parsed.args.p_issue_number === true;
  const typedNumber = issueNumber ? '' : (request.header.gr_no ?? '').trim();
  const payload: CreateGRNPayload = context.ratesNotOnPhone ? { ...request, rates: undefined } : request;
  const existingLotIds = new Set(parsed.lotLocalIds);
  const lotLocalIds: string[] = request.items.map((_item, index) => {
    const existing = context.lineIds?.[index];
    return existing && existingLotIds.has(existing) ? existing : Crypto.randomUUID();
  });
  const args: SaveGrnArgs = {
    ...buildSaveGrnArgs(payload, typedNumber),
    p_issue_number: issueNumber,
    p_recorded_at: parsed.args.p_recorded_at,
  };
  const body: NewGrnBody = {
    v: 1,
    localId: parsed.localId,
    lotLocalIds,
    args,
    show: {
      customerName: request.header.customer_name,
      lines: request.items.map(item => ({ itemName: item.item_name, packaging: item.packaging || null })),
    },
  };
  const what = typedNumber ? t('offline.unsent.whatNewGrnNumber', { number: typedNumber }) : t('offline.unsent.whatNewGrn');
  const photos = grnPhotosOf(request);
  const photoWhat = t('offline.unsent.whatPhotosNewGrn', { count: photos.length });
  const replaced = await replaceItem(row.id, {
    body,
    targetRef: { grnId: parsed.localId, lotIds: lotLocalIds, ...(typedNumber ? { number: typedNumber } : {}) },
    what,
    customer: request.header.customer_name || undefined,
    photos,
    photoDoc: 'grn',
    photoWhat,
    formGrnId: localId,
  });
  return replaced ? 'replaced' : 'being-sent';
}
