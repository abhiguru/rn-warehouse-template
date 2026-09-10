import { getAuthenticatedClient } from '@/config/supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeRPC } from '@/utils/serviceErrorHandler';
// Import canonical types (snake_case) - fully migrated
import type {
  RpcImageInfo,
  RpcGrnItemFull,
  RpcGrnDetails,
  RpcGrnStatistics,
  RpcGrnInvoicesSummary,
  RpcGrnDispatchesSummary,
  RpcCustomerDetails,
  RpcSupervisorDetails,
  RpcSenderDetails,
  RpcItemDetails,
  RpcUserDetails,
} from '@/types/rpc-canonical.types';

// Re-export canonical types for consumers
export type {
  RpcGrnDetails,
  RpcGrnItemFull,
  RpcGrnStatistics,
  RpcGrnInvoicesSummary,
  RpcGrnDispatchesSummary,
  RpcCustomerDetails,
  RpcSupervisorDetails,
  RpcSenderDetails,
  RpcImageInfo,
  RpcItemDetails,
  RpcUserDetails,
};

// Extended GRN item with processed images (signed URLs)
export interface GrnItemWithImages extends RpcGrnItemFull {
  processed_images?: ProcessedImage[];
}

// Processed image with signed URL
export interface ProcessedImage {
  id: string;
  image_url: string;  // Signed URL
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  is_header_image: boolean;
  item_id?: string;
}

// Dispatch record from get_grn_item_dispatches
export interface DispatchRecord {
  id: string;
  dispatch_id: string;
  disp_no: string;
  disp_quantity: number;
  disp_date: string;
  customer_name: string;
  registration: string;
  supervisor_name: string;
  note?: string;
}

// Summary from get_grn_item_dispatches
export interface ItemDispatchDetailSummary {
  total_dispatches: number;
  total_dispatched_qty: number;
  remaining_stock: number;
}

// Response types
export interface GRNItemDispatchesResponse {
  success: boolean;
  data?: {
    dispatches: DispatchRecord[];
    summary: ItemDispatchDetailSummary;
  };
  message: string;
  error?: string;
}

export interface GRNDetailsResponse {
  success: boolean;
  data?: {
    grn: RpcGrnDetails;
  };
  message: string;
  error?: string;
}

// Helper function to generate signed URL from storage path
const generateSignedUrl = async (storagePath: string): Promise<string | null> => {
  try {
    if (!storagePath) return null;

    // Use authenticated client for storage access (required by bucket RLS policies)
    const authenticatedClient = await getAuthenticatedClient();
    if (__DEV__) console.log('[GRNDetailService] Creating signed URL for path:', storagePath);

    const { data, error } = await authenticatedClient.storage
      .from('grn-images')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
      // Log as warning instead of error - this is expected for missing files
      console.warn('[GRNDetailService] Signed URL error:', storagePath, error.message);
      return null; // Return null for missing images
    }

    if (__DEV__) {
      console.log('[GRNDetailService] Signed URL created successfully:', {
        path: storagePath,
        urlPreview: data.signedUrl?.substring(0, 80) + '...',
      });
    }

    return data.signedUrl;
  } catch (error) {
    console.warn('[GRNDetailService] Could not create signed URL for:', storagePath, error);
    return null; // Return null for errors
  }
};

// Helper function to process images and generate signed URLs
const processImages = async (images: RpcImageInfo[], isHeader: boolean = false): Promise<ProcessedImage[]> => {
  if (!images || images.length === 0) return [];

  if (__DEV__) {
    console.log('[GRNDetailService] Processing images summary:', images.map(img => ({
      id: img.id,
      storage_path: img.storage_path,
    })));
  }

  const processedImagesPromises = images.map(async (img) => {
    const pathForSigning = img.storage_path;
    if (!pathForSigning) return null;
    const signedUrl = await generateSignedUrl(pathForSigning);

    // Skip images where signed URL generation failed (file doesn't exist)
    if (!signedUrl) {
      return null;
    }

    const processedImage: ProcessedImage = {
      id: img.id,
      image_url: signedUrl,
      file_name: img.original_filename || 'image.jpg',
      file_size: img.file_size || 0,
      mime_type: img.mime_type || 'image/jpeg',
      uploaded_at: img.created_at || new Date().toISOString(),
      is_header_image: isHeader,
      item_id: undefined,
    };
    return processedImage;
  });

  const processedImages = await Promise.all(processedImagesPromises);

  // Filter out null values (images that failed to load)
  return processedImages.filter((img): img is ProcessedImage => img !== null);
};

// Extended GRN details type for background processing (adds mutable images array)
interface GrnDetailsWithProcessedImages extends RpcGrnDetails {
  items: Array<RpcGrnItemFull & { processed_images?: ProcessedImage[] }>;
  processed_header_images?: ProcessedImage[];
}

// Background image processing - fires and forgets
const processImagesInBackground = async (
  grnId: string,
  grnData: GrnDetailsWithProcessedImages,
  headerImages: RpcImageInfo[]
): Promise<void> => {
  const startTime = Date.now();
  if (__DEV__) console.log('[GRNDetailService] Starting background image processing...');

  try {
    // Create all image processing promises at once
    const allPromises: Promise<void>[] = [];

    // Header images promise
    if (headerImages.length > 0) {
      allPromises.push(
        processImages(headerImages, true).then(processed => {
          grnData.processed_header_images = processed;
        })
      );
    }

    // Item images promises - all in parallel
    if (grnData.items) {
      for (const item of grnData.items) {
        const itemImages = item.item_images || [];
        if (itemImages.length > 0) {
          allPromises.push(
            processImages(itemImages, false).then(processed => {
              item.processed_images = processed;
            })
          );
        }
      }
    }

    // Wait for ALL images to process in parallel
    await Promise.all(allPromises);
    if (__DEV__) console.log('[GRNDetailService] Background images processed:', Date.now() - startTime, 'ms');

    // Cache the updated GRN data with signed URLs to AsyncStorage
    const cacheKey = `grn_detail_${grnId}`;
    await AsyncStorage.setItem(cacheKey, JSON.stringify(grnData));
    if (__DEV__) console.log('[GRNDetailService] Cached GRN with processed images to AsyncStorage');
  } catch (error) {
    console.warn('[GRNDetailService] Background image processing error:', error);
  }

  const totalTime = Date.now() - startTime;
  if (__DEV__) console.log('[GRNDetailService] Background processing total time:', totalTime, 'ms');
};

export const getGRNDetails = async (grnId: string): Promise<GRNDetailsResponse> => {
  const startTime = Date.now();
  try {
    if (__DEV__) {
      console.log('[GRNDetailService] ====== FETCHING GRN DETAILS ======');
      console.log('[GRNDetailService] GRN ID:', grnId);
    }

    if (!grnId) {
      return {
        success: false,
        message: 'GRN ID is required',
        error: 'Missing parameter'
      };
    }

    // Get authenticated client with JWT tokens
    const authStartTime = Date.now();
    const authenticatedClient = await getAuthenticatedClient();
    if (__DEV__) console.log('[GRNDetailService] Auth client ready:', Date.now() - authStartTime, 'ms');

    const rpcStartTime = Date.now();
    const { data, error } = await authenticatedClient.rpc('get_grn_details', {
      p_grn_id: grnId
    });
    if (__DEV__) console.log('[GRNDetailService] RPC get_grn_details:', Date.now() - rpcStartTime, 'ms');

    if (error) {
      console.error('[GRNDetailService] Failed to fetch GRN details:', error.message);
      return {
        success: false,
        message: 'Failed to fetch GRN details',
        error: error.message
      };
    }

    // Handle nested response structure if needed
    const responseData = data?.data || data;

    if (__DEV__) {
      console.log('[GRNDetailService] Raw response structure:', {
        hasGrn: !!responseData?.grn,
        headerImagesCount: responseData?.grn?.header_images?.length || 0,
        itemsCount: responseData?.grn?.items?.length || 0,
        firstItemImages: responseData?.grn?.items?.[0]?.item_images?.length || 0,
        statistics: responseData?.grn?.statistics,
      });
    }

    if (!responseData || !responseData.grn) {
      console.log('[GRNDetailService] No GRN found in response');
      return {
        success: false,
        message: 'No GRN found',
        error: 'GRN not found or access denied'
      };
    }

    // Get header images (snake_case from backend)
    const headerImages: RpcImageInfo[] = responseData.grn.header_images || [];

    // Count total images
    let totalItemImages = 0;
    if (responseData.grn.items) {
      responseData.grn.items.forEach((item: RpcGrnItemFull) => {
        const itemImages = item.item_images || [];
        totalItemImages += itemImages.length;
      });
    }
    const totalImages = headerImages.length + totalItemImages;

    // Initialize empty images arrays immediately for UI
    if (responseData.grn.items) {
      responseData.grn.items.forEach((item: RpcGrnItemFull & { processed_images?: ProcessedImage[] }) => {
        item.processed_images = [];
      });
    }

    const totalTime = Date.now() - startTime;
    if (__DEV__) {
      console.log('[GRNDetailService] ====== TOTAL TIME (without images):', totalTime, 'ms ======');
      console.log('[GRNDetailService] Returning data immediately. Will process', totalImages, 'images in background...');
    }

    // Fire-and-forget background image processing
    if (totalImages > 0) {
      processImagesInBackground(grnId, responseData.grn, headerImages).catch(err => {
        console.warn('[GRNDetailService] Background image processing failed:', err);
      });
    }

    return {
      success: true,
      data: responseData,
      message: 'GRN details fetched successfully'
    };
  } catch (error) {
    console.error('[GRNDetailService] Exception:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// M3 Fix: Using executeRPC wrapper
export const getGRNItemDispatches = async (grnItemId: string): Promise<GRNItemDispatchesResponse> => {
  if (__DEV__) console.log('[GRNDetailService] Fetching dispatches for GRN Item ID:', grnItemId);

  if (!grnItemId) {
    return {
      success: false,
      message: 'GRN Item ID is required',
      error: 'Missing parameter'
    };
  }

  interface GRNItemDispatchesData {
    dispatches: DispatchRecord[];
    summary: ItemDispatchDetailSummary;
  }

  const result = await executeRPC<GRNItemDispatchesData>(
    getAuthenticatedClient,
    'get_grn_item_dispatches',
    { p_grn_item_id: grnItemId },
    {
      context: 'GRNDetailService.getGRNItemDispatches',
      errorMessage: 'Failed to fetch GRN item dispatches',
      unwrapNested: true,
      validateSuccess: true
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error
    };
  }

  if (!result.data) {
    console.log('[GRNDetailService] No dispatch data found in response');
    return {
      success: false,
      message: 'No dispatch data found',
      error: 'Dispatch data not found'
    };
  }

  return {
    success: true,
    data: result.data,
    message: 'GRN item dispatches retrieved successfully'
  };
};

export interface DeleteGRNResponse {
  success: boolean;
  error?: string;
  message?: string;
  grn_info?: {
    gr_no: string;
    customer_name: string;
    date: string;
  };
  deleted_counts?: {
    grn_items: number;
    order_items: number;
    stock_movements: number;
    images: number;
    auto_invoice_errors: number;
  };
  deletion_type?: string;
  note?: string;
  blocking_dependencies?: {
    invoiced_dispatches?: number;
    total_dispatches?: number;
    dispatches?: number;
  };
  instructions?: string;
}

// M3 Fix: Using executeRPC wrapper
export const deleteGRN = async (grnId: string): Promise<DeleteGRNResponse> => {
  if (__DEV__) console.log('[GRNDetailService] Deleting GRN ID:', grnId);

  if (!grnId) {
    return {
      success: false,
      message: 'GRN ID is required',
      error: 'Missing parameter'
    };
  }

  const result = await executeRPC<DeleteGRNResponse>(
    getAuthenticatedClient,
    'delete_grn_safe',
    { p_grn_id: grnId },
    {
      context: 'GRNDetailService.deleteGRN',
      errorMessage: 'Failed to delete GRN',
      unwrapNested: false, // delete_grn_safe returns direct response object
      validateSuccess: false // We handle success: false case manually below
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error
    };
  }

  const responseData = result.data || {} as DeleteGRNResponse;

  // If the RPC returned success: false, treat it as an error (e.g., blocking dependencies)
  if (responseData.success === false) {
    console.log('[GRNDetailService] GRN deletion blocked:', responseData.error);
    return responseData;
  }

  if (__DEV__) console.log('[GRNDetailService] GRN deleted successfully:', responseData.message);
  return responseData;
};
