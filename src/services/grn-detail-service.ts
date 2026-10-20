import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { isUnsettledFailure } from '@/utils/serverText';
import { waitForServer } from '@/utils/lostAnswer';
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
import { t } from '@/i18n';
import { invalidateReportQueries } from '@/lib/queryClient';

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

// Process signed image URLs only after the current caller has successfully
// fetched the GRN. Protected detail data and signed URLs are not persisted.
const processImagesForDisplay = async (
  grnData: GrnDetailsWithProcessedImages,
  headerImages: RpcImageInfo[]
): Promise<void> => {
  const startTime = Date.now();
  if (__DEV__) console.log('[GRNDetailService] Starting image processing...');

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
    if (__DEV__) console.log('[GRNDetailService] Images processed:', Date.now() - startTime, 'ms');
  } catch (error) {
    console.warn('[GRNDetailService] Image processing error:', error);
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
        message: t('errors.grn.idRequired'),
        error: t('errors.general.missingParameter')
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
        message: t('errors.grn.fetchDetailsFailed'),
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
        message: t('errors.grn.noneFound'),
        error: t('errors.grn.notFoundOrDenied')
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

    // Finish caller-authorized image signing before returning. This avoids a
    // persistent cross-account cache of protected rows and bearer URLs.
    if (totalImages > 0) {
      await processImagesForDisplay(responseData.grn, headerImages);
    }

    return {
      success: true,
      data: responseData,
      message: t('errors.grn.detailsFetched')
    };
  } catch (error) {
    console.error('[GRNDetailService] Exception:', error);
    return {
      success: false,
      message: t('errors.general.unexpected'),
      error: error instanceof Error ? error.message : t('errors.general.unknown')
    };
  }
};

// M3 Fix: Using executeRPC wrapper
export const getGRNItemDispatches = async (grnItemId: string): Promise<GRNItemDispatchesResponse> => {
  if (__DEV__) console.log('[GRNDetailService] Fetching dispatches for GRN Item ID:', grnItemId);

  if (!grnItemId) {
    return {
      success: false,
      message: t('errors.grn.itemIdRequired'),
      error: t('errors.general.missingParameter')
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
      errorMessage: t('errors.grn.fetchItemDispatchesFailed'),
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
      message: t('errors.grn.noDispatchData'),
      error: t('errors.grn.dispatchDataNotFound')
    };
  }

  return {
    success: true,
    data: result.data,
    message: t('errors.grn.itemDispatchesRetrieved')
  };
};

export interface DeleteGRNResponse {
  success: boolean;
  error?: string;
  message?: string;
  /**
   * The request went out and got no answer (the connection dropped, the 60 s timeout): the GRN may be deleted
   * all the same. The screen locks, waits (`settleLostDelete`) and reads the GRN before it sends anything again.
   * A 57014 statement timeout is an answer: nothing was deleted. On a RESEND (`options.resend`) it is also set for any
   * other failure that is not the server's answer (57014 while the resend waits behind the first delete, a failure
   * before sending, a changed session): that attempt is not settled, so the screen goes back to the check.
   */
  lostAnswer?: boolean;
  /**
   * A resend was answered "GRN not found": the GRN is gone, which is what was asked for (the delete whose answer was
   * lost went through, or someone else deleted it). Returned as a success; the counts are not known.
   */
  alreadyGone?: boolean;
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
export const deleteGRN = async (grnId: string, options: { resend?: boolean } = {}): Promise<DeleteGRNResponse> => {
  if (__DEV__) console.log('[GRNDetailService] Deleting GRN ID:', grnId);

  if (!grnId) {
    return {
      success: false,
      message: t('errors.grn.idRequired'),
      error: t('errors.general.missingParameter')
    };
  }

  const result = await executeRPC<DeleteGRNResponse>(
    getAuthenticatedClient,
    'delete_grn_safe',
    { p_grn_id: grnId },
    {
      context: 'GRNDetailService.deleteGRN',
      write: true,
      // A timeout or a failure after the request started reads "it may have been deleted" (contract item 7).
      delete: true,
      errorMessage: t('errors.grn.deleteFailed'),
      unwrapNested: false, // delete_grn_safe returns direct response object
      validateSuccess: false // We handle success: false case manually below
    }
  );

  if (!result.success) {
    return {
      success: false,
      message: result.message,
      error: result.error,
      // A failure on the way after the request went out (executeRPC's `lostAnswer`: not one before it left, and not
      // an answer). A resend that failed without an answer of the server is not settled either (owner rule D22).
      lostAnswer: result.lostAnswer === true || (options.resend === true && isUnsettledFailure(result, result.errorCode)),
    };
  }

  const responseData = result.data || {} as DeleteGRNResponse;

  // The answer of a resend is "GRN not found": the GRN is gone, as asked. A report left open must stop listing it.
  if (options.resend && responseData.success === false && /grn not found/i.test(String(responseData.error ?? responseData.message ?? ''))) {
    void invalidateReportQueries();
    return { success: true, alreadyGone: true };
  }

  // If the RPC returned success: false, treat it as an error (e.g., blocking dependencies)
  if (responseData.success === false) {
    console.log('[GRNDetailService] GRN deletion blocked:', responseData.error);
    return responseData;
  }

  if (__DEV__) console.log('[GRNDetailService] GRN deleted successfully:', responseData.message);
  // The write changed what reports count: a report on screen asks again (SR-10).
  void invalidateReportQueries();
  return responseData;
};

/**
 * After a delete that got no answer: is the GRN still there? 'gone' when the server answers "GRN not found" (it
 * was deleted), 'exists' when it answers with the GRN, 'unknown' when it cannot be asked or answers otherwise.
 */
export const checkGRNGone = async (grnId: string): Promise<'gone' | 'exists' | 'unknown'> => {
  try {
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('get_grn_details', { p_grn_id: grnId });
    if (error) return 'unknown';
    const body = data?.data || data;
    if (body?.grn) return 'exists';
    // get_grn_details answers {success:false, message:'GRN not found or access denied'} for a GRN that is not there.
    if (data?.success === false && typeof data.message === 'string' && /grn not found/i.test(data.message)) return 'gone';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

/** Waits `ms`, or less when the signal is aborted. */
const pause = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });

/** How long the read after a lost delete waits between tries, up to the last value (owner rule D22: up to 30 s). */
const READ_BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

/**
 * After a delete whose answer was lost: waits until the phone is online and at least 10 s have passed since the
 * request was sent (`waitForServer`), then reads the GRN. 'gone': the delete had been applied. 'exists': it had
 * not, the caller sends the delete again once. A read that fails is tried again with a growing wait (up to 30 s)
 * until the server answers; 'aborted' when the signal is aborted first (the person left).
 */
export const settleLostDelete = async (
  grnId: string,
  sentAt: number,
  signal?: AbortSignal
): Promise<'gone' | 'exists' | 'aborted'> => {
  try {
    await waitForServer(sentAt, signal);
  } catch {
    if (signal?.aborted) return 'aborted';
  }
  for (let attempt = 0; !signal?.aborted; attempt++) {
    const state = await checkGRNGone(grnId);
    if (signal?.aborted) break;
    if (state === 'gone') {
      // The delete had been applied: a report left open must stop listing the GRN, as after any delete (SR-10).
      void invalidateReportQueries();
      return state;
    }
    if (state !== 'unknown') return state;
    await pause(READ_BACKOFF_MS[Math.min(attempt, READ_BACKOFF_MS.length - 1)], signal);
  }
  return 'aborted';
};

/** The stored file of each photo the details data lists, for the GRN's header and for each of its lines. */
export const photoPathsOf = (grn: { header_images?: RpcImageInfo[]; items?: Array<{ item_images?: RpcImageInfo[] }> } | null | undefined): string[] => {
  const paths = [
    ...(grn?.header_images ?? []),
    ...(grn?.items ?? []).flatMap(item => item.item_images ?? []),
  ].map(image => image.storage_path);
  return Array.from(new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0)));
};

/**
 * After a GRN was deleted: removes its photo files from storage (the server deletes the rows, not the files). A best
 * effort: a failure is only logged, the GRN is deleted whatever happens here. Never throws.
 */
export const removeGRNPhotoFiles = async (paths: string[]): Promise<void> => {
  if (paths.length === 0) return;
  try {
    const authenticatedClient = await getAuthenticatedClient();
    const { error } = await authenticatedClient.storage.from('grn-images').remove(paths);
    if (error) console.warn('[GRNDetailService] Could not remove the photo files of a deleted GRN');
  } catch {
    console.warn('[GRNDetailService] Could not remove the photo files of a deleted GRN');
  }
};
