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
 * Only the sentences listed here are turned into a reason. Everything else,
 * and above all `Error adding item: <database text>`, becomes "Not saved": no
 * database text and no stored status value ("DISPATCHED") reaches the screen.
 */
import { t } from '@/i18n';
import { formatCount } from '@/utils/formatters';
import { serverReason } from '@/utils/serverText';
import { isOfflineFailure } from '@/utils/serviceErrorHandler';

/** The failed answer of an `OrderService` cart call; only these two fields are read. */
export interface CartFailure {
  message?: unknown;
  error?: unknown;
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

/** The reason to show on a lot that was not saved. */
export function cartFailureReason(failure: CartFailure | null | undefined): string {
  const texts = [sentence(failure?.message), sentence(failure?.error)].filter(
    (text): text is string => text !== undefined
  );
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
  const refused = match(ACCESS_REFUSED);
  if (refused) return serverReason(refused[0]) ?? t('orders.catalog.reasonNotSaved');
  return t('orders.catalog.reasonNotSaved');
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

/** True when a removal was refused because the line is already gone, which is what was asked for. */
export function isAlreadyRemoved(failure: CartFailure | null | undefined): boolean {
  return [sentence(failure?.message), sentence(failure?.error)].some(text => text !== undefined && /^Order item not found$/i.test(text));
}
