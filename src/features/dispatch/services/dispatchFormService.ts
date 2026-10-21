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
import { isUnsettledFailure, serverText, withHttpStatus } from '@/utils/serverText';
import { checkSubmission, isLostAnswer } from '@/utils/lostAnswer';
import { REFUSAL, refusalOf } from '@/utils/serverRefusal';
import { toCalendarDay } from '@/utils/formatters';
import { invalidateReportQueries } from '@/lib/queryClient';
import { forgetUnfinishedSave, rememberUnfinishedSave } from '@/services/unfinishedSaves';

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

/**
 * The refusals of migration 121 that a dispatch form words itself, by reason (the rest of the server's refusals keep the
 * ordinary failure path). Each goes back to the screen as `{ success: false, reason, refusal }` and the screen writes the
 * sentence from the reason and the fields.
 */
const WORDED_REFUSALS: ReadonlySet<string> = new Set([
  REFUSAL.STALE_RECORD,
  REFUSAL.DISPATCH_INVOICED,
  REFUSAL.DISPATCH_DATE_FUTURE,
  REFUSAL.DISPATCH_BEFORE_GRN,
  REFUSAL.ORDER_CHANGED,
  // Migration 124: a likely duplicate of a direct dispatch made in the last 30 minutes (a warning, nothing was saved).
  REFUSAL.POSSIBLE_DUPLICATE,
]);

/** The result for a refusal of the list above, or undefined when the answer is none of them. */
function wordedRefusal(answer: unknown, fallback: string): DispatchApiResponse | undefined {
  const refusal = refusalOf(answer);
  if (!refusal || !WORDED_REFUSALS.has(refusal.reason)) return undefined;
  const text = serverText(refusal.text, fallback, { write: true, form: true });
  return { success: false, reason: refusal.reason, refusal, error: text, message: text };
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
 * One send of a write. `resend` is true for every send after an answer was lost. The first send goes out on the client the
 * function got when it began; a resend gets the CURRENT authenticated client: a client holds the sign-in token it was made
 * with, and the check that precedes a resend can last minutes (offline, a slow server), long enough for the token to be
 * renewed (or to expire). A client that cannot be got (offline, the session ended, a server switch) is the failure of that
 * send, not an exception: on a resend `sendUntilAnswered` then keeps the attempt unsettled and goes back to the check.
 */
async function sendOnCurrentClient(
  first: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  resend: boolean,
  call: (client: Awaited<ReturnType<typeof getAuthenticatedClient>>) => PromiseLike<RpcAnswer>
): Promise<RpcAnswer> {
  if (!resend) return call(first);
  let current: Awaited<ReturnType<typeof getAuthenticatedClient>>;
  try {
    current = await getAuthenticatedClient();
  } catch (error) {
    return { data: null, error };
  }
  return call(current);
}

/** What `sendUntilAnswered` hands back when the attempt is settled (or the person gave up waiting on it being answered). */
interface SentAnswer {
  data: any;
  error: any;
  /**
   * The person left (the signal was aborted) while the request was on its way: the answer came, but there is nobody
   * on the form to act on it. A saved dispatch is then only reported ("saved after you left"), never touched further.
   */
  afterLeaving: boolean;
  /**
   * The identical request was sent again after a lost answer and refused for the number, twice, with a check that
   * found nothing in between: the first send may well have saved the dispatch under that number. The person is told to
   * check the list; no next number is offered.
   */
  numberMaybeSaved: boolean;
  /**
   * The person left (X) while the FIRST send was on its way and its answer was lost: no warning was given, and the
   * request may have been applied. The screen tells them to check the list before entering it again.
   */
  lostAfterLeaving: boolean;
}

/**
 * Sends a write and returns the answer that settles it. When the request gets no answer (`isLostAnswer`: it may have
 * reached the server; a statement timeout, 57014, is not one, nothing was saved then) the screen is told to lock, and
 * once the phone is online and the server has had time (`checkSubmission`) the server is asked about THIS attempt by its
 * request code:
 *  - found: the stored answer is used as the answer that was lost;
 *  - not found: the identical request is sent once more with the same code, and its answer is handled as any answer.
 *
 * Once an attempt's answer is lost it is settled only by the server's answer to it. Any failure of the resend that is
 * not such an answer (57014 while it waits behind the original, a failure before sending, a changed session, a
 * gateway error) leaves the attempt unsettled: the screen stays locked and goes back to the check; the form is never
 * unlocked for a changed body. A resend refused for the number means the first send may have saved it: back to the
 * check, and if the check still finds nothing and the resend is refused again, the person is told to check the list
 * (`numberMaybeSaved`) and no next number is offered. Nothing is looked up by customer, date or lines.
 *
 * Returns null when `signal` was aborted while the answer was unknown (the person left).
 */
async function sendUntilAnswered(
  rpcName: string,
  send: (resend: boolean) => PromiseLike<RpcAnswer>,
  requestKey: string,
  options: LostAnswerOptions
): Promise<SentAnswer | null> {
  // True once an answer was lost: every later send is a resend of the identical request.
  let resent = false;
  let takenOnResend = false;
  for (;;) {
    const sentAt = Date.now();
    const { data, error, status } = await send(resent);
    const left = options.signal?.aborted === true;
    // The HTTP status goes with the error: a gateway's 502 / 504 is told from the server's own refusals.
    const failure = error ? withHttpStatus(error, status) : null;
    const lost = failure !== null && isLostAnswer(failure);
    const unsettled = lost || (resent && failure !== null && isUnsettledFailure(failure));
    const taken = resent && isNumberTakenAnswer(failure ?? data);
    if (!unsettled && !taken) return { data, error, afterLeaving: left, numberMaybeSaved: false, lostAfterLeaving: false };
    if (taken && takenOnResend) return { data, error, afterLeaving: left, numberMaybeSaved: true, lostAfterLeaving: false };
    if (taken) takenOnResend = true;
    // The person left: nothing is asked or sent for a form that is gone. When it was the first send that got no answer
    // they were not warned (the warning belongs to the check), so the screen tells them it may have been saved.
    if (left) return resent ? null : { data, error, afterLeaving: true, numberMaybeSaved: false, lostAfterLeaving: true };

    log.warn(`${rpcName} is not settled; asking the server what became of it`, { code: errorCode(error) });
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
      return { data: check.response, error: null, afterLeaving: false, numberMaybeSaved: false, lostAfterLeaving: false };
    }
    log.info(`${rpcName} was not saved; sending the same request again`);
    resent = true;
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
  /**
   * Ask the server to warn about a likely duplicate (`warn_duplicate`, migration 124): a direct dispatch (no source order)
   * made in the last 30 minutes with the same customer, lots and vehicle. Default true; a dispatch from an order is never
   * checked and sends nothing. "Save anyway" passes false, after the person confirmed the warning. The flag is part of the
   * request body, so of the request code: the same form saved with the warning and without it are two requests.
   */
  warnDuplicate?: boolean;
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
        // Wave B (D5): the order as the form read it. The server refuses when the order changed since. Sent only when the
        // form holds it (an order read in full); part of the body the idempotency key hashes, so a resend is identical.
        ...(payload.header.source_order_updated_at ? { source_order_updated_at: payload.header.source_order_updated_at } : {}),
        // Opt-in (migration 124): a direct dispatch asks the server to check for a likely duplicate. A dispatch from an order
        // is never a duplicate (its order line is used up), and an older server ignores the key.
        ...(payload.header.source_order_id ? {} : { warn_duplicate: payload.warnDuplicate ?? true }),
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

    // Written down before the request goes out: if the app dies with the answer still lost, the next start asks the
    // server about this code (src/services/unfinishedSaves.ts).
    await rememberUnfinishedSave({
      kind: 'dispatch',
      requestKey: rpcPayload.p_idempotency_key,
      number: payload.header.disp_no,
      customerName: payload.header.customer_name,
    });

    // The key is the request code of this attempt: it is what the server is asked about when no answer comes back,
    // and what an identical request is sent again with.
    const answer = await sendUntilAnswered(
      'create_dispatch_with_stock_check',
      (resend) => sendOnCurrentClient(authenticatedClient, resend, (client) => client.rpc('create_dispatch_with_stock_check', rpcPayload)),
      rpcPayload.p_idempotency_key,
      options
    );
    // The person left while the answer was unknown, or the answer was lost and they left before being warned: still in
    // doubt, so the note stays for the next start of the app.
    if (!answer) return { success: false, aborted: true, error: '', message: '' };
    if (answer.lostAfterLeaving) return { success: false, aborted: true, maybeSaved: true, error: '', message: '' };
    // The resend was refused for the number twice: the first send may have saved it. The screen says so; no next number.
    if (answer.numberMaybeSaved) {
      return {
        success: false,
        numberMaybeSaved: true,
        number: numberOfRefusal(answer.error ?? answer.data, payload.header.disp_no),
        error: '',
        message: '',
      };
    }
    // Every other outcome is the server's own answer (saved, refused, found stored) or a failure before the request
    // left: nothing is left in doubt.
    await forgetUnfinishedSave(rpcPayload.p_idempotency_key);
    const { data, error } = answer;
    // The person left while the request was on its way: only a saved dispatch is worth a word (the screen says it was
    // saved after they left); a refusal is nobody's business any more.
    if (answer.afterLeaving && (error || !data || data.success === false)) return { success: false, aborted: true, error: '', message: '' };

    if (error) {
      log.error('create_dispatch_with_stock_check failed', { code: errorCode(error) });
      if (isNumberTakenAnswer(error)) {
        return numberTakenResponse(numberOfRefusal(error, payload.header.disp_no));
      }
      throw new Error(serverText(error, t('dispatch.service.createFailed'), { write: true, form: true }));
    }

    // Check if RPC returned success: false (business logic error, not Postgres error)
    if (data && data.success === false) {
      log.error('create_dispatch_with_stock_check returned failure', { reason: typeof data.reason === 'string' ? data.reason : undefined });
      if (isNumberTakenAnswer(data)) {
        return numberTakenResponse(numberOfRefusal(data, payload.header.disp_no));
      }
      // Wave B: the date rules (D3) and the order that moved (D5) are worded by the screen, from the reason and the fields.
      const worded = wordedRefusal(data, t('dispatch.service.createFailed'));
      if (worded) return worded;
      throw new Error(serverText(data.error || data.message, t('dispatch.service.createFailed'), { write: true, form: true }));
    }

    log.info('Dispatch created', { dispatchId: data?.dispatch_id });
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    // The person left before the answer came: the dispatch is saved, but the form and its photo files belong to someone
    // else now. Nothing is uploaded; the screen tells the person it was saved (and that any photos are still to be added).
    if (answer.afterLeaving) {
      return { success: true, aborted: true, dispatch_id: data?.dispatch_id, failed_photos: payload.images ?? [], error: '', message: '' };
    }

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
 *
 * Wave B (D1): `expectedUpdatedAt`, the dispatch's `updated_at` as the form read it, goes into `p_dispatch_data` as
 * `expected_updated_at`; the server refuses with STALE_RECORD when someone else changed the dispatch since. The key is part
 * of the request that is captured once below, so a resend after a lost answer is byte-identical; the server answers a
 * resend of one's own saved request from the stored answer of its request code, before it compares versions.
 */
export const updateDispatch = async (
  dispatchId: string,
  payload: {
    header: DispatchHeaderData;
    items: DispatchItemData[];
    expectedUpdatedAt?: string | null;
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
        // Only when the form holds it: a dispatch read from a server that sends none is saved as before.
        ...(payload.expectedUpdatedAt ? { expected_updated_at: payload.expectedUpdatedAt } : {}),
      },
      p_dispatch_items: payload.items.map((item) => ({
        gr_trl_id: item.grnItems_id,
        disp_qty: item.disp_quantity,
      })),
    };

    log.debug('Calling update_dispatch_smart', { dispatchId });

    const answer = await sendUntilAnswered(
      'update_dispatch_smart',
      (resend) => sendOnCurrentClient(authenticatedClient, resend, (client) => client.rpc('update_dispatch_smart', rpcPayload)),
      requestKey,
      options
    );
    if (!answer) return { success: false, aborted: true, error: '', message: '' };
    if (answer.lostAfterLeaving) return { success: false, aborted: true, maybeSaved: true, error: '', message: '' };
    // The resend was refused for the number twice: the first send may have saved it. The screen says so; no next number.
    if (answer.numberMaybeSaved) {
      return {
        success: false,
        numberMaybeSaved: true,
        number: numberOfRefusal(answer.error ?? answer.data, payload.header.disp_no),
        error: '',
        message: '',
      };
    }
    const { data, error } = answer;
    // The person left while the request was on its way (see createDispatch).
    if (answer.afterLeaving && (error || !data || data.success === false)) return { success: false, aborted: true, error: '', message: '' };

    if (error) {
      log.error('update_dispatch_smart failed', { dispatchId, code: errorCode(error) });
      if (isNumberTakenAnswer(error)) {
        return numberTakenResponse(numberOfRefusal(error, payload.header.disp_no));
      }
      throw new Error(serverText(error, t('dispatch.service.updateFailed'), { write: true, form: true }));
    }

    if (data && data.success === false) {
      log.error('update_dispatch_smart returned failure', { dispatchId, reason: typeof data.reason === 'string' ? data.reason : undefined });
      if (isNumberTakenAnswer(data)) {
        return numberTakenResponse(numberOfRefusal(data, payload.header.disp_no));
      }
      // Wave B: a stale dispatch (D1), a date or number that is locked by an invoice (D2) and the date rules (D3) are
      // worded by the screen, from the reason and the fields.
      const worded = wordedRefusal(data, t('dispatch.service.updateFailed'));
      if (worded) return worded;
      throw new Error(serverText(data.error || data.message, t('dispatch.service.updateFailed'), { write: true, form: true }));
    }

    log.info('Dispatch updated', { dispatchId });
    // The write changed what reports count: a report on screen asks again (SR-10).
    void invalidateReportQueries();

    // The person left before the answer came: the edit is saved; the screen tells them so.
    if (answer.afterLeaving) {
      return { success: true, aborted: true, dispatch_id: data?.dispatch_id ?? dispatchId, error: '', message: '' };
    }

    // Migration 121: the dispatch's new `updated_at` and what the edit did to the order. Both are absent on an older server.
    const orderSync = data?.order_sync;
    return {
      success: true,
      dispatch_id: data?.dispatch_id ?? dispatchId,
      message: serverText(data?.message, t('dispatch.service.updated')),
      ...(typeof data?.updated_at === 'string' ? { updated_at: data.updated_at } : {}),
      ...(orderSync && typeof orderSync === 'object'
        ? {
            order_sync: {
              given_back: Number(orderSync.given_back) || 0,
              taken: Number(orderSync.taken) || 0,
            },
          }
        : {}),
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
    /** The dispatch's `updated_at` as read: the version token of the save (wave B, D1). Absent when the server sends none. */
    updatedAt?: string;
    /** The number of the live invoice a line of the dispatch is on (wave B, D2); absent when it is on none. */
    invoicedNumber?: string;
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

    // A line on a live invoice carries `invoice_details` (the server leaves it out for a deleted invoice). The dispatch is
    // on that invoice: its date and number are locked (D2). Lines that were skipped above (no GRN details) still count.
    const invoicedLine = (dispatch.items || []).find((item: any) => item?.invoice_details);
    const invoicedNumber: string | undefined = invoicedLine
      ? String(invoicedLine.invoice_details.invoice_no ?? '')
      : undefined;
    const updatedAt: string | undefined =
      typeof dispatch.updated_at === 'string' && dispatch.updated_at !== '' ? dispatch.updated_at : undefined;

    log.info('Dispatch loaded', { dispatchId, itemCount: items.length });

    return {
      success: true,
      data: {
        header,
        items,
        ...(updatedAt !== undefined ? { updatedAt } : {}),
        ...(invoicedNumber !== undefined ? { invoicedNumber } : {}),
      },
    };
  } catch (error: any) {
    log.error('Dispatch load failed', { dispatchId });
    return {
      success: false,
      error: serverText(error.message, t('dispatch.service.loadFailed')),
    };
  }
};
