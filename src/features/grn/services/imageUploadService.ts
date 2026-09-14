import { deleteWarehouseImage } from '@/services/imageDeletion';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import {
  getSupabaseWithJWT,
  getAuthenticatedClient,
  getCurrentConfig,
  getSupabaseClient,
} from '@/config/supabaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
// M3 Fix: Using executeRPC wrapper - imported for future use
// Note: Most RPC calls in this file have extensive debug logging and are part of
// complex transactional flows (register -> upload -> confirm with rollback),
// so they are kept unchanged to preserve debugging capability
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

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
  maxWidth: 1280,
  maxHeight: 1280,
};

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Convert image file to base64 string using modern expo-file-system API (SDK 54+)
 */
const imageToBase64 = async (uri: string): Promise<string> => {
  try {
    // Remove file:// prefix if present for the File constructor
    const cleanPath = uri.startsWith('file://') ? uri.slice(7) : uri;
    const file = new File(cleanPath);
    const base64 = await file.base64();
    return base64;
  } catch (error) {
    console.error('[ImageService] Error converting image to base64:', error);
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
    console.error(
      '[ImageService] Error converting image to ArrayBuffer:',
      error
    );
    throw new Error('Failed to read image file');
  }
};

/**
 * Compress image before upload to reduce file size
 */
const compressImage = async (
  uri: string
): Promise<{ uri: string; fileSize: number }> => {
  try {
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: IMAGE_COMPRESSION_SETTINGS.maxWidth,
            height: IMAGE_COMPRESSION_SETTINGS.maxHeight,
          },
        },
      ],
      {
        compress: IMAGE_COMPRESSION_SETTINGS.compress,
        format: IMAGE_COMPRESSION_SETTINGS.format,
      }
    );

    // Get file size (approximate)
    const response = await fetch(manipulatedImage.uri);
    const blob = await response.blob();
    const fileSize = blob.size;

    return {
      uri: manipulatedImage.uri,
      fileSize: fileSize,
    };
  } catch (error) {
    console.error('[ImageService] Error compressing image:', error);
    // Fallback to original image
    const response = await fetch(uri);
    const blob = await response.blob();
    return {
      uri: uri,
      fileSize: blob.size,
    };
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
  try {
    // Validate file size before compression
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size (${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit (10MB)`,
      };
    }

    // Progress: Starting compression
    if (onProgress) {
      onProgress({ loaded: 0, total: 100, percentage: 5 });
    }

    // Compress image
    const { uri: compressedUri, fileSize } = await compressImage(asset.uri);

    // Check compressed file size
    if (fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Compressed file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) still exceeds maximum limit (10MB)`,
      };
    }

    // Determine content type (always WebP after compression for better compression)
    const contentType = 'image/webp';
    const fileName =
      asset.fileName?.replace(/\.[^/.]+$/, '.webp') || 'image.webp';

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
      console.error('[ImageService] Registration failed:', regError);
      return {
        success: false,
        error: regError.message || 'Failed to register image upload',
      };
    }

    if (!regResult?.success) {
      console.error('[ImageService] Registration rejected:', regResult?.error);
      return {
        success: false,
        error: regResult?.error || 'Registration failed on server',
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
        console.error('[ImageService] Storage upload failed:', uploadError);
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
        console.error('[ImageService] Confirmation failed:', confirmError);
        throw confirmError;
      }

      if (!confirmResult?.success) {
        console.error(
          '[ImageService] Confirmation rejected:',
          confirmResult?.error
        );
        throw new Error(
          confirmResult?.error || 'Confirmation failed on server'
        );
      }

      // Generate signed URL for the uploaded image
      const { data: urlData, error: urlError } = await supabase.storage
        .from('grn-images')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      let finalImageUrl: string;
      if (urlError || !urlData?.signedUrl) {
        console.warn('[ImageService] Could not create signed URL:', urlError);
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
      console.error(
        '[ImageService] Upload/confirm failed, rolling back:',
        uploadOrConfirmError
      );

      try {
        await supabase.rpc('cancel_grn_image_upload', { p_image_id: imageId });
      } catch (cancelError) {
        console.warn(
          '[ImageService] Failed to cancel pending record:',
          cancelError
        );
      }

      try {
        await supabase.storage.from('grn-images').remove([storagePath]);
      } catch (removeError) {
        console.warn(
          '[ImageService] Failed to remove partial upload:',
          removeError
        );
      }

      return {
        success: false,
        error:
          uploadOrConfirmError instanceof Error
            ? uploadOrConfirmError.message
            : 'Upload failed',
      };
    }
  } catch (error) {
    console.error('[ImageService] Upload exception:', error);

    let errorMessage = 'Upload failed';
    if (error instanceof Error) {
      if (error.message.includes('Network request failed')) {
        errorMessage =
          'Network connection failed. Please check your internet connection and try again.';
      } else if (error.message.includes('Failed to read image')) {
        errorMessage =
          'Failed to process image file. Please try a different image.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
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
): Promise<{ success: boolean; error?: string }> => {
  if (imageId.startsWith('temp_')) return { success: true };
  return deleteWarehouseImage('grn', imageId);
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
        console.error('[ImageService] Final signed URL attempt failed:', error);
      }
    }

    // Fallback to direct storage URL
    const baseUrl = `${getCurrentConfig().url}/storage/v1/object/grn-images/${filePath}`;
    console.warn('[ImageService] Using fallback direct storage URL:', baseUrl);
    return baseUrl;
  } catch (error) {
    console.error('[ImageService] Error getting signed URL:', error);
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
    console.error('[ImageService] Error getting public URL:', error);
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
      error: `File size (${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit (10MB)`,
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
      error: `File type ${asset.mimeType} is not supported. Use JPEG, PNG, WebP, or HEIC.`,
    };
  }

  return { valid: true };
};

/**
 * Save image metadata to database after GRN creation
 * This is used for images uploaded with temporary GRN IDs
 */
export const saveImageMetadataAfterGRN = async (
  grnId: string,
  imageData: GRNImageData,
  imageType: 'header' | 'item',
  itemId?: string
): Promise<{ success: boolean; imageId?: string; error?: string }> => {
  try {
    if (!imageData.storagePath) {
      throw new Error('Storage path is required to save metadata');
    }

    const supabase = await getSupabaseWithJWT();

    // Check if we have a non-temp ID that needs to be passed to the RPC
    const hasExistingId = imageData.id && !imageData.id.startsWith('temp_');

    // Always use the RPC function which should handle user authentication properly

    // Build RPC parameters
    const rpcParams: any = {
      p_grn_id: grnId,
      p_storage_path: imageData.storagePath,
      p_image_type: imageType,
      p_grn_item_id: itemId || null,
      p_file_size: imageData.fileSize || 0, // Default to 0 if undefined
      p_original_filename: imageData.fileName,
      p_mime_type: imageData.mimeType || 'image/webp', // Default to webp if undefined
    };

    // Add image ID if it exists (backend needs to support this parameter)
    if (hasExistingId) {
      rpcParams.p_image_id = imageData.id;
    }

    const { data: metadataResult, error: metadataError } = await (
      await getAuthenticatedClient()
    ).rpc('upload_grn_image', rpcParams);

    if (metadataError) {
      console.error('[ImageService] Metadata save error:', metadataError);
      return {
        success: false,
        error: metadataError.message || 'Failed to save image metadata',
      };
    }

    return {
      success: true,
      imageId: metadataResult?.image_id || metadataResult?.id,
    };
  } catch (error) {
    console.error('[ImageService] Save metadata exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save metadata',
    };
  }
};

/**
 * Save all pending image metadata after GRN creation
 */
export const savePendingImageMetadata = async (
  grnId: string,
  headerImages: GRNImageData[],
  itemImages: Array<{ itemId: string; image: GRNImageData }>
): Promise<{ success: boolean; errors: string[] }> => {
  const errors: string[] = [];

  try {
    if (__DEV__) {
      /* No action needed. */
    }

    // Save header images
    for (const image of headerImages) {
      if (image.storagePath && (!image.id || image.id.startsWith('temp_'))) {
        // If the ID has temp_edit_ prefix, extract the original ID
        const imageToSave = { ...image };
        if (image.id?.startsWith('temp_edit_')) {
          imageToSave.id = image.id.replace('temp_edit_', '');
        }
        const result = await saveImageMetadataAfterGRN(
          grnId,
          imageToSave,
          'header'
        );

        if (!result.success) {
          errors.push(`Header image: ${result.error}`);
        }
      }
    }

    // Save item images
    for (const { itemId, image } of itemImages) {
      if (image.storagePath && (!image.id || image.id.startsWith('temp_'))) {
        // If the ID has temp_edit_ prefix, extract the original ID
        const imageToSave = { ...image };
        if (image.id?.startsWith('temp_edit_')) {
          imageToSave.id = image.id.replace('temp_edit_', '');
        }
        const result = await saveImageMetadataAfterGRN(
          grnId,
          imageToSave,
          'item',
          itemId
        );

        if (!result.success) {
          errors.push(`Item ${itemId} image: ${result.error}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  } catch (error) {
    console.error('[ImageService] Save pending metadata exception:', error);
    return {
      success: false,
      errors: [
        error instanceof Error
          ? error.message
          : 'Failed to save pending metadata',
      ],
    };
  }
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
        console.error(`[ImageService] Failed to get file size:`, sizeError);
        return { success: false, error: 'Failed to read image file' };
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
      console.error(
        `[ImageService] Registration failed for deferred ${imageType} image:`,
        regError
      );
      return { success: false, error: regError.message };
    }

    if (!regResult?.success) {
      console.error(
        `[ImageService] Registration rejected for deferred ${imageType} image:`,
        regResult?.error
      );
      return {
        success: false,
        error: regResult?.error || 'Registration failed',
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
        console.error(
          `[ImageService] Storage upload failed for deferred ${imageType} image:`,
          uploadError
        );
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
        console.error(
          `[ImageService] Confirmation failed for deferred ${imageType} image:`,
          confirmError
        );
        throw confirmError;
      }

      if (!confirmResult?.success) {
        console.error(
          `[ImageService] Confirmation rejected for deferred ${imageType} image:`,
          confirmResult?.error
        );
        throw new Error(confirmResult?.error || 'Confirmation failed');
      }

      return { success: true };
    } catch (uploadOrConfirmError) {
      // Rollback: Cancel the pending DB record and try to remove from storage
      console.error(
        `[ImageService] Upload/confirm failed for deferred ${imageType} image, rolling back:`,
        uploadOrConfirmError
      );

      try {
        await supabase.rpc('cancel_grn_image_upload', { p_image_id: imageId });
      } catch (cancelError) {
        console.warn(
          `[ImageService] Failed to cancel pending record for deferred ${imageType} image:`,
          cancelError
        );
      }

      try {
        await supabase.storage.from('grn-images').remove([storagePath]);
      } catch (removeError) {
        console.warn(
          `[ImageService] Failed to remove partial upload for deferred ${imageType} image:`,
          removeError
        );
      }

      return {
        success: false,
        error:
          uploadOrConfirmError instanceof Error
            ? uploadOrConfirmError.message
            : 'Upload failed',
      };
    }
  } catch (err) {
    console.error(
      `[ImageService] Error uploading deferred ${imageType} image:`,
      err
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Upload deferred images after GRN creation
 * This handles images that were selected with a temp GRN ID and need to be uploaded with the real GRN ID
 * Uses parallel uploads for better performance
 */
export const uploadDeferredImages = async (
  realGrnId: string,
  headerImages: GRNImageData[],
  items: Array<{ grn_trl_id: string; trl_images?: GRNImageData[] }>,
  itemMapping?: Array<{ index: number; item_id: string; item_name: string }>
): Promise<{ success: boolean; uploadedCount: number; errors: string[] }> => {
  const errors: string[] = [];
  let uploadedCount = 0;

  // Filter to only deferred images (have local file:// imageUrl but no storagePath)
  // Also exclude images that already have a valid database ID (not temp_*) as they're already uploaded
  const deferredHeaderImages = headerImages.filter(img => {
    const hasLocalUrl = img.imageUrl && img.imageUrl.startsWith('file://');
    const hasNoStoragePath = !img.storagePath;
    const isNotAlreadyUploaded = !img.id || img.id.startsWith('temp_');

    // Skip if image already has a real database ID (was already uploaded)
    if (img.id && !img.id.startsWith('temp_')) {
      return false;
    }

    return hasLocalUrl && hasNoStoragePath;
  });
  const deferredItemImages: Array<{ image: GRNImageData; itemId: string }> = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    // Same logic as header images - exclude already-uploaded images
    const itemImages = (item.trl_images || []).filter(img => {
      const hasLocalUrl = img.imageUrl && img.imageUrl.startsWith('file://');
      const hasNoStoragePath = !img.storagePath;

      // Skip if image already has a real database ID
      if (img.id && !img.id.startsWith('temp_')) {
        return false;
      }

      return hasLocalUrl && hasNoStoragePath;
    });

    // Get the real item ID from the mapping if available
    let realItemId = item.grn_trl_id;
    if (itemMapping && itemMapping[itemIndex]) {
      realItemId = itemMapping[itemIndex].item_id;
    }

    for (const image of itemImages) {
      deferredItemImages.push({ image, itemId: realItemId });
    }
  }

  const totalImages = deferredHeaderImages.length + deferredItemImages.length;

  if (totalImages === 0) {
    return { success: true, uploadedCount: 0, errors: [] };
  }

  try {
    const supabase = await getAuthenticatedClient();

    // Upload all images in parallel for better performance
    const uploadPromises: Promise<{
      success: boolean;
      error?: string;
      type: string;
    }>[] = [];

    // Add header image uploads
    for (const image of deferredHeaderImages) {
      uploadPromises.push(
        uploadSingleDeferredImage(supabase, realGrnId, image, 'header').then(
          result => ({ ...result, type: `header:${image.fileName}` })
        )
      );
    }

    // Add item image uploads
    for (const { image, itemId } of deferredItemImages) {
      uploadPromises.push(
        uploadSingleDeferredImage(
          supabase,
          realGrnId,
          image,
          'item',
          itemId
        ).then(result => ({ ...result, type: `item:${image.fileName}` }))
      );
    }

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    // Count successes and collect errors
    for (const result of results) {
      if (result.success) {
        uploadedCount++;
      } else if (result.error) {
        errors.push(`${result.type}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      uploadedCount,
      errors,
    };
  } catch (error) {
    console.error('[ImageService] uploadDeferredImages exception:', error);
    return {
      success: false,
      uploadedCount,
      errors: [
        error instanceof Error
          ? error.message
          : 'Failed to upload deferred images',
      ],
    };
  }
};

// Note: imageToBase64 helper is defined at the top of this file
