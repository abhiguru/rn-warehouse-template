/**
 * Photos of a held item (WH-304, product/tech/app-offline-holding-list.md 2.5 and 3). A `photos` row whose hand-over the server
 * answered has a `held_id` and stays `refused` (counted as waiting photos, never starting the 2-hour clock) until each of its
 * files is on the server under that held id or marked missing. Each file goes register, upload, confirm, the same three steps as
 * the GRN photo upload (`photosKind.ts`), through `register_held_photo_upload` and `confirm_held_photo_upload`.
 *
 * Only then does the row become `held`. A decided item (HELD_ALREADY_DECIDED) needs no files: the row is settled at once.
 */
import { File } from 'expo-file-system';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { classify } from '@/features/unsent/sendEngine';
import { markPhoto, photosOf, updateItem, type ItemRow, type PhotoRow } from '@/features/unsent/unsentRows';
import { createLogger, loggableError } from '@/utils/logger';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

const logger = createLogger('[holding-photos]');

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const mimeOf = (name: string): string => (/\.webp$/i.test(name) ? 'image/webp' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

/** How one photo ended. */
type PhotoEnd = 'done' | 'invalid' | 'file_missing' | 'not_yours' | 'line_gone' | 'document_gone' | 'missing' | 'decided' | 'blocked' | 'transient' | 'stop';

/** Why a photo is marked missing; the reason code the server keeps with it. */
type MissingReason = 'invalid' | 'file_missing' | 'not_yours' | 'line_gone' | 'document_gone';

/** What a call to the server gave: its members when it succeeded, or why not. */
type Reply = { kind: 'ok'; data: Fields } | { kind: 'code'; code: string } | { kind: 'transient' } | { kind: 'stop' };

/**
 * How the send pass sends (WH-393): `quietWrite` keeps its requests from asking for an after-write sync each, and `onWrite` is
 * told when the server accepted a change that is not sent again (an item held, a photo done or missing), so the pass asks for one
 * sync at its end. A step that is repeated until the photo goes (a registration) is not told: the sync after it would start the
 * next pass at once, without the retry wait, for as long as the upload keeps failing.
 */
export interface PassWriteOptions {
  quietWrite?: boolean;
  onWrite?: () => void;
}

async function rpc(name: string, args: Fields, options?: PassWriteOptions): Promise<Reply> {
  let answer: { data: unknown; error: unknown; status?: number };
  try {
    const client = await getAuthenticatedClient(options?.quietWrite ? { quietWrite: true } : undefined);
    answer = (await client.rpc(name, args)) as typeof answer;
  } catch (error) {
    answer = { data: null, error };
  }
  const failure = answer.error ? withHttpStatus(answer.error, answer.status) : emptyAnswerAsError(answer);
  const outcome = classify(answer.data, failure);
  if (outcome.kind === 'stop') return { kind: 'stop' };
  if (outcome.kind === 'sent') return { kind: 'ok', data: isFields(outcome.result) ? outcome.result : {} };
  if (outcome.kind === 'refused') return { kind: 'code', code: outcome.code ?? 'refused' };
  return { kind: 'transient' };
}

/** What a refusal code means for the photo: the item is decided, the photo can never be accepted, or it is not this person's. */
function endOfCode(code: string): PhotoEnd {
  if (code === 'HELD_ALREADY_DECIDED') return 'decided';
  if (code === 'HELD_PHOTO_INVALID') return 'invalid';
  if (code === 'HELD_PHOTO_LINE_GONE') return 'line_gone';
  if (code === 'HELD_PHOTO_DOCUMENT_GONE') return 'document_gone';
  if (code === 'HELD_PHOTO_NOT_YOURS') return 'blocked';
  return 'transient';
}

async function sendOne(heldId: string, photo: PhotoRow, options?: PassWriteOptions): Promise<PhotoEnd> {
  const file = new File(photo.file);
  if (!file.exists) return 'file_missing';
  const fileName = photo.file.slice(photo.file.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '');
  const mimeType = mimeOf(fileName);
  const registered = await rpc('register_held_photo_upload', {
    p_held_id: heldId,
    p_client_photo_id: photo.client_photo_id,
    p_role: photo.role,
    p_file_name: fileName,
    p_file_size: file.size,
    p_mime_type: mimeType,
    p_line_ref: photo.line_ref,
  }, options);
  if (registered.kind === 'stop') return 'stop';
  if (registered.kind === 'transient') return 'transient';
  if (registered.kind === 'code') return endOfCode(registered.code);
  // A resend answers the same row; one already confirmed needs nothing more.
  if (registered.data.status === 'confirmed') return 'done';
  const { storage_path: storagePath, bucket } = registered.data;
  if (typeof storagePath !== 'string' || typeof bucket !== 'string') return 'transient';
  try {
    const client = await getAuthenticatedClient(options?.quietWrite ? { quietWrite: true } : undefined);
    const bytes = await file.arrayBuffer();
    // upsert: a resend after a lost answer finds its file already there.
    const { error } = await client.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: true });
    if (error) return classify(null, error).kind === 'stop' ? 'stop' : 'transient';
  } catch (error) {
    logger.warn('A held photo could not be uploaded', loggableError(error));
    return 'transient';
  }
  const confirmed = await rpc('confirm_held_photo_upload', { p_held_id: heldId, p_client_photo_id: photo.client_photo_id }, options);
  if (confirmed.kind === 'ok') return 'done';
  return confirmed.kind === 'code' ? endOfCode(confirmed.code) : confirmed.kind;
}

/**
 * Tells the server the photo is missing, so the held item page shows it as missing. Only a settled answer lets the phone mark the
 * photo done: a transient failure leaves it for the next pass, and an item already decided needs nothing more.
 */
async function reportMissing(heldId: string, photo: PhotoRow, reason: MissingReason, options?: PassWriteOptions): Promise<PhotoEnd> {
  const reply = await rpc('mark_held_photo_missing', {
    p_held_id: heldId,
    p_client_photo_id: photo.client_photo_id,
    p_role: photo.role,
    p_line_ref: photo.line_ref,
    p_reason: reason,
  }, options);
  if (reply.kind === 'ok') {
    options?.onWrite?.();
    return 'missing';
  }
  if (reply.kind === 'code') return reply.code === 'HELD_ALREADY_DECIDED' ? 'decided' : 'transient';
  return reply.kind;
}

/** What a round of uploads learned. */
export interface HeldPhotosResult {
  stop: boolean;
  transient: boolean;
  /** The rows whose files are all up or missing, or whose item was decided. */
  finished: Set<string>;
}

/**
 * HELD_PHOTO_NOT_YOURS is retried only until one full sync run has finished after the first such refusal (Product PQ11): the answer
 * can be true for a moment while the sign-in or role is re-read. `syncRuns` counts the runs that ended; `blockedAt` holds the count at
 * the first refusal of each photo. The record lives while the app runs; a restart starts the wait again, which is still bounded.
 */
let syncRuns = 0;
const blockedAt = new Map<string, number>();
let stopCounting: (() => void) | null = null;
registerSessionScoped('held-photos-blocked', () => {
  blockedAt.clear();
  syncRuns = 0;
});

/** Starts counting ended sync runs (the hand-over starts with the phone copy). Idempotent; nothing listens at import. */
export function startHeldPhotos(): void {
  if (stopCounting) return;
  stopCounting = subscribeSyncRunEnd(() => {
    syncRuns += 1;
  });
}

/** Stops counting and forgets the first refusals. Idempotent. */
export function stopHeldPhotos(): void {
  stopCounting?.();
  stopCounting = null;
  blockedAt.clear();
  syncRuns = 0;
}

/** True once a sync run has ended since this photo was first refused as not the person's. Records the first refusal. */
function blockedForGood(heldId: string, photo: PhotoRow): boolean {
  const key = `${heldId}/${photo.client_photo_id}`;
  const first = blockedAt.get(key);
  if (first === undefined) {
    blockedAt.set(key, syncRuns);
    return false;
  }
  if (syncRuns <= first) return false;
  blockedAt.delete(key);
  logger.warn('A held photo is still refused as not this person\'s after a full sync run; it is marked missing: HELD_PHOTO_NOT_YOURS', { heldId });
  return true;
}

/**
 * Sends the files of the `photos` rows that have a held id and are not held yet, then turns each row whose files are all done or
 * missing into `held` (unless `markHeld` is false: the move deletes them instead). Always resolves; what could not go is tried again.
 */
export async function sendHeldPhotos(
  rows: readonly ItemRow[],
  markHeld = true,
  options?: PassWriteOptions
): Promise<HeldPhotosResult> {
  const result: HeldPhotosResult = { stop: false, transient: false, finished: new Set() };
  for (const row of rows) {
    if (row.kind !== 'photos' || row.state !== 'refused' || !row.held_id) continue;
    try {
      let settled = true;
      let decided = false;
      for (const photo of await photosOf(row.id)) {
        if (photo.done === 1) continue;
        if (photo.missing === 1) {
          // Marked missing by the send engine before the hand-over (WH-385): the server is told once, so the accepted GRN counts it.
          if (photo.report_queued === 1) continue;
          const told = await reportMissing(row.held_id, photo, 'file_missing', options);
          if (told === 'missing') await markPhoto(row.id, photo.client_photo_id, { report_queued: 1 });
          else if (told === 'decided') {
            decided = true;
            break;
          } else {
            settled = false;
            if (told === 'transient') result.transient = true;
            if (told === 'stop') {
              result.stop = true;
              break;
            }
          }
          continue;
        }
        let end = await sendOne(row.held_id, photo, options);
        if (end === 'blocked' && blockedForGood(row.held_id, photo)) end = 'not_yours';
        if (end === 'invalid' || end === 'file_missing' || end === 'not_yours' || end === 'line_gone' || end === 'document_gone') {
          end = await reportMissing(row.held_id, photo, end, options);
        }
        // A report the server took is told in `reportMissing`.
        if (end === 'done') options?.onWrite?.();
        if (end === 'done') await markPhoto(row.id, photo.client_photo_id, { done: 1 });
        else if (end === 'missing') await markPhoto(row.id, photo.client_photo_id, { missing: 1, report_queued: 1 });
        else if (end === 'decided') {
          decided = true;
          break;
        } else {
          settled = false;
          if (end === 'transient') result.transient = true;
          if (end === 'stop') {
            result.stop = true;
            break;
          }
        }
      }
      if (decided || settled) {
        result.finished.add(row.id);
        if (markHeld) await updateItem(row.id, { state: 'held' });
      }
    } catch (error) {
      logger.warn('Held photos could not be sent', loggableError(error));
      result.transient = true;
    }
    if (result.stop) break;
  }
  return result;
}
