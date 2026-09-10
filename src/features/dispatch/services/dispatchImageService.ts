/**
 * Dispatch Image Upload Service
 * Handles image upload operations for dispatch forms
 * Follows the same three-step transactional pattern as GRN images
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getAuthenticatedClient, getCurrentConfig, getSupabaseClient } from '@/config/supabaseConfig';
import type { DispatchImageData } from '@/types/dispatch.types';

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
  maxWidth: 1280,
  maxHeight: 1280,
};

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Storage bucket name
const STORAGE_BUCKET = 'dispatch-images';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert image URI to ArrayBuffer for direct Supabase Storage upload
 */
const imageToArrayBuffer = async (uri: string): Promise<{ buffer: ArrayBuffer; size: number }> => {
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

    console.log('[DispatchImageService] Image converted to ArrayBuffer:', {
      size: arrayBuffer.byteLength,
      blobType: blob.type
    });
    return { buffer: arrayBuffer, size: arrayBuffer.byteLength };
  } catch (error) {
    console.error('[DispatchImageService] Error converting image to ArrayBuffer:', error);
    throw new Error('Failed to read image file');
  }
};

/**
 * Compress image before upload to reduce file size
 */
const compressImage = async (uri: string): Promise<{ uri: string; fileSize: number }> => {
  try {
    console.log('[DispatchImageService] Compressing image:', uri);

    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: IMAGE_COMPRESSION_SETTINGS.maxWidth, height: IMAGE_COMPRESSION_SETTINGS.maxHeight } }],
      {
        compress: IMAGE_COMPRESSION_SETTINGS.compress,
        format: IMAGE_COMPRESSION_SETTINGS.format,
      }
    );

    const response = await fetch(manipulatedImage.uri);
    const blob = await response.blob();
    const fileSize = blob.size;

    console.log('[DispatchImageService] Image compressed:', {
      originalUri: uri,
      compressedUri: manipulatedImage.uri,
      fileSize: fileSize,
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2)
    });

    return {
      uri: manipulatedImage.uri,
      fileSize: fileSize
    };
  } catch (error) {
    console.error('[DispatchImageService] Error compressing image:', error);
    // Fallback to original image
    const response = await fetch(uri);
    const blob = await response.blob();
    return {
      uri: uri,
      fileSize: blob.size
    };
  }
};

/**
 * Validate image file before upload
 */
export const validateImageFile = (asset: ImagePicker.ImagePickerAsset): { valid: boolean; error?: string } => {
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit (10MB)`
    };
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (asset.mimeType && !allowedTypes.includes(asset.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `File type ${asset.mimeType} is not supported. Use JPEG, PNG, WebP, or HEIC.`
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
  try {
    console.log('[DispatchImageService] Starting upload:', {
      dispatchId,
      fileName: asset.fileName,
      fileSize: asset.fileSize
    });

    // Validate file size before compression
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size (${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit (10MB)`
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
        error: `Compressed file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) still exceeds maximum limit (10MB)`
      };
    }

    // Determine content type (always JPEG after compression)
    const contentType = 'image/jpeg';
    const fileName = asset.fileName?.replace(/\.[^/.]+$/, '.jpg') || 'image.jpg';

    // Check for temporary dispatch ID - skip RPC and defer upload
    if (dispatchId.startsWith('temp_dispatch_')) {
      console.log('[DispatchImageService] Temporary dispatch ID detected, deferring upload:', dispatchId);

      if (onProgress) {
        onProgress({ loaded: 100, total: 100, percentage: 100 });
      }

      return {
        success: true,
        imageId: undefined,
        imageUrl: compressedUri, // Use local URI for preview
        metadata: {
          file_size: fileSize,
          file_name: fileName,
          mime_type: contentType,
          uploadTimestamp: new Date().toISOString(),
          storage_path: undefined
        }
      };
    }

    // Progress: Compression done
    if (onProgress) {
      onProgress({ loaded: 25, total: 100, percentage: 25 });
    }

    const supabase = await getAuthenticatedClient();

    // === THREE-STEP TRANSACTIONAL UPLOAD ===

    // Step 1: Register the upload
    console.log('[DispatchImageService] Step 1: Registering image upload');
    const { data: regResult, error: regError } = await supabase.rpc('register_dispatch_image_upload', {
      p_dispatch_id: dispatchId,
      p_file_name: fileName,
      p_file_size: fileSize,
      p_mime_type: contentType
    });

    if (regError) {
      console.error('[DispatchImageService] Registration failed:', regError);
      return {
        success: false,
        error: regError.message || 'Failed to register image upload'
      };
    }

    if (!regResult?.success) {
      console.error('[DispatchImageService] Registration rejected:', regResult?.error);
      return {
        success: false,
        error: regResult?.error || 'Registration failed on server'
      };
    }

    const { image_id: imageId, storage_path: storagePath, upload_token: uploadToken } = regResult;
    console.log('[DispatchImageService] Registration successful:', { imageId, storagePath });

    // Progress: Registration complete
    if (onProgress) {
      onProgress({ loaded: 40, total: 100, percentage: 40 });
    }

    try {
      // Step 2: Upload to storage
      console.log('[DispatchImageService] Step 2: Uploading to storage:', storagePath);
      const startTime = Date.now();

      const { buffer: fileBuffer } = await imageToArrayBuffer(compressedUri);

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: contentType,
          upsert: false
        });

      const uploadDuration = Date.now() - startTime;
      console.log('[DispatchImageService] Storage upload duration:', `${uploadDuration}ms`);

      if (uploadError) {
        console.error('[DispatchImageService] Storage upload failed:', uploadError);
        throw uploadError;
      }

      // Progress: Upload complete
      if (onProgress) {
        onProgress({ loaded: 80, total: 100, percentage: 80 });
      }

      // Step 3: Confirm the upload
      console.log('[DispatchImageService] Step 3: Confirming upload');
      const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_dispatch_image_upload', {
        p_image_id: imageId,
        p_upload_token: uploadToken
      });

      if (confirmError) {
        console.error('[DispatchImageService] Confirmation failed:', confirmError);
        throw confirmError;
      }

      if (!confirmResult?.success) {
        console.error('[DispatchImageService] Confirmation rejected:', confirmResult?.error);
        throw new Error(confirmResult?.error || 'Confirmation failed on server');
      }

      console.log('[DispatchImageService] Upload confirmed successfully');

      // Generate signed URL for the uploaded image
      const { data: urlData, error: urlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      let finalImageUrl: string;
      if (urlError || !urlData?.signedUrl) {
        console.warn('[DispatchImageService] Could not create signed URL:', urlError);
        finalImageUrl = `${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
      } else {
        finalImageUrl = urlData.signedUrl;
      }

      // Progress: Complete
      if (onProgress) {
        onProgress({ loaded: 100, total: 100, percentage: 100 });
      }

      console.log('[DispatchImageService] ✅ Upload completed:', {
        imageId,
        storagePath,
        fileSize
      });

      return {
        success: true,
        imageId: imageId,
        imageUrl: finalImageUrl,
        metadata: {
          file_size: fileSize,
          file_name: fileName,
          mime_type: contentType,
          uploadTimestamp: new Date().toISOString(),
          storage_path: storagePath
        }
      };

    } catch (uploadOrConfirmError) {
      // Rollback: Cancel the pending DB record
      console.error('[DispatchImageService] Upload/confirm failed, rolling back:', uploadOrConfirmError);

      try {
        await supabase.rpc('cancel_dispatch_image_upload', { p_image_id: imageId });
        console.log('[DispatchImageService] Pending record cancelled');
      } catch (cancelError) {
        console.warn('[DispatchImageService] Failed to cancel pending record:', cancelError);
      }

      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        console.log('[DispatchImageService] Partial upload removed from storage');
      } catch (removeError) {
        console.warn('[DispatchImageService] Failed to remove partial upload:', removeError);
      }

      return {
        success: false,
        error: uploadOrConfirmError instanceof Error ? uploadOrConfirmError.message : 'Upload failed'
      };
    }

  } catch (error) {
    console.error('[DispatchImageService] Upload exception:', error);

    let errorMessage = 'Upload failed';
    if (error instanceof Error) {
      if (error.message.includes('Network request failed')) {
        errorMessage = 'Network connection failed. Please check your internet connection and try again.';
      } else if (error.message.includes('Failed to read image')) {
        errorMessage = 'Failed to process image file. Please try a different image.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
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
  imageUrl: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('[DispatchImageService] Deleting image:', { imageId, imageUrl });

    // Delete from database using RPC
    const { data, error: dbError } = await getSupabaseClient().rpc('delete_dispatch_image', {
      p_image_id: imageId
    });

    if (dbError) {
      console.error('[DispatchImageService] Database delete error:', dbError);
      return {
        success: false,
        error: dbError.message || 'Failed to delete image record'
      };
    }

    // Extract file path from URL and delete from storage
    const urlParts = imageUrl.split('/');
    const bucketIndex = urlParts.findIndex(part => part === STORAGE_BUCKET);
    if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
      const filePath = urlParts.slice(bucketIndex + 1).join('/');
      const supabase = await getAuthenticatedClient();

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      if (storageError) {
        console.warn('[DispatchImageService] Storage delete warning:', storageError);
        // Don't fail since database record is already deleted
      }
    }

    console.log('[DispatchImageService] Image deleted successfully');
    return { success: true };

  } catch (error) {
    console.error('[DispatchImageService] Delete exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed'
    };
  }
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
    console.log('[DispatchImageService] Uploading deferred image:', image.file_name);

    const fileName = image.file_name || 'image.jpg';
    const mimeType = image.mime_type || 'image/jpeg';

    // Step 1: Register
    const { data: regResult, error: regError } = await supabase.rpc('register_dispatch_image_upload', {
      p_dispatch_id: realDispatchId,
      p_file_name: fileName,
      p_file_size: image.file_size || 0,
      p_mime_type: mimeType
    });

    if (regError) {
      console.error('[DispatchImageService] Registration failed:', regError);
      return { success: false, error: regError.message };
    }

    if (!regResult?.success) {
      return { success: false, error: regResult?.error || 'Registration failed' };
    }

    const { image_id: imageId, storage_path: storagePath, upload_token: uploadToken } = regResult;

    try {
      // Step 2: Upload to storage
      const { buffer: fileBuffer } = await imageToArrayBuffer(image.image_url);

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Step 3: Confirm
      const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_dispatch_image_upload', {
        p_image_id: imageId,
        p_upload_token: uploadToken
      });

      if (confirmError) {
        throw confirmError;
      }

      if (!confirmResult?.success) {
        throw new Error(confirmResult?.error || 'Confirmation failed');
      }

      console.log('[DispatchImageService] ✅ Deferred image uploaded:', storagePath);
      return { success: true };

    } catch (uploadOrConfirmError) {
      // Rollback
      console.error('[DispatchImageService] Deferred upload failed, rolling back:', uploadOrConfirmError);

      try {
        await supabase.rpc('cancel_dispatch_image_upload', { p_image_id: imageId });
      } catch (cancelError) {
        console.warn('[DispatchImageService] Failed to cancel:', cancelError);
      }

      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      } catch (removeError) {
        console.warn('[DispatchImageService] Failed to remove partial upload:', removeError);
      }

      return {
        success: false,
        error: uploadOrConfirmError instanceof Error ? uploadOrConfirmError.message : 'Upload failed'
      };
    }

  } catch (err) {
    console.error('[DispatchImageService] Error uploading deferred image:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

/**
 * Upload deferred images after dispatch creation
 * Uses parallel uploads for better performance
 */
export const uploadDeferredDispatchImages = async (
  realDispatchId: string,
  images: DispatchImageData[]
): Promise<{ success: boolean; uploadedCount: number; errors: string[] }> => {
  const errors: string[] = [];
  let uploadedCount = 0;

  // Filter to only deferred images (have image_url but no storage_path)
  const deferredImages = images.filter(img => img.image_url && !img.storage_path);

  console.log('[DispatchImageService] 🚀 Uploading deferred images for dispatch:', realDispatchId);
  console.log('[DispatchImageService] Total deferred images:', deferredImages.length);

  if (deferredImages.length === 0) {
    console.log('[DispatchImageService] No deferred images to upload');
    return { success: true, uploadedCount: 0, errors: [] };
  }

  try {
    const supabase = await getAuthenticatedClient();

    // Upload all images in parallel
    const uploadPromises = deferredImages.map(image =>
      uploadSingleDeferredImage(supabase, realDispatchId, image)
        .then(result => ({ ...result, file_name: image.file_name }))
    );

    const results = await Promise.all(uploadPromises);

    for (const result of results) {
      if (result.success) {
        uploadedCount++;
      } else if (result.error) {
        errors.push(`${result.file_name}: ${result.error}`);
      }
    }

    console.log('[DispatchImageService] 📊 Deferred upload summary:', {
      totalUploaded: uploadedCount,
      totalImages: deferredImages.length,
      totalErrors: errors.length
    });

    return {
      success: errors.length === 0,
      uploadedCount,
      errors
    };
  } catch (error) {
    console.error('[DispatchImageService] uploadDeferredDispatchImages exception:', error);
    return {
      success: false,
      uploadedCount,
      errors: [error instanceof Error ? error.message : 'Failed to upload deferred images']
    };
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
      console.log('[DispatchImageService] Signed URL created successfully');
      return data.signedUrl;
    }

    console.error('[DispatchImageService] Failed to create signed URL:', error);
    return `${getCurrentConfig().url}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`;
  } catch (error) {
    console.error('[DispatchImageService] Error getting signed URL:', error);
    return filePath;
  }
};
