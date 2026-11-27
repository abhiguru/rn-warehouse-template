/**
 * Saves a quick change of a lot's rack and mark on the phone (WH-302, product/tech/app-offline-quick-change.md section 3):
 * one own `lotChange` item per lot while it can still change, and a new one (depending on it) once it has been tried. A
 * value put back to what the server holds is dropped before anything was sent (Product PQ6). The queue sends the item at
 * once when the server is reachable (`enqueue` asks the engine).
 */
import { t, formatIdentifier } from '@/i18n';
import { normalizeDigits } from '@/i18n/language';
import { changedLotFields, isLotChangeBody, LOT_FIELD_LABELS, LOT_FIELDS, type FieldChange, type LotChangeBody, type LotField } from '@/features/unsent/lotChangeKind';
import { sendNow } from '@/features/unsent/sendEngine';
import { deleteItem, enqueue, mergeInto, reviveItem } from '@/features/unsent/unsentQueue';
import { itemById, itemsOfScope, type ItemRow } from '@/features/unsent/unsentRows';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';

const logger = createLogger('[lot-change]');

export interface LotValues {
  rack: string | null;
  package_mark: string | null;
}

export interface SaveLotChangeInput {
  lotId: string;
  grnId: string;
  /** The GRN number, an identifier (0-9). */
  grnNumber: string;
  customer?: string;
  /** What the confirmed row holds (the copy's, or on a server-read page the server's): never the overlay's. */
  copy: LotValues;
  /** The new value of a field; absent = the field is untouched. */
  rack?: string | null;
  package_mark?: string | null;
}

export interface SaveLotChangeResult {
  id: string;
  requestKey: string;
  /** The change went into an item that was already waiting. */
  merged: boolean;
  /** Every value was put back: nothing is kept and nothing will be sent. */
  dropped?: boolean;
}

/** Trimmed, in 0-9 digits, blank is null: as the server stores it. */
export const normaliseLotValue = (value: string | null | undefined): string | null => {
  const text = normalizeDigits(value ?? '').trim();
  return text === '' ? null : text;
};

const parse = (row: ItemRow): unknown => {
  try {
    return JSON.parse(row.body) as unknown;
  } catch (error) {
    logger.warn('An unsent item could not be read', loggableError(error));
    return null;
  }
};

/** The `to` this item gives a lot's field, whatever its kind (`lotChange`, or WH-303's `grnEdit`); undefined when it gives none. */
function toOf(row: ItemRow, lotId: string, field: LotField): string | null | undefined {
  const body = parse(row);
  if (row.kind === 'lotChange') {
    if (!isLotChangeBody(body) || body.lotId !== lotId) return undefined;
    const change = body.changes[field];
    return change === undefined ? undefined : change.to;
  }
  if (row.kind === 'grnEdit' && typeof body === 'object' && body !== null) {
    const lots = (body as { lots?: Record<string, Record<string, { to?: unknown } | undefined> | undefined> }).lots;
    const change = lots?.[lotId]?.[field];
    if (change && 'to' in change) return typeof change.to === 'string' ? change.to : null;
  }
  return undefined;
}

const WAITING_STATES: readonly string[] = ['saved', 'sending', 'waiting'];

const whatOf = (grnNumber: string, fields: readonly LotField[]): string =>
  t('offline.unsent.whatChange', { number: formatIdentifier(grnNumber), fields: fields.map(field => t(LOT_FIELD_LABELS[field])).join(', ') });

/**
 * A save was refused at once while the sheet is open (Product PQ7): only the newer part goes. A merged item goes back to
 * what it was before the merge (waiting, counted, its dependants kept); an item that was new, or has nothing to go back
 * to, is removed.
 */
export async function undoRefusedSave(saved: Pick<SaveLotChangeResult, 'id' | 'merged'>): Promise<void> {
  if (saved.merged) {
    const row = await itemById(saved.id);
    const body = row ? parse(row) : null;
    if (isLotChangeBody(body) && body.previous) {
      const { previous } = body;
      const back: LotChangeBody = { lotId: body.lotId, grnId: body.grnId, recordedAt: previous.recordedAt, changes: previous.changes };
      if (changedLotFields(back).length > 0 && (await reviveItem(saved.id, back, previous.what))) return;
    }
  }
  await deleteItem(saved.id);
}

/**
 * Saves or merges the change. `from` of a field is the `to` of the person's latest earlier unsent item of either kind for
 * that lot and field, else the confirmed value (C303 section 4 rule 2). Throws when the file cannot be written.
 */
export async function saveLotChange(input: SaveLotChangeInput): Promise<SaveLotChangeResult> {
  const scope = await getSessionCacheScope();
  if (!scope) throw new Error('No session: nothing can be saved');
  const copy: LotValues = { rack: normaliseLotValue(input.copy.rack), package_mark: normaliseLotValue(input.copy.package_mark) };
  const wanted: Partial<Record<LotField, string | null>> = {};
  for (const field of LOT_FIELDS) {
    if (field in input && input[field] !== undefined) wanted[field] = normaliseLotValue(input[field]);
  }
  const mine = (await itemsOfScope(scope)).filter(row => WAITING_STATES.includes(row.state));

  /** What the server will hold for this field once the earlier items are sent. */
  const expected = (field: LotField): string | null => {
    for (let i = mine.length - 1; i >= 0; i -= 1) {
      const to = toOf(mine[i], input.lotId, field);
      if (to !== undefined) return to;
    }
    return copy[field];
  };

  // The own `lotChange` item for this lot that is still waiting: the newest one.
  const lotItems = mine.filter(row => {
    const body = row.kind === 'lotChange' ? parse(row) : null;
    return isLotChangeBody(body) && body.lotId === input.lotId;
  });
  const own = lotItems.at(-1);
  const recordedAt = new Date().toISOString();

  if (own?.state === 'saved' && own.attempts === 0) {
    const old = parse(own) as LotChangeBody;
    const changes: LotChangeBody['changes'] = { ...old.changes };
    for (const field of LOT_FIELDS) {
      if (!(field in wanted)) continue;
      const to = wanted[field] ?? null;
      const from = changes[field]?.from ?? expected(field);
      // A value put back before anything was sent drops that field (PQ6).
      if (to === from) delete changes[field];
      else changes[field] = { to, from };
    }
    const next: LotChangeBody = { ...old, recordedAt, changes };
    const fields = changedLotFields(next);
    if (fields.length === 0) {
      const fresh = await itemById(own.id);
      if (fresh?.state === 'saved' && fresh.attempts === 0) {
        await deleteItem(own.id);
        return { id: own.id, requestKey: own.request_key, merged: true, dropped: true };
      }
    } else {
      const merged = await mergeInto(
        own.id,
        body => {
          const current = isLotChangeBody(body) ? body : old;
          return { ...current, recordedAt, changes: next.changes, previous: { recordedAt: current.recordedAt, changes: current.changes, what: own.what } };
        },
        whatOf(input.grnNumber, fields)
      );
      if (merged) {
        // A merge is not a save of a new item: ask the engine to send, as a save does.
        void sendNow('saved');
        return { id: own.id, requestKey: own.request_key, merged: true };
      }
    }
  }

  // A new item: depends on the own item that was tried (it stays in front of it), else stands alone.
  const changes: LotChangeBody['changes'] = {};
  for (const field of LOT_FIELDS) {
    if (!(field in wanted)) continue;
    const to = wanted[field] ?? null;
    const from = expected(field);
    if (to !== from) changes[field] = { to, from } satisfies FieldChange;
  }
  const body: LotChangeBody = { lotId: input.lotId, grnId: input.grnId, recordedAt, changes };
  const fields = changedLotFields(body);
  if (fields.length === 0) return { id: '', requestKey: '', merged: false, dropped: true };
  const saved = await enqueue({
    kind: 'lotChange',
    body,
    ...(own ? { dependsOn: own.id } : {}),
    targetRef: { grnId: input.grnId, lotIds: [input.lotId], number: input.grnNumber },
    ...(input.customer ? { customer: input.customer } : {}),
    what: whatOf(input.grnNumber, fields),
  });
  return { id: saved.id, requestKey: saved.requestKey, merged: false };
}
