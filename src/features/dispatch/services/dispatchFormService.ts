/**
 * Dispatch Form Service
 * Handles API calls for dispatch form operations
 * Follows GRN form service patterns adapted for dispatch requirements
 *
 * Logging rule: identifiers, codes and counts only. Headers, payloads, RPC
 * data, items and error messages never reach the console.
 */

import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';
import { createLogger } from '@/utils/logger';
import type {
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
  CreateDispatchPayload,
  DispatchApiResponse,
  StockCheckResponse,
} from '@/types/dispatch.types';
import { uploadDeferredDispatchImages } from './dispatchImageService';

const log = createLogger('dispatch');

/** Only the PostgREST/Postgres code of an RPC error is loggable. */
const errorCode = (error: { code?: string | null } | null | undefined) =>
  typeof error?.code === 'string' ? error.code : undefined;

// ============================================================================
// CHECK DISPATCH EXISTS
// ============================================================================

/**
 * Result from checkDispatchExists - includes full dispatch data to avoid second RPC call
 */
export interface CheckDispatchExistsResult {
  exists: boolean;
  dispatchId?: string;
  // Full dispatch data (when exists=true) - can be used to pre-populate form
  dispatchData?: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
  };
}

/**
 * Check if a dispatch number already exists in the database
 * Uses optimized check_dispatch_exists RPC (3-25ms vs 500-730ms direct query)
 * Returns full dispatch data to avoid redundant get_dispatch_details call
 */
export const checkDispatchExists = async (
  dispNo: string
): Promise<CheckDispatchExistsResult> => {
  try {
    if (!dispNo || dispNo.length < 5) {
      return { exists: false };
    }

    log.debug('Checking whether a dispatch number exists', { dispNo });

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('check_dispatch_exists', {
      p_disp_no: dispNo.toUpperCase(),
    });

    if (error) {
      log.error('check_dispatch_exists failed', { code: errorCode(error) });
      return { exists: false };
    }

    if (!data || !data.exists || !data.dispatch) {
      log.debug('Dispatch number not found', { dispNo });
      return { exists: false };
    }

    const dispatch = data.dispatch;
    log.debug('Dispatch number found', { dispNo, dispatchId: dispatch.id });

    // Transform to DispatchHeaderData format
    const header: DispatchHeaderData = {
      disp_no: dispatch.disp_no,
      disp_date: dispatch.disp_date,
      registration: dispatch.registration || '',
      customer_id: dispatch.customer_id,
      customer_name: dispatch.customer_name,
      supervisor_id: dispatch.supervisor_id || '',
      supervisor_name: dispatch.supervisor_name || '',
      note: dispatch.note || '',
      source_order_id: dispatch.source_order_id || undefined,
      source_order_no: dispatch.source_order_no || undefined,
    };

    // Transform items to DispatchItemData format
    const items: DispatchItemData[] = (dispatch.items || []).map((item: any) => ({
      unique_id: item.id,
      grns_id: item.gr_id,
      grns_gr_no: item.gr_no,
      grns_date: item.grn_date,
      grns_customer_name: dispatch.customer_name,
      grnItems_id: item.gr_trl_id,
      grnItems_item_id: item.item_id,
      grnItems_item_name: item.item_name,
      grnItems_quantity: item.grn_qty,
      grnItems_stock: item.available_qty,
      grnItems_package_mark: item.packaging || '',
      grnItems_rack: item.rack || '',
      grnItems_weight: item.weight || 0,
      disp_quantity: item.disp_qty,
      original_disp_quantity: item.disp_qty,
    }));

    return {
      exists: true,
      dispatchId: dispatch.id,
      dispatchData: { header, items },
    };
  } catch {
    log.error('Dispatch existence check failed', { dispNo });
    return { exists: false };
  }
};

// ============================================================================
// GET NEXT DISPATCH NUMBER
// ============================================================================

/**
 * Generate next dispatch number using optimized RPC
 * RPC handles all logic server-side for better performance
 */
export const getNextDispatchNumber = async (): Promise<string> => {
  try {
    log.debug('Requesting next dispatch number');

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_next_dispatch_number');

    if (error) {
      log.error('get_next_dispatch_number failed', { code: errorCode(error) });
      throw new Error(error.message || 'Failed to get next dispatch number');
    }

    if (!data) {
      log.warn('get_next_dispatch_number returned no data; using fallback D0001');
      return 'D0001';
    }

    log.debug('Next dispatch number received');
    return data;
  } catch (error) {
    log.error('Next dispatch number request failed');
    throw error;
  }
};

// ============================================================================
// CHECK AVAILABLE STOCK
// ============================================================================

/**
 * Check available stock for a GRN item (lot)
 * Uses get_available_stock RPC function
 */
// M3 Fix: Using executeRPC wrapper
export const getAvailableStock = async (grTrlId: string): Promise<StockCheckResponse> => {
  log.debug('Checking available stock', { grTrlId });

  const result = await executeRPC<StockCheckResponse>(
    getAuthenticatedClient,
    'get_available_stock',
    { p_gr_trl_id: grTrlId },
    {
      context: 'DispatchFormService.getAvailableStock',
      errorMessage: 'Failed to check available stock',
      unwrapNested: false,
      validateSuccess: false,
    }
  );

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to check available stock');
  }

  log.debug('Available stock received', { grTrlId });
  return result.data;
};

// ============================================================================
// CREATE DISPATCH
// ============================================================================

/**
 * Create new dispatch using create_dispatch_with_stock_check RPC
 * Includes automatic stock validation and deduction
 * Also handles deferred image uploads after dispatch creation
 */
export const createDispatch = async (payload: {
  header: DispatchHeaderData;
  items: DispatchItemData[];
  images?: DispatchImageData[];
}): Promise<DispatchApiResponse> => {
  let finishMutation: (() => void) | undefined;
  try {
    finishMutation = beginOperatorMutation();
    log.info('Creating dispatch', {
      itemCount: payload.items.length,
      imageCount: payload.images?.length || 0,
    });

    const authenticatedClient = await getAuthenticatedClient();

    // Transform data to match RPC function format
    const rpcBody = {
      p_dispatch_data: {
        disp_no: payload.header.disp_no,
        disp_date: payload.header.disp_date, // ISO timestamp
        registration: payload.header.registration.toUpperCase(), // Ensure uppercase
        customer_id: payload.header.customer_id,
        customer_name: payload.header.customer_name,
        supervisor_id: payload.header.supervisor_id,
        supervisor_name: payload.header.supervisor_name,
        note: payload.header.note || '',
        source_order_id: payload.header.source_order_id || null,
        source_order_no: payload.header.source_order_no || null,
      },
      p_dispatch_items: payload.items.map((item) => ({
        gr_trl_id: item.grnItems_id, // The lot ID
        disp_qty: item.disp_quantity,
      })),
      p_generate_invoice: true, // Auto-generate invoice
      p_retry_count: 0, // Required to disambiguate function overload
    };
    const rpcPayload: CreateDispatchPayload = {
      ...rpcBody,
      p_idempotency_key: await submissionIdempotencyKey('dispatch', rpcBody),
    };

    log.debug('Calling create_dispatch_with_stock_check');

    const { data, error } = await authenticatedClient.rpc(
      'create_dispatch_with_stock_check',
      rpcPayload
    );

    if (error) {
      log.error('create_dispatch_with_stock_check failed', { code: errorCode(error) });
      throw new Error(error.message || 'Failed to create dispatch');
    }

    // Check if RPC returned success: false (business logic error, not Postgres error)
    if (data && data.success === false) {
      log.error('create_dispatch_with_stock_check returned failure');
      throw new Error(data.error || data.message || 'Failed to create dispatch');
    }

    log.info('Dispatch created', { dispatchId: data?.dispatch_id });

    // Upload deferred images if any
    if (payload.images && payload.images.length > 0 && data.dispatch_id) {
      log.debug('Uploading deferred dispatch images', { imageCount: payload.images.length });

      const imageUploadResult = await uploadDeferredDispatchImages(
        data.dispatch_id,
        payload.images
      );

      if (!imageUploadResult.success) {
        log.warn('Some deferred dispatch images failed to upload', {
          uploadedCount: imageUploadResult.uploadedCount,
        });
        // Don't fail the dispatch creation, just log the warning
      } else {
        log.info('Deferred dispatch images uploaded', { uploadedCount: imageUploadResult.uploadedCount });
      }
    }

    return {
      success: true,
      dispatch_id: data.dispatch_id,
      dispatch_items: data.dispatch_items,
      message: data.message || 'Dispatch created successfully',
      invoice_data: data.invoice_data,
      source_order_cleared: data.source_order_cleared || false,
      source_order_id: data.source_order_id,
    };
  } catch (error: any) {
    log.error('Dispatch creation failed');

    // Parse error message for user-friendly display
    let errorMessage = 'Failed to create dispatch';

    if (error.message) {
      // Check for common error patterns
      if (error.message.includes('insufficient stock')) {
        errorMessage = 'Insufficient stock for one or more items';
      } else if (error.message.includes('back-dated')) {
        errorMessage = 'Cannot create dispatch before GRN date';
      } else if (error.message.includes('duplicate')) {
        errorMessage = 'Duplicate dispatch detected';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
      message: errorMessage,
    };
  } finally {
    finishMutation?.();
  }
};

// ============================================================================
// UPDATE DISPATCH
// ============================================================================

/**
 * Update existing dispatch using update_dispatch_smart RPC
 * Handles stock restoration and recalculation
 */
export const updateDispatch = async (
  dispatchId: string,
  payload: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
  }
): Promise<DispatchApiResponse> => {
  try {
    log.info('Updating dispatch', { dispatchId, itemCount: payload.items.length });

    const authenticatedClient = await getAuthenticatedClient();

    // Transform data to match RPC function format
    const rpcPayload = {
      p_dispatch_id: dispatchId,
      p_dispatch_data: {
        disp_no: payload.header.disp_no,
        disp_date: payload.header.disp_date,
        registration: payload.header.registration.toUpperCase(),
        customer_id: payload.header.customer_id,
        customer_name: payload.header.customer_name,
        supervisor_id: payload.header.supervisor_id,
        supervisor_name: payload.header.supervisor_name,
        note: payload.header.note || '',
      },
      p_dispatch_items: payload.items.map((item) => ({
        gr_trl_id: item.grnItems_id,
        disp_qty: item.disp_quantity,
      })),
    };

    log.debug('Calling update_dispatch_smart', { dispatchId });

    const { data, error } = await authenticatedClient.rpc('update_dispatch_smart', rpcPayload);

    if (error) {
      log.error('update_dispatch_smart failed', { dispatchId, code: errorCode(error) });
      throw new Error(error.message || 'Failed to update dispatch');
    }

    if (data && data.success === false) {
      log.error('update_dispatch_smart returned failure', { dispatchId });
      throw new Error(data.error || data.message || 'Failed to update dispatch');
    }

    log.info('Dispatch updated', { dispatchId });

    return {
      success: true,
      dispatch_id: data?.dispatch_id ?? dispatchId,
      message: data?.message || 'Dispatch updated successfully',
    };
  } catch (error: any) {
    log.error('Dispatch update failed', { dispatchId });
    return {
      success: false,
      error: error.message || 'Failed to update dispatch',
      message: error.message || 'Failed to update dispatch',
    };
  }
};

// ============================================================================
// LOAD DISPATCH DATA (for editing)
// ============================================================================

/**
 * Load dispatch data for editing using get_dispatch_details RPC
 * Returns comprehensive dispatch details with full customer, supervisor, and item information
 */
export const loadDispatchData = async (
  dispatchId: string
): Promise<{
  success: boolean;
  data?: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
  };
  error?: string;
}> => {
  try {
    log.info('Loading dispatch', { dispatchId });

    const authenticatedClient = await getAuthenticatedClient();

    // Use get_dispatch_details RPC for comprehensive data
    const { data: rpcData, error: rpcError } = await authenticatedClient.rpc(
      'get_dispatch_details',
      {
        p_dispatch_id: dispatchId,
      }
    );

    if (rpcError) {
      log.error('get_dispatch_details failed', { dispatchId, code: errorCode(rpcError) });
      throw new Error(rpcError.message || 'Failed to load dispatch data');
    }

    if (!rpcData || !rpcData.success || !rpcData.data) {
      log.warn('get_dispatch_details returned no dispatch', { dispatchId });
      throw new Error(rpcData?.message || 'Dispatch not found or access denied');
    }

    const dispatch = rpcData.data.dispatch;

    // Transform to DispatchHeaderData - backend returns snake_case
    const header: DispatchHeaderData = {
      disp_no: dispatch.disp_no || '',
      disp_date: dispatch.disp_date || '',
      registration: dispatch.registration || '',
      customer_id: dispatch.customer_details?.id || dispatch.customer_id || '',
      customer_name: dispatch.customer_details?.name || dispatch.customer_name || '',
      supervisor_id: dispatch.supervisor_details?.id || dispatch.supervisor_id || '',
      supervisor_name: dispatch.supervisor_details?.name || dispatch.supervisor_name || '',
      note: dispatch.note || '',
      source_order_id: dispatch.source_order_id || undefined,
      source_order_no: dispatch.source_order_no || undefined,
    };

    // Transform to DispatchItemData[] - backend returns snake_case
    const items: DispatchItemData[] = (dispatch.items || [])
      .filter((item: any) => {
        if (!item.grn_details || !item.grn_item_details) {
          // Only the line identifier: the item carries customer and GRN data.
          log.warn('Skipping dispatch item with missing GRN details', {
            dispatchId,
            itemId: typeof item?.id === 'string' ? item.id : undefined,
          });
          return false;
        }
        return true;
      })
      .map((item: any) => {
        return {
          unique_id: item.id,
          grns_id: item.grn_details?.id || '',
          grns_gr_no: item.grn_details?.gr_no || '',
          grns_date: item.grn_details?.date || '',
          grns_customer_name: item.grn_details?.customer_name || '',
          grnItems_id: item.grn_item_id || '',
          grnItems_item_id: item.item_details?.id || '',
          grnItems_item_name: item.grn_item_details?.item_name || '',
          grnItems_quantity: item.grn_item_details?.qty || 0,
          grnItems_stock: item.grn_item_details?.stock || 0,
          grnItems_package_mark: item.grn_item_details?.package_mark || '',
          grnItems_rack: item.grn_item_details?.rack || '',
          grnItems_weight: item.grn_item_details?.weight || 0,
          disp_quantity: item.disp_qty || 0,
          original_disp_quantity: item.disp_qty || 0,
        };
      });

    log.info('Dispatch loaded', { dispatchId, itemCount: items.length });

    return {
      success: true,
      data: { header, items },
    };
  } catch (error: any) {
    log.error('Dispatch load failed', { dispatchId });
    return {
      success: false,
      error: error.message || 'Failed to load dispatch data',
    };
  }
};

// ============================================================================
// DELETE DISPATCH
// ============================================================================

/**
 * Delete dispatch using delete_dispatch_with_order_cleanup RPC
 * Handles stock restoration and order cleanup
 */
// M3 Fix: Using executeRPC wrapper
export const deleteDispatch = async (
  dispatchId: string,
  userId: string
): Promise<DispatchApiResponse> => {
  log.info('Deleting dispatch', { dispatchId });

  const result = await executeRPC<{ message?: string; order_restored?: boolean; restored_order_id?: string }>(
    getAuthenticatedClient,
    'delete_dispatch_with_order_cleanup',
    {
      p_dispatch_id: dispatchId,
      p_user_id: userId,
    },
    {
      context: 'DispatchFormService.deleteDispatch',
      errorMessage: 'Failed to delete dispatch',
      unwrapNested: false,
      validateSuccess: false,
    }
  );

  if (!result.success) {
    log.error('delete_dispatch_with_order_cleanup failed', { dispatchId });
    return {
      ...createErrorResponse(result.error, 'Failed to delete dispatch'),
    };
  }

  log.info('Dispatch deleted', {
    dispatchId,
    orderRestored: result.data?.order_restored || false,
    restoredOrderId: result.data?.restored_order_id,
  });

  return {
    success: true,
    message: result.data?.message || 'Dispatch deleted successfully',
  };
};
