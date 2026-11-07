import { deleteWarehouseImage } from '@/services/imageDeletion';
/**
 * Dispatch Image Upload Service
 * Handles image upload operations for dispatch forms
 * Follows the same three-step transactional pattern as GRN images
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { compressPhoto, PHOTO_PROCESSING_FAILED } from '@/utils/photoCompression';
import * as ImagePicker from 'expo-image-picker';
import {
  getAuthenticatedClient,
  getCurrentConfig,
  getSupabaseClient,
  beginOperatorMutation,
} from '@/config/supabaseConfig';
import type { DispatchImageData } from '@/types/dispatch.types';
import { localizeDigits, t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLimiter } from '@/utils/concurrency';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { rollbackPendingUpload } from '@/services/uploadRollback';
import { logPhotoFailure, photoUploadFailureText } from '@/utils/photoUploadError';
import { createLogger, loggableError } from '@/utils/logger';
import { toCanonicalUrl, viaCurrentPath } from '@/config/lanTransport';
import {
  holdLocalPhoto,
  localPhotoUploadEnded,
  LOCAL_PHOTO_OWNERS,
  releaseLocalPhotos,
} from '@/utils/localPhotoFiles';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ImageUploadResult {
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  error?: string;
  metadata?: {
    file_size: number;
    file_name: string;
    mime_type: string;
    uploadTimestamp: string;
    storage_path?: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Image compression settings - optimized for mobile
const IMAGE_COMPRESSION_SETTINGS = {
  compress: 0.6,
  format: ImageManipulator.SaveFormat.JPEG,
  maxEdge: 1280,
};

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Storage bucket name
const STORAGE_BUCKET = 'dispatch-images';

const log = createLogger('DispatchImageService');

/**
 * Photo uploads that run at the same time when a dispatch is saved, as for a
 * GRN: each one reads its file only when its turn comes.
 */
export const DISPATCH_PHOTO_UPLOAD_CONCURRENCY = 4;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert image URI to ArrayBuffer for direct Supabase Storage upload
 */
const imageToArrayBuffer = async (
  uri: string
): Promise<{ buffer: ArrayBuffer; size: number }> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader did not return ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });

    return { buffer: arrayBuffer, size: arrayBuffer.byteLength };
  } catch (error) {
    console.error(
      '[DispatchImageService] Error converting image to ArrayBuffer:',
      error
    );
    // No `cause`: the caught error can name a local file path, and it is logged above.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('Failed to read image file');
  }
};

/** A file size in megabytes with one decimal, in the digits of the app's language. */
const megabytes = (bytes: number): string => localizeDigits((bytes / (1024 * 1024)).toFixed(1));

/**
 * Validate image file before upload
 */
export const validateImageFile = (
  asset: ImagePicker.ImagePickerAsset
): { valid: boolean; error?: string } => {
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: t('dispatch.photos.tooLarge', { size: megabytes(asset.fileSize) }),
    };
  }

  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  if (asset.mimeType && !allowedTypes.includes(asset.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: t('dispatch.photos.typeNotSupported', { type: asset.mimeType }),
    };
  }

  return { valid: true };
};

/**
 * Generate a temporary dispatch ID for uploads before dispatch creation
 */
export const generateTempDispatchId = (): string => {
  return `temp_dispatch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// MAIN UPLOAD FUNCTION
// ============================================================================

/**
 * Upload dispatch image using three-step transactional flow
 * 1. Register - Create pending DB record
 * 2. Upload - Upload to storage bucket
 * 3. Confirm - Mark as confirmed
 */
export const uploadDispatchImage = async (
  asset: ImagePicker.ImagePickerAsset,
  dispatchId: string,
  onProgress?: (progress: ImageUploadProgress) => void
): Promise<ImageUploadResult> => {
  let finishMutation: (() => void) | undefined;
  // The prepared copy is kept only when the form holds it for a later upload.
  let preparedUri: string | undefined;
  let keepPrepared = false;
  try {
    finishMutation = beginOperatorMutation();
    // Validate file size before compression
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: t('dispatch.photos.tooLarge', { size: megabytes(asset.fileSize) }),
      };
    }

    // Progress: Starting compression
    if (onProgress) {
      onProgress({ loaded: 0, total: 100, percentage: 5 });
    }

    // Compress image
    const {
      uri: compressedUri,
      fileSize,
      mimeType: contentType,
      extension,
    } = await compressPhoto(asset, IMAGE_COMPRESSION_SETTINGS, LOCAL_PHOTO_OWNERS.dispatchForm);
    preparedUri = compressedUri;

    // Check compressed file size
    if (fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: t('dispatch.photos.tooLargeCompressed', { size: megabytes(fileSize) }),
      };
    }

    // The name follows the format that was really written.
    const fileName =
      asset.fileName?.replace(/\.[^/.]+$/, extension) || `image${extension}`;

    // Check for temporary dispatch ID - skip RPC and defer upload
    if (dispatchId.startsWith('temp_dispatch_')) {
      if (onProgress) {
        onProgress({ loaded: 100, total: 100, percentage: 100 });
      }

      // The form holds this copy until the dispatch is saved.
      keepPrepared = true;
      return {
        success: true,
        imageId: undefined,
        imageUrl: compressedUri, // Use local URI for preview
        metadata: {
          file_size: fileSize,
          file_name: fileName,
          mime_type: contentType,
          uploadTimestamp: new Date().toISOString(),
          storage_path: undefined,
        },
      };
    }

    // Progress: Compression done
    if (onProgress) {
      onProgress({ loaded: 25, total: 100, percentage: 25 });
    }

    const supabase = await getAuthenticatedClient();

    // === THREE-STEP TRANSACTIONAL UPLOAD ===

    // Step 1: Register the upload

    const { data: regResult, error: regError } = await supabase.rpc(
      'register_dispatch_image_upload',
      {
        p_dispatch_id: dispatchId,
        p_file_name: fileName,
        p_file_size: fileSize,
        p_mime_type: contentType,
      }
    );

    if (regError) {
      logPhotoFailure(log, 'Registration failed', regError);
      return {
        success: false,
        error: serverText(regError, t('dispatch.photos.registerFailed'), { write: true, photo: true }),
      };
    }

    if (!regResult?.success) {
      console.error(
        '[DispatchImageService] Registration rejected:',
        regResult?.error
      );
      return {
        success: false,
        error: serverText(regResult?.error, t('dispatch.photos.registrationFailedServer'), { write: true, photo: true }),
      };
    }

    const {
      image_id: imageId,
      storage_path: storagePath,
      upload_token: uploadToken,
    } = regResult;

    // Progress: Registration complete
    if (onProgress) {
      onProgress({ loaded: 40, total: 100, percentage: 40 });
    }

    // Builds the success answer once the photo is attached (also used when a
    // lost confirm answer is found to have committed).
    const finishConfirmed = async (confirmedPath: string): Promise<ImageUploadResult> => {
      // Generate signed URL for the uploaded image
      // A throw here must never reach the upload catch: the photo is already confirmed.
      let urlData: { signedUrl?: string } | null | undefined;
      let urlError: unknown;
      try {
        const signed = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(confirmedPath, 3600); // 1 hour expiry
        urlData = signed.data;
        urlError = signed.error;
      } catch (signError) {
        urlError = signError;
      }

      let finalImageUrl: string;
      if (urlError || !urlData?.signedUrl) {
        console.warn(
          '[DispatchImageService] Could not create signed URL:',
          urlError
        );
        finalImageUrl = viaCurrentPath(`${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${confirmedPath}`);
      } else {
        finalImageUrl = viaCurrentPath(urlData.signedUrl);
      }

      // Progress: Complete
      if (onProgress) {
        onProgress({ loaded: 100, total: 100, percentage: 100 });
      }

      return {
        success: true,
        imageId: imageId,
        imageUrl: finalImageUrl,
        metadata: {
          file_size: fileSize,
          file_name: fileName,
          mime_type: contentType,
          uploadTimestamp: new Date().toISOString(),
          storage_path: confirmedPath,
        },
      };
    };

    let confirmedPath: string;
    try {
      // Step 2: Upload to storage

      const startTime = Date.now();

      const { buffer: fileBuffer } = await imageToArrayBuffer(compressedUri);

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: contentType,
          upsert: false,
        });

      const uploadDuration = Date.now() - startTime;

      if (uploadError) {
        logPhotoFailure(log, 'Storage upload failed', uploadError);
        throw uploadError;
      }

      // Progress: Upload complete
      if (onProgress) {
        onProgress({ loaded: 80, total: 100, percentage: 80 });
      }

      // Step 3: Confirm the upload

      const { data: confirmResult, error: confirmError } = await supabase.rpc(
        'confirm_dispatch_image_upload',
        {
          p_image_id: imageId,
          p_upload_token: uploadToken,
        }
      );

      if (confirmError) {
        logPhotoFailure(log, 'Confirmation failed', confirmError);
        throw confirmError;
      }

      if (!confirmResult?.success) {
        console.error(
          '[DispatchImageService] Confirmation rejected:',
          confirmResult?.error
        );
        throw new Error(
          serverText(confirmResult?.error, t('dispatch.photos.confirmationFailedServer'), { write: true, photo: true })
        );
      }

      confirmedPath = storagePath;
    } catch (uploadOrConfirmError) {
      // Rollback: Cancel the pending DB record
      logPhotoFailure(log, 'Upload/confirm failed, rolling back', uploadOrConfirmError);

      const rollback = await rollbackPendingUpload(supabase, {
        rpc: 'cancel_dispatch_image_upload',
        bucket: STORAGE_BUCKET,
        imageId,
        storagePath,
      });
      if (rollback.outcome === 'already_confirmed') {
        // The confirm committed and only its answer was lost: the photo is attached.
        confirmedPath = rollback.storagePath ?? storagePath;
      } else {
        return {
          success: false,
          error: photoUploadFailureText(uploadOrConfirmError, t('dispatch.photos.uploadFailedRetry')),
        };
      }
    }

    return await finishConfirmed(confirmedPath);
  } catch (error) {
    logPhotoFailure(log, 'Upload exception', error);

    // Only the photo being unreadable has a sentence of its own; a failure to reach the server is worded by
    // photoUploadFailureText, and anything else is the app's generic text (never a library's English message).
    let errorMessage = photoUploadFailureText(error, t('dispatch.photos.uploadFailedRetry'));
    if (
      error instanceof Error &&
      (error.message.includes('Failed to read image') || error.message === PHOTO_PROCESSING_FAILED)
    ) {
      errorMessage = t('dispatch.photos.processFailed');
    }

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    // Uploaded at once, refused, or too large: the copy is not needed any more.
    if (preparedUri && !keepPrepared) void releaseLocalPhotos([preparedUri]);
    finishMutation?.();
  }
};

// ============================================================================
// DELETE IMAGE
// ============================================================================

/**
 * Delete dispatch image from storage and database
 */
export const deleteDispatchImage = async (
  imageId: string,
  _imageUrl: string
): Promise<{ success: boolean; partial?: boolean; error?: string }> => {
  const result = await deleteWarehouseImage('dispatch', imageId);
  if (result.partial) {
    // The record is gone; only the stored file could not be confirmed deleted.
    return {
      success: true,
      partial: true,
      error: t('dispatch.photos.removedFileUnconfirmed'),
    };
  }
  return { success: result.success, error: result.error };
};

// ============================================================================
// DEFERRED UPLOADS
// ============================================================================

/**
 * Upload a single deferred image using three-step transactional flow
 */
const uploadSingleDeferredImage = async (
  supabase: any,
  realDispatchId: string,
  image: DispatchImageData
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fileName = image.file_name || 'image.jpg';
    const mimeType = image.mime_type || 'image/jpeg';

    // Step 1: Register
    const { data: regResult, error: regError } = await supabase.rpc(
      'register_dispatch_image_upload',
      {
        p_dispatch_id: realDispatchId,
        p_file_name: fileName,
        p_file_size: image.file_size || 0,
        p_mime_type: mimeType,
      }
    );

    if (regError) {
      logPhotoFailure(log, 'Registration failed', regError);
      return { success: false, error: photoUploadFailureText(regError, t('dispatch.photos.uploadFailedRetry')) };
    }

    if (!regResult?.success) {
      return {
        success: false,
        error: serverText(regResult?.error, t('dispatch.photos.registrationFailed'), { write: true, photo: true }),
      };
    }

    const {
      image_id: imageId,
      storage_path: storagePath,
      upload_token: uploadToken,
    } = regResult;

    try {
      // Step 2: Upload to storage
      const { buffer: fileBuffer } = await imageToArrayBuffer(image.image_url);

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Step 3: Confirm
      const { data: confirmResult, error: confirmError } = await supabase.rpc(
        'confirm_dispatch_image_upload',
        {
          p_image_id: imageId,
          p_upload_token: uploadToken,
        }
      );

      if (confirmError) {
        throw confirmError;
      }

      if (!confirmResult?.success) {
        throw new Error(serverText(confirmResult?.error, t('dispatch.photos.confirmationFailed'), { write: true, photo: true }));
      }

      return { success: true };
    } catch (uploadOrConfirmError) {
      // Rollback
      logPhotoFailure(log, 'Deferred upload failed, rolling back', uploadOrConfirmError);

      const rollback = await rollbackPendingUpload(supabase, {
        rpc: 'cancel_dispatch_image_upload',
        bucket: STORAGE_BUCKET,
        imageId,
        storagePath,
      });
      if (rollback.outcome === 'already_confirmed') {
        // The confirm committed and only its answer was lost: the photo is attached.
        return { success: true };
      }

      return {
        success: false,
        error: photoUploadFailureText(uploadOrConfirmError, t('dispatch.photos.uploadFailedRetry')),
      };
    }
  } catch (err) {
    logPhotoFailure(log, 'Error uploading deferred image', err);
    return {
      success: false,
      error: photoUploadFailureText(err, t('dispatch.photos.uploadFailedRetry')),
    };
  }
};

/**
 * A photo that exists only on the device and is ready to be uploaded: it has a
 * local file, no storage path, and its preparation has finished ('completed').
 *
 * Until the preparation has finished, and when it has failed, the entry still
 * points at the original camera or gallery file, with its EXIF block and
 * possibly over the size limit. That file is never uploaded.
 */
export const isDeferredDispatchPhoto = (image: DispatchImageData): boolean =>
  !!image.image_url && !image.storage_path && image.upload_status === 'completed';

/**
 * What keeps a dispatch from being created because of its photos: one still
 * being prepared, or one whose preparation failed. Null when every photo is
 * either on the server or prepared.
 */
export const unpreparedDispatchPhotos = (
  images: DispatchImageData[]
): 'preparing' | 'failed' | null => {
  const local = images.filter(image => !image.storage_path);
  if (local.some(image => image.upload_status === 'failed')) return 'failed';
  if (local.some(image => image.upload_status !== 'completed')) return 'preparing';
  return null;
};

/** How long a save waits for its photos before reporting the rest as not uploaded (the GRN form waits the same). */
export const DISPATCH_PHOTO_UPLOAD_WAIT_MS = 30000;

// Shared by every call, so a retry started while an earlier save is still uploading does not add places of its own.
const dispatchPhotoUploadSlots = createLimiter(DISPATCH_PHOTO_UPLOAD_CONCURRENCY);

// Uploads still running after their wait ended, by file: a retry of the same photo waits for that upload instead of
// starting a second one.
const dispatchPhotosInFlight = new Map<string, Promise<{ success: boolean; error?: string }>>();
// Cleared at sign-out and a server or facility switch, so a retry never waits on an upload started for the previous
// session. Only the lookup goes: a running upload keeps its own promise and finishes (its removal below is by identity).
// The slots above keep no session data (a count and the waiting jobs, each already holding its own client) and are not
// reset, as that would let new uploads exceed the limit while earlier ones still run.
// Photos whose upload was confirmed after the save's wait ended (their phone copy is deleted then), by dispatch and
// file: a retry counts them as uploaded instead of reading the deleted file. Photos the person gave up on stay out of
// the queue. Both are cleared with the session.
const dispatchPhotosUploaded = new Set<string>();
const dispatchPhotosGivenUp = new Set<string>();
const photoKey = (dispatchId: string, image: DispatchImageData) => `${dispatchId}|${image.image_url}`;

/**
 * "Continue without photos": these photos are not wanted any more. One still waiting for an upload place is not
 * started. One already uploading cannot be stopped half way and still ends attached to the dispatch.
 */
export const giveUpDispatchPhotos = (dispatchId: string, images: DispatchImageData[]): void => {
  images.forEach(image => {
    dispatchPhotosGivenUp.add(photoKey(dispatchId, image));
    dispatchPhotosUploaded.delete(photoKey(dispatchId, image));
  });
};

registerSessionScoped('dispatch-image-uploads', () => {
  dispatchPhotosInFlight.clear();
  dispatchPhotosUploaded.clear();
  dispatchPhotosGivenUp.clear();
}, { onGenerationChange: true });

/**
 * Upload deferred images after dispatch creation, at most
 * DISPATCH_PHOTO_UPLOAD_CONCURRENCY at a time, and wait for them at most
 * `waitMs` in all. A photo still uploading then is reported as not uploaded
 * (like a failed one) while its upload carries on in the background. A photo
 * whose upload is confirmed has its copy on the phone deleted; a failed one
 * keeps it for a retry.
 */
export const uploadDeferredDispatchImages = async (
  realDispatchId: string,
  images: DispatchImageData[],
  waitMs: number = DISPATCH_PHOTO_UPLOAD_WAIT_MS
): Promise<{ success: boolean; uploadedCount: number; errors: string[]; failed: DispatchImageData[] }> => {
  const errors: string[] = [];
  // The photos that did not arrive, so the caller can name them and try again.
  const failed: DispatchImageData[] = [];
  let uploadedCount = 0;

  // Only prepared photos go up (see isDeferredDispatchPhoto).
  const deferredImages = images.filter(isDeferredDispatchPhoto);

  if (deferredImages.length === 0) {
    return { success: true, uploadedCount: 0, errors: [], failed: [] };
  }

  let finishMutation: (() => void) | undefined;
  let started = false;
  // Once the uploads are running, the mutation ends with the last of them, not with this call.
  let handedOff = false;
  try {
    finishMutation = beginOperatorMutation();
    const supabase = await getAuthenticatedClient();
    started = true;

    // A few at a time; each file is held from the start, also while it waits.
    const attempts = deferredImages.map(async (image): Promise<{ success: boolean; error?: string }> => {
      // An upload from an earlier try may still be running: its result counts.
      const key = photoKey(realDispatchId, image);
      // Uploaded after an earlier wait ended: nothing more to send (the phone copy is gone).
      if (dispatchPhotosUploaded.has(key)) return { success: true };
      const earlier = dispatchPhotosInFlight.get(image.image_url);
      if (earlier) {
        const earlierResult = await earlier;
        if (earlierResult.success) return earlierResult;
      }
      const release = holdLocalPhoto(image.image_url);
      let result: { success: boolean; error?: string } = { success: false };
      try {
        result = await dispatchPhotoUploadSlots(async () => {
          // Given up while it waited for a place: not started.
          if (dispatchPhotosGivenUp.has(key)) return { success: false, error: t('dispatch.photos.deferredFailed') };
          return uploadSingleDeferredImage(supabase, realDispatchId, image);
        });
        if (result.success) dispatchPhotosUploaded.add(key);
      } catch (error) {
        logPhotoFailure(log, 'Dispatch photo upload ended unexpectedly', error);
      } finally {
        localPhotoUploadEnded(image.image_url, result.success);
        release();
      }
      return result;
    });
    deferredImages.forEach((image, index) => {
      dispatchPhotosInFlight.set(image.image_url, attempts[index]);
      void attempts[index].finally(() => {
        if (dispatchPhotosInFlight.get(image.image_url) === attempts[index]) dispatchPhotosInFlight.delete(image.image_url);
      });
    });
    // The uploads are not cancelled when the wait ends (queued ones still start later), so the mutation ends with the
    // last of them.
    void Promise.allSettled(attempts).then(() => finishMutation?.());
    handedOff = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => resolve(null), waitMs);
    });
    const results = await Promise.all(attempts.map(attempt => Promise.race([attempt, deadline])));
    if (timer !== undefined) clearTimeout(timer);

    results.forEach((result, index) => {
      const image = deferredImages[index];
      if (result?.success) {
        uploadedCount++;
      } else {
        failed.push(image);
        if (result) {
          errors.push(`${image.file_name}: ${result.error ?? t('dispatch.photos.deferredFailed')}`);
        } else {
          log.warn('Dispatch photo upload still running when the wait ended');
          errors.push(`${image.file_name}: ${t('dispatch.photos.deferredFailed')}`);
        }
      }
    });

    return {
      success: failed.length === 0,
      uploadedCount,
      errors,
      failed,
    };
  } catch (error) {
    logPhotoFailure(log, 'uploadDeferredDispatchImages exception', error);
    // Could not start: like a failed upload, each file is kept for the retry,
    // also through the form reset that follows the save.
    if (!started) deferredImages.forEach(image => localPhotoUploadEnded(image.image_url, false));
    // Nothing is known to have arrived beyond the counted ones: every photo
    // not counted is reported, so none is passed over.
    return {
      success: false,
      uploadedCount,
      errors: [
        error instanceof Error
          ? error.message
          : t('dispatch.photos.deferredFailed'),
      ],
      failed: failed.length > 0 ? failed : deferredImages,
    };
  } finally {
    if (!handedOff) finishMutation?.();
  }
};

// ============================================================================
// SIGNED URL HELPER
// ============================================================================

/**
 * Get signed URL for an image from private bucket
 */
export const getDispatchImageSignedUrl = async (
  filePath: string,
  expiresIn: number = 7 * 24 * 60 * 60
): Promise<string> => {
  try {
    // If filePath is already a signed URL, return it as-is
    if (filePath.startsWith('http') && filePath.includes('token=')) {
      // Signed on either address: it is returned on the address the phone reaches the server by now.
      return viaCurrentPath(toCanonicalUrl(filePath));
    }

    const supabase = await getAuthenticatedClient();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (!error && data?.signedUrl) {
      return viaCurrentPath(data.signedUrl);
    }

    logPhotoFailure(log, 'Failed to create signed URL', error);
    return viaCurrentPath(`${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`);
  } catch (error) {
    logPhotoFailure(log, 'Error getting signed URL', error);
    return filePath;
  }
};
