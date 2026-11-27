/**
 * The `photos` kind (WH-301, product/tech/app-offline-unsent-work.md sections 2.1 and 3): photos of a record that is already
 * on the server, waiting on the phone. Photo lane: each file goes register, upload, confirm (the same three steps as the
 * form's upload, `imageUploadService.ts`), up to four at a time, after their record is sent. A photo done stays done, so a
 * later try sends only the others. A file gone from the phone was marked missing by the engine; the rest go.
 *
 * Body: `{ doc: 'grn' | 'dispatch', recordId?: string }`; without `recordId` it comes from the record this item depended on
 * (`ctx.resolved`). Each photo row's `role` is `header` or `item` (GRN; `lineRef` is then the GRN item id) or `dispatch`.
 *
 * Not verified: the client photo id is not sent yet (the backend topic "photo upload by client photo id" is not built), so a
 * lost answer to a register can leave an unconfirmed row, which the server expires (`delete_expired_pending_images`).
 */
import { File } from 'expo-file-system';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { deleteWarehouseImage } from '@/services/imageDeletion';
import { rollbackPendingUpload } from '@/services/uploadRollback';
import { createLimiter } from '@/utils/concurrency';
import { createLogger, loggableError } from '@/utils/logger';
import { classify } from './sendEngine';
import { registerSendKind, type SendContext, type SendKind, type SendOutcome } from './sendKinds';
import { markPhoto, photosOf, type PhotoRow } from './unsentRows';

const logger = createLogger('[unsent-photos]');

export interface PhotosBody {
  doc: 'grn' | 'dispatch';
  recordId?: string;
  /** GRN photos the person removed in an offline edit (WH-303); deleted after this item's uploads are confirmed. */
  remove?: string[];
}

/** The id of a line an edit added: its `clientLineId` mapped through the answer's `lines_added` (WH-303); other refs stay. */
function lineIdOf(lineRef: string | null, resolved: Record<string, unknown>): string | null {
  if (lineRef === null) return null;
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
const BUCKET = { grn: 'grn-images', dispatch: 'dispatch-images' } as const;

const isBody = (value: unknown): value is PhotosBody => {
  const doc = typeof value === 'object' && value !== null ? (value as { doc?: unknown }).doc : undefined;
  return doc === 'grn' || doc === 'dispatch';
};

/** The record's id from what it answered when it was sent. */
function recordIdOf(body: PhotosBody, resolved: Record<string, unknown>): string | null {
  if (body.recordId) return body.recordId;
  for (const answer of Object.values(resolved)) {
    if (typeof answer !== 'object' || answer === null) continue;
    const fields = answer as Record<string, unknown>;
    const id = body.doc === 'grn' ? (fields.grn_id ?? fields.grnId ?? fields.id) : (fields.dispatch_id ?? fields.dispatchId ?? fields.id);
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

const mimeOf = (name: string): string => (/\.webp$/i.test(name) ? 'image/webp' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg');

type Client = Awaited<ReturnType<typeof getAuthenticatedClient>>;
interface Answer {
  data: unknown;
  error: unknown;
}

const asOutcome = (answer: Answer): SendOutcome => classify(answer.data, answer.error);

/** One photo through register, upload and confirm. `sent` means it is attached. */
async function uploadOne(client: Client, body: PhotosBody, recordId: string, photo: PhotoRow, lineId: string | null): Promise<SendOutcome> {
  const file = new File(photo.file);
  const fileName = photo.file.slice(photo.file.lastIndexOf('/') + 1).replace(/^[0-9a-f-]{36}-/, '');
  const mimeType = mimeOf(fileName);
  const registered =
    body.doc === 'grn'
      ? await client.rpc('register_grn_image_upload', {
          p_grn_id: recordId,
          p_image_type: photo.role === 'item' ? 'item' : 'header',
          p_file_name: fileName,
          p_file_size: file.size,
          p_mime_type: mimeType,
          p_grn_item_id: lineId,
        })
      : await client.rpc('register_dispatch_image_upload', {
          p_dispatch_id: recordId,
          p_file_name: fileName,
          p_file_size: file.size,
          p_mime_type: mimeType,
        });
  const registration = asOutcome(registered);
  if (registration.kind !== 'sent') return registration.kind === 'lost' ? { kind: 'transient' } : registration;
  const { image_id: imageId, storage_path: storagePath, upload_token: uploadToken } = registration.result as Record<string, string>;

  const confirm = body.doc === 'grn' ? 'confirm_grn_image_upload' : 'confirm_dispatch_image_upload';
  const cancel = body.doc === 'grn' ? 'cancel_grn_image_upload' : 'cancel_dispatch_image_upload';
  let failure: SendOutcome;
  try {
    const bytes = await file.arrayBuffer();
    const { error } = await client.storage.from(BUCKET[body.doc]).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (error) {
      failure = classify(null, error);
    } else {
      const confirmed = asOutcome(await client.rpc(confirm, { p_image_id: imageId, p_upload_token: uploadToken }));
      if (confirmed.kind === 'sent') return confirmed;
      failure = confirmed;
    }
  } catch (error) {
    failure = classify(null, error);
  }
  // Undo the pending row; a confirm that did commit (its answer was lost) shows as already confirmed.
  const rollback = await rollbackPendingUpload(client, { rpc: cancel, bucket: BUCKET[body.doc], imageId, storagePath });
  if (rollback.outcome === 'already_confirmed') return { kind: 'sent', result: { success: true } };
  // A lost answer is not asked about: the pending row was cancelled, so this photo is sent again from the start.
  return failure.kind === 'lost' ? { kind: 'transient' } : failure;
}

async function sendPhotos(rawBody: unknown, ctx: SendContext): Promise<SendOutcome> {
  if (!isBody(rawBody)) return { kind: 'refused', reason: 'photos: unreadable body' };
  const recordId = recordIdOf(rawBody, ctx.resolved);
  if (!recordId) return { kind: 'refused', reason: 'photos: the record is not known' };
  const rows = (await photosOf(ctx.itemId)).filter(row => !row.done && !row.missing);
  const client = await getAuthenticatedClient();
  if (rows.length === 0) {
    const removal = await removePhotos(rawBody);
    return removal ?? { kind: 'sent', result: { success: true, uploaded: 0 } };
  }
  const limit = createLimiter(SLOTS);
  const outcomes = await Promise.all(
    rows.map(row =>
      limit(async () => {
        const outcome = await uploadOne(client, rawBody, recordId, row, lineIdOf(row.line_ref, ctx.resolved));
        if (outcome.kind === 'sent') await markPhoto(row.item_id, row.client_photo_id, { done: 1 });
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
  const removal = await removePhotos(rawBody);
  return removal ?? { kind: 'sent', result: { success: true, uploaded: outcomes.length } };
}

/** Deletes the photos an offline edit removed. Null when all are gone (a photo already gone counts); else what to do next. */
async function removePhotos(body: PhotosBody): Promise<SendOutcome | null> {
  for (const imageId of body.remove ?? []) {
    const result = await deleteWarehouseImage('grn', imageId);
    // The record is gone and only the stored file could not be confirmed deleted: the photo no longer belongs to the GRN.
    if (!result.success && !result.partial) return { kind: 'transient' };
  }
  return null;
}

const photosKind: SendKind = {
  lane: 'photo',
  send: (body, ctx) => sendPhotos(body, ctx),
};

registerSendKind('photos', photosKind);
