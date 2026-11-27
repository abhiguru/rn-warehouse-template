import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { viaCurrentPath } from '@/config/lanTransport';
import { isJWTSignatureError } from '@/utils/serviceErrorHandler';
import { store } from '@/store';
import { forceLogoutOnInvalidToken } from '@/store/slices/authSlice';

/**
 * Handle JWT/auth errors by forcing logout
 */
function handleAuthError(error: unknown): void {
  if (isJWTSignatureError(error)) {
    console.warn('[DispatchDetailService] Auth error detected - forcing logout');
    store.dispatch(forceLogoutOnInvalidToken(t('errors.auth.authenticationFailed')));
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
import { t } from '@/i18n';
import { copyCarriesFormat3, forCustomerAccounts, readVia } from '@/features/phone-copy/readRoute';
import { readDispatchDetails } from '@/features/phone-copy/reads/dispatchDetails';
import { keepPhoto, photoFile } from '@/features/phone-copy/photoStore';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import type { DataSource } from '@/features/phone-copy/sourced';

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
  /** The photo is not on the phone and the server cannot be asked now: the screen shows a frame (WH-299). */
  needs_connection?: boolean;
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
  /** The server answered but there is no such dispatch (deleted, or not visible to the caller): not a failed load. */
  notFound?: boolean;
  /** Answered by the phone copy (WH-299); absent when the server answered. */
  source?: DataSource;
  /** Parts the copy cannot give: the screen says they need a connection (Product's PR1). */
  needsServer?: 'invoiceAmounts'[];
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

    return data.signedUrl ? viaCurrentPath(data.signedUrl) : data.signedUrl;
  } catch (error) {
    console.warn('[DispatchDetailService] Could not create signed URL for:', storagePath, error);
    return null;
  }
};

// Helper function to process images and generate signed URLs
const processDispatchImages = async (images: RpcImageInfo[], fromCopy = false): Promise<ProcessedDispatchImage[]> => {
  if (!images || images.length === 0) return [];

  if (__DEV__) console.log('[DispatchDetailService] Processing images:', images.length);

  const processedImagesPromises = images.map(async (img) => {
    const pathForSigning = img.storage_path;
    if (!pathForSigning) return null;
    // A copy-sourced page shows a photo kept on the phone first, and keeps each one it shows from a link.
    const keptKey = `dispatch-images/${pathForSigning}`;
    const kept = fromCopy ? await photoFile(keptKey) : null;
    const signedUrl = kept ?? (fromCopy && isCopyOffline() ? null : await generateSignedUrl(pathForSigning));
    if (fromCopy && signedUrl && !kept) void keepPhoto(keptKey, signedUrl);

    if (!signedUrl && !fromCopy) {
      return null;
    }

    const dispatchImage: ProcessedDispatchImage = {
      id: img.id,
      image_url: signedUrl ?? '',
      ...(signedUrl ? {} : { needs_connection: true }),
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

/** The server's own words for a dispatch that is not there or not the caller's (get_dispatch_details), whatever the app's language. */
const DISPATCH_NOT_FOUND = /dispatch not found or access denied/i;

export const getDispatchDetails = async (dispatchId: string): Promise<DispatchDetailsResponse> => {
  try {
    if (__DEV__) console.log('[DispatchDetailService] Fetching details for Dispatch ID:', dispatchId);
    if (!dispatchId) {
      return {
        success: false,
        message: t('errors.dispatch.idRequired'),
        error: t('errors.general.missingParameter')
      };
    }

    const copy = await readVia('all', forCustomerAccounts(q => readDispatchDetails(q, dispatchId)));
    if (copy) {
      const { value, source } = copy;
      if (value.kind === 'not-found') {
        return { success: false, message: t('errors.dispatch.noneFound'), error: t('errors.dispatch.notFoundOrDenied'), notFound: true, source };
      }
      const dispatch = value.dispatch as unknown as DispatchDetailsWithImages;
      if (dispatch.images?.length) dispatch.processed_images = await processDispatchImages(dispatch.images, true);
      return { success: true, data: { dispatch }, message: t('errors.dispatch.detailsFetched'), source, needsServer: copyCarriesFormat3() ? undefined : value.needsServer };
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
        message: t('errors.dispatch.fetchDetailsFailed'),
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
      // Only the server's "Dispatch not found or access denied" answer is a missing document. Its "Error retrieving
      // dispatch details: ..." answer (a SQL error, also {success:false, data:null}) and an empty answer are load errors.
      const serverMessage = String(data?.message ?? '');
      if (DISPATCH_NOT_FOUND.test(serverMessage)) {
        return {
          success: false,
          message: t('errors.dispatch.noneFound'),
          error: t('errors.dispatch.notFoundOrDenied'),
          notFound: true
        };
      }
      return {
        success: false,
        message: t('errors.dispatch.fetchDetailsFailed'),
        error: serverMessage || t('errors.dispatch.fetchDetailsFailed')
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
      message: t('errors.dispatch.detailsFetched')
    };
  } catch (error) {
    console.error('[DispatchDetailService] Exception:', error);
    return {
      success: false,
      message: t('errors.general.unexpected'),
      error: error instanceof Error ? error.message : t('errors.general.unknown')
    };
  }
};
