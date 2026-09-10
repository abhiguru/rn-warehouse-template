/**
 * Dispatch Form Service
 * Handles API calls for dispatch form operations
 * Follows GRN form service patterns adapted for dispatch requirements
 */

import * as Crypto from 'expo-crypto';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';
import type {
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
  CreateDispatchPayload,
  UpdateDispatchPayload,
  DispatchApiResponse,
  StockCheckResponse,
} from '@/types/dispatch.types';
import { uploadDeferredDispatchImages } from './dispatchImageService';

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

    console.log('[DispatchFormService] Checking if dispatch exists:', dispNo);

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('check_dispatch_exists', {
      p_disp_no: dispNo.toUpperCase(),
    });

    if (error) {
      console.error('[DispatchFormService] ❌ RPC Error:', error);
      return { exists: false };
    }

    if (!data || !data.exists || !data.dispatch) {
      console.log('[DispatchFormService] Dispatch not found:', dispNo);
      return { exists: false };
    }

    const dispatch = data.dispatch;
    console.log('[DispatchFormService] ✅ Dispatch found:', dispNo, 'ID:', dispatch.id);

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
  } catch (error) {
    console.error('[DispatchFormService] Error checking dispatch exists:', error);
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
    console.log('[DispatchFormService] 🔄 Getting next dispatch number using RPC');

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_next_dispatch_number');

    if (error) {
      console.error('[DispatchFormService] ❌ RPC Error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(error.message || 'Failed to get next dispatch number');
    }

    if (!data) {
      console.log('[DispatchFormService] ⚠️ No data returned from RPC, using fallback D0001');
      return 'D0001';
    }

    console.log('[DispatchFormService] ✅ Next dispatch number from RPC:', data);
    return data;
  } catch (error) {
    console.error('[DispatchFormService] Error getting next dispatch number:', error);
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
  console.log('[DispatchFormService] Checking available stock for gr_trl_id:', grTrlId);

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

  console.log('[DispatchFormService] Stock check result:', result.data);
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
  try {
    console.log('[DispatchFormService] Creating dispatch with payload:', {
      header: payload.header,
      itemCount: payload.items.length,
      imageCount: payload.images?.length || 0,
    });

    const authenticatedClient = await getAuthenticatedClient();

    // Transform data to match RPC function format
    const rpcPayload: CreateDispatchPayload = {
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
      p_idempotency_key: Crypto.randomUUID(),
    };

    console.log('[DispatchFormService] Calling create_dispatch_with_stock_check RPC');
    console.log('[DispatchFormService] RPC payload:', JSON.stringify(rpcPayload, null, 2));

    const { data, error } = await authenticatedClient.rpc(
      'create_dispatch_with_stock_check',
      rpcPayload
    );

    if (error) {
      console.error('[DispatchFormService] ❌ RPC Error:', error);
      throw new Error(error.message || 'Failed to create dispatch');
    }

    // Check if RPC returned success: false (business logic error, not Postgres error)
    if (data && data.success === false) {
      console.error('[DispatchFormService] ❌ RPC returned failure:', data);
      throw new Error(data.error || data.message || 'Failed to create dispatch');
    }

    console.log('[DispatchFormService] ✅ Dispatch created successfully:', data);

    // Upload deferred images if any
    if (payload.images && payload.images.length > 0 && data.dispatch_id) {
      console.log('[DispatchFormService] Uploading deferred images for dispatch:', data.dispatch_id);

      const imageUploadResult = await uploadDeferredDispatchImages(
        data.dispatch_id,
        payload.images
      );

      if (!imageUploadResult.success) {
        console.warn('[DispatchFormService] Some images failed to upload:', imageUploadResult.errors);
        // Don't fail the dispatch creation, just log the warning
      } else {
        console.log('[DispatchFormService] All images uploaded successfully:', imageUploadResult.uploadedCount);
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
    console.error('[DispatchFormService] Exception creating dispatch:', error);

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
  }
};

// ============================================================================
// UPDATE DISPATCH (Future)
// ============================================================================

/**
 * Update existing dispatch using update_dispatch_smart RPC
 * Handles stock restoration and recalculation
 * @future Not implemented in initial version
 */
export const updateDispatch = async (
  dispatchId: string,
  payload: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
  }
): Promise<DispatchApiResponse> => {
  try {
    console.log('[DispatchFormService] Updating dispatch:', dispatchId);

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

    console.log('[DispatchFormService] Calling update_dispatch_smart RPC');

    const { data, error } = await authenticatedClient.rpc('update_dispatch_smart', rpcPayload);

    if (error) {
      console.error('[DispatchFormService] ❌ RPC Error:', error);
      throw new Error(error.message || 'Failed to update dispatch');
    }

    console.log('[DispatchFormService] ✅ Dispatch updated successfully:', data);

    return {
      success: true,
      dispatch_id: data.dispatch_id,
      message: data.message || 'Dispatch updated successfully',
    };
  } catch (error: any) {
    console.error('[DispatchFormService] Exception updating dispatch:', error);
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
    console.log('[DispatchFormService] Loading dispatch data for ID:', dispatchId);

    const authenticatedClient = await getAuthenticatedClient();

    // Use get_dispatch_details RPC for comprehensive data
    const { data: rpcData, error: rpcError } = await authenticatedClient.rpc(
      'get_dispatch_details',
      {
        p_dispatch_id: dispatchId,
      }
    );

    if (rpcError) {
      console.error('[DispatchFormService] ❌ RPC Error:', rpcError);
      throw new Error(rpcError.message || 'Failed to load dispatch data');
    }

    if (!rpcData || !rpcData.success || !rpcData.data) {
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
          console.warn('[DispatchFormService] Skipping item with missing grn_details or grn_item_details:', item);
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

    console.log('[DispatchFormService] ✅ Loaded dispatch data:', {
      header,
      itemCount: items.length,
    });

    return {
      success: true,
      data: { header, items },
    };
  } catch (error: any) {
    console.error('[DispatchFormService] Exception loading dispatch data:', error);
    return {
      success: false,
      error: error.message || 'Failed to load dispatch data',
    };
  }
};

// ============================================================================
// DELETE DISPATCH (Future)
// ============================================================================

/**
 * Delete dispatch using delete_dispatch_with_order_cleanup RPC
 * Handles stock restoration and order cleanup
 * @future Not implemented in initial version
 */
// M3 Fix: Using executeRPC wrapper
export const deleteDispatch = async (
  dispatchId: string,
  userId: string
): Promise<DispatchApiResponse> => {
  console.log('[DispatchFormService] ========== DELETE DISPATCH START ==========');
  console.log('[DispatchFormService] Dispatch ID:', dispatchId);
  console.log('[DispatchFormService] User ID:', userId);
  console.log('[DispatchFormService] Calling RPC: delete_dispatch_with_order_cleanup');

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

  console.log('[DispatchFormService] RPC Result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('[DispatchFormService] ❌ Delete dispatch failed:', result.error);
    return {
      ...createErrorResponse(result.error, 'Failed to delete dispatch'),
    };
  }

  console.log('[DispatchFormService] ✅ Dispatch deleted successfully');
  console.log('[DispatchFormService] Order restored:', result.data?.order_restored || false);
  console.log('[DispatchFormService] Restored order ID:', result.data?.restored_order_id || 'N/A');
  console.log('[DispatchFormService] ========== DELETE DISPATCH END ==========');

  return {
    success: true,
    message: result.data?.message || 'Dispatch deleted successfully',
  };
};
