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
import { mapWithConcurrency } from '@/utils/concurrency';
import { rollbackPendingUpload } from '@/services/uploadRollback';
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
      console.error('[DispatchImageService] Registration failed:', regError);
      return {
        success: false,
        error: serverText(regError.message, t('dispatch.photos.registerFailed'), { write: true, photo: true }),
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
        finalImageUrl = `${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${confirmedPath}`;
      } else {
        finalImageUrl = urlData.signedUrl;
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
        console.error(
          '[DispatchImageService] Storage upload failed:',
          uploadError
        );
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
        console.error(
          '[DispatchImageService] Confirmation failed:',
          confirmError
        );
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
      console.error(
        '[DispatchImageService] Upload/confirm failed, rolling back:',
        uploadOrConfirmError
      );

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
          error:
            uploadOrConfirmError instanceof Error
              ? uploadOrConfirmError.message
              : t('dispatch.photos.uploadFailed'),
        };
      }
    }

    return await finishConfirmed(confirmedPath);
  } catch (error) {
    console.error('[DispatchImageService] Upload exception:', error);

    let errorMessage = t('dispatch.photos.uploadFailed');
    if (error instanceof Error) {
      if (error.message.includes('Network request failed')) {
        errorMessage = t('dispatch.photos.networkFailed');
      } else if (
        error.message.includes('Failed to read image') ||
        error.message === PHOTO_PROCESSING_FAILED
      ) {
        errorMessage = t('dispatch.photos.processFailed');
      } else {
        errorMessage = error.message;
      }
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
      console.error('[DispatchImageService] Registration failed:', regError);
      return { success: false, error: regError.message };
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
      console.error(
        '[DispatchImageService] Deferred upload failed, rolling back:',
        uploadOrConfirmError
      );

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
        error:
          uploadOrConfirmError instanceof Error
            ? uploadOrConfirmError.message
            : t('dispatch.photos.uploadFailed'),
      };
    }
  } catch (err) {
    console.error(
      '[DispatchImageService] Error uploading deferred image:',
      err
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : t('dispatch.wizard.unknownError'),
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

/**
 * Upload deferred images after dispatch creation, at most
 * DISPATCH_PHOTO_UPLOAD_CONCURRENCY at a time. A photo whose upload is
 * confirmed has its copy on the phone deleted; a failed one keeps it for a retry.
 */
export const uploadDeferredDispatchImages = async (
  realDispatchId: string,
  images: DispatchImageData[]
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
  try {
    finishMutation = beginOperatorMutation();
    const supabase = await getAuthenticatedClient();
    started = true;

    // A few at a time; each file is held from the start, also while it waits.
    const releases = deferredImages.map(image => holdLocalPhoto(image.image_url));
    const results = await mapWithConcurrency(
      deferredImages,
      DISPATCH_PHOTO_UPLOAD_CONCURRENCY,
      async (image, index) => {
        let result: { success: boolean; error?: string } = { success: false };
        try {
          result = await uploadSingleDeferredImage(supabase, realDispatchId, image);
        } finally {
          localPhotoUploadEnded(image.image_url, result.success);
          releases[index]();
        }
        return { ...result, image };
      }
    );

    for (const result of results) {
      if (result.success) {
        uploadedCount++;
      } else {
        failed.push(result.image);
        errors.push(`${result.image.file_name}: ${result.error ?? t('dispatch.photos.deferredFailed')}`);
      }
    }

    return {
      success: failed.length === 0,
      uploadedCount,
      errors,
      failed,
    };
  } catch (error) {
    console.error(
      '[DispatchImageService] uploadDeferredDispatchImages exception:',
      error
    );
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
    finishMutation?.();
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
      return filePath;
    }

    const supabase = await getAuthenticatedClient();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    console.error('[DispatchImageService] Failed to create signed URL:', error);
    return `${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`;
  } catch (error) {
    console.error('[DispatchImageService] Error getting signed URL:', error);
    return filePath;
  }
};
