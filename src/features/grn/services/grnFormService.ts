import * as Crypto from 'expo-crypto';
import { getSupabaseClient, getAuthenticatedClient, getCurrentConfig } from '@/config/supabaseConfig';
import { GRNHeaderData, GRNItemData, GRNImageData } from '@/store/slices/grnFormSlice';
import { savePendingImageMetadata, uploadDeferredImages } from './imageUploadService';
// M3 Fix: Import executeRPC for potential future refactoring
// Note: Current RPC methods have custom error handling (E5 fix) or extensive debug logging
// and are not migrated to executeRPC pattern to preserve their specialized behavior
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

// Helper function to construct full image URL
// Note: This is a fallback for when signed URL generation fails
// Since grn-images bucket is private, public URLs won't work
// Return empty string to trigger error handling in the UI
const getFullImageUrl = (storagePath: string): string => {
  if (!storagePath) return '';

  // Log warning since this fallback shouldn't normally be needed
  console.warn('[grnFormService] getFullImageUrl called as fallback - signed URL generation may have failed for:', storagePath);

  // Return empty string since public URLs don't work for private buckets
  // The UI should handle missing imageUrl gracefully
  return '';
};

interface CreateGRNPayload {
  header: Omit<GRNHeaderData, 'gr_no'> & { gr_no?: string };
  items: Omit<GRNItemData, 'grn_trl_id' | 'stock'>[];
}

interface UpdateGRNPayload {
  header: Partial<GRNHeaderData> & { out_of_stock?: boolean; invoiced?: boolean };
  items: (Omit<GRNItemData, 'stock'> & {
    trl_images?: GRNImageData[];
    // Legacy field aliases for backwards compatibility
    // These should NOT be used - use grn_trl_id and item_table_id instead
    id?: string;       // Legacy alias for grn_trl_id
    item_id?: string;  // Legacy alias for item_table_id
    // Additional fields that may be passed from the form
    stock?: number;    // Current stock level
    note?: string;     // Item-level note
  })[];
}

// ============================================================================
// CHECK GRN EXISTS
// ============================================================================

/**
 * Result from checkGrnExists - includes full GRN data to avoid second RPC call
 * E5 Fix: Added error and message fields to distinguish network errors from "not found"
 */
export interface CheckGrnExistsResult {
  exists: boolean;
  grnId?: string;
  // Full GRN data (when exists=true) - can be used to pre-populate form
  grnData?: {
    header: GRNHeaderData;
    items: GRNItemData[];
  };
  // E5: Distinguish errors from "not found"
  error?: boolean;
  message?: string;
}

/**
 * Check if a GRN number already exists in the database
 * Uses optimized check_grn_exists RPC (18-31ms vs direct query with RLS overhead)
 * Returns full GRN data to avoid redundant load call
 *
 * // M3 Fix: Not migrated to executeRPC - uses custom CheckGrnExistsResult return type
 * // with E5 fix error handling that distinguishes network errors from "not found"
 */
export const checkGrnExists = async (
  grNo: string
): Promise<CheckGrnExistsResult> => {
  try {
    // Minimum 5 characters to check (prevents premature checks while typing)
    if (!grNo || grNo.length < 5) {
      return { exists: false };
    }

    console.log('[GRNFormService] Checking if GRN exists:', grNo);

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('check_grn_exists', {
      p_gr_no: grNo.toUpperCase(),
    });

    if (error) {
      console.error('[GRNFormService] ❌ RPC Error:', error);
      // E5 Fix: Return distinct error response so caller can distinguish from "not found"
      return { exists: false, error: true, message: error.message || 'Failed to check GRN' };
    }

    if (!data || !data.exists || !data.grn) {
      console.log('[GRNFormService] GRN not found:', grNo);
      return { exists: false };
    }

    const grn = data.grn;
    console.log('[GRNFormService] ✅ GRN found:', grNo, 'ID:', grn.id);

    // Transform to GRNHeaderData format
    const header: GRNHeaderData = {
      gr_no: grn.gr_no,
      registration: grn.registration || '',
      date: grn.date,
      sender_id: grn.sender_id || '',
      sender_name: grn.sender_name || '',
      customer_id: grn.customer_id,
      customer_name: grn.customer_name,
      supervisor_id: grn.supervisor_id || '',
      supervisor_name: grn.supervisor_name || '',
      note: grn.note || '',
      leon: grn.leon || false,
      pricing_mode: grn.pricing_mode || 'MONTHLY',
      gr_images: [], // Images not included in check response
    };

    // Transform items to GRNItemData format
    const items: GRNItemData[] = (grn.items || []).map((item: any) => ({
      grn_trl_id: item.id,
      item_table_id: item.item_id,
      item_name: item.item_name,
      packaging: item.packaging || '',
      qty: item.qty,
      stock: item.stock,
      weight: item.weight || 0,
      rack: item.rack || '',
      package_mark: item.package_mark || '',
      trl_images: [], // Images not included in check response
    }));

    return {
      exists: true,
      grnId: grn.id,
      grnData: { header, items },
    };
  } catch (error) {
    console.error('[GRNFormService] Error checking GRN exists:', error);
    // E5 Fix: Return distinct error response so caller can distinguish from "not found"
    return {
      exists: false,
      error: true,
      message: error instanceof Error ? error.message : 'Network error checking GRN'
    };
  }
};

// ============================================================================
// GET NEXT GRN NUMBER
// ============================================================================

// Generate next GRN number using optimized RPC
// RPC handles all logic server-side for better performance
// M3 Fix: Not migrated to executeRPC - throws errors and returns string directly,
// different pattern from standard success/error response
export const getNextGRNNumber = async (): Promise<string> => {
  try {
    console.log('[GRNFormService] 🔄 Getting next GRN number using RPC');

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_next_grn_number');

    if (error) {
      console.error('[GRNFormService] ❌ RPC Error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(error.message || 'Failed to get next GRN number');
    }

    if (!data) {
      console.log('[GRNFormService] ⚠️ No data returned from RPC, using fallback G0001');
      return 'G0001';
    }

    console.log('[GRNFormService] ✅ Next GRN number from RPC:', data);
    return data;
  } catch (error) {
    console.error('[GRNFormService] Error getting next GRN number:', error);
    throw error;
  }
};

// Create new GRN using enhanced save_grn RPC with item-level image mapping
// M3 Fix: Not migrated to executeRPC - extensive debug logging for troubleshooting
// image uploads and item mapping; complex post-RPC deferred image upload logic
export const createGRN = async (payload: CreateGRNPayload) => {
  try {
    if (__DEV__) console.log('[GRNFormService] DEBUG: Creating GRN with enhanced RPC payload:', {
      header: {
        ...payload.header,
        gr_images: payload.header.gr_images?.map(img => ({
          id: img.id,
          fileName: img.fileName,
          storagePath: img.storagePath,
          hasStoragePath: !!img.storagePath,
          hasId: !!img.id
        }))
      },
      items: payload.items.map(item => ({
        item_table_id: item.item_table_id,
        item_name: item.item_name,
        trl_images: item.trl_images?.map(img => ({
          id: img.id,
          fileName: img.fileName,
          storagePath: img.storagePath,
          hasStoragePath: !!img.storagePath,
          hasId: !!img.id
        })) || []
      }))
    });

    // Generate GRN number if not provided
    const grNumber = payload.header.gr_no || await getNextGRNNumber();

    // Prepare items for RPC (map frontend format to RPC format)
    const rpcItems = payload.items.map(item => ({
      item_id: item.item_table_id || null, // ✅ Use new field name
      item_name: item.item_name,
      packaging: item.packaging || null,
      qty: item.qty,
      weight: item.weight || 0,
      rack: item.rack || null,
      package_mark: item.package_mark || null,
      pricing_mode: payload.header.pricing_mode || 'MONTHLY'
    }));

    // Prepare images for RPC using enhanced array index mapping
    const rpcImages: any[] = [];

    // Add header images
    if (payload.header.gr_images) {
      payload.header.gr_images
        .filter(img => img.storagePath) // Only include images that have been uploaded
        .forEach(img => {
          rpcImages.push({
            image_type: 'header',
            storage_path: img.storagePath,
            original_filename: img.fileName,
            file_size: img.fileSize || 0,
            mime_type: img.mimeType || 'image/jpeg'
          });
        });
    }

    // Add item images using enhanced array index mapping (supports multiple images per item)
    payload.items.forEach((item, index) => {
      if (item.trl_images && item.trl_images.length > 0) {
        item.trl_images.forEach((img, imgIndex) => {
          if (img.storagePath) {
            rpcImages.push({
              image_type: 'item',
              item_index: index, // Enhanced: Use array index to map image to item
              storage_path: img.storagePath,
              original_filename: img.fileName,
              file_size: img.fileSize || 0,
              mime_type: img.mimeType || 'image/jpeg'
            });
          }
        });
      }
    });

    console.log('[GRNFormService] Calling enhanced save_grn RPC with:', {
      p_gr_no: grNumber,
      p_date: payload.header.date,
      p_customer_id: payload.header.customer_id,
      p_customer_name: payload.header.customer_name,
      p_sender_id: payload.header.sender_id,
      p_sender_name: payload.header.sender_name,
      p_supervisor_id: payload.header.supervisor_id,
      p_supervisor_name: payload.header.supervisor_name,
      p_registration: payload.header.registration,
      p_note: payload.header.note,
      p_leon: payload.header.leon || false,
      p_pricing_mode: payload.header.pricing_mode || 'MONTHLY',
      p_items: rpcItems,
      p_images: rpcImages,
      imageCount: rpcImages.length,
      itemImageCount: rpcImages.filter(img => img.image_type === 'item').length,
      headerImageCount: rpcImages.filter(img => img.image_type === 'header').length
    });

    // Call the enhanced save_grn RPC function using authenticated client
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('save_grn', {
      p_gr_no: grNumber,
      p_date: payload.header.date,
      p_customer_id: payload.header.customer_id,
      p_customer_name: payload.header.customer_name,
      p_sender_id: payload.header.sender_id || null,
      p_sender_name: payload.header.sender_name || null,
      p_supervisor_id: payload.header.supervisor_id || null,
      p_supervisor_name: payload.header.supervisor_name || null,
      p_registration: payload.header.registration || null,
      p_note: payload.header.note || null,
      p_leon: payload.header.leon || false,
      p_pricing_mode: payload.header.pricing_mode || 'MONTHLY',
      p_items: rpcItems,
      p_images: rpcImages,
      p_idempotency_key: Crypto.randomUUID(),
    });

    console.log('[GRNFormService] Enhanced RPC Response:', { data, error });

    if (error) {
      console.error('[GRNFormService] Enhanced RPC Error:', error);
      throw new Error(error.message || 'RPC call failed');
    }

    if (!data || !data.success) {
      console.error('[GRNFormService] Enhanced RPC returned failure:', data);
      throw new Error(data?.message || 'GRN creation failed');
    }

    const rpcResult = data.data;
    console.log('[GRNFormService] Enhanced RPC Success:', {
      grn_id: rpcResult.grn_id,
      gr_no: rpcResult.gr_no,
      items_created: rpcResult.items_created,
      images_saved: rpcResult.images_saved,
      item_mapping: rpcResult.item_mapping,
      image_ids: rpcResult.image_ids
    });

    // Log item mapping for debugging
    if (rpcResult.item_mapping) {
      console.log('[GRNFormService] Item mapping from RPC:');
      rpcResult.item_mapping.forEach((mapping: any) => {
        console.log(`  Index ${mapping.index}: "${mapping.item_name}" -> ID: ${mapping.item_id}`);
      });
    }

    // ✅ Upload deferred images now that we have a real GRN ID
    // Check if any images were deferred (have imageUrl but no storagePath)
    const deferredHeaderImages = (payload.header.gr_images || []).filter(img => img.imageUrl && !img.storagePath);
    const deferredItemImages = payload.items.flatMap(item =>
      (item.trl_images || []).filter(img => img.imageUrl && !img.storagePath)
    );

    const totalDeferredImages = deferredHeaderImages.length + deferredItemImages.length;

    if (totalDeferredImages > 0) {
      console.log('[GRNFormService] 📸 Uploading deferred images with real GRN ID:', rpcResult.grn_id);
      console.log('[GRNFormService] 📸 Deferred images count:', {
        header: deferredHeaderImages.length,
        items: deferredItemImages.length,
        total: totalDeferredImages
      });

      // Prepare items with item mapping for proper item ID association
      const itemsForUpload = payload.items.map((item, index) => ({
        grn_trl_id: rpcResult.item_mapping?.[index]?.item_id || '',
        trl_images: item.trl_images
      }));

      try {
        // Add a timeout for image uploads - don't block GRN creation indefinitely
        const uploadPromise = uploadDeferredImages(
          rpcResult.grn_id,
          payload.header.gr_images || [],
          itemsForUpload,
          rpcResult.item_mapping
        );

        // Set a 30 second timeout for image uploads
        const timeoutPromise = new Promise<{ success: false; uploadedCount: number; errors: string[] }>((resolve) => {
          setTimeout(() => {
            console.warn('[GRNFormService] 📸 Image upload timeout - continuing without waiting');
            resolve({ success: false, uploadedCount: 0, errors: ['Upload timeout - images will be uploaded in background'] });
          }, 30000);
        });

        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

        console.log('[GRNFormService] 📸 Deferred image upload result:', uploadResult);

        if (!uploadResult.success) {
          console.warn('[GRNFormService] Some images failed to upload:', uploadResult.errors);
          // Don't fail the whole operation - GRN is created, just warn about images
        }
      } catch (uploadError) {
        console.error('[GRNFormService] 📸 Deferred image upload failed:', uploadError);
        // Don't fail the whole operation - GRN is created successfully
      }
    } else {
      console.log('[GRNFormService] 📸 No deferred images to upload');
    }

    return {
      success: true,
      data: {
        id: rpcResult.grn_id,
        gr_no: rpcResult.gr_no,
        items_created: rpcResult.items_created,
        images_saved: rpcResult.images_saved,
        item_ids: rpcResult.item_ids,
        image_ids: rpcResult.image_ids,
        item_mapping: rpcResult.item_mapping,
      },
    };
  } catch (error) {
    console.error('[GRNFormService] Error creating GRN with enhanced RPC:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create GRN',
    };
  }
};

// Update existing GRN using update_grn RPC
// M3 Fix: Not migrated to executeRPC - extensive debug logging for troubleshooting
// field normalization, ID validation, image updates; complex stock protection handling
export const updateGRN = async (grnId: string, payload: UpdateGRNPayload) => {
  try {
    console.log('[GRNFormService] 🚀 STARTING GRN UPDATE - Input Analysis:');
    console.log('GRN ID:', grnId);
    console.log('Items received from frontend:', payload.items.length);

    // ✅ CRITICAL: Normalize field names - support both legacy and new field names
    // Legacy: id, item_id | New: grn_trl_id, item_table_id
    // Helper to check if an ID is a valid UUID (not a temporary ID)
    const isValidUUID = (id: string | undefined | null): boolean => {
      if (!id || typeof id !== 'string') return false;
      // Temp IDs start with "item-" or "temp_" - these are NOT valid UUIDs
      if (id.startsWith('item-') || id.startsWith('temp_')) return false;
      // Basic UUID format check (8-4-4-4-12 hex characters)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(id);
    };

    const normalizedItems = payload.items.map((item, index) => {
      // Use new field names if available, fall back to legacy names
      // ✅ Only use IDs that are valid UUIDs (not temporary IDs)
      const normalizedGrnTrlId = isValidUUID(item.grn_trl_id) ? item.grn_trl_id : (isValidUUID(item.id) ? item.id : undefined);
      const normalizedItemTableId = item.item_table_id || item.item_id;

      console.log(`[GRNFormService] 📋 Item ${index} normalization:`, {
        original: {
          grn_trl_id: item.grn_trl_id,
          id: item.id,
          item_table_id: item.item_table_id,
          item_id: item.item_id,
        },
        normalized: {
          grn_trl_id: normalizedGrnTrlId,
          item_table_id: normalizedItemTableId,
        },
        item_name: item.item_name
      });

      return {
        ...item,
        grn_trl_id: normalizedGrnTrlId,
        item_table_id: normalizedItemTableId,
      };
    });

    if (__DEV__) console.log('[GRNFormService] DEBUG: Normalized payload structure:', {
      grnId,
      headerFields: Object.keys(payload.header),
      itemsCount: normalizedItems.length,
      items: normalizedItems.map((item, index) => ({
        index,
        grn_trl_id: item.grn_trl_id,
        item_table_id: item.item_table_id,
        item_name: item.item_name,
        qty: item.qty,
        hasTrlImages: item.trl_images && item.trl_images.length > 0,
        trlImagesCount: item.trl_images?.length || 0
      }))
    });

    // Prepare items for RPC (map frontend format to RPC format)
    const rpcItems = normalizedItems.map((item, index) => {
      // ✅ CRITICAL: Use the GRN item record ID (goodsreceived_trl.id), NOT the item master ID
      const grnItemId = item.grn_trl_id; // This is goodsreceived_trl.id - the GRN item record ID
      const itemMasterId = item.item_table_id; // This is items.id - the item master/catalog ID

      console.log(`[GRNFormService] 🔍 DETAILED Item ${index} Analysis:`, {
        rawItem: {
          grn_trl_id: item.grn_trl_id,
          item_table_id: item.item_table_id,
          itemTableIdValue: item.item_table_id || 'NULL_VALUE',
          hasItemTableId: !!item.item_table_id,
          item_name: item.item_name
        },
        typeCheck: {
          grnTrlIdType: typeof item.grn_trl_id,
          itemTableIdType: typeof item.item_table_id,
          itemTableIdLength: item.item_table_id?.length,
          itemTableIdTruthy: !!item.item_table_id
        },
        decision: {
          grnItemId: grnItemId,
          itemMasterId: itemMasterId,
          willUpdate: !!grnItemId,
          willCreate: !grnItemId,
          correctIdUsed: grnItemId ? 'GRN_ITEM_ID' : 'NEW_ITEM'
        },
        rpcPayload: {
          willSendItemId: itemMasterId ? 'YES' : 'NO',
          itemIdBeingSent: itemMasterId || 'NULL'
        }
      });

      // Build the RPC item with correct field names
      // NOTE: Backend validation uses camelCase, but RPC spec shows snake_case
      // We send BOTH versions to ensure compatibility
      const rpcItem: any = {
        // Item identification (both formats)
        item_name: item.item_name, // snake_case per spec
        itemName: item.item_name, // camelCase per actual backend validation
        item_id: itemMasterId, // snake_case per spec
        itemId: itemMasterId, // camelCase per actual backend validation

        // Quantities
        qty: item.qty,
        stock: item.stock || item.qty,
        weight: item.weight || 0,

        // Package information (both formats)
        packaging: item.packaging || null,
        package_mark: item.package_mark || null, // snake_case per spec
        packageMark: item.package_mark || null, // camelCase per actual backend

        // Location and notes
        rack: item.rack || null,
        note: item.note || null
      };

      // ✅ Only add ID if we have a valid UUID (not a temp ID like "item-xxx")
      if (isValidUUID(grnItemId)) {
        rpcItem.id = grnItemId;
        console.log(`[GRNFormService] ✅ Item ${index} WILL UPDATE - ID: ${grnItemId}`);
      } else {
        console.log(`[GRNFormService] ⚠️  Item ${index} WILL CREATE NEW - No valid GRN item ID`);
        console.log(`[GRNFormService] Debug: grnItemId="${grnItemId}", isValidUUID=${isValidUUID(grnItemId)}`);
      }

      return rpcItem;
    });

    console.log('[GRNFormService] 📤 FINAL RPC ITEMS PAYLOAD:', rpcItems.map((item, idx) => ({
      index: idx,
      id: item.id, // This should be goodsreceived_trl.id
      item_id: item.item_id, // This should be the item master ID
      item_name: item.item_name, // Item name
      package_mark: item.package_mark,
      hasGrnItemId: !!item.id,
      hasItemId: !!item.item_id,
      itemIdValue: item.item_id || 'NULL',
      action: item.id ? 'UPDATE_EXISTING' : 'CREATE_NEW'
    })));

    console.log('[GRNFormService] 🔍 CRITICAL FIELD VERIFICATION:');
    console.log('Items being sent to RPC:');
    rpcItems.forEach((item, idx) => {
      console.log(`  Item ${idx}: ${item.item_name}`);
      console.log(`    - grn_item_id (id): ${item.id || 'NEW_ITEM'}`);
      console.log(`    - item_master_id (item_id): ${item.item_id || 'NULL'}`);
      console.log(`    - package_mark: ${item.package_mark || 'NULL'}`);
      console.log(`    - Will ${item.id ? 'UPDATE' : 'CREATE'} in database`);
    });

    // ==========================================================================
    // 🖼️ IMAGE DEBUG LOGGING - Track what images are being sent to backend
    // ==========================================================================
    console.log('[GRNFormService] 🖼️ IMAGE UPDATE ANALYSIS:');
    console.log('[GRNFormService] 📥 Incoming header images from payload:', {
      count: payload.header.gr_images?.length || 0,
      images: payload.header.gr_images?.map(img => ({
        id: img.id,
        storagePath: img.storagePath?.substring(0, 50),
        uploadStatus: img.uploadStatus,
        hasStoragePath: !!img.storagePath,
      })) || [],
    });

    // Prepare images for RPC using enhanced array index mapping
    const rpcImages: any[] = [];

    // Add header images with correct RPC format
    // NOTE: Backend validation requires storage_path and image_type (not image_url as per spec)
    if (payload.header.gr_images) {
      payload.header.gr_images.forEach((img, idx) => {
        console.log(`[GRNFormService] 🖼️ Processing header image ${idx}:`, {
          id: img.id,
          hasStoragePath: !!img.storagePath,
          storagePath: img.storagePath?.substring(0, 50),
          willInclude: !!img.storagePath,
        });
        if (img.storagePath) {
          rpcImages.push({
            ...(img.id && !img.id.startsWith('temp_') && { id: img.id }), // Include real IDs for existing images
            storage_path: img.storagePath, // ✅ Required by actual backend
            image_type: 'header', // ✅ Required by actual backend
            original_filename: img.fileName || null,
            file_size: img.fileSize || 0,
            mime_type: img.mimeType || 'image/jpeg'
          });
        } else {
          console.warn(`[GRNFormService] ⚠️ Skipping header image ${idx} - no storagePath`);
        }
      });
    }

    console.log('[GRNFormService] 🖼️ Header images to send:', rpcImages.length);

    // Add item images using enhanced array index mapping (supports multiple images per item)
    // NOTE: Backend validation requires storage_path and image_type (not image_url as per spec)
    // Use normalizedItems to ensure consistent field names
    normalizedItems.forEach((item, index) => {
      if (item.trl_images && item.trl_images.length > 0) {
        item.trl_images.forEach((img, imgIndex) => {
          if (img.storagePath) {
            // For item images, we need to link them to the GRN item ID
            const imagePayload: any = {
              ...(img.id && !img.id.startsWith('temp_') && { id: img.id }), // Include real IDs for existing images
              storage_path: img.storagePath, // ✅ Required by actual backend
              image_type: 'item', // ✅ Required by actual backend
              original_filename: img.fileName || null,
              file_size: img.fileSize || 0,
              mime_type: img.mimeType || 'image/jpeg'
            };

            // Link image to GRN item for proper association (uses normalized grn_trl_id)
            if (item.grn_trl_id && typeof item.grn_trl_id === 'string' && item.grn_trl_id.length > 10) {
              imagePayload.grn_item_id = item.grn_trl_id; // Link to existing GRN item record
              console.log(`[GRNFormService] Linking item image ${imgIndex} to existing GRN item ID: ${item.grn_trl_id}`);
            } else {
              imagePayload.item_index = index; // For new items, use array index
              console.log(`[GRNFormService] Using item_index ${index} for new item image ${imgIndex}`);
            }

            rpcImages.push(imagePayload);
          }
        });
      }
    });

    // ==========================================================================
    // 🖼️ IMAGE SUMMARY - What's being sent to backend
    // ==========================================================================
    const headerImagesInPayload = payload.header.gr_images?.length || 0;
    const headerImagesSending = rpcImages.filter(img => img.image_type === 'header').length;
    const itemImagesSending = rpcImages.filter(img => img.image_type === 'item').length;

    console.log('[GRNFormService] 🖼️ IMAGE UPDATE SUMMARY:');
    console.log(`  📥 Header images in payload: ${headerImagesInPayload}`);
    console.log(`  📤 Header images to send: ${headerImagesSending}`);
    console.log(`  📤 Item images to send: ${itemImagesSending}`);
    console.log(`  📤 Total images to send: ${rpcImages.length}`);

    if (headerImagesInPayload !== headerImagesSending) {
      console.warn(`[GRNFormService] ⚠️ IMAGE MISMATCH: ${headerImagesInPayload} in payload but only ${headerImagesSending} will be sent`);
      console.warn('[GRNFormService] ⚠️ This usually means some images are missing storagePath');
    }

    console.log('[GRNFormService] 🔍 IMAGE FORMAT VERIFICATION:');
    rpcImages.forEach((img, index) => {
      console.log(`[GRNFormService] Image ${index + 1}:`, {
        hasId: !!img.id,
        id: img.id,
        hasStoragePath: !!img.storage_path,
        storage_path: img.storage_path?.substring(0, 60),
        image_type: img.image_type,
        hasRequiredFields: !!(img.storage_path && img.image_type),
        // Item linking fields
        item_index: img.item_index,
        grn_item_id: img.grn_item_id,
        linkingMethod: img.grn_item_id ? 'GRN_ITEM_ID' : (img.item_index !== undefined ? 'ITEM_INDEX' : 'NONE')
      });
    });

    console.log('[GRNFormService] Calling update_grn RPC with corrected parameters:', {
      p_grn_id: grnId, // ✅ Corrected parameter name
      p_gr_no: payload.header.gr_no,
      p_date: payload.header.date,
      p_customer_id: payload.header.customer_id,
      p_customer_name: payload.header.customer_name,
      p_sender_id: payload.header.sender_id, // ✅ Correct sender fields
      p_sender_name: payload.header.sender_name,
      p_supervisor_id: payload.header.supervisor_id, // ✅ Correct supervisor fields
      p_supervisor_name: payload.header.supervisor_name,
      p_registration: payload.header.registration,
      p_note: payload.header.note, // ✅ Correct note field
      p_leon: payload.header.leon, // ✅ Correct leon field
      p_pricing_mode: payload.header.pricing_mode, // ✅ Correct pricing mode
      p_items: rpcItems,
      p_images: rpcImages,
      itemsCount: rpcItems.length,
      imagesCount: rpcImages.length,
      headerImagesCount: rpcImages.filter(img => !Object.prototype.hasOwnProperty.call(img, 'item_index')).length,
      itemImagesCount: rpcImages.filter(img => Object.prototype.hasOwnProperty.call(img, 'item_index')).length
    });

    // Prepare the complete RPC request payload
    const rpcRequest = {
      p_grn_id: grnId, // ✅ Corrected: was p_gr_id
      p_gr_no: payload.header.gr_no || null,
      p_date: payload.header.date || null,
      p_customer_id: payload.header.customer_id || null,
      p_customer_name: payload.header.customer_name || null,
      p_sender_id: payload.header.sender_id || null, // ✅ New: sender ID
      p_sender_name: payload.header.sender_name || null, // ✅ New: sender name
      p_supervisor_id: payload.header.supervisor_id || null, // ✅ New: supervisor ID
      p_supervisor_name: payload.header.supervisor_name || null,
      p_registration: payload.header.registration || null,
      p_note: payload.header.note || null, // ✅ Corrected: note field
      p_leon: payload.header.leon || null, // ✅ New: leon flag
      p_pricing_mode: payload.header.pricing_mode || null, // ✅ New: pricing mode
      p_items: rpcItems,
      p_images: rpcImages
    };

    console.log('[GRNFormService] 📤 COMPLETE RPC REQUEST PAYLOAD:');
    console.log('='.repeat(80));
    console.log('Function: update_grn');
    console.log('Request:', JSON.stringify(rpcRequest, null, 2));
    console.log('='.repeat(80));

    // Call the update_grn RPC function with correct parameters using authenticated client
    const authenticatedClient = await getAuthenticatedClient();
    const { data, error } = await authenticatedClient.rpc('update_grn', rpcRequest);

    console.log('[GRNFormService] 📥 COMPLETE RPC RESPONSE:');
    console.log('='.repeat(80));
    console.log('Success:', !error);
    console.log('Error:', error);
    console.log('Data:', JSON.stringify(data, null, 2));
    console.log('='.repeat(80));

    // Quick summary for debugging
    if (__DEV__) console.log('[GRNFormService] 🔍 QUICK DEBUG SUMMARY:');
    console.log('RPC Function Called: update_grn');
    console.log('GRN ID:', grnId);
    console.log('Items sent:', rpcItems.length);
    console.log('Items with IDs (will update):', rpcItems.filter(item => item.id).length);
    console.log('Items without IDs (will create):', rpcItems.filter(item => !item.id).length);
    console.log('Item IDs being sent:', rpcItems.map(item => ({ name: item.item_name, id: item.id || 'NEW', item_id: item.item_id, package_mark: item.package_mark })));
    console.log('Images sent:', rpcImages.length);
    console.log('RPC Success:', !error);
    console.log('RPC Error Message:', error?.message || 'None');
    if (data) {
      const result = Array.isArray(data) && data.length > 0 ? data[0] : (Array.isArray(data) ? null : data);
      console.log('RPC Result Success:', result?.success);
      console.log('RPC Result Message:', result?.message);
      console.log('RPC Error Code:', result?.error_code);
    }
    console.log('='.repeat(50));

    if (error) {
      console.error('[GRNFormService] Update RPC Error:', error);

      // Handle stock protection errors specifically
      if (error.message?.includes('dispatches exist') || error.message?.includes('STOCK_PROTECTED')) {
        throw new Error(`Stock Protection: ${error.message}`);
      }

      throw new Error(error.message || 'RPC call failed');
    }

    // RPC returns array, get first result (with safe array access)
    const rpcResult = Array.isArray(data) && data.length > 0 ? data[0] : (Array.isArray(data) ? null : data);

    if (!rpcResult || !rpcResult.success) {
      console.error('[GRNFormService] Update RPC returned failure:', rpcResult);

      // Handle stock protection from RPC response
      if (rpcResult?.error_code === 'STOCK_PROTECTED') {
        throw new Error(`Stock Protection: ${rpcResult.message}`);
      }

      throw new Error(rpcResult?.message || 'GRN update failed');
    }

    console.log('[GRNFormService] Update RPC Success:', {
      gr_id: rpcResult.gr_id,
      message: rpcResult.message,
      stats: rpcResult.stats
    });

    // Log update statistics if available
    if (rpcResult.stats) {
      console.log('[GRNFormService] Update Statistics:', {
        items_updated: rpcResult.stats.items_updated,
        items_created: rpcResult.stats.items_created,
        items_deleted: rpcResult.stats.items_deleted,
        images_updated: rpcResult.stats.images_updated,
        images_created: rpcResult.stats.images_created,
        images_deleted: rpcResult.stats.images_deleted
      });
    }

    // ✅ Upload deferred images now that the GRN update succeeded
    // Check if any images were deferred (have imageUrl but no storagePath - local file:// URLs)
    // Also exclude images that already have a real database ID (non-temp) as they were already uploaded
    const deferredHeaderImages = (payload.header.gr_images || []).filter(img => {
      const hasLocalUrl = img.imageUrl && img.imageUrl.startsWith('file://');
      const hasNoStoragePath = !img.storagePath;

      // Skip if image already has a real database ID (was already uploaded during image selection)
      if (img.id && !img.id.startsWith('temp_')) {
        console.log('[GRNFormService] Skipping already-uploaded header image:', { id: img.id, fileName: img.fileName });
        return false;
      }

      return hasLocalUrl && hasNoStoragePath;
    });

    // Get deferred item images from normalized items
    // Also exclude images that already have a real database ID
    const deferredItemImages = normalizedItems.flatMap((item, index) =>
      (item.trl_images || [])
        .filter(img => {
          const hasLocalUrl = img.imageUrl && img.imageUrl.startsWith('file://');
          const hasNoStoragePath = !img.storagePath;

          // Skip if image already has a real database ID
          if (img.id && !img.id.startsWith('temp_')) {
            console.log('[GRNFormService] Skipping already-uploaded item image:', { id: img.id, fileName: img.fileName });
            return false;
          }

          return hasLocalUrl && hasNoStoragePath;
        })
        .map(img => ({ image: img, itemId: item.grn_trl_id || '' }))
    );

    const totalDeferredImages = deferredHeaderImages.length + deferredItemImages.length;

    if (totalDeferredImages > 0) {
      console.log('[GRNFormService] 📸 Uploading deferred images for GRN update:', grnId);
      console.log('[GRNFormService] 📸 Deferred images count:', {
        header: deferredHeaderImages.length,
        items: deferredItemImages.length,
        total: totalDeferredImages
      });

      // Prepare items with proper item IDs for image association
      const itemsForUpload = normalizedItems.map((item) => ({
        grn_trl_id: item.grn_trl_id || '',
        trl_images: item.trl_images
      }));

      try {
        // Add a timeout for image uploads - don't block GRN update indefinitely
        const uploadPromise = uploadDeferredImages(
          grnId,
          payload.header.gr_images || [],
          itemsForUpload
        );

        // Set a 30 second timeout for image uploads
        const timeoutPromise = new Promise<{ success: false; uploadedCount: number; errors: string[] }>((resolve) => {
          setTimeout(() => {
            console.warn('[GRNFormService] 📸 Image upload timeout during update - continuing without waiting');
            resolve({ success: false, uploadedCount: 0, errors: ['Upload timeout - images will be uploaded in background'] });
          }, 30000);
        });

        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

        console.log('[GRNFormService] 📸 Deferred image upload result for update:', uploadResult);

        if (!uploadResult.success) {
          console.warn('[GRNFormService] Some images failed to upload during update:', uploadResult.errors);
          // Don't fail the whole operation - GRN is updated, just warn about images
        }
      } catch (uploadError) {
        console.error('[GRNFormService] 📸 Deferred image upload failed during update:', uploadError);
        // Don't fail the whole operation - GRN is updated successfully
      }
    } else {
      console.log('[GRNFormService] 📸 No deferred images to upload for update');
    }

    return {
      success: true,
      data: {
        id: rpcResult.gr_id || grnId,
        message: rpcResult.message,
        stats: rpcResult.stats
      },
    };
  } catch (error) {
    console.error('[GRNFormService] Error updating GRN with RPC:', error);

    // Provide user-friendly error messages
    let errorMessage = 'Failed to update GRN';
    if (error instanceof Error) {
      if (error.message.includes('Stock Protection:')) {
        errorMessage = error.message; // Keep stock protection messages as-is
      } else if (error.message.includes('dispatches exist')) {
        errorMessage = 'Cannot modify quantities for items with existing dispatches. Other details can still be updated.';
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

// Load GRN data for editing
export const loadGRNData = async (grnId: string) => {
  try {
    console.log('[loadGRNData] 🔄 Loading fresh data from database (NO CACHE) for GRN:', grnId);

    // Use authenticated client to ensure RLS policies are satisfied
    const authenticatedClient = await getAuthenticatedClient();

    // ✅ FETCH FRESH DATA: Always get latest data from database without any caching
    const { data: headerData, error: headerError } = await authenticatedClient
      .from('goodsreceived')
      .select('*')
      .eq('id', grnId)
      .single();

    if (headerError) throw headerError;

    // Fetch items with explicit field selection to ensure ID is returned
    const { data: itemsData, error: itemsError } = await authenticatedClient
      .from('goodsreceived_trl')
      .select(`
        id,
        gr_id,
        item_id,
        item_name,
        packaging,
        qty,
        stock,
        weight,
        rack,
        package_mark,
        trl_img_url
      `)
      .eq('gr_id', grnId);

    if (itemsError) throw itemsError;

    // ✅ REDUCED LOGGING: Only essential info to prevent render loops
    console.log(`[loadGRNData] Loading items for GRN: ${grnId}, found: ${itemsData?.length || 0} items`);

    // ✅ CRITICAL: Verify each item has required ID
    if (itemsData && itemsData.length > 0) {
      const missingIds = itemsData.filter(item => !item.id);
      if (missingIds.length > 0) {
        console.error(`[loadGRNData] CRITICAL: ${missingIds.length} items missing ID field!`);
      } else {
        console.log(`[loadGRNData] ✅ All ${itemsData.length} items have valid IDs`);
      }
    }

    // Fetch GRN images
    const { data: imagesData, error: imagesError } = await authenticatedClient
      .from('grn_images')
      .select('*')
      .eq('grn_id', grnId)
      .eq('image_type', 'header')
      .order('display_order', { ascending: true });

    if (imagesError) console.warn('[loadGRNData] Failed to fetch images:', imagesError);

    // Get signed URLs for images
    console.log('[loadGRNData] Generating signed URLs for', imagesData?.length || 0, 'header images');
    const imagesWithUrls = await Promise.all((imagesData || []).map(async (img) => {
      if (img.storage_path) {
        const { data: urlData, error: urlError } = await authenticatedClient.storage
          .from('grn-images')
          .createSignedUrl(img.storage_path, 3600); // 1 hour expiry

        if (urlError) {
          console.error('[loadGRNData] Failed to create signed URL for image:', img.id, urlError);
        } else {
          console.log('[loadGRNData] Signed URL created for image:', img.id, urlData?.signedUrl ? 'SUCCESS' : 'EMPTY');
        }

        return {
          ...img,
          signedUrl: urlData?.signedUrl
        };
      }
      console.warn('[loadGRNData] Image has no storage_path:', img.id);
      return img;
    }));

    console.log('[loadGRNData] Header images with URLs:', imagesWithUrls.map(img => ({
      id: img.id,
      hasSignedUrl: !!img.signedUrl,
      storagePath: img.storage_path
    })));

    // Transform to form data format
    const header: GRNHeaderData = {
      gr_no: headerData.gr_no,
      registration: headerData.registration || '',
      date: headerData.date,
      sender_id: headerData.sender_id,
      sender_name: headerData.sender_name || '',
      customer_id: headerData.customer_id,
      customer_name: headerData.customer_name || '',
      supervisor_id: headerData.supervisor_id,
      supervisor_name: headerData.supervisor_name || '',
      note: headerData.note || '',
      leon: headerData.leon || false,
      pricing_mode: headerData.pricing_mode || 'MONTHLY',
      gr_images: imagesWithUrls ? imagesWithUrls.map(img => ({
        id: img.id,
        fileName: img.original_filename || 'image.jpg',
        imageUrl: img.signedUrl || (img.storage_path ? getFullImageUrl(img.storage_path) : ''),
        uploadStatus: 'completed' as const,
        uploadProgress: 100,
        storagePath: img.storage_path,
        fileSize: img.file_size || 0,
        mimeType: img.mime_type || 'image/jpeg',
        uploadTimestamp: img.created_at,
      })) : [],
    };

    console.log('[loadGRNData] Header gr_images constructed:', header.gr_images.map(img => ({
      id: img.id,
      hasImageUrl: !!img.imageUrl && img.imageUrl.length > 0,
      imageUrlPreview: img.imageUrl?.substring(0, 80),
      storagePath: img.storagePath
    })));

    // Fetch item images
    const itemIds = itemsData.map((item: any) => item.id).filter(Boolean);
    let itemImagesData: any[] = [];

    if (itemIds.length > 0) {
      const { data: itemImages, error: itemImagesError } = await authenticatedClient
        .from('grn_images')
        .select('*')
        .in('grn_item_id', itemIds)
        .eq('image_type', 'item')
        .order('display_order', { ascending: true });

      if (itemImagesError) {
        console.warn('[loadGRNData] Failed to fetch item images:', itemImagesError);
      } else {
        itemImagesData = itemImages || [];
      }
    }

    // Get signed URLs for item images
    const itemImagesWithUrls = await Promise.all(itemImagesData.map(async (img) => {
      if (img.storage_path) {
        const { data: urlData } = await authenticatedClient.storage
          .from('grn-images')
          .createSignedUrl(img.storage_path, 3600); // 1 hour expiry

        return {
          ...img,
          signedUrl: urlData?.signedUrl
        };
      }
      return img;
    }));

    // Group item images by item ID (using the URLs with signed URLs)
    const itemImagesByItemId = itemImagesWithUrls.reduce((acc: any, img: any) => {
      if (!acc[img.grn_item_id]) {
        acc[img.grn_item_id] = [];
      }
      acc[img.grn_item_id].push(img);
      return acc;
    }, {});

    const items: GRNItemData[] = itemsData.map((item: any, index: number) => {
      // ✅ CRITICAL: Ensure we ALWAYS use the database ID, never fall back to generated ID
      if (!item.id) {
        console.error(`[loadGRNData] ❌ CRITICAL ERROR: Database item ${index} missing ID field!`);
        throw new Error(`Database item at index ${index} is missing the required 'id' field. This indicates a database schema or query issue.`);
      }

      // Log the raw data from database
      console.log(`[loadGRNData] Item ${index} from DB:`, {
        id: item.id,
        item_id: item.item_id,
        item_name: item.item_name,
        hasItemId: !!item.item_id,
        itemIdValue: item.item_id,
        imagesCount: itemImagesByItemId[item.id]?.length || 0
      });

      // Map all images for this item to GRNImageData array
      const itemImages = itemImagesByItemId[item.id] || [];
      const trl_images: GRNImageData[] = itemImages.map((img: any) => ({
        id: img.id,
        fileName: img.original_filename || 'image.jpg',
        imageUrl: img.signedUrl || (img.storage_path ? getFullImageUrl(img.storage_path) : ''),
        uploadStatus: 'completed' as const,
        uploadProgress: 100,
        storagePath: img.storage_path,
        fileSize: img.file_size || 0,
        mimeType: img.mime_type || 'image/jpeg',
        uploadTimestamp: img.created_at,
      }));

      return {
        grn_trl_id: item.id, // ✅ MUST be the database UUID from goodsreceived_trl
        item_table_id: item.item_id, // Reference to items table
        item_name: item.item_name || '',
        packaging: item.packaging || '',
        qty: item.qty || 0,
        stock: item.stock || 0,
        weight: item.weight || 0,
        rack: item.rack || '',
        package_mark: item.package_mark || '',
        trl_images, // ✅ Now an array of images
      };
    });

    console.log(`[loadGRNData] ✅ Successfully processed ${items.length} items with valid IDs`);

    return {
      success: true,
      data: { header, items },
    };
  } catch (error) {
    console.error('[GRNFormService] Error loading GRN:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load GRN',
    };
  }
};

// Check if items have dispatches
export const checkItemsHaveDispatches = async (grnId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('dispatch_trl')
      .select('id')
      .eq('gr_id', grnId)
      .limit(1);

    if (error) throw error;

    return {
      success: true,
      hasDispatches: data && data.length > 0,
    };
  } catch (error) {
    console.error('[GRNFormService] Error checking dispatches:', error);
    return {
      success: false,
      hasDispatches: false,
      error: error instanceof Error ? error.message : 'Failed to check dispatches',
    };
  }
};