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
import { classify } from '@/features/unsent/sendEngine';
import { markPhoto, photosOf, updateItem, type ItemRow, type PhotoRow } from '@/features/unsent/unsentRows';
import { createLogger, loggableError } from '@/utils/logger';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';

const logger = createLogger('[holding-photos]');

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const mimeOf = (name: string): string => (/\.webp$/i.test(name) ? 'image/webp' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

/** How one photo ended. */
type PhotoEnd = 'done' | 'missing' | 'decided' | 'blocked' | 'transient' | 'stop';

/** What a call to the server gave: its members when it succeeded, or why not. */
type Reply = { kind: 'ok'; data: Fields } | { kind: 'code'; code: string } | { kind: 'transient' } | { kind: 'stop' };

async function rpc(name: string, args: Fields): Promise<Reply> {
  let answer: { data: unknown; error: unknown; status?: number };
  try {
    const client = await getAuthenticatedClient();
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
  if (code === 'HELD_PHOTO_INVALID') return 'missing';
  if (code === 'HELD_PHOTO_NOT_YOURS') return 'blocked';
  return 'transient';
}

async function sendOne(heldId: string, photo: PhotoRow): Promise<PhotoEnd> {
  const file = new File(photo.file);
  if (!file.exists) return 'missing';
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
  });
  if (registered.kind === 'stop') return 'stop';
  if (registered.kind === 'transient') return 'transient';
  if (registered.kind === 'code') return endOfCode(registered.code);
  // A resend answers the same row; one already confirmed needs nothing more.
  if (registered.data.status === 'confirmed') return 'done';
  const { storage_path: storagePath, bucket } = registered.data;
  if (typeof storagePath !== 'string' || typeof bucket !== 'string') return 'transient';
  try {
    const client = await getAuthenticatedClient();
    const bytes = await file.arrayBuffer();
    // upsert: a resend after a lost answer finds its file already there.
    const { error } = await client.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: true });
    if (error) return classify(null, error).kind === 'stop' ? 'stop' : 'transient';
  } catch (error) {
    logger.warn('A held photo could not be uploaded', loggableError(error));
    return 'transient';
  }
  const confirmed = await rpc('confirm_held_photo_upload', { p_held_id: heldId, p_client_photo_id: photo.client_photo_id });
  if (confirmed.kind === 'ok') return 'done';
  return confirmed.kind === 'code' ? endOfCode(confirmed.code) : confirmed.kind;
}

/** What a round of uploads learned. */
export interface HeldPhotosResult {
  stop: boolean;
  transient: boolean;
  /** The rows whose files are all up or missing, or whose item was decided. */
  finished: Set<string>;
}

const blockedLogged = new Set<string>();

/**
 * Sends the files of the `photos` rows that have a held id and are not held yet, then turns each row whose files are all done or
 * missing into `held` (unless `markHeld` is false: the move deletes them instead). Always resolves; what could not go is tried again.
 */
export async function sendHeldPhotos(rows: readonly ItemRow[], markHeld = true): Promise<HeldPhotosResult> {
  const result: HeldPhotosResult = { stop: false, transient: false, finished: new Set() };
  for (const row of rows) {
    if (row.kind !== 'photos' || row.state !== 'refused' || !row.held_id) continue;
    try {
      let settled = true;
      let decided = false;
      for (const photo of await photosOf(row.id)) {
        if (photo.done === 1 || photo.missing === 1) continue;
        const end = await sendOne(row.held_id, photo);
        if (end === 'done') await markPhoto(row.id, photo.client_photo_id, { done: 1 });
        else if (end === 'missing') await markPhoto(row.id, photo.client_photo_id, { missing: 1 });
        else if (end === 'decided') {
          decided = true;
          break;
        } else {
          settled = false;
          if (end === 'stop') result.stop = true;
          else if (end === 'transient') result.transient = true;
          else if (!blockedLogged.has(row.held_id)) {
            blockedLogged.add(row.held_id);
            logger.warn('A held photo is not this person\'s to send: HELD_PHOTO_NOT_YOURS');
          }
          if (end === 'stop') break;
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
