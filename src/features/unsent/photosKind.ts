/**
 * The `photos` kind (WH-301, product/tech/app-offline-unsent-work.md sections 2.1 and 3): photos of a record that is already
 * on the server, waiting on the phone. Photo lane: each file goes register, upload, confirm (the same three steps as the
 * form's upload, `imageUploadService.ts`), up to four at a time, after their record is sent. A photo done stays done, so a
 * later try sends only the others. A file gone from the phone was marked missing by the engine; the rest go.
 *
 * Body: `{ doc: 'grn', recordId?: string }`; without `recordId` it comes from the record this item depended on
 * (`ctx.resolved`). Each photo row's `role` is `header` or `item` (`lineRef` is then the GRN item id).
 *
 * Not verified: the client photo id is not sent yet (the backend topic "photo upload by client photo id" is not built), so a
 * lost answer to a register can leave an unconfirmed row, which the server expires (`delete_expired_pending_images`).
 */
import { File } from 'expo-file-system';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { deleteWarehouseImageDetailed } from '@/services/imageDeletion';
import { rollbackPendingUpload } from '@/services/uploadRollback';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { createLimiter } from '@/utils/concurrency';
import { createLogger, loggableError } from '@/utils/logger';
import { classify } from './sendEngine';
import { registerSendKind, type SendContext, type SendKind, type SendOutcome } from './sendKinds';
import { queuePhotoReports, sendPhotoReports } from './photoReports';
import { itemById, markPhoto, photosOf, type PhotoRow } from './unsentRows';

const logger = createLogger('[unsent-photos]');

export interface PhotosBody {
  doc: 'grn';
  recordId?: string;
  /** GRN photos the person removed in an offline edit (WH-303); deleted after this item's uploads are confirmed. */
  remove?: string[];
}

/** The id of a line an edit added: its `clientLineId` mapped through the answer's `lines_added` (WH-303); other refs stay. */
function addedLineIdOf(lineRef: string, resolved: Record<string, unknown>): string {
  for (const answer of Object.values(resolved)) {
    const added = typeof answer === 'object' && answer !== null ? (answer as { lines_added?: unknown }).lines_added : undefined;
    if (!Array.isArray(added)) continue;
    for (const entry of added as { client_line_id?: unknown; id?: unknown }[]) {
      if (entry.client_line_id === lineRef && typeof entry.id === 'string') return entry.id;
    }
  }
  return lineRef;
}

const SLOTS = 4;
const BUCKET = 'grn-images';

const isBody = (value: unknown): value is PhotosBody => {
  const doc = typeof value === 'object' && value !== null ? (value as { doc?: unknown }).doc : undefined;
  return doc === 'grn';
};

/** The record's id from what it answered when it was sent. */
function recordIdOf(body: PhotosBody, resolved: Record<string, unknown>): string | null {
  if (body.recordId) return body.recordId;
  for (const answer of Object.values(resolved)) {
    if (typeof answer !== 'object' || answer === null) continue;
    const fields = answer as Record<string, unknown>;
    const id = fields.grn_id ?? fields.grnId ?? fields.id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/**
 * The GRN item id a photo row names. A line of a GRN that was unsent has `index:<n>` (WH-161): the server's `item_mapping` of the
 * record answer says which item that was. A line an edit added is mapped by `addedLineIdOf`; anything else is the item id
 * itself. An `index:<n>` line that cannot be resolved gives undefined.
 */
function lineItemOf(lineRef: string | null, resolved: Record<string, unknown>): string | null | undefined {
  if (lineRef === null) return null;
  const index = /^index:(\d+)$/.exec(lineRef)?.[1];
  if (index === undefined) return addedLineIdOf(lineRef, resolved);
  for (const answer of Object.values(resolved)) {
    const mapping = typeof answer === 'object' && answer !== null ? (answer as { item_mapping?: unknown }).item_mapping : undefined;
    if (!Array.isArray(mapping)) continue;
    for (const row of mapping as unknown[]) {
      const fields = typeof row === 'object' && row !== null ? (row as { index?: unknown; item_id?: unknown }) : {};
      if (fields.index === Number(index) && typeof fields.item_id === 'string') return fields.item_id;
    }
  }
  return undefined;
}

const mimeOf = (name: string): string => (/\.webp$/i.test(name) ? 'image/webp' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

type Client = Awaited<ReturnType<typeof getAuthenticatedClient>>;
interface Answer {
  data: unknown;
  error: unknown;
  status?: number;
}

// An unreadable HTTP 200, an empty one and a gateway's 502 / 504 are a LOST answer, not a plain transient failure.
const asOutcome = (answer: Answer): SendOutcome => {
  const error = answer.error ?? emptyAnswerAsError({ data: answer.data, error: answer.error, status: answer.status });
  return classify(answer.data, error ? withHttpStatus(error, answer.status) : null);
};

/** One photo through register, upload and confirm. `sent` means it is attached. */
async function uploadOne(client: Client, recordId: string, photo: PhotoRow, ctx: SendContext): Promise<SendOutcome> {
  const itemId = lineItemOf(photo.line_ref, ctx.resolved);
  if (itemId === undefined) return { kind: 'refused', reason: 'photos: the line of this photo is not known' };
  const file = new File(photo.file);
  const fileName = photo.file.slice(photo.file.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '');
  const mimeType = mimeOf(fileName);
  const registered = await client.rpc('register_grn_image_upload', {
    p_grn_id: recordId,
    p_image_type: photo.role === 'item' ? 'item' : 'header',
    p_file_name: fileName,
    p_file_size: file.size,
    p_mime_type: mimeType,
    p_grn_item_id: itemId,
  });
  const registration = asOutcome(registered);
  if (registration.kind !== 'sent') return registration.kind === 'lost' ? { kind: 'transient' } : registration;
  const { image_id: imageId, storage_path: storagePath, upload_token: uploadToken } = registration.result as Record<string, string>;

  let failure: SendOutcome;
  try {
    const bytes = await file.arrayBuffer();
    const { error } = await client.storage.from(BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (error) {
      failure = classify(null, error);
    } else {
      const confirmed = asOutcome(await client.rpc('confirm_grn_image_upload', { p_image_id: imageId, p_upload_token: uploadToken }));
      if (confirmed.kind === 'sent') return confirmed;
      failure = confirmed;
    }
  } catch (error) {
    failure = classify(null, error);
  }
  // Undo the pending row; a confirm that did commit (its answer was lost) shows as already confirmed.
  const rollback = await rollbackPendingUpload(client, { rpc: 'cancel_grn_image_upload', bucket: BUCKET, imageId, storagePath });
  if (rollback.outcome === 'already_confirmed') return { kind: 'sent', result: { success: true } };
  // A lost answer is not asked about: the pending row was cancelled, so this photo is sent again from the start.
  return failure.kind === 'lost' ? { kind: 'transient' } : failure;
}

async function sendPhotos(rawBody: unknown, ctx: SendContext): Promise<SendOutcome> {
  if (!isBody(rawBody)) return { kind: 'refused', reason: 'photos: unreadable body' };
  const recordId = recordIdOf(rawBody, ctx.resolved);
  if (!recordId) return { kind: 'refused', reason: 'photos: the record is not known' };
  // A photo marked missing is reported to the server before any upload starts, and the report is kept apart from this item (WH-385).
  const item = await itemById(ctx.itemId);
  if (item) await queuePhotoReports(ctx.itemId, item.scope, recordId, lineRef => lineItemOf(lineRef, ctx.resolved));
  const rows = (await photosOf(ctx.itemId)).filter(row => !row.done && !row.missing);
  const client = await getAuthenticatedClient({ quietWrite: true });
  if (rows.length === 0) {
    const removal = await removePhotos(rawBody, ctx);
    return removal ?? { kind: 'sent', result: { success: true, uploaded: 0 } };
  }
  const limit = createLimiter(SLOTS);
  const outcomes = await Promise.all(
    rows.map(row =>
      limit(async () => {
        const outcome = await uploadOne(client, recordId, row, ctx);
        if (outcome.kind === 'sent') {
          // Attached, and not sent again: the pass asks for its sync even when other photos of the item wait (WH-393).
          ctx.noteWrite?.();
          await markPhoto(row.item_id, row.client_photo_id, { done: 1 });
        }
        return outcome;
      }).catch((error: unknown) => {
        logger.warn('A photo could not be sent', loggableError(error));
        return classify(null, error);
      })
    )
  );
  const stop = outcomes.find(outcome => outcome.kind === 'stop');
  if (stop) return stop;
  const refused = outcomes.find(outcome => outcome.kind === 'refused');
  if (refused) return refused;
  if (outcomes.some(outcome => outcome.kind !== 'sent')) return { kind: 'transient' };
  // Photos the person removed go after the new ones are up: the server keeps a GRN's last photo (GRN_PHOTO_REQUIRED).
  const removal = await removePhotos(rawBody, ctx);
  return removal ?? { kind: 'sent', result: { success: true, uploaded: outcomes.length } };
}

/** Deletes the photos an offline edit removed. Null when all are gone (a photo already gone counts); else what to do next. */
async function removePhotos(body: PhotosBody, ctx: SendContext): Promise<SendOutcome | null> {
  let removed = false;
  for (const imageId of body.remove ?? []) {
    const result = await deleteWarehouseImageDetailed('grn', imageId, { quietWrite: true });
    // The record is gone and only the stored file could not be confirmed deleted: the photo no longer belongs to the GRN.
    if (!result.success && !result.partial) {
      // A refusal (the last photo of a GRN stays, not allowed) is not tried again; any other failure is the network's.
      if (!result.refusal) return { kind: 'transient' };
      // The item ends refused with some photos already gone from the record: the copy still has to learn that (WH-393). A
      // transient end asks for nothing, as the next pass deletes the same photos again and its sync would start it at once.
      if (removed) ctx.noteWrite?.();
      return { kind: 'refused', reason: result.error ?? '', ...(result.refusal.code ? { code: result.refusal.code } : {}) };
    }
    removed = true;
  }
  return null;
}

const photosKind: SendKind = {
  lane: 'photo',
  send: async (body, ctx) => {
    const outcome = await sendPhotos(body, ctx);
    // At once (WH-385); what cannot go now goes at the end of a sync run. Always resolves.
    await sendPhotoReports({ quietWrite: true, onWrite: ctx.noteWrite });
    return outcome;
  },
};

registerSendKind('photos', photosKind);
