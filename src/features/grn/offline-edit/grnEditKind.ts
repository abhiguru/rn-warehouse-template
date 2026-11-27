/**
 * The `grnEdit` kind (WH-303, product/tech/app-offline-edit-grn.md sections 3 and 14.2): an Edit GRN made on the phone,
 * sent as the field changes the person made (`apply_grn_changes`) with the item's permanent request ID, never as a whole
 * GRN. Lane `record`: in order, one at a time. The last change sent wins; the server tells what it replaced.
 *
 * Several saves of one GRN before any attempt are one item. A save after the item was tried is a new item that depends on
 * it. Photos added or removed in the edit are a separate `photos` item that depends on the edit.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { QUICK_CHANGE_WAIT_MS, waitForOutcome } from '@/features/quick-change/quickChangeOutcome';
import { closeSaveWait } from '@/features/unsent/saveWait';
import { refusalCodeOf } from '@/features/unsent/refusalTags';
import { classify, sendNow } from '@/features/unsent/sendEngine';
import { registerSendKind, type SendKind, type SendOutcome } from '@/features/unsent/sendKinds';
import { deleteItem, enqueue, mergeInto } from '@/features/unsent/unsentQueue';
import { itemsOfScope, type ItemRow } from '@/features/unsent/unsentRows';
import { loadedUnsentRows, refreshUnsent } from '@/features/unsent/unsentStore';
import { t, formatIdentifier } from '@/i18n';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';
import { changedFieldLabels, isGrnEditBody, lotIdsOf, mergeGrnEdit, overlayOf, type GrnEditBody } from './grnEditChanges';

const logger = createLogger('[grn-edit]');

/** The code an older server's missing function becomes: the item is held whole. */
export const SERVER_TOO_OLD = 'SERVER_TOO_OLD';

async function sendGrnEdit(body: unknown, requestKey: string): Promise<SendOutcome> {
  if (!isGrnEditBody(body)) return { kind: 'refused', reason: 'grnEdit: unreadable body' };
  const client = await getAuthenticatedClient();
  const answer = await client.rpc('apply_grn_changes', { p_grn_id: body.grnId, p_changes: body, p_request_key: requestKey });
  // An unreadable HTTP 200, an empty one and a gateway's 502 / 504 are a LOST answer (the edit may be applied), not a plain
  // transient failure: the item then stays tried and is checked by its request key.
  const error = answer.error ?? emptyAnswerAsError({ data: answer.data, error: answer.error, status: answer.status });
  const outcome = classify(answer.data, error ? withHttpStatus(error, answer.status) : null);
  // A server without the function: the item cannot be sent, and the person's work is kept whole for a supervisor.
  if (outcome.kind === 'refused' && outcome.code === 'PGRST202') return { kind: 'refused', code: SERVER_TOO_OLD, reason: SERVER_TOO_OLD };
  return outcome;
}

const grnEditKind: SendKind = {
  lane: 'record',
  send: (body, ctx) => sendGrnEdit(body, ctx.requestKey),
  overlay: body => overlayOf(body),
};

registerSendKind('grnEdit', grnEditKind);

export interface GrnEditPhoto {
  file: string;
  role: 'header' | 'item';
  /** For an item photo: the lot id, or the `clientLineId` of a line this edit adds. */
  lineRef?: string;
}
export interface GrnEditMeta {
  /** The GRN number, an identifier (0-9). */
  grnNumber: string;
  customer?: string;
  /** Photos of the GRN the person removed in the form; deleted after the new photos are up. */
  removePhotoIds?: string[];
}
export interface SaveGrnEditResult {
  id: string;
  requestKey: string;
  /** The change went into an item that was already waiting. */
  merged: boolean;
}
export interface SaveGrnEditWaitResult extends SaveGrnEditResult {
  outcome: 'sent' | 'later' | 'refused';
  /** The server's words for a refusal. */
  reason: string | null;
  /** A refusal as an answer, for the screen's own refused-save handling. */
  answer?: { success: false; code: string | null; reason: string | null; error: string | null; message: string | null };
}

const parseResult = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const WAITING_STATES: readonly string[] = ['saved', 'sending', 'waiting'];

const parse = (row: ItemRow): unknown => {
  try {
    return JSON.parse(row.body) as unknown;
  } catch (error) {
    logger.warn('An unsent item could not be read', loggableError(error));
    return null;
  }
};

const whatOf = (grnNumber: string, body: GrnEditBody): string =>
  t('offline.unsent.whatChange', { number: formatIdentifier(grnNumber), fields: changedFieldLabels(body).map(label => t(label)).join(', ') });

async function save(grnId: string, body: GrnEditBody | null, photos: GrnEditPhoto[], meta: GrnEditMeta): Promise<SaveGrnEditResult> {
  const scope = await getSessionCacheScope();
  if (!scope) throw new Error('No session: nothing can be saved');
  const waiting = (await itemsOfScope(scope)).filter(row => row.kind === 'grnEdit' && WAITING_STATES.includes(row.state));
  const mine = waiting.filter(row => {
    const found = parse(row);
    return isGrnEditBody(found) && found.grnId === grnId;
  });
  const own = mine.at(-1);

  let result: SaveGrnEditResult | null = null;
  let current = body;
  if (body !== null && own?.state === 'saved' && own.attempts === 0) {
    const old = parse(own);
    const merged = isGrnEditBody(old) ? mergeGrnEdit(old, body) : body;
    if (merged === null) {
      // Everything was undone before anything was sent: nothing is kept.
      await deleteItem(own.id);
      return { id: own.id, requestKey: own.request_key, merged: true };
    }
    const done = await mergeInto(own.id, () => merged, whatOf(meta.grnNumber, merged));
    if (done) {
      void sendNow('saved');
      current = merged;
      result = { id: own.id, requestKey: own.request_key, merged: true };
    }
  }
  if (body !== null && result === null) {
    const saved = await enqueue({
      kind: 'grnEdit',
      body,
      ...(own ? { dependsOn: own.id } : {}),
      targetRef: { grnId, lotIds: lotIdsOf(body), number: meta.grnNumber },
      ...(meta.customer ? { customer: meta.customer } : {}),
      what: whatOf(meta.grnNumber, body),
    });
    result = { id: saved.id, requestKey: saved.requestKey, merged: false };
  }

  const remove = meta.removePhotoIds ?? [];
  let photoItem: { id: string; requestKey: string } | null = null;
  if (photos.length > 0 || remove.length > 0) {
    photoItem = await enqueue({
      kind: 'photos',
      body: { doc: 'grn', recordId: grnId, ...(remove.length > 0 ? { remove } : {}) },
      ...(result ? { dependsOn: result.id } : {}),
      targetRef: { grnId, number: meta.grnNumber },
      what: t('offline.unsent.whatPhotos', { count: photos.length, number: formatIdentifier(meta.grnNumber) }),
      photos,
    });
  }
  // The screens read the phone's own work from this snapshot: it holds the edit before the form closes onto the GRN.
  await refreshUnsent();
  logger.info(`Edit of a GRN saved on the phone with ${current ? changedFieldLabels(current).length : 0} changed fields`);
  // Photos only: the photos item is what was saved.
  return result ?? { id: photoItem?.id ?? '', requestKey: photoItem?.requestKey ?? '', merged: false };
}

// Calls for one phone go one at a time, so two taps on Save are one item.
let chain: Promise<unknown> = Promise.resolve();

/** Stores the edit on the phone. Throws when the file cannot be written (nothing is kept then). */
export function saveGrnEditOffline(grnId: string, body: GrnEditBody | null, photos: GrnEditPhoto[], meta: GrnEditMeta): Promise<SaveGrnEditResult> {
  const run = chain.then(() => save(grnId, body, photos, meta));
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Stores the edit and waits up to `QUICK_CHANGE_WAIT_MS` for the server's answer (Design DQ2). A refusal during the wait is
 * told at once and nothing is kept: the item and its photo item are removed (Product PQ9).
 */
export async function saveGrnEditAndWait(grnId: string, body: GrnEditBody | null, photos: GrnEditPhoto[], meta: GrnEditMeta): Promise<SaveGrnEditWaitResult> {
  const saved = await saveGrnEditOffline(grnId, body, photos, meta);
  // Photos only: they go in the photo lane after the person has left the form; there is nothing to wait for.
  if (body === null) return { ...saved, outcome: 'later', reason: null };
  try {
    return await answerOf(saved);
  } finally {
    // The refused item is gone (or the outcome handled): only now may the hand-over see this item.
    closeSaveWait(saved.id);
  }
}

async function answerOf(saved: Awaited<ReturnType<typeof saveGrnEditOffline>>): Promise<SaveGrnEditWaitResult> {
  const outcome = await waitForOutcome(saved.id, QUICK_CHANGE_WAIT_MS);
  if (outcome.kind !== 'refused') return { ...saved, outcome: outcome.kind, reason: null };
  const row = loadedUnsentRows().find(each => each.id === saved.id);
  const kept = row?.result ? parseResult(row.result) : null;
  const code = refusalCodeOf(kept);
  const reason = row?.last_error ?? null;
  await deleteItem(saved.id);
  // The server's whole refusal (its figures included) when the engine kept it, as `{ code, answer }`; the code and message otherwise.
  const answered = typeof kept === 'object' && kept !== null ? (kept as { answer?: unknown }).answer : undefined;
  const fields = typeof answered === 'object' && answered !== null ? (answered as Record<string, unknown>) : {};
  const reasonCode = typeof fields.reason === 'string' ? fields.reason : code;
  return { ...saved, outcome: 'refused', reason, answer: { ...fields, success: false, code, reason: reasonCode, error: reason, message: reason } };
}
