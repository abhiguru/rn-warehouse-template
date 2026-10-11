import { deleteWarehouseImage } from '@/services/imageDeletion';
import * as ImageManipulator from 'expo-image-manipulator';
import { compressPhoto, PHOTO_PROCESSING_FAILED } from '@/utils/photoCompression';
import { File } from 'expo-file-system';
import {
  getSupabaseWithJWT,
  getAuthenticatedClient,
  getCurrentConfig,
  getSupabaseClient,
  beginOperatorMutation,
} from '@/config/supabaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
// M3 Fix: Using executeRPC wrapper - imported for future use
// Note: Most RPC calls in this file have extensive debug logging and are part of
// complex transactional flows (register -> upload -> confirm with rollback),
// so they are kept unchanged to preserve debugging capability
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';
import { isTemporaryGRNImageId } from './imageId';
import { formatNumber } from '@/utils/formatters';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('grn-photos');

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
    fileSize: number;
    fileName: string;
    mimeType: string;
    uploadTimestamp: string;
    storagePath?: string;
  };
}

export interface ImageMetadata {
  id: string;
  imageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadTimestamp: string;
  uploadStatus: 'uploading' | 'completed' | 'failed' | 'pending';
  progress?: number;
}

// Image compression settings - optimized for mobile (P8 perf fix)
// Reduced from 1920px to 1280px and 0.8 to 0.6 compression for ~50% smaller files
// Changed from JPEG to WebP for 25-35% better compression at similar quality (P5-2)
const IMAGE_COMPRESSION_SETTINGS = {
  compress: 0.6,
  format: ImageManipulator.SaveFormat.WEBP,
  maxEdge: 1280,
  // Some devices cannot write WebP; the photo is then written as JPEG.
  fallbackFormat: ImageManipulator.SaveFormat.JPEG,
};

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Convert image file to base64 string using modern expo-file-system API (SDK 54+)
 */
const imageToBase64 = async (uri: string): Promise<string> => {
  try {
    // Preserve the absolute URI returned by Expo camera/image manipulation.
    const file = new File(uri);
    const base64 = await file.base64();
    return base64;
  } catch (error) {
    log.error('Error converting image to base64', loggableError(error));
    throw new Error('Failed to read image file');
  }
};

/**
 * Convert image URI to ArrayBuffer for direct Supabase Storage upload
 * React Native's Supabase client requires ArrayBuffer (not Blob) for storage uploads
 * Note: blob.arrayBuffer() is not available in React Native, so we use FileReader
 */
const imageToArrayBuffer = async (
  uri: string
): Promise<{ buffer: ArrayBuffer; size: number }> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    // React Native doesn't support blob.arrayBuffer(), use FileReader instead
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
    log.error('Error converting image to ArrayBuffer', loggableError(error));
    throw new Error('Failed to read image file');
  }
};

/**
 * Generate file path for storage based on image type
 */
const generateFilePath = (
  imageType: 'header' | 'item',
  grnId: string,
  itemId?: string,
  fileName?: string
): string => {
  const timestamp = Date.now();
  const sanitizedFileName =
    fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') || `image_${timestamp}.webp`;

  if (imageType === 'header') {
    return `headers/${grnId}/${timestamp}_${sanitizedFileName}`;
  } else {
    if (!itemId) {
      throw new Error('Item ID is required for item images');
    }
    return `items/${grnId}/${itemId}/${timestamp}_${sanitizedFileName}`;
  }
};

/**
 * Upload image via backend RPC (handles storage upload server-side)
 * This method is more secure as it uses service role key on backend
 */
export const uploadGRNImage = async (
  asset: ImagePicker.ImagePickerAsset,
  grnId: string,
  imageType: 'header' | 'item',
  itemId?: string,
  onProgress?: (progress: ImageUploadProgress) => void
): Promise<ImageUploadResult> => {
  let finishMutation: (() => void) | undefined;
  try {
    finishMutation = beginOperatorMutation();
    // Validate file size before compression
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: t('grn.upload.fileTooLarge', { size: formatNumber(asset.fileSize / (1024 * 1024), 1) }),
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
    } = await compressPhoto(asset, IMAGE_COMPRESSION_SETTINGS);

    // Check compressed file size
    if (fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: t('grn.upload.compressedTooLarge', { size: formatNumber(fileSize / (1024 * 1024), 1) }),
      };
    }

    // The name follows the format that was really written.
    const fileName =
      asset.fileName?.replace(/\.[^/.]+$/, extension) || `image${extension}`;

    // Check for temporary GRN ID BEFORE making RPC call - skip RPC entirely for temp IDs
    if (grnId.startsWith('temp_grn_')) {
      // Progress: Complete (deferred)
      if (onProgress) {
        onProgress({ loaded: 100, total: 100, percentage: 100 });
      }

      return {
        success: true,
        imageId: undefined,
        imageUrl: compressedUri, // Use local URI for preview
        metadata: {
          fileSize: fileSize,
          fileName: fileName,
          mimeType: contentType,
          uploadTimestamp: new Date().toISOString(),
          storagePath: undefined, // Will be set when GRN is created
        },
      };
    }

    // Progress: Compression done, preparing upload
    if (onProgress) {
      onProgress({ loaded: 25, total: 100, percentage: 25 });
    }

    // Get authenticated Supabase client
    const supabase = await getAuthenticatedClient();

    // === THREE-STEP TRANSACTIONAL UPLOAD ===
    // Step 1: Register the upload (creates pending DB record)

    const { data: regResult, error: regError } = await supabase.rpc(
      'register_grn_image_upload',
      {
        p_grn_id: grnId,
        p_image_type: imageType,
        p_file_name: fileName,
        p_file_size: fileSize,
        p_mime_type: contentType,
        p_grn_item_id: itemId || null,
      }
    );

    if (regError) {
      log.error('Registration failed', loggableError(regError));
      return {
        success: false,
        error: serverText(regError.message, t('grn.upload.registerFailed')),
      };
    }

    if (!regResult?.success) {
      log.error('Registration rejected');
      return {
        success: false,
        error: serverText(regResult?.error, t('grn.upload.registrationRejected')),
      };
    }

    const {
      image_id: imageId,
      storage_path: storagePath,
      upload_token: uploadToken,
    } = regResult;

    // Progress: Registration complete, starting upload
    if (onProgress) {
      onProgress({ loaded: 40, total: 100, percentage: 40 });
    }

    try {
      // Step 2: Upload binary file directly to Supabase Storage

      const startTime = Date.now();

      // Convert compressed image to ArrayBuffer for direct storage upload
      // React Native's Supabase client requires ArrayBuffer (not Blob)
      const { buffer: fileBuffer } = await imageToArrayBuffer(compressedUri);

      const { error: uploadError } = await supabase.storage
        .from('grn-images')
        .upload(storagePath, fileBuffer, {
          contentType: contentType,
          upsert: false,
        });

      const uploadDuration = Date.now() - startTime;

      if (uploadError) {
        log.error('Storage upload failed', loggableError(uploadError));
        throw uploadError;
      }

      // Progress: Upload complete, confirming
      if (onProgress) {
        onProgress({ loaded: 80, total: 100, percentage: 80 });
      }

      // Step 3: Confirm the upload (marks DB record as confirmed)

      const { data: confirmResult, error: confirmError } = await supabase.rpc(
        'confirm_grn_image_upload',
        {
          p_image_id: imageId,
          p_upload_token: uploadToken,
        }
      );

      if (confirmError) {
        log.error('Confirmation failed', loggableError(confirmError));
        throw confirmError;
      }

      if (!confirmResult?.success) {
        log.error('Confirmation rejected');
        throw new Error(
          serverText(confirmResult?.error, t('grn.upload.confirmationFailed'))
        );
      }

      // Generate signed URL for the uploaded image
      const { data: urlData, error: urlError } = await supabase.storage
        .from('grn-images')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      let finalImageUrl: string;
      if (urlError || !urlData?.signedUrl) {
        log.warn('Could not create signed URL', loggableError(urlError));
        // Use direct storage URL as fallback
        finalImageUrl = `${getCurrentConfig().url}/storage/v1/object/grn-images/${storagePath}`;
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
          fileSize: fileSize,
          fileName: fileName,
          mimeType: contentType,
          uploadTimestamp: new Date().toISOString(),
          storagePath: storagePath,
        },
      };
    } catch (uploadOrConfirmError) {
      // Rollback: Cancel the pending DB record and try to remove from storage
      log.error('Upload/confirm failed, rolling back', loggableError(uploadOrConfirmError));

      try {
        await supabase.rpc('cancel_grn_image_upload', { p_image_id: imageId });
      } catch (cancelError) {
        log.warn('Failed to cancel pending record', loggableError(cancelError));
      }

      try {
        await supabase.storage.from('grn-images').remove([storagePath]);
      } catch (removeError) {
        log.warn('Failed to remove partial upload', loggableError(removeError));
      }

      return {
        success: false,
        error:
          uploadOrConfirmError instanceof Error
            ? uploadOrConfirmError.message
            : t('grn.photos.uploadFailed'),
      };
    }
  } catch (error) {
    log.error('Upload exception', loggableError(error));

    let errorMessage = t('grn.photos.uploadFailed');
    if (error instanceof Error) {
      if (error.message.includes('Network request failed')) {
        errorMessage =
          t('grn.upload.networkFailed');
      } else if (
        error.message.includes('Failed to read image') ||
        error.message === PHOTO_PROCESSING_FAILED
      ) {
        errorMessage =
          t('grn.upload.processFailed');
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    finishMutation?.();
  }
};

/**
 * Upload GRN header image
 */
export const uploadGRNHeaderImage = async (
  asset: ImagePicker.ImagePickerAsset,
  grnId: string,
  onProgress?: (progress: ImageUploadProgress) => void
): Promise<ImageUploadResult> => {
  return uploadGRNImage(asset, grnId, 'header', undefined, onProgress);
};

/**
 * Upload GRN item image
 */
export const uploadGRNItemImage = async (
  asset: ImagePicker.ImagePickerAsset,
  grnId: string,
  itemId: string,
  onProgress?: (progress: ImageUploadProgress) => void
): Promise<ImageUploadResult> => {
  return uploadGRNImage(asset, grnId, 'item', itemId, onProgress);
};

/**
 * Delete image from storage and database
 */
export const deleteGRNImage = async (
  imageId: string,
  _imageUrl: string
): Promise<{ success: boolean; partial?: boolean; error?: string }> => {
  if (isTemporaryGRNImageId(imageId)) return { success: true };
  const result = await deleteWarehouseImage('grn', imageId);
  if (result.partial) {
    // The record is gone; only the stored file could not be confirmed deleted.
    // Callers remove the photo locally and show the warning.
    return {
      success: true,
      partial: true,
      error: t('grn.upload.partialDelete'),
    };
  }
  return { success: result.success, error: result.error };
};

/**
 * Get signed URL for an image from private bucket
 */
export const getImageSignedUrl = async (
  filePath: string,
  expiresIn: number = 7 * 24 * 60 * 60
): Promise<string> => {
  try {
    // If filePath is already a signed URL, return it as-is
    if (filePath.startsWith('http') && filePath.includes('token=')) {
      return filePath;
    }

    const supabase = await getSupabaseWithJWT();

    // Try multiple times with delays for newly uploaded files
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase.storage
        .from('grn-images')
        .createSignedUrl(filePath, expiresIn);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      } else {
        log.error('Final signed URL attempt failed', loggableError(error));
      }
    }

    // Fallback to direct storage URL
    const baseUrl = `${getCurrentConfig().url}/storage/v1/object/grn-images/${filePath}`;
    log.warn('Using fallback direct storage URL');
    return baseUrl;
  } catch (error) {
    log.error('Error getting signed URL', loggableError(error));
    return filePath; // Fallback to original path
  }
};

/**
 * Get public URL for an image (deprecated - use getImageSignedUrl for private buckets)
 */
export const getImagePublicUrl = (filePath: string): string => {
  // This is a synchronous operation, but we'll make it async-compatible for consistency
  try {
    // For now, return the file path as-is since we store full URLs in the database
    // In the future, if we store only paths, we can generate URLs here
    return filePath;
  } catch (error) {
    log.error('Error getting public URL', loggableError(error));
    return filePath; // Fallback to original path
  }
};

/**
 * Validate image file before upload
 */
export const validateImageFile = (
  asset: ImagePicker.ImagePickerAsset
): { valid: boolean; error?: string } => {
  // Check file size
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: t('grn.upload.fileTooLarge', { size: formatNumber(asset.fileSize / (1024 * 1024), 1) }),
    };
  }

  // Check file type - HEIC/HEIF are allowed as they get converted to JPEG during compression
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
      error: t('grn.upload.unsupportedType', { type: asset.mimeType }),
    };
  }

  return { valid: true };
};

/**
 * Generate a temporary GRN ID for uploads before GRN creation
 */
export const generateTempGRNId = (): string => {
  return `temp_grn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Upload a single deferred image using three-step transactional flow
 */
const uploadSingleDeferredImage = async (
  supabase: any,
  realGrnId: string,
  image: GRNImageData,
  imageType: 'header' | 'item',
  itemId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fileName = image.fileName || 'image.webp';
    const mimeType = image.mimeType || 'image/webp';

    // Step 0: Get actual file size from the image (in case fileSize is undefined)
    let actualFileSize = image.fileSize;
    let fileBuffer: ArrayBuffer | null = null;

    if (!actualFileSize || actualFileSize === 0) {
      try {
        const result = await imageToArrayBuffer(image.imageUrl);
        fileBuffer = result.buffer;
        actualFileSize = result.size;
      } catch (sizeError) {
        log.error(`Failed to get file size`, loggableError(sizeError));
        return { success: false, error: t('grn.upload.readFailed') };
      }
    }

    // Step 1: Register the upload (backend generates unique UUID-based storage path)
    const { data: regResult, error: regError } = await supabase.rpc(
      'register_grn_image_upload',
      {
        p_grn_id: realGrnId,
        p_image_type: imageType,
        p_file_name: fileName,
        p_file_size: actualFileSize,
        p_mime_type: mimeType,
        p_grn_item_id: itemId || null,
      }
    );

    if (regError) {
      log.error(`Registration failed for deferred ${imageType} image`, loggableError(regError));
      return { success: false, error: regError.message };
    }

    if (!regResult?.success) {
      log.error(`Registration rejected for deferred ${imageType} image`);
      return {
        success: false,
        error: serverText(regResult?.error, t('grn.upload.registerFailed')),
      };
    }

    const {
      image_id: imageId,
      storage_path: storagePath,
      upload_token: uploadToken,
    } = regResult;

    try {
      // Step 2: Upload binary file directly to Supabase Storage

      // Convert image to ArrayBuffer for direct storage upload
      // React Native's Supabase client requires ArrayBuffer (not Blob)
      // Reuse buffer if we already fetched it in Step 0
      if (!fileBuffer) {
        const result = await imageToArrayBuffer(image.imageUrl);
        fileBuffer = result.buffer;
      }

      const { error: uploadError } = await supabase.storage
        .from('grn-images')
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        log.error(`Storage upload failed for deferred ${imageType} image`, loggableError(uploadError));
        throw uploadError;
      }

      // Step 3: Confirm the upload

      const { data: confirmResult, error: confirmError } = await supabase.rpc(
        'confirm_grn_image_upload',
        {
          p_image_id: imageId,
          p_upload_token: uploadToken,
        }
      );

      if (confirmError) {
        log.error(`Confirmation failed for deferred ${imageType} image`, loggableError(confirmError));
        throw confirmError;
      }

      if (!confirmResult?.success) {
        log.error(`Confirmation rejected for deferred ${imageType} image`);
        throw new Error(serverText(confirmResult?.error, t('grn.upload.confirmationFailed')));
      }

      return { success: true };
    } catch (uploadOrConfirmError) {
      // Rollback: Cancel the pending DB record and try to remove from storage
      log.error(`Upload/confirm failed for deferred ${imageType} image, rolling back`, loggableError(uploadOrConfirmError));

      try {
        await supabase.rpc('cancel_grn_image_upload', { p_image_id: imageId });
      } catch (cancelError) {
        log.warn(`Failed to cancel pending record for deferred ${imageType} image`, loggableError(cancelError));
      }

      try {
        await supabase.storage.from('grn-images').remove([storagePath]);
      } catch (removeError) {
        log.warn(`Failed to remove partial upload for deferred ${imageType} image`, loggableError(removeError));
      }

      return {
        success: false,
        error:
          uploadOrConfirmError instanceof Error
            ? uploadOrConfirmError.message
            : t('grn.photos.uploadFailed'),
      };
    }
  } catch (err) {
    log.error(`Error uploading deferred ${imageType} image`, loggableError(err));
    return {
      success: false,
      error: err instanceof Error ? err.message : t('grn.photos.uploadFailed'),
    };
  }
};

// ============================================================================
// PHOTOS KEPT ON THE DEVICE UNTIL THE GRN IS SAVED
// ============================================================================

/**
 * A photo picked in the GRN form. It stays on the device (a local file) until
 * the GRN is saved, in create and in edit mode alike, so that discarding the
 * form leaves the server as it was.
 */
export interface PendingGRNPhoto {
  image: GRNImageData;
  imageType: 'header' | 'item';
  /** goodsreceived_trl id for an item photo; empty when the saved line could not be identified. */
  itemId?: string;
  /** Name of the line, to tell the user which photo this is. */
  itemName?: string;
  /** 1-based place among the photos picked for the GRN, or for that line. */
  position: number;
}

/** A photo that did not reach the server. */
export interface FailedGRNPhoto extends PendingGRNPhoto {
  error?: string;
  /**
   * Set when the upload was still running when the wait ended. A retry waits
   * for this same upload before it starts another, so a slow upload that lands
   * late is not uploaded twice.
   */
  inFlight?: Promise<{ success: boolean; error?: string }>;
}

export interface GRNPhotoUploadOutcome {
  uploadedCount: number;
  failed: FailedGRNPhoto[];
}

/** How long a save waits for its photos before reporting the rest as not uploaded. */
export const GRN_PHOTO_UPLOAD_WAIT_MS = 30000;

/**
 * A photo that exists only on the device and is ready to be uploaded: the
 * prepared (re-encoded) local file, no storage path, no server id.
 *
 * Until its preparation has finished, and when it has failed, the entry still
 * points at the original camera or gallery file, with its EXIF block. That file
 * is never uploaded, so only a 'completed' entry counts.
 */
export const isDeferredGRNPhoto = (image: GRNImageData): boolean =>
  image.uploadStatus === 'completed' &&
  !!image.imageUrl &&
  image.imageUrl.startsWith('file://') &&
  !image.storagePath &&
  isTemporaryGRNImageId(image.id);

/**
 * What keeps a form from being saved because of its photos: one that is still
 * being prepared, or one whose preparation failed. Null when every photo is
 * either on the server or prepared.
 */
export const unpreparedGRNPhotos = (
  headerImages: GRNImageData[],
  lines: Array<{ images?: GRNImageData[] }>
): 'preparing' | 'failed' | null => {
  const local = [...headerImages, ...lines.flatMap(line => line.images || [])].filter(
    image => !image.storagePath && isTemporaryGRNImageId(image.id)
  );
  if (local.some(image => image.uploadStatus === 'failed')) return 'failed';
  if (local.some(image => image.uploadStatus !== 'completed')) return 'preparing';
  return null;
};

/**
 * The photos of a form that still have to be uploaded.
 * @param lines the saved lines, each with the id the server gave it
 */
export const collectDeferredGRNPhotos = (
  headerImages: GRNImageData[],
  lines: Array<{ itemId?: string; itemName?: string; images?: GRNImageData[] }>
): PendingGRNPhoto[] => {
  const photos: PendingGRNPhoto[] = headerImages
    .filter(isDeferredGRNPhoto)
    .map((image, index) => ({ image, imageType: 'header' as const, position: index + 1 }));

  for (const line of lines) {
    (line.images || []).filter(isDeferredGRNPhoto).forEach((image, index) => {
      photos.push({
        image,
        imageType: 'item',
        itemId: line.itemId,
        itemName: line.itemName,
        position: index + 1,
      });
    });
  }

  return photos;
};

/**
 * Upload photos to a saved GRN, in parallel, and report each one that did not
 * arrive. Never throws.
 *
 * Pass the `failed` list of an earlier call to try those photos again.
 */
export const uploadGRNPhotos = async (
  realGrnId: string,
  photos: Array<PendingGRNPhoto | FailedGRNPhoto>,
  waitMs: number = GRN_PHOTO_UPLOAD_WAIT_MS
): Promise<GRNPhotoUploadOutcome> => {
  if (photos.length === 0) {
    return { uploadedCount: 0, failed: [] };
  }

  const describe = ({ image, imageType, itemId, itemName, position }: PendingGRNPhoto): PendingGRNPhoto => ({
    image,
    imageType,
    itemId,
    itemName,
    position,
  });

  let finishMutation: (() => void) | undefined;
  let supabase: Awaited<ReturnType<typeof getAuthenticatedClient>>;
  try {
    finishMutation = beginOperatorMutation();
    supabase = await getAuthenticatedClient();
  } catch (error) {
    finishMutation?.();
    log.error('uploadGRNPhotos could not start', loggableError(error));
    return {
      uploadedCount: 0,
      failed: photos.map(photo => ({ ...describe(photo), error: t('grn.photos.uploadFailed') })),
    };
  }

  const attempts = photos.map(async (photo): Promise<{ success: boolean; error?: string }> => {
    // An upload from an earlier try may still be running: its result counts.
    const earlier = (photo as FailedGRNPhoto).inFlight;
    if (earlier) {
      const earlierResult = await earlier;
      if (earlierResult.success) return earlierResult;
    }
    if (photo.imageType === 'item' && !photo.itemId) {
      return { success: false, error: t('grn.upload.lineNotFound') };
    }
    // Only the prepared copy is ever sent, whatever list the caller built.
    if (!isDeferredGRNPhoto(photo.image)) {
      return { success: false, error: t('grn.upload.notPrepared') };
    }
    return uploadSingleDeferredImage(supabase, realGrnId, photo.image, photo.imageType, photo.itemId);
  });
  // The uploads are not cancelled when the wait ends, so the mutation ends with them.
  void Promise.all(attempts).then(() => finishMutation?.());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const results = await Promise.all(attempts.map(attempt => Promise.race([attempt, deadline])));
  if (timer !== undefined) clearTimeout(timer);

  let uploadedCount = 0;
  const failed: FailedGRNPhoto[] = [];
  results.forEach((result, index) => {
    if (result?.success) {
      uploadedCount++;
    } else if (result) {
      failed.push({ ...describe(photos[index]), error: result.error });
    } else {
      log.warn('Photo upload still running when the wait ended');
      failed.push({ ...describe(photos[index]), error: t('grn.upload.stillUploading'), inFlight: attempts[index] });
    }
  });

  return { uploadedCount, failed };
};

// Note: imageToBase64 helper is defined at the top of this file
