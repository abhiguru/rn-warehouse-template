/**
 * Photos that did not upload when a GRN or dispatch was saved are kept on the phone and sent later (WH-301, contract
 * sections 2 and 3; Design 4.9): one `photos` item for the saved record, with its files moved into the unsent folder. The
 * session teardown no longer abandons them. Only when the facility has the offline feature; otherwise the caller keeps
 * today's "photos not uploaded" retry.
 */
import { hasCapability } from '@/config/facilityCapabilities';
import { releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { createLogger, loggableError } from '@/utils/logger';
import { enqueue } from './unsentQueue';

const logger = createLogger('[unsent-photos]');

export interface KeptPhoto {
  /** The local file (an app-private file address). */
  file: string;
  role: 'header' | 'item' | 'dispatch';
  /** The GRN item id of an item photo. */
  lineRef?: string | undefined;
}

export interface KeepFailedPhotosInput {
  doc: 'grn' | 'dispatch';
  /** The saved record's id on the server. */
  recordId: string;
  /** Its number, for the row's words ("3 photos for GRN 311"). */
  number: string;
  customer?: string | undefined;
  photos: KeptPhoto[];
}

/** How many photos were kept; 0 when the feature is off, there is no session, or they could not be saved (nothing moved then). */
export async function keepFailedPhotos(input: KeepFailedPhotosInput): Promise<number> {
  if (!hasCapability('sync') || input.photos.length === 0) return 0;
  try {
    await enqueue({
      kind: 'photos',
      body: { doc: input.doc, recordId: input.recordId },
      targetRef: input.doc === 'grn' ? { grnId: input.recordId, number: input.number } : { dispatchId: input.recordId, number: input.number },
      what: 'photos',
      ...(input.customer ? { customer: input.customer } : {}),
      photos: input.photos.map(photo => ({ file: photo.file, role: photo.role, ...(photo.lineRef ? { lineRef: photo.lineRef } : {}) })),
    });
  } catch (error) {
    logger.warn('Photos that did not upload could not be kept', loggableError(error));
    return 0;
  }
  // Their files are in the unsent folder now; the form's own registry entries go.
  void releaseLocalPhotos(input.photos.map(photo => photo.file));
  return input.photos.length;
}
