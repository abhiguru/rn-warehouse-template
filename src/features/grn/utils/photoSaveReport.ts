import { t, formatIdentifier } from '@/i18n';
import type { PendingGRNPhoto } from '../services/imageUploadService';

/** How each photo that was not uploaded is named to the user: which GRN photo, or which line's photo. */
export function failedPhotoNames(failed: PendingGRNPhoto[]): string[] {
  return failed.map((photo) =>
    photo.imageType === 'header'
      ? t('grn.review.failedGrnPhoto', { position: photo.position })
      : t('grn.review.failedItemPhoto', {
          item: photo.itemName || t('common.unknown'),
          position: photo.position,
        })
  );
}

/** The saved GRN's number, then one line per photo that still has to be uploaded. */
export function photosNotUploadedMessage(grNo: string | undefined, failed: PendingGRNPhoto[]): string {
  const photos = failedPhotoNames(failed)
    .map((name) => `• ${name}`)
    .join('\n');
  return grNo
    ? t('grn.review.photosNotUploadedMessage', { number: formatIdentifier(grNo), photos })
    : t('grn.review.photosNotUploadedMessageNoNumber', { photos });
}
