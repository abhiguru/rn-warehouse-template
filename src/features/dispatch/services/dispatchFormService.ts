/**
 * Dispatch Form Service
 * Handles API calls for dispatch form operations
 * Follows GRN form service patterns adapted for dispatch requirements
 *
 * Logging rule: identifiers, codes and counts only. Headers, payloads, RPC
 * data, items and error messages never reach the console.
 */

import * as Crypto from 'expo-crypto';
import { submissionIdempotencyKey } from '@/utils/submissionIdempotency';
import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';
import type {
  DispatchHeaderData,
  DispatchItemData,
  DispatchImageData,
  CreateDispatchPayload,
  DispatchApiResponse,
  StockCheckResponse,
} from '@/types/dispatch.types';
import { uploadDeferredDispatchImages } from './dispatchImageService';
import { serverText } from '@/utils/serverText';
import { checkSubmission, isLostAnswer } from '@/utils/lostAnswer';
import { toCalendarDay } from '@/utils/formatters';
import { invalidateReportQueries } from '@/lib/queryClient';

const log = createLogger('dispatch');

/** Only the PostgREST/Postgres code of an RPC error is loggable. */
const errorCode = (error: { code?: string | null } | null | undefined) =>
  typeof error?.code === 'string' ? error.code : undefined;

/**
 * Another dispatch holds the number. The server names it (`reason: 'NUMBER_TAKEN'`, migration 120); an older server
 * answers with the unique-key error of the table, which names the key.
 */
function isNumberTakenAnswer(answer: unknown): boolean {
  if (typeof answer !== 'object' || answer === null) return false;
  const fields = answer as { reason?: unknown; code?: unknown; error_code?: unknown; error?: unknown; message?: unknown };
  if (fields.reason === 'NUMBER_TAKEN') return true;
  const code = String(fields.error_code ?? fields.code ?? '');
  const text = `${typeof fields.error === 'string' ? fields.error : ''} ${typeof fields.message === 'string' ? fields.message : ''}`;
  return code === '23505' && text.includes('dispatch_disp_no_key');
}

/** The number a refusal is about: the one the server names, else the number that was sent. */
function numberOfRefusal(answer: unknown, sent: string): string {
  const named = (answer as { number?: unknown } | null)?.number;
  return typeof named === 'string' && named.trim() !== '' ? named : sent;
}

// ============================================================================
// CHECK DISPATCH EXISTS
// ============================================================================

/**
 * Result from checkDispatchExists.
 *
 * The check only says whether the number is taken and by which dispatch. It
 * carries no items and no photos, so it must never be used to fill the form;
 * load the dispatch with `loadDispatchData` instead. `error` tells a failed
 * check apart from "not found".
 */
export interface CheckDispatchExistsResult {
  exists: boolean;
  dispatchId?: string;
  dispNo?: string;
  customerName?: string;
  date?: string;
  error?: boolean;
}

/**
 * Check if a dispatch number already exists in the database
 * Uses optimized check_dispatch_exists RPC (3-25ms vs 500-730ms direct query),
 * which answers `{ success, data: { exists, dispatch_id, disp_no, customer_name, date } }`.
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
      return { exists: false, error: true };
    }

    if (!data || data.success !== true) {
      log.error('check_dispatch_exists was refused');
      return { exists: false, error: true };
    }

    const found = data.data;
    if (!found || found.exists !== true || !found.dispatch_id) {
      log.debug('Dispatch number not found', { dispNo });
      return { exists: false };
    }

    log.debug('Dispatch number found', { dispNo, dispatchId: found.dispatch_id });

    return {
      exists: true,
      dispatchId: found.dispatch_id,
      dispNo: found.disp_no,
      customerName: found.customer_name,
      date: found.date,
    };
  } catch {
    log.error('Dispatch existence check failed', { dispNo });
    return { exists: false, error: true };
  }
};

/**
 * What a write needs so a request that gets no answer is not guessed about (owner rule D22). `onLostAnswer` is called
 * when the request may have reached the server and no answer came back: the screen locks until the server says what
 * became of it. `signal` is aborted when the person leaves; the check then stops and nothing is sent again.
 */
export interface LostAnswerOptions {
  onLostAnswer?: () => void;
  signal?: AbortSignal;
}

type RpcAnswer = { data: any; error: any; status?: number };

/**
 * Sends a write and returns the answer it gets. When the request gets no answer (`isLostAnswer`: it may have reached
 * the server; a statement timeout, 57014, is not one, nothing was saved then) the screen is told to lock, and once the
 * phone is online and the server has had time (`checkSubmission`) the server is asked about THIS attempt by its
 * request code:
 *  - found: the stored answer is used as the answer that was lost;
 *  - not found: the identical request is sent once more with the same code, and its answer is handled as any answer
 *    (if that one is lost too, this repeats).
 * Nothing is looked up by customer, date or lines. Returns null when `signal` was aborted (the person left).
 */
async function sendUntilAnswered(
  rpcName: string,
  send: () => PromiseLike<RpcAnswer>,
  requestKey: string,
  options: LostAnswerOptions
): Promise<{ data: any; error: any } | null> {
  for (;;) {
    const sentAt = Date.now();
    const { data, error, status } = await send();
    if (!error || !isLostAnswer(typeof status === 'number' ? { ...error, status } : error)) return { data, error };

    log.warn(`${rpcName} got no answer; asking the server what became of it`, { code: errorCode(error) });
    options.onLostAnswer?.();
    let check: Awaited<ReturnType<typeof checkSubmission>>;
    try {
      check = await checkSubmission(requestKey, sentAt, options.signal);
    } catch (checkError) {
      // The helper may report the person's leaving as a rejection.
      if (options.signal?.aborted) return null;
      throw checkError;
    }
    if (options.signal?.aborted) return null;
    if (check.found) {
      log.info(`${rpcName} had been saved although its answer was lost`);
      return { data: check.response, error: null };
    }
    log.info(`${rpcName} was not saved; sending the same request again`);
  }
}

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
      throw new Error(serverText(error.message, t('dispatch.service.nextNumberFailed')));
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
      errorMessage: t('dispatch.service.stockCheckFailed'),
      unwrapNested: false,
      validateSuccess: false,
    }
  );

  if (!result.success || !result.data) {
    throw new Error(serverText(result.error, t('dispatch.service.stockCheckFailed')));
  }

  log.debug('Available stock received', { grTrlId });
  return result.data;
};

/** The refusal the screens turn into "number already used, the next free one is ...". */
const numberTakenResponse = (number: string): DispatchApiResponse => ({
  success: false,
  reason: 'NUMBER_TAKEN',
  number,
  error: t('dispatch.service.duplicate'),
  message: t('dispatch.service.duplicate'),
});

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
  /** The id of the form that makes this create (see DispatchFormState.submissionNonce): hashed into the key, never sent. */
  submissionNonce?: string;
}, options: LostAnswerOptions = {}): Promise<DispatchApiResponse> => {
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
        disp_date: toCalendarDay(payload.header.disp_date), // the day, 'YYYY-MM-DD': the server takes the day from this text
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
      // The form's own id is part of the key: two forms with the same fields (a dispatch made, deleted and made again
      // with the same number) must not share a key, or the server would answer the second from the first's cache.
      p_idempotency_key: await submissionIdempotencyKey('dispatch', { ...rpcBody, nonce: payload.submissionNonce }),
    };

    log.debug('Calling create_dispatch_with_stock_check');

    // The key is the request code of this attempt: it is what the server is asked about when no answer comes back,
    // and what an identical request is sent again with.
    const answer = await sendUntilAnswered(
      'create_dispatch_with_stock_check',
      () => authenticatedClient.rpc('create_dispatch_with_stock_check', rpcPayload),
      rpcPayload.p_idempotency_key,
      options
    );
    if (!answer) return { success: false, aborted: true, error: '', message: '' };
    const { data, error } = answer;

    if (error) {
      log.error('create_dispatch_with_stock_check failed', { code: errorCode(error) });
      if (isNumberTakenAnswer(error)) {
        return numberTakenResponse(numberOfRefusal(error, payload.header.disp_no));
      }
      throw new Error(serverText(error, t('dispatch.service.createFailed'), { write: true, form: true }));
    }

    // Check if RPC returned success: false (business logic error, not Postgres error)
    if (data && data.success === false) {
      log.error('create_dispatch_with_stock_check returned failure');
      if (isNumberTakenAnswer(data)) {
        return numberTakenResponse(numberOfRefusal(data, payload.header.disp_no));
      }
      throw new Error(serverText(data.error || data.message, t('dispatch.service.createFailed'), { write: true, form: true }));
    }

    log.info('Dispatch created', { dispatchId: data?.dispatch_id });
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    // Upload deferred images if any. The dispatch is saved either way; photos
    // that did not arrive are returned so the screen can name them and offer
    // another try, instead of reporting a clean save.
    let failedPhotos: DispatchImageData[] = [];
    if (payload.images && payload.images.length > 0 && data.dispatch_id) {
      log.debug('Uploading deferred dispatch images', { imageCount: payload.images.length });

      const imageUploadResult = await uploadDeferredDispatchImages(
        data.dispatch_id,
        payload.images
      );
      failedPhotos = imageUploadResult.failed;

      if (!imageUploadResult.success) {
        log.warn('Some deferred dispatch images failed to upload', {
          uploadedCount: imageUploadResult.uploadedCount,
          failedCount: failedPhotos.length,
        });
      } else {
        log.info('Deferred dispatch images uploaded', { uploadedCount: imageUploadResult.uploadedCount });
      }
    }

    return {
      success: true,
      failed_photos: failedPhotos,
      dispatch_id: data.dispatch_id,
      dispatch_items: data.dispatch_items,
      message: serverText(data.message, t('dispatch.service.created')),
      invoice_data: data.invoice_data,
      source_order_cleared: data.source_order_cleared || false,
      source_order_id: data.source_order_id,
      // Server migration 120: how many lines of the order are still open. Absent on an older server (null: show
      // neither text).
      order_lines_left: typeof data.order_lines_left === 'number' ? data.order_lines_left : null,
    };
  } catch (error: any) {
    log.error('Dispatch creation failed');

    // Parse error message for user-friendly display
    let errorMessage = t('dispatch.service.createFailed');

    if (error.message) {
      // Check for common error patterns
      if (error.message.includes('insufficient stock')) {
        errorMessage = t('dispatch.service.insufficientStock');
      } else if (error.message.includes('back-dated')) {
        errorMessage = t('dispatch.service.beforeGrnDate');
      } else if (error.message.includes('duplicate')) {
        errorMessage = t('dispatch.service.duplicate');
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
 *
 * The save has a request code of its own (`p_dispatch_data.request_key`, migration 120): it is made when Save is
 * first tapped and kept until the save's outcome is known, that is for this whole call, however many times the
 * identical request is sent again after a lost answer (see sendUntilAnswered). A save that is tapped again later is
 * another attempt and gets another code.
 */
export const updateDispatch = async (
  dispatchId: string,
  payload: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
  },
  options: LostAnswerOptions = {}
): Promise<DispatchApiResponse> => {
  try {
    log.info('Updating dispatch', { dispatchId, itemCount: payload.items.length });

    const authenticatedClient = await getAuthenticatedClient();
    const requestKey = `warehouse-dispatch-update-${Crypto.randomUUID()}`;

    // Transform data to match RPC function format
    const rpcPayload = {
      p_dispatch_id: dispatchId,
      p_dispatch_data: {
        disp_no: payload.header.disp_no,
        disp_date: toCalendarDay(payload.header.disp_date),
        registration: payload.header.registration.toUpperCase(),
        customer_id: payload.header.customer_id,
        customer_name: payload.header.customer_name,
        supervisor_id: payload.header.supervisor_id,
        supervisor_name: payload.header.supervisor_name,
        note: payload.header.note || '',
        request_key: requestKey,
      },
      p_dispatch_items: payload.items.map((item) => ({
        gr_trl_id: item.grnItems_id,
        disp_qty: item.disp_quantity,
      })),
    };

    log.debug('Calling update_dispatch_smart', { dispatchId });

    const answer = await sendUntilAnswered(
      'update_dispatch_smart',
      () => authenticatedClient.rpc('update_dispatch_smart', rpcPayload),
      requestKey,
      options
    );
    if (!answer) return { success: false, aborted: true, error: '', message: '' };
    const { data, error } = answer;

    if (error) {
      log.error('update_dispatch_smart failed', { dispatchId, code: errorCode(error) });
      if (isNumberTakenAnswer(error)) {
        return numberTakenResponse(numberOfRefusal(error, payload.header.disp_no));
      }
      throw new Error(serverText(error, t('dispatch.service.updateFailed'), { write: true, form: true }));
    }

    if (data && data.success === false) {
      log.error('update_dispatch_smart returned failure', { dispatchId });
      if (isNumberTakenAnswer(data)) {
        return numberTakenResponse(numberOfRefusal(data, payload.header.disp_no));
      }
      throw new Error(serverText(data.error || data.message, t('dispatch.service.updateFailed'), { write: true, form: true }));
    }

    log.info('Dispatch updated', { dispatchId });
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    return {
      success: true,
      dispatch_id: data?.dispatch_id ?? dispatchId,
      message: serverText(data?.message, t('dispatch.service.updated')),
    };
  } catch (error: any) {
    log.error('Dispatch update failed', { dispatchId });
    return {
      success: false,
      error: serverText(error.message, t('dispatch.service.updateFailed'), { write: true, form: true }),
      message: serverText(error.message, t('dispatch.service.updateFailed'), { write: true, form: true }),
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
      throw new Error(serverText(rpcError.message, t('dispatch.service.loadFailed')));
    }

    if (!rpcData || !rpcData.success || !rpcData.data) {
      log.warn('get_dispatch_details returned no dispatch', { dispatchId });
      throw new Error(serverText(rpcData?.message, t('dispatch.service.notFound')));
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
      error: serverText(error.message, t('dispatch.service.loadFailed')),
    };
  }
};
