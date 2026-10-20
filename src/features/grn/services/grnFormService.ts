import { beginGrnEditSession, grnUpdateIdempotencyKey, submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { beginOperatorMutation, getAuthenticatedClient, getCurrentConfig } from '@/config/supabaseConfig';
import { GRNHeaderData, GRNItemData, GRNImageData, RemovedGRNImage } from '@/store/slices/grnFormSlice';
import {
  collectDeferredGRNPhotos,
  deleteGRNImage,
  uploadGRNPhotos,
  type FailedGRNPhoto,
  type PendingGRNPhoto,
} from './imageUploadService';
import { isTemporaryGRNImageId } from './imageId';
// M3 Fix: Import executeRPC for potential future refactoring
// Note: Current RPC methods have custom error handling (E5 fix) or extensive debug logging
// and are not migrated to executeRPC pattern to preserve their specialized behavior
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';
import { isLostAnswer } from '@/utils/lostAnswer';
import { t } from '@/i18n';
import { isUnsettledFailure, serverText, withHttpStatus } from '@/utils/serverText';
import { toCalendarDay } from '@/utils/formatters';
import { createLogger, loggableError } from '@/utils/logger';
import { invalidateReportQueries } from '@/lib/queryClient';
import type { RatesPayloadEntry } from '@/features/grn/rates/types';
import { grnRatesFromDetails } from '@/features/grn/rates/grnRateModel';
import { RateRefusal, isRateRefusalCode, serverNeedsUpdateForRates } from '@/features/grn/rates/rateErrors';

// Identifiers, counts and error codes only: a GRN's names, notes, photo
// addresses and the server's messages never reach the device log.
const log = createLogger('grn');

// Helper function to construct full image URL
// Note: This is a fallback for when signed URL generation fails
// Since grn-images bucket is private, public URLs won't work
// Return empty string to trigger error handling in the UI
const getFullImageUrl = (storagePath: string): string => {
  if (!storagePath) return '';

  // Log warning since this fallback shouldn't normally be needed
  log.warn('getFullImageUrl called as fallback; signed URL generation may have failed');

  // Return empty string since public URLs don't work for private buckets
  // The UI should handle missing imageUrl gracefully
  return '';
};

interface CreateGRNPayload {
  /**
   * `gr_no` is the number the form holds: the screen fetches it once and stores it in the form before the
   * first send, so a retry sends the same body. createGRN never asks the server for a number.
   */
  header: Omit<GRNHeaderData, 'gr_no'> & { gr_no?: string };
  items: Omit<GRNItemData, 'grn_trl_id' | 'stock'>[];
  /** `p_rates` (migration 86): the rates saved with the GRN. Absent: the old call, no rate check. */
  rates?: RatesPayloadEntry[];
  /**
   * The form's session id (grnFormSlice `submissionNonce`). Part of what the idempotency key hashes, never
   * of the RPC body: the same GRN entered again in a new form meets a new key, not the answer cached for a
   * GRN that was deleted since (contract item 11). Absent: the key is the body's alone, as before.
   */
  nonce?: string;
  /**
   * The answer of an earlier press of Create that got no answer, found stored on the server under this request's
   * key (`checkSubmission`): it is handled exactly as the answer that was lost, and nothing is sent.
   */
  storedAnswer?: unknown;
  /**
   * The check found nothing for a lost request: the identical request is sent again, byte for byte (`resend.args`: the
   * body and request code exactly as last sent, no new key is made and nothing is rebuilt). Any failure of it that is
   * not the server's answer leaves the attempt unsettled (`lostAnswer` again).
   */
  resend?: GRNLostAnswer;
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
  /** `p_rates` (migration 86): the rates saved with the GRN. Absent: the old call, no rate check. */
  rates?: RatesPayloadEntry[];
}

/**
 * What happened to the photos of a saved GRN. The GRN itself is saved either
 * way; the screen tells the user about anything listed here and offers to try
 * the uploads again (`uploadGRNPhotos(grnId, failed)`).
 */
export interface GRNPhotoSaveReport {
  uploadedCount: number;
  /** Photos picked in the form that did not reach the server. */
  failed: FailedGRNPhoto[];
  /** Photos removed in the form that are still on the GRN. */
  removalFailures: number;
}

/** A line whose quantity `update_grn` left unchanged because it already has dispatches (migration 86). */
export interface GRNSkippedStockLine {
  grn_trl_item_id: string;
  item_name: string;
  /** English server text; the app words the warning itself and does not show this. */
  reason: string;
  current_qty: number;
  current_stock: number;
  dispatched_qty: number;
}

/** The `stats` object `update_grn` returns. */
export interface GRNUpdateStats {
  items_skipped_stock?: GRNSkippedStockLine[];
}

/** Upload a saved GRN's photos; a failure of the whole step fails every photo, never the save. */
const uploadPhotosOfSavedGRN = async (
  grnId: string,
  pending: PendingGRNPhoto[]
): Promise<{ uploadedCount: number; failed: FailedGRNPhoto[] }> => {
  if (pending.length === 0) return { uploadedCount: 0, failed: [] };
  try {
    return await uploadGRNPhotos(grnId, pending);
  } catch (uploadError) {
    log.error('Photo upload failed', loggableError(uploadError));
    return {
      uploadedCount: 0,
      failed: pending.map(photo => ({ ...photo, error: t('grn.photos.uploadFailed') })),
    };
  }
};

// ============================================================================
// CHECK GRN EXISTS
// ============================================================================

/**
 * Result from checkGrnExists.
 * E5 Fix: `error` distinguishes a failed check from "not found".
 *
 * The check only says whether the number is taken and by which GRN. It carries
 * no items and no photos, so it must never be used to fill the form: a form
 * loaded from it would list no photos, and saving that form makes `update_grn`
 * delete every photo the GRN has. Load the GRN with `loadGRNData` instead.
 */
export interface CheckGrnExistsResult {
  exists: boolean;
  grnId?: string;
  grNo?: string;
  customerName?: string;
  date?: string;
  // E5: Distinguish errors from "not found"
  error?: boolean;
  message?: string;
}

/**
 * Check if a GRN number already exists in the database
 * Uses optimized check_grn_exists RPC (18-31ms vs direct query with RLS overhead),
 * which answers `{ success, data: { exists, grn_id, gr_no, customer_name, date } }`.
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

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('check_grn_exists', {
      p_gr_no: grNo.toUpperCase(),
    });

    if (error) {
      log.error('check_grn_exists failed', loggableError(error));
      // E5 Fix: Return distinct error response so caller can distinguish from "not found"
      return { exists: false, error: true, message: serverText(error.message, t('grn.form.checkNumberFailed')) };
    }

    if (!data || data.success !== true) {
      log.error('check_grn_exists was refused');
      return { exists: false, error: true, message: serverText(data?.message, t('grn.form.checkNumberFailed')) };
    }

    const found = data.data;
    if (!found || found.exists !== true || !found.grn_id) {
      return { exists: false };
    }

    return {
      exists: true,
      grnId: found.grn_id,
      grNo: found.gr_no,
      customerName: found.customer_name,
      date: found.date,
    };
  } catch (error) {
    log.error('Error checking GRN exists', loggableError(error));
    // E5 Fix: Return distinct error response so caller can distinguish from "not found"
    return {
      exists: false,
      error: true,
      message: error instanceof Error ? error.message : t('grn.form.checkNumberNetwork')
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

    const authenticatedClient = await getAuthenticatedClient();

    const { data, error } = await authenticatedClient.rpc('get_next_grn_number');

    if (error) {
      log.error('get_next_grn_number failed', loggableError(error));
      throw new Error(serverText(error.message, t('grn.form.nextNumberFailed')));
    }

    if (!data) {
      return 'G0001';
    }

    return data;
  } catch (error) {
    log.error('Error getting next GRN number', loggableError(error));
    throw error;
  }
};

/**
 * save_grn / update_grn refused because an item of the GRN no longer exists in the catalogue (an item deleted
 * after it was put into the form): the foreign key from the line to the items table. Told apart from other
 * foreign keys by the constraint's name, so a line that cannot be removed (stock movements, orders) keeps the
 * shared "Other records depend on this one" text.
 */
const ITEM_FK = /goodsreceived_trl_item_id_fkey|not present in table "items"/i;
const isItemGone = (failure: unknown): boolean => {
  if (!failure) return false;
  if (typeof failure === 'string') return ITEM_FK.test(failure);
  if (typeof failure !== 'object') return false;
  const { message, details, error } = failure as { message?: unknown; details?: unknown; error?: unknown };
  return [message, details, error].some(text => typeof text === 'string' && ITEM_FK.test(text));
};

/** The wording of a refusal because an item was deleted; undefined for any other failure. */
const itemGoneText = (failure: unknown): string | undefined => (isItemGone(failure) ? t('grn.form.itemDeleted') : undefined);

/**
 * A request that went out and got no answer (a dropped connection, the 60 s timeout): the write may have been
 * applied. `key` is the request code it was sent under and `sentAt` when it went out; the screen locks the form and
 * asks the server about that code (`checkSubmission` in utils/lostAnswer) before it sends anything again. A 57014
 * statement timeout is not one: nothing was saved.
 */
export interface GRNLostAnswer {
  key: string;
  sentAt: number;
  /**
   * The complete arguments of the RPC as sent, request code (`p_idempotency_key`) included: the exact request a
   * resend repeats. A retry without `p_rates` (an older server) is the request that was sent last, and is what is
   * repeated, not the first attempt with its other key.
   */
  args: Record<string, unknown>;
}

/** What save_grn answers (and what is stored under its key): `data` holds the saved GRN. */
interface SaveGRNResult {
  grn_id: string;
  gr_no: string;
  items_created?: number;
  images_saved?: number;
  item_ids?: unknown;
  image_ids?: unknown;
  item_mapping?: Array<{ index: number; item_id: string }>;
}
type SaveGRNAnswer = {
  success?: boolean;
  data?: SaveGRNResult;
  message?: string;
  error?: string;
  error_code?: string;
  reason?: string;
} | null;

/** save_grn refused because another GRN holds the number (the server names the number in its sentence). */
const NUMBER_TAKEN = /GRN number already exists/i;
const isNumberTaken = (answer: unknown): boolean => {
  if (!answer || typeof answer !== 'object') return false;
  const { reason, message, error } = answer as { reason?: unknown; message?: unknown; error?: unknown };
  return reason === 'NUMBER_TAKEN' || [message, error].some(text => typeof text === 'string' && NUMBER_TAKEN.test(text));
};
class NumberTakenRefusal extends Error {
  constructor(public readonly number: string, message: string) {
    super(message);
    this.name = 'NumberTakenRefusal';
  }
}

// Create new GRN using enhanced save_grn RPC with item-level image mapping
// M3 Fix: Not migrated to executeRPC - extensive debug logging for troubleshooting
// image uploads and item mapping; complex post-RPC deferred image upload logic
export const createGRN = async (payload: CreateGRNPayload) => {
  let finishMutation: (() => void) | undefined;
  // Set when save_grn was sent and no answer came back: the GRN may be saved. The screen locks the form, asks the
  // server about this request's key and either handles the stored answer or sends the identical request again.
  let lostAnswer: GRNLostAnswer | undefined;
  // The latest send (a retry without p_rates is a second one): its key and time.
  const sent: { last?: GRNLostAnswer } = {};
  try {
    finishMutation = beginOperatorMutation();

    // The number is the form's: the screen fetched it once and stored it in the form before the first send. Asking
    // for a number here would give a retry after a lost answer the next number, and with it another key.
    const grNumber = payload.header.gr_no;
    if (!grNumber || !grNumber.trim()) throw new Error(t('errors.document.numberRequired'));

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

    // No p_images on create. A photo can be stored only under the receipt's own
    // folder (headers/<grn id>/..., items/<grn id>/...), which does not exist
    // before the receipt does, and the server refuses any other path
    // (migration 43). Photos are uploaded after the save, below.

    // The answer is either the stored answer of an earlier press (found by its key: nothing is sent) or the answer
    // of save_grn.
    let data: SaveGRNAnswer;
    if (payload.storedAnswer !== undefined) {
      data = payload.storedAnswer as SaveGRNAnswer;
    } else {
      // Call the enhanced save_grn RPC function using authenticated client
      const authenticatedClient = await getAuthenticatedClient();
      const rpcPayload = {
        p_gr_no: grNumber,
        p_date: toCalendarDay(payload.header.date),
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
        // Part of what the idempotency key hashes: the same form with other rates is another save.
        ...(payload.rates ? { p_rates: payload.rates } : {}),
      };
      // The form's nonce is hashed with the body and never sent in it. The same body and nonce give the same key,
      // which is the request code the screen asks the server about after a lost answer.
      const callSave = async (body: typeof rpcPayload) => {
        const key = await submissionIdempotencyKey('grn', payload.nonce ? { ...body, nonce: payload.nonce } : body);
        const args = { ...body, p_idempotency_key: key };
        sent.last = { key, sentAt: Date.now(), args };
        return authenticatedClient.rpc('save_grn', args);
      };
      let answer: SaveGRNAnswer;
      let error: any;
      let status: number | undefined;
      if (payload.resend) {
        // The identical request, byte for byte, under the code the check was made for.
        const { key, args } = payload.resend;
        sent.last = { key, sentAt: Date.now(), args };
        ({ data: answer, error, status } = await authenticatedClient.rpc('save_grn', args));
      } else {
        ({ data: answer, error, status } = await callSave(rpcPayload));
        if (error && isUnknownFunctionSignature(error) && payload.rates && payload.rates.length === 0) {
          // A server without migration 86 knows no p_rates. With nothing set the app already checked that every row
          // has a stored rate, so the old call (and its key) loses nothing.
          log.warn('save_grn does not take p_rates on this server; sent without it');
          const { p_rates: _noRates, ...withoutRates } = rpcPayload as typeof rpcPayload & { p_rates?: unknown };
          ({ data: answer, error, status } = await callSave(withoutRates as typeof rpcPayload));
        }
      }

      if (error) {
        log.error('save_grn failed', loggableError(error));
        if (payload.rates && payload.rates.length > 0 && isUnknownFunctionSignature(error)) throw serverNeedsUpdateForRates();
        // Sent and not answered (a dropped connection, the 60 s timeout, a gateway's 502 / 504): the GRN may be saved.
        // A statement timeout is an answer: nothing was saved. The HTTP status goes with the error, so a gateway's
        // answer is told from the server's own refusals. A RESEND is settled only by the server's answer: any other
        // failure of it (57014 while it waits behind the original, a failure before sending, a changed session) leaves
        // the attempt unsettled, and the screen goes back to the check.
        const failure = withHttpStatus(error, status);
        if (sent.last && (isLostAnswer(failure) || (payload.resend && isUnsettledFailure(failure)))) lostAnswer = sent.last;
        throw new Error(itemGoneText(error) ?? serverText(error, t('grn.form.requestFailed'), { write: true, form: true }));
      }
      data = answer;
    }

    if (!data || !data.success) {
      log.error('save_grn returned failure', { errorCode: data?.error_code });
      const refusalCode = data?.error_code;
      if (isRateRefusalCode(refusalCode)) throw new RateRefusal(refusalCode, serverText(data?.message ?? data?.error, t('grn.form.creationFailed'), { write: true, form: true }), data?.data);
      // Another GRN holds the number (it was taken since the form got it): the screen offers the next free one. On a
      // RESEND it means the first send may have saved it: the attempt is unsettled (`lostAnswer`), the screen checks
      // again and, if that finds nothing and it is refused again, says to look in the list; no next number.
      if (isNumberTaken(data)) {
        if (payload.resend && sent.last) lostAnswer = sent.last;
        throw new NumberTakenRefusal(grNumber, serverText(data?.message, t('grn.form.creationFailed'), { write: true, form: true }));
      }
      throw new Error(itemGoneText(data) ?? serverText(data?.message, t('grn.form.creationFailed'), { write: true, form: true }));
    }
    const rpcResult = data.data as SaveGRNResult;
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    // ✅ Upload the photos picked in the form now that we have a real GRN ID.
    // Each line's id comes from the mapping save_grn returns.
    const itemMapping: Array<{ index: number; item_id: string }> = rpcResult.item_mapping || [];
    const pendingPhotos = collectDeferredGRNPhotos(
      payload.header.gr_images || [],
      payload.items.map((item, index) => ({
        itemId: (itemMapping.find(mapping => mapping.index === index) ?? itemMapping[index])?.item_id,
        itemName: item.item_name,
        images: item.trl_images,
      }))
    );

    // The GRN is created whatever happens to its photos; the caller is told which ones failed.
    const photoUpload = await uploadPhotosOfSavedGRN(rpcResult.grn_id, pendingPhotos);
    if (photoUpload.failed.length > 0) {
      log.warn('Photos not uploaded', photoUpload.failed.length);
    }
    const photos: GRNPhotoSaveReport = { ...photoUpload, removalFailures: 0 };

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
        photos,
      },
    };
  } catch (error) {
    log.error('Error creating GRN with enhanced RPC', loggableError(error));
    return {
      success: false,
      error: error instanceof Error ? error.message : t('grn.form.createFailed'),
      lostAnswer,
      numberTaken: error instanceof NumberTakenRefusal ? { number: error.number } : undefined,
      rateError: error instanceof RateRefusal ? { code: error.code, data: error.data } : undefined,
    };
  } finally {
    finishMutation?.();
  }
};

/** PostgREST found no update_grn that takes the parameters sent (PGRST202). */
const isUnknownFunctionSignature = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');

/** The update_grn body for a form, and the form's lines under the ids that body uses. */
const buildUpdateGRNRequest = (grnId: string, payload: UpdateGRNPayload) => {
  // ✅ CRITICAL: Normalize field names - support both legacy and new field names
  // Legacy: id, item_id | New: grn_trl_id, item_table_id
  // Helper to check if an ID is a valid UUID (not a temporary ID)
  const isValidUUID = (id: string | undefined | null): boolean => {
    if (!id || typeof id !== 'string') return false;
    // Temp IDs start with "item-" or "temp_" - these are NOT valid UUIDs
    if (id.startsWith('item-') || isTemporaryGRNImageId(id)) return false;
    // Basic UUID format check (8-4-4-4-12 hex characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  const normalizedItems = payload.items.map((item, index) => {
    // Use new field names if available, fall back to legacy names
    // ✅ Only use IDs that are valid UUIDs (not temporary IDs)
    const normalizedGrnTrlId = isValidUUID(item.grn_trl_id) ? item.grn_trl_id : (isValidUUID(item.id) ? item.id : undefined);
    const normalizedItemTableId = item.item_table_id || item.item_id;

    return {
      ...item,
      grn_trl_id: normalizedGrnTrlId,
      item_table_id: normalizedItemTableId,
    };
  });

  // Prepare items for RPC (map frontend format to RPC format)
  const rpcItems = normalizedItems.map((item, index) => {
    // ✅ CRITICAL: Use the GRN item record ID (goodsreceived_trl.id), NOT the item master ID
    const grnItemId = item.grn_trl_id; // This is goodsreceived_trl.id - the GRN item record ID
    const itemMasterId = item.item_table_id; // This is items.id - the item master/catalog ID

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
    }

    return rpcItem;
  });

  // Prepare images for RPC using enhanced array index mapping
  const rpcImages: any[] = [];

  // Add header images with correct RPC format
  // NOTE: Backend validation requires storage_path and image_type (not image_url as per spec)
  if (payload.header.gr_images) {
    payload.header.gr_images.forEach((img, idx) => {
      if (img.storagePath) {
        rpcImages.push({
          ...(img.id && !isTemporaryGRNImageId(img.id) && { id: img.id }), // Include real IDs for existing images
          storage_path: img.storagePath, // ✅ Required by actual backend
          image_type: 'header', // ✅ Required by actual backend
          original_filename: img.fileName || null,
          file_size: img.fileSize || 0,
          mime_type: img.mimeType || 'image/jpeg'
        });
      } else {
        log.warn(`Skipping header image ${idx} - no storagePath`);
      }
    });
  }

  // Add item images using enhanced array index mapping (supports multiple images per item)
  // NOTE: Backend validation requires storage_path and image_type (not image_url as per spec)
  // Use normalizedItems to ensure consistent field names
  normalizedItems.forEach((item, index) => {
    if (item.trl_images && item.trl_images.length > 0) {
      item.trl_images.forEach((img, imgIndex) => {
        if (img.storagePath) {
          // For item images, we need to link them to the GRN item ID
          const imagePayload: any = {
            ...(img.id && !isTemporaryGRNImageId(img.id) && { id: img.id }), // Include real IDs for existing images
            storage_path: img.storagePath, // ✅ Required by actual backend
            image_type: 'item', // ✅ Required by actual backend
            original_filename: img.fileName || null,
            file_size: img.fileSize || 0,
            mime_type: img.mimeType || 'image/jpeg'
          };

          // Link image to GRN item for proper association (uses normalized grn_trl_id)
          if (item.grn_trl_id && typeof item.grn_trl_id === 'string' && item.grn_trl_id.length > 10) {
            imagePayload.grn_item_id = item.grn_trl_id; // Link to existing GRN item record
          } else {
            imagePayload.item_index = index; // For new items, use array index
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

  if (headerImagesInPayload !== headerImagesSending) {
    log.warn(`IMAGE MISMATCH: ${headerImagesInPayload} in payload but only ${headerImagesSending} will be sent`);
    log.warn('This usually means some images are missing storagePath');
  }

  // Prepare the complete RPC request payload
  const rpcRequest = {
    p_grn_id: grnId, // ✅ Corrected: was p_gr_id
    p_gr_no: payload.header.gr_no || null,
    p_date: payload.header.date ? toCalendarDay(payload.header.date) : null,
    p_customer_id: payload.header.customer_id || null,
    p_customer_name: payload.header.customer_name || null,
    p_sender_id: payload.header.sender_id || null, // ✅ New: sender ID
    p_sender_name: payload.header.sender_name || null, // ✅ New: sender name
    p_supervisor_id: payload.header.supervisor_id || null, // ✅ New: supervisor ID
    p_supervisor_name: payload.header.supervisor_name || null,
    // A cleared text goes as '' (update_grn keeps the old value for null, and the
    // screens show '' and null alike); only a missing one is null.
    p_registration: payload.header.registration ?? null,
    p_note: payload.header.note ?? null,
    // Always a boolean: null would keep the old value, so Leon could not be switched off.
    p_leon: payload.header.leon === true,
    p_pricing_mode: payload.header.pricing_mode || null, // ✅ New: pricing mode
    p_items: rpcItems,
    p_images: rpcImages,
    // Part of what the idempotency key hashes: the same form with other rates is another save.
    ...(payload.rates ? { p_rates: payload.rates } : {}),
  };

  return { normalizedItems, rpcImages, rpcRequest };
};

// Update existing GRN using update_grn RPC
// M3 Fix: Not migrated to executeRPC - extensive debug logging for troubleshooting
// field normalization, ID validation, image updates; complex stock protection handling
//
// Photo changes made in the form are applied here and nowhere earlier:
// photos picked in the form are uploaded after update_grn succeeds, and photos
// removed in the form (`options.removedImages`) are deleted after it succeeds.
// If update_grn fails, or the form is discarded, the server keeps its photos.
export const updateGRN = async (
  grnId: string,
  payload: UpdateGRNPayload,
  options: {
    removedImages?: RemovedGRNImage[];
    /**
     * The stored answer of an earlier Save that got no answer, found on the server under its request code
     * (`checkSubmission`): it is handled exactly as the answer that was lost, and nothing is sent.
     */
    storedAnswer?: unknown;
    /**
     * The check found nothing for a lost Save: the identical request is sent again, byte for byte (`resend.args`: the
     * body and request code exactly as last sent; the key is not made again, so it cannot differ from the one asked
     * about). Any failure of it that is not the server's answer leaves the attempt unsettled (`lostAnswer` again).
     */
    resend?: GRNLostAnswer;
  } = {}
) => {
  let finishMutation: (() => void) | undefined;
  // Set when update_grn was sent and no answer came back: the server may have applied it. The screen locks the
  // form and asks the server about this request's key; the same body sent again carries the same key (the edit
  // session keeps it until a save is answered), so a resend is answered from the first if that one was applied.
  let lostAnswer: GRNLostAnswer | undefined;
  // The latest send (a retry without p_rates is a second one): its key and time. No key when the server takes none.
  const sent: { last?: GRNLostAnswer } = {};
  try {
    finishMutation = beginOperatorMutation();

    const { normalizedItems, rpcImages, rpcRequest } = buildUpdateGRNRequest(grnId, payload);

    const authenticatedClient = await getAuthenticatedClient();
    // The answer is either the stored answer of an earlier Save (found by its request code: nothing is sent) or
    // the answer of update_grn.
    let data: any;
    if (options.storedAnswer !== undefined) {
      data = options.storedAnswer;
    } else {
      // Call the update_grn RPC function with correct parameters using authenticated client. The request code is the
      // edit session's key for this complete body: the same Save sent again carries the same one.
      const send = async (request: typeof rpcRequest) => {
        const key = await grnUpdateIdempotencyKey(grnId, request);
        const args = { ...request, p_idempotency_key: key };
        sent.last = { key, sentAt: Date.now(), args };
        return authenticatedClient.rpc('update_grn', args);
      };
      let answer: any;
      let error: any;
      let status: number | undefined;
      if (options.resend) {
        // The identical request, byte for byte, under the code the check was made for: nothing is rebuilt, and no key
        // is made (the first attempt, a retry without p_rates, or the retry as an older server takes it, whichever
        // was sent last, is what is repeated).
        const { key, args } = options.resend;
        sent.last = { key, sentAt: Date.now(), args };
        ({ data: answer, error, status } = await authenticatedClient.rpc('update_grn', args));
      } else {
        let sentRequest: typeof rpcRequest = rpcRequest;
        ({ data: answer, error, status } = await send(sentRequest));
        if (error && isUnknownFunctionSignature(error) && payload.rates && payload.rates.length === 0) {
          // A server without migration 86 knows no p_rates. With nothing set the app already checked that every row
          // has a stored rate, so the call as it was before rates loses nothing (and its key is the old key).
          log.warn('update_grn does not take p_rates on this server; sent without it');
          const { p_rates: _noRates, ...rest } = rpcRequest as typeof rpcRequest & { p_rates?: unknown };
          sentRequest = rest as typeof rpcRequest;
          ({ data: answer, error, status } = await send(sentRequest));
        }
        if (error && isUnknownFunctionSignature(error)) {
          // A server that has not applied migration 47 knows no p_idempotency_key and
          // refused the call before running it. Sent once more as that server takes it: with no request code, a
          // lost answer of this send cannot be asked about.
          log.warn('update_grn does not take an idempotency key on this server; sent without it');
          sent.last = undefined;
          ({ data: answer, error, status } = await authenticatedClient.rpc('update_grn', sentRequest));
        }
      }
      // With rates set, a server that still refuses the call has no p_rates (migration 86 missing).
      if (error && payload.rates && payload.rates.length > 0 && isUnknownFunctionSignature(error)) throw serverNeedsUpdateForRates();

      if (error) {
        log.error('update_grn failed', loggableError(error));
        // Sent and not answered (a dropped connection, the 60 s timeout, a gateway's 502 / 504): the save may be
        // applied. A statement timeout is an answer: nothing was saved. The HTTP status goes with the error, so a
        // gateway's answer is told from the server's own refusals. A RESEND is settled only by the server's answer:
        // any other failure of it (57014 while it waits behind the original, a failure before sending, a changed
        // session) leaves the attempt unsettled, and the screen goes back to the check.
        const failure = withHttpStatus(error, status);
        if (sent.last && (isLostAnswer(failure) || (options.resend && isUnsettledFailure(failure)))) lostAnswer = sent.last;

        // Handle stock protection errors specifically
        if (error.message?.includes('dispatches exist') || error.message?.includes('STOCK_PROTECTED')) {
          throw new Error(`Stock Protection: ${error.message}`);
        }

        throw new Error(itemGoneText(error) ?? serverText(error, t('grn.form.requestFailed'), { write: true, form: true }));
      }
      data = answer;
    }

    // RPC returns array, get first result (with safe array access)
    const rpcResult = Array.isArray(data) && data.length > 0 ? data[0] : (Array.isArray(data) ? null : data);

    if (!rpcResult || !rpcResult.success) {
      log.error('update_grn returned failure', { errorCode: rpcResult?.error_code });

      // Handle stock protection from RPC response
      if (rpcResult?.error_code === 'STOCK_PROTECTED') {
        throw new Error(`Stock Protection: ${rpcResult.message}`);
      }
      if (isRateRefusalCode(rpcResult?.error_code)) {
        throw new RateRefusal(rpcResult.error_code, serverText(rpcResult?.message ?? rpcResult?.error, t('grn.form.updateRejected'), { write: true, form: true }), rpcResult?.data);
      }

      throw new Error(itemGoneText(rpcResult) ?? serverText(rpcResult?.message, t('grn.form.updateRejected'), { write: true, form: true }));
    }

    // Saved (also when this is the stored answer of an earlier attempt,
    // `idempotent: true`): whatever is saved next is a new save with a new key.
    beginGrnEditSession(grnId);
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    // ✅ Photos removed in the form. update_grn deletes the rows it was not sent,
    // but only when it was sent at least one image, so the answer's own image
    // list decides what is left to delete.
    const remainingImageIds: Set<string> | null = Array.isArray(rpcResult.grn?.images)
      ? new Set(rpcResult.grn.images.map((image: { id: string }) => image.id))
      : null;
    let removalFailures = 0;
    const orphanedPaths: string[] = [];
    for (const removed of options.removedImages || []) {
      const stillOnGrn = remainingImageIds ? remainingImageIds.has(removed.id) : rpcImages.length === 0;
      if (stillOnGrn) {
        const deletion = await deleteGRNImage(removed.id, '');
        if (!deletion.success) removalFailures++;
      } else if (remainingImageIds && removed.storagePath) {
        orphanedPaths.push(removed.storagePath);
      }
    }
    if (orphanedPaths.length > 0) {
      // The rows are gone; the stored files are removed on a best effort.
      try {
        await authenticatedClient.storage.from('grn-images').remove(orphanedPaths);
      } catch (removeError) {
        log.warn('Could not remove the files of deleted photos', loggableError(removeError));
      }
    }

    // ✅ Photos picked in the form are uploaded now that the update succeeded.
    // A line added in this edit gets its id from update_grn's item_mapping
    // (index = position in p_items); before the save it only had a local id.
    const newLineIds = new Map<number, string>(
      (rpcResult.item_mapping || []).map(
        (mapping: { index: number; grn_trl_item_id: string }) => [mapping.index, mapping.grn_trl_item_id]
      )
    );
    const pendingPhotos = collectDeferredGRNPhotos(
      payload.header.gr_images || [],
      normalizedItems.map((item, index) => ({
        itemId: item.grn_trl_id || newLineIds.get(index),
        itemName: item.item_name,
        images: item.trl_images,
      }))
    );

    // The GRN is updated whatever happens to its photos; the caller is told which ones failed.
    const photoUpload = await uploadPhotosOfSavedGRN(grnId, pendingPhotos);
    if (photoUpload.failed.length > 0) {
      log.warn('Photos not uploaded during update', photoUpload.failed.length);
    }
    const photos: GRNPhotoSaveReport = { ...photoUpload, removalFailures };

    return {
      success: true,
      data: {
        id: rpcResult.gr_id || grnId,
        message: rpcResult.message,
        stats: rpcResult.stats as GRNUpdateStats | undefined,
        photos,
      },
    };
  } catch (error) {
    log.error('Error updating GRN with RPC', loggableError(error));

    // Provide user-friendly error messages
    let errorMessage = t('grn.form.updateFailed');
    if (error instanceof Error) {
      if (error.message.includes('Stock Protection:')) {
        errorMessage = error.message; // Keep stock protection messages as-is
      } else if (error.message.includes('dispatches exist')) {
        errorMessage = t('grn.form.dispatchedQuantityLocked');
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
      lostAnswer,
      rateError: error instanceof RateRefusal ? { code: error.code, data: error.data } : undefined,
    };
  } finally {
    finishMutation?.();
  }
};

// Load GRN data for editing
export const loadGRNData = async (grnId: string) => {
  try {

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

    // ✅ CRITICAL: Verify each item has required ID
    if (itemsData && itemsData.length > 0) {
      const missingIds = itemsData.filter(item => !item.id);
      if (missingIds.length > 0) {
        log.error(`CRITICAL: ${missingIds.length} items missing ID field!`);
      }
    }

    // Fetch GRN images. Only confirmed rows are photos: a row left 'pending' by
    // an upload that could not be cancelled has no file behind it.
    const { data: imagesData, error: imagesError } = await authenticatedClient
      .from('grn_images')
      .select('*')
      .eq('grn_id', grnId)
      .eq('image_type', 'header')
      .eq('status', 'confirmed')
      .order('display_order', { ascending: true });

    // A photo list that could not be read is not an empty one: the next Save
    // would tell update_grn to delete every photo this form did not load.
    if (imagesError) {
      log.error('Failed to fetch images', loggableError(imagesError));
      throw imagesError;
    }

    // Get signed URLs for images
    const imagesWithUrls = await Promise.all((imagesData || []).map(async (img) => {
      if (img.storage_path) {
        const { data: urlData, error: urlError } = await authenticatedClient.storage
          .from('grn-images')
          .createSignedUrl(img.storage_path, 3600); // 1 hour expiry

        if (urlError) {
          log.error('Failed to create signed URL for image', img.id, loggableError(urlError));
        }

        return {
          ...img,
          signedUrl: urlData?.signedUrl
        };
      }
      log.warn('Image has no storage_path', img.id);
      return img;
    }));

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

    // Fetch item images
    const itemIds = itemsData.map((item: any) => item.id).filter(Boolean);
    let itemImagesData: any[] = [];

    if (itemIds.length > 0) {
      const { data: itemImages, error: itemImagesError } = await authenticatedClient
        .from('grn_images')
        .select('*')
        .in('grn_item_id', itemIds)
        .eq('image_type', 'item')
        .eq('status', 'confirmed')
        .order('display_order', { ascending: true });

      // As for the header photos: an unread list fails the load.
      if (itemImagesError) {
        log.error('Failed to fetch item images', loggableError(itemImagesError));
        throw itemImagesError;
      }
      itemImagesData = itemImages || [];
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
        log.error(`CRITICAL ERROR: Database item ${index} missing ID field!`);
        throw new Error(`Database item at index ${index} is missing the required 'id' field. This indicates a database schema or query issue.`);
      }

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

    // The rates for this GRN only (migration 86). Saving sends the complete set back, so a set that
    // could not be read fails the load, like the photo lists: it must not look empty.
    const { data: details, error: detailsError } = await authenticatedClient.rpc('get_grn_details', { p_grn_id: grnId });
    if (detailsError) {
      log.error('Failed to read the rates of the GRN', loggableError(detailsError));
      throw detailsError;
    }
    // A failed read ({success:false, data:null}) is not "no rates": Save would delete the GRN's own rates.
    const grn = details?.success === true ? details?.data?.grn : null;
    if (!grn) {
      log.error('The rates of the GRN were not returned', { message: details?.message });
      throw new Error(serverText(details?.message, t('grn.form.loadFailed')));
    }
    const grnRates = grnRatesFromDetails(grn.rates);
    const grnInvoiced = grn.invoiced === true || (Array.isArray(grn.rates) && grn.rates.some((r: { archived?: unknown }) => r?.archived === true));

    // The form now shows what the server holds: saves from here on are new saves.
    beginGrnEditSession(grnId);

    return {
      success: true,
      data: { header, items, grnRates, grnInvoiced },
    };
  } catch (error) {
    log.error('Error loading GRN', loggableError(error));
    return {
      success: false,
      error: error instanceof Error ? error.message : t('grn.form.loadFailed'),
    };
  }
};
