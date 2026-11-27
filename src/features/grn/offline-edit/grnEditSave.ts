/**
 * What an Edit GRN save puts on the queue (WH-303, contract section 3.4): the field changes of the form against the baseline
 * it was loaded with, the photos it added and the photos it removed. Pure.
 */
import { isTemporaryGRNImageId } from '@/features/grn/services/imageId';
import type { GRNLoadedBaseline, GRNHeaderData, GRNItemData, RemovedGRNImage } from '@/store/slices/grnFormSlice';
import { diffGrnEdit, type GrnEditBody } from './grnEditChanges';
import type { GrnEditMeta, GrnEditPhoto } from './grnEditKind';

export interface OfflineEditInput {
  grnId: string;
  baseline: GRNLoadedBaseline;
  header: GRNHeaderData;
  items: GRNItemData[];
  removedImages: readonly RemovedGRNImage[];
  /** The GRN's version token when the form loaded. */
  loadedAt: string | null;
  recordedAt: string;
}

export interface OfflineEdit {
  body: GrnEditBody;
  photos: GrnEditPhoto[];
  meta: Pick<GrnEditMeta, 'grnNumber' | 'customer' | 'removePhotoIds'>;
}

/** The save to queue, or null when the form changed nothing the server would take (no field, no photo). */
export function offlineEditOf(input: OfflineEditInput): OfflineEdit | null {
  const { header, items } = input;
  const body = diffGrnEdit({ header: input.baseline.header, items: input.baseline.items }, { header, items }, {
    grnId: input.grnId,
    loadedAt: input.loadedAt,
    recordedAt: input.recordedAt,
  });
  const photos: GrnEditPhoto[] = [];
  for (const image of header.gr_images ?? []) {
    if (isTemporaryGRNImageId(image.id) && image.imageUrl) photos.push({ file: image.imageUrl, role: 'header' });
  }
  for (const item of items) {
    for (const image of item.trl_images ?? []) {
      if (isTemporaryGRNImageId(image.id) && image.imageUrl) photos.push({ file: image.imageUrl, role: 'item', lineRef: item.grn_trl_id });
    }
  }
  const removePhotoIds = input.removedImages.filter(image => !isTemporaryGRNImageId(image.id)).map(image => image.id);
  if (body === null && photos.length === 0 && removePhotoIds.length === 0) return null;
  // Photos only: a body with nothing in it is not sent, so the edit is the smallest one the server takes.
  return {
    body: body ?? { v: 1, grnId: input.grnId, loadedAt: input.loadedAt, recordedAt: input.recordedAt },
    photos,
    meta: { grnNumber: header.gr_no, ...(header.customer_name ? { customer: header.customer_name } : {}), ...(removePhotoIds.length > 0 ? { removePhotoIds } : {}) },
  };
}
