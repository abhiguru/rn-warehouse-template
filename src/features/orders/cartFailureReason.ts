/**
 * Why a lot was not saved to an order, in the app's own words, for the lot's
 * row in the Add items picker.
 *
 * The three cart functions (backend migration 28: add_item_to_order,
 * update_order_item_quantity, remove_item_from_order) answer a refusal in
 * English. What `OrderService` hands back holds that sentence in one of two
 * places:
 *
 *  - a refusal sent as the answer (`{success:false, message, error?}`): the
 *    sentence is in `message`; `error` is `{code:'ORDER_NOT_OPEN'}` for an order
 *    that is no longer open, otherwise the placeholder 'API_ERROR';
 *  - a raised exception (the 42501 access refusals) or a failed request:
 *    `message` is the app's own text for the action and the raw text is in
 *    `error`.
 *
 * In Gujarati `message` is the app's own text and `error` may be the placeholder, so the server's sentence
 * is also kept in `serverMessage` (what `executeRPC` reads from the answer, before it is turned into text):
 * every sentence below is matched in all three.
 *
 * Only the sentences listed here are turned into a reason. Everything else,
 * and above all `Error adding item: <database text>`, becomes "Not saved": no
 * database text and no stored status value ("DISPATCHED") reaches the screen.
 */
import { t } from '@/i18n';
import { formatCount } from '@/utils/formatters';
import { isLostAnswer } from '@/utils/lostAnswer';
import { serverReason } from '@/utils/serverText';
import { isOfflineFailure } from '@/utils/serviceErrorHandler';

/** The failed answer of an `OrderService` cart call; only these three fields are read. */
export interface CartFailure {
  message?: unknown;
  error?: unknown;
  /** The server's own sentence as it sent it (English), which `message` no longer holds in Gujarati. */
  serverMessage?: unknown;
}

const STOCK = /^Insufficient stock\. Available: (-?\d+), Requested: -?\d+$/i;
const ALREADY_IN_ORDER = /^Item already exists in order$/i;
const BELOW_DISPATCHED = /^Quantity cannot be below the (\d+) already dispatched$/i;
const ORDER_CLOSED = /^Cannot (add items to|change items on|remove items from) .+ orders$/i;
// The 42501 texts of warehouse_security.authorize_rpc and of add_item_to_order.
const ACCESS_REFUSED =
  /^(Item belongs to another customer|Customer access denied|Staff access required|Administrator required|Active account required)$/i;

const sentence = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** Every sentence a failure carries: the app's text, the raw error, and the server's own sentence. */
const sentencesOf = (failure: CartFailure | null | undefined): string[] =>
  [sentence(failure?.message), sentence(failure?.error), sentence(failure?.serverMessage)].filter(
    (text): text is string => text !== undefined
  );

/** The server's code for the refusal: `error` as `{code}`, or the code itself. */
function codeOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

const bags = (count: string) => formatCount(Math.max(0, parseInt(count, 10)), 'bag');

/** What the caller knows about the call that failed. */
export interface CartFailureContext {
  /**
   * The call was for a line the app has read on the order (a change or a removal of it). A missing line
   * ("Order item not found") then means the line was taken off since.
   */
  lineKnown?: boolean;
  /**
   * A read of the order made after the failure no longer has the line. A customer login on an older facility
   * is answered "Customer access denied" for a line that is gone (the server finds the customer through the
   * line); only this read tells that from a real refusal, so without it the sentence is a refusal.
   */
  lineConfirmedGone?: boolean;
  /** The bags the person chose, for the "removed by someone else" sentence of a change. */
  chosen?: number;
  /** The call took the lot off the order: a lost answer is then "checking whether it was deleted", not saved. */
  removal?: boolean;
}

/** The reason to show on a lot that was not saved. */
export function cartFailureReason(failure: CartFailure | null | undefined, context?: CartFailureContext): string {
  const texts = sentencesOf(failure);
  const match = (pattern: RegExp) => {
    for (const text of texts) {
      const found = pattern.exec(text);
      if (found) return found;
    }
    return null;
  };

  const stock = match(STOCK);
  if (stock) return t('orders.catalog.reasonStock', { bags: bags(stock[1]) });
  if (match(ALREADY_IN_ORDER)) return t('orders.catalog.reasonAlreadyInOrder');
  const dispatched = match(BELOW_DISPATCHED);
  if (dispatched) return t('orders.catalog.reasonBelowDispatched', { bags: bags(dispatched[1]) });
  if (codeOf(failure?.error) === 'ORDER_NOT_OPEN' || match(ORDER_CLOSED)) return t('orders.catalog.reasonOrderClosed');
  if (context?.lineKnown && (isAlreadyRemoved(failure) || (context.lineConfirmedGone && isCustomerAccessDenied(failure)))) {
    return context.chosen !== undefined && context.chosen > 0
      ? t('orders.catalog.reasonRemovedMeanwhile', { chosen: bags(String(context.chosen)) })
      : t('orders.catalog.reasonLineGone');
  }
  // The request went out and no answer came (a timeout, a connection that dropped): the lot may be on the order
  // (or, for a removal, may be off it). The editor checks it (waits, reads the order) and shows the server's state;
  // until then the lot says it is being checked.
  if (mayHaveBeenSaved(failure)) return t(context?.removal ? 'errors.lostAnswer.checkingDelete' : 'errors.lostAnswer.checking');
  const refused = accessRefusalText(failure);
  if (refused) return refused;
  return t('orders.catalog.reasonNotSaved');
}

/** The permission text for an access refusal of the cart functions (the 42501 sentences); undefined for any other failure. */
export function accessRefusalText(failure: CartFailure | null | undefined): string | undefined {
  for (const text of sentencesOf(failure)) {
    const found = ACCESS_REFUSED.exec(text);
    if (found) return serverReason(found[0]) ?? t('orders.catalog.reasonNotSaved');
  }
  return undefined;
}

/**
 * True when a cart call failed without an answer from the server: the request
 * timed out, could not be sent, or the connection broke. `OrderService` hands
 * such a failure back with the transport's own text in `error` ("TimeoutError:
 * Request timeout", "TypeError: Network request failed"), and the app's
 * connectivity test classes that text as it does for every other service.
 *
 * A refusal is an answer and is never one of these: its `error` is the
 * placeholder 'API_ERROR', a `{code}`, or the sentence the server raised.
 * Neither is a session that ended or changed (`isOfflineFailure` excludes it).
 */
export function isConnectionFailure(failure: CartFailure | null | undefined): boolean {
  const raw = sentence(failure?.error);
  // As an error object, the shape the PostgREST client gave it: a bare string is not classed.
  return raw !== undefined && isOfflineFailure({ message: raw });
}

/**
 * True when a cart call failed after the request went out with no answer (a timeout, a dropped or reset
 * connection, a gateway's error page): the change may have been applied. A failure before the request
 * left the phone (offline, no session that could be renewed) is not one: nothing was sent. The same rule
 * as every other screen's lost answer (`isLostAnswer`).
 */
export function mayHaveBeenSaved(failure: CartFailure | null | undefined): boolean {
  const raw = sentence(failure?.error);
  // As an error object, the shape the PostgREST client gave it: a bare string is not classed.
  return raw !== undefined && isLostAnswer({ message: raw });
}

/** True when a removal or change was refused because the line is already gone ("Order item not found"): for certain. */
export function isAlreadyRemoved(failure: CartFailure | null | undefined): boolean {
  return sentencesOf(failure).some(text => /^Order item not found$/i.test(text));
}

/**
 * True when the server said "Customer access denied". For a customer login on an older facility that is
 * what a line that is gone is answered (the server finds the customer through the line, and a line that
 * is gone has none), but it is also the answer to a real refusal: only a read of the order that no longer
 * has the line tells which (see `CartFailureContext.lineConfirmedGone`).
 */
export function isCustomerAccessDenied(failure: CartFailure | null | undefined): boolean {
  return sentencesOf(failure).some(text => /^Customer access denied$/i.test(text));
}

/**
 * True when a change or removal of a line the app has read may have failed because the line is gone: the
 * server says "Order item not found" (for certain), or "Customer access denied" (only a read can tell).
 * Only for a call about a line the caller knows; for any other call "access denied" is a refusal.
 */
export function isLineGone(failure: CartFailure | null | undefined): boolean {
  return isAlreadyRemoved(failure) || isCustomerAccessDenied(failure);
}

/**
 * True when `get_or_create_cart` refused because the business is deactivated or deleted
 * (backend migration 80: `RAISE EXCEPTION 'Business is not active'`, SQLSTATE P0001).
 * `OrderService.getOrCreateOrder` hands back the raised text in `error`. Only that
 * sentence counts; any other failure keeps the generic handling.
 */
export function isBusinessInactive(failure: CartFailure | null | undefined): boolean {
  return sentencesOf(failure).some(text => /^Business is not active$/i.test(text));
}
