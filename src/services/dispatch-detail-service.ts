import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { isJWTSignatureError } from '@/utils/serviceErrorHandler';
import { store } from '@/store';
import { forceLogoutOnInvalidToken } from '@/store/slices/authSlice';

/**
 * Handle JWT/auth errors by forcing logout
 */
function handleAuthError(error: unknown): void {
  if (isJWTSignatureError(error)) {
    console.warn('[DispatchDetailService] Auth error detected - forcing logout');
    store.dispatch(forceLogoutOnInvalidToken('Authentication failed. Please sign in again.'));
  }
}
// Import canonical types (snake_case) - fully migrated
import type {
  RpcImageInfo,
  RpcDispatchDetails,
  RpcDispatchItemDetails,
  RpcDispatchStatistics,
  RpcDispatchGrnsSummary,
  RpcDispatchInvoicesSummary,
  RpcCustomerDetails,
  RpcSupervisorDetails,
} from '@/types/rpc-canonical.types';

// Re-export canonical types for consumers
export type {
  RpcDispatchDetails,
  RpcDispatchItemDetails,
  RpcDispatchStatistics,
  RpcDispatchGrnsSummary,
  RpcDispatchInvoicesSummary,
  RpcCustomerDetails,
  RpcSupervisorDetails,
  RpcImageInfo,
};

// Processed image with signed URL (snake_case)
export interface ProcessedDispatchImage {
  id: string;
  image_url: string;
  file_name: string;
  file_size?: number;
  mime_type?: string;
  uploaded_at?: string;
}

// Extended dispatch details with processed images
export interface DispatchDetailsWithImages extends RpcDispatchDetails {
  processed_images?: ProcessedDispatchImage[];
}

export interface DispatchDetailsResponse {
  success: boolean;
  data?: {
    dispatch: DispatchDetailsWithImages;
  };
  message: string;
  error?: string;
}

// Helper function to generate signed URL for dispatch images
const generateSignedUrl = async (storagePath: string): Promise<string | null> => {
  try {
    if (!storagePath) return null;

    const authenticatedClient = await getAuthenticatedClient();
    if (__DEV__) console.log('[DispatchDetailService] Creating signed URL for path:', storagePath);

    const { data, error } = await authenticatedClient.storage
      .from('dispatch-images')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
      console.warn('[DispatchDetailService] Signed URL error:', storagePath, error.message);
      return null;
    }

    if (__DEV__) {
      console.log('[DispatchDetailService] Signed URL created:', {
        path: storagePath,
        urlPreview: data.signedUrl?.substring(0, 80) + '...',
      });
    }

    return data.signedUrl;
  } catch (error) {
    console.warn('[DispatchDetailService] Could not create signed URL for:', storagePath, error);
    return null;
  }
};

// Helper function to process images and generate signed URLs
const processDispatchImages = async (images: RpcImageInfo[]): Promise<ProcessedDispatchImage[]> => {
  if (!images || images.length === 0) return [];

  if (__DEV__) console.log('[DispatchDetailService] Processing images:', images.length);

  const processedImagesPromises = images.map(async (img) => {
    const pathForSigning = img.storage_path;
    if (!pathForSigning) return null;
    const signedUrl = await generateSignedUrl(pathForSigning);

    if (!signedUrl) {
      return null;
    }

    const dispatchImage: ProcessedDispatchImage = {
      id: img.id,
      image_url: signedUrl,
      file_name: img.original_filename || 'image.jpg',
      file_size: img.file_size || 0,
      mime_type: img.mime_type || 'image/jpeg',
      uploaded_at: img.created_at || new Date().toISOString(),
    };
    return dispatchImage;
  });

  const processedImages = await Promise.all(processedImagesPromises);
  return processedImages.filter((img): img is ProcessedDispatchImage => img !== null);
};

export const getDispatchDetails = async (dispatchId: string): Promise<DispatchDetailsResponse> => {
  try {
    if (__DEV__) console.log('[DispatchDetailService] Fetching details for Dispatch ID:', dispatchId);
    if (!dispatchId) {
      return {
        success: false,
        message: 'Dispatch ID is required',
        error: 'Missing parameter'
      };
    }

    // Get authenticated client with JWT tokens
    const authenticatedClient = await getAuthenticatedClient();

    if (__DEV__) console.log('[DispatchDetailService] Calling RPC with p_dispatch_id:', dispatchId);
    const { data, error } = await authenticatedClient.rpc('get_dispatch_details', {
      p_dispatch_id: dispatchId
    });

    if (__DEV__) console.log('[DispatchDetailService] RPC Response:', { hasData: !!data, error });

    if (error) {
      console.error('[DispatchDetailService] RPC Error:', error);
      handleAuthError(error);
      return {
        success: false,
        message: 'Failed to fetch dispatch details',
        error: error.message
      };
    }

    // Handle nested response structure if needed
    const responseData = data?.data || data;
    if (__DEV__) {
      console.log('[DispatchDetailService] Response data structure:', {
        hasData: !!responseData,
        hasDispatch: !!responseData?.dispatch,
        dataKeys: responseData ? Object.keys(responseData) : []
      });
    }

    if (!responseData || !responseData.dispatch) {
      console.log('[DispatchDetailService] No dispatch found in response');
      return {
        success: false,
        message: 'No dispatch found',
        error: 'Dispatch not found or access denied'
      };
    }

    // Process images to generate signed URLs
    if (responseData.dispatch.images && responseData.dispatch.images.length > 0) {
      if (__DEV__) console.log('[DispatchDetailService] Processing', responseData.dispatch.images.length, 'images');
      responseData.dispatch.processed_images = await processDispatchImages(responseData.dispatch.images);
    }

    return {
      success: true,
      data: responseData,
      message: 'Dispatch details fetched successfully'
    };
  } catch (error) {
    console.error('[DispatchDetailService] Exception:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};
