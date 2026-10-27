/**
 * Text that came from the facility's server, made fit to show.
 *
 * The server answers in English. In English the app shows that text as it always
 * did. In any other language an English sentence is no use to the reader, so the
 * app shows its own words: the reason, when the server text names one the app
 * knows (no permission, not found, not enough stock ...), and otherwise the
 * caller's own message for what was being done.
 */
import { t, type TranslationKey } from '@/i18n';
import { getLanguage } from '@/i18n/language';
import { getAppErrorCode } from '@/utils/appError';

/** Reasons the server gives, by the words it uses for them. The first match wins. */
const REASONS: [RegExp, TranslationKey][] = [
  // "X not found or access denied": the record is missing as far as this person can tell.
  [/not found or access denied/, 'errors.parsed.itemNotFound'],
  // Business state (server migrations 80, 82 and 83). Both are also worded in English (see APP_WORDED).
  [/^this business is deactivated\. activate it in customers to receive new goods\.?$/, 'errors.parsed.businessDeactivated'],
  [/^business is not active\.?$/, 'errors.parsed.businessNotActive'],
  // An access token the server found expired (PostgREST: 401 "JWT expired", PGRST301 / PGRST303; the edge functions' own sentence).
  [/session expired|not authenticated|authentication required|invalid refresh token|jwt expired|invalid or expired access token/, 'errors.code.sessionExpired'],
  [
    /access denied|permission|only admins?\b|only administrators|only supervisors|supervisors cannot|staff access required|administrator required|you cannot change your own|self_edit_forbidden|cannot_modify_admin|cannot_promote_to_admin/,
    'errors.parsed.noPermission',
  ],
  // Stock, a lot or an item that is not the document's customer's.
  [/(another|different|other) customer/, 'errors.parsed.otherCustomer'],
  [/cannot change the customer of a grn/, 'errors.parsed.grnCustomerLocked'],
  // Invoice rules (server migration 41). "Already invoiced" is not a duplicate number.
  [/line charge must be between/, 'errors.parsed.invoiceChargeRange'],
  [/line labour rate must be between/, 'errors.parsed.invoiceLabourRange'],
  [/line tax must be between/, 'errors.parsed.invoiceTaxRange'],
  [/grn is already invoiced/, 'errors.parsed.grnAlreadyInvoiced'],
  [/already on another invoice/, 'errors.parsed.lineOnOtherInvoice'],
  [/invoice that has payments/, 'errors.parsed.invoiceHasPayments'],
  // Invoice line checks (assert_invoice_lines). The first sentence has the word
  // "duplicate" in it and is not "this entry already exists".
  [/missing, duplicate or unrelated dispatch line/, 'errors.parsed.invoiceLinesChanged'],
  [/invoice requires at least one dispatch line/, 'errors.parsed.invoiceNeedsLine'],
  [/invoice customer and grn must match/, 'errors.parsed.invoiceCustomerMismatch'],
  [/discount exceeds the invoice amount/, 'errors.parsed.discountTooLarge'],
  [/reason is required for an invoice discount/, 'errors.parsed.discountReasonRequired'],
  // A line with a charge of 0 and no reason from staff (server migration 48).
  [/reason for the zero charge/, 'errors.parsed.zeroChargeReasonRequired'],
  // Users and enrollment review.
  [/10-digit indian mobile number/, 'errors.parsed.mobileInvalid'],
  [/customer assignment/, 'errors.parsed.customerAssignmentRequired'],
  // Photo rules (server migration 43): a photo is confirmed only for a file in
  // its own document's folder. save_grn wraps these as "Error creating GRN: <text>".
  [/image path does not belong to this (grn|dispatch)/, 'errors.parsed.imageWrongDocument'],
  [/image file is not in storage/, 'errors.parsed.imageNotStored'],
  [/image path is attached to a different image record/, 'errors.parsed.imageAlreadyAttached'],
  [/image line does not belong to this grn/, 'errors.parsed.imageWrongLine'],
  [/image path is required/, 'errors.parsed.imagePathRequired'],
  [/insufficient stock/, 'errors.code.insufficientStock'],
  [/delete invoices first|cannot delete item|cannot modify invoiced|is pending tally sync/, 'errors.parsed.inUse'],
  [/already exists|duplicate|overlapping/, 'errors.parsed.duplicate'],
  [/not found/, 'errors.parsed.itemNotFound'],
  [/transaction conflict|too many retries|deadlock|could not serialize/, 'errors.parsed.busy'],
  [/network request failed|failed to fetch|fetch failed/, 'errors.parsed.network'],
];

/**
 * Server sentences the app words itself in English too: the bare "Business is not active" says little.
 */
const APP_WORDED: TranslationKey[] = ['errors.parsed.businessDeactivated', 'errors.parsed.businessNotActive'];

/** Sentences the app wrote itself that may reach serverText again; they would look like developer text ("violates"). */
const APP_OWN_TEXT: TranslationKey[] = [
  'errors.code.businessRuleViolation',
  'errors.parsed.network',
  'errors.parsed.timeoutWrite',
  'errors.parsed.timeoutWriteForm',
  'errors.parsed.timeoutWritePhoto',
  'errors.parsed.timeoutDelete',
  'errors.parsed.timeoutDeleteForm',
  'errors.parsed.timeoutNotSaved',
];

/**
 * True for a sentence written in Gujarati: more Gujarati letters than Latin
 * ones. An English server sentence that only names a Gujarati item or customer
 * ('Cannot delete item "લસણ" - has 3 existing dispatches') is not one, and a
 * sentence of the app's own that carries a code or a number ("A0010", "OTP") is.
 */
function writtenInGujarati(text: string): boolean {
  const gujarati = text.match(/[઀-૿]/g)?.length ?? 0;
  if (gujarati === 0) return false;
  return gujarati > (text.match(/[A-Za-z]/g)?.length ?? 0);
}

/**
 * save_invoice(jsonb) reports a refusal as "Database error: <text> (SQLState: <code>)".
 * The wrapper says nothing to the reader, so only the text inside is kept.
 */
function unwrapDatabaseError(text: string): string {
  const wrapped = /^Database error:\s*([\s\S]*?)\s*\(SQLState:\s*[^)]*\)\s*$/.exec(text);
  return wrapped ? wrapped[1] : text;
}

/**
 * The name the PostgREST client puts before the text of an error that was thrown inside fetch:
 * "TimeoutError: Request timeout", "TypeError: Network request failed", "AppError: <the app's own
 * sentence, in the language it was made in>". The name is a class name, never something to show.
 */
const NAME_PREFIX = /^\s*([A-Z][A-Za-z]*(?:Error|Exception)|Error):\s*/;

/** The text without such class names in front of it; a text that has none comes back as it was. */
export function stripErrorPrefix(text: string): string {
  let rest = text;
  for (let i = 0; i < 3; i += 1) {
    const found = NAME_PREFIX.exec(rest);
    if (!found) break;
    rest = rest.slice(found[0].length);
  }
  return rest;
}

/** The reason a server text names, in the app's language; undefined when it names none the app knows. */
export function serverReason(text: string): string | undefined {
  const lower = unwrapDatabaseError(stripErrorPrefix(text)).trim().toLowerCase();
  const match = REASONS.find(([pattern]) => pattern.test(lower));
  return match ? t(match[1]) : undefined;
}

// -----------------------------------------------------------------------------
// What kind of failure was it? Screens that want their own text for a network
// failure, a timeout or one code ask here instead of reading error text.
//
//   isNetworkError(err)   no answer could be had: no connection, a dropped or aborted request
//   isTimeoutError(err)   the app (or the server) gave up waiting
//   requestMayHaveBeenSent(err)
//                         the failure came after the request went out, so a write may have been applied
//   isSessionExpiredError(err)
//                         the server found the access token expired (PGRST301 / PGRST303, "JWT expired")
//   errorCodeOf(err)      the code: Postgres SQLState, PostgREST code, or the server's own
//                         (PERMISSION_DENIED ...); undefined when there is none
//   transportText(err)    the app's sentence for a network failure or timeout; undefined for any other error
//
// `err` is whatever failed: an Error, a Supabase error object, a service result
// ({ error, errorCode }) or the server's text. A failure is told by the app's error
// codes, by the error's class name ("TimeoutError"; the PostgREST client keeps it as
// the first word of the text) and by the app's own sentences, never by the words of a
// translation; only the English text of the system and the server is matched by words.
// -----------------------------------------------------------------------------

/** The text inside an error: a string as it is, an object's `message` (or `error`). */
function textOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const { message, error: inner } = error as { message?: unknown; error?: unknown };
    if (typeof message === 'string') return message;
    if (typeof inner === 'string') return inner;
  }
  return undefined;
}

/**
 * Both texts of an error: a service result keeps the app's words in `message` and the
 * raw failure in `error`, and either may be the one that says "network" or "timed out".
 */
function textsOf(error: unknown): string[] {
  if (typeof error === 'string') return [error];
  if (typeof error === 'object' && error !== null) {
    const { message, error: inner } = error as { message?: unknown; error?: unknown };
    return [message, inner].filter((value): value is string => typeof value === 'string');
  }
  return [];
}

/**
 * What the system says when no answer came: fetch failures, dropped sockets. (An "abort" is not
 * here: Postgres says "current transaction is aborted" for a statement that failed.)
 */
const NETWORK_TEXT =
  /network request failed|network connection|network error|networkerror|failed to fetch|fetch failed|load failed|no internet|internet is not reachable|connection (error|failed|lost|refused|reset)|econn(refused|reset|aborted)|enotfound|socket|unable to resolve host|network is unreachable|appears to be offline|hostname could not be found|could not connect to the server|no route to host|host unreachable|ehostunreach|sslhandshake|certpathvalidator|trust anchor|invalid response was received from the upstream server|upstream server is timing out|upstream request timeout/i;

/**
 * What the system says when a request never left the device: the host name could not be looked up,
 * nothing was listening, there is no route, or the connection could not be opened in time
 * ("fetch failed: Unable to resolve host ..." from expo/fetch on Android), and what the app's own
 * raise before a request says (no usable session, a changed session, a server switch). The words
 * the app puts in a sentence of its own ("No internet connection") are in here as well.
 */
const NOT_SENT_TEXT =
  /unable to resolve host|no address associated|unknownhost|enotfound|econnrefused|connection refused|failed to connect to|network is unreachable|enetunreach|connect(ion)? timed out|connect timeout|connect etimedout|appears to be offline|hostname could not be found|could not connect to the server|no route to host|host unreachable|ehostunreach|sslhandshake|certpathvalidator|trust anchor|no internet|internet is not reachable|session refresh unavailable|session changed|identity verification|server switch|sign in required/i;

/**
 * A proxy's own answer reached the app instead of the server's: an HTML error page, or
 * Cloudflare's plain "error code: 1033". Nobody can use it, and it means the server was not reached.
 */
const PROXY_TEXT = /^\s*</;
const PROXY_CODE_TEXT = /^error code:\s*\d+/i;
/** Cloudflare's own errors 1000-1999 (tunnel down, origin DNS ...): the facility's server was not reached. */
const PROXY_NOT_REACHED_TEXT = /^error code:\s*1\d{3}\b/i;

/** What the app and the server say when they stop waiting ("time outside" is not one). */
const TIMEOUT_TEXT = /\btimed out\b|\btime ?out\b|\betimedout\b/i;

/** The code of a failure; undefined when it has none. */
export function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const fields = error as Record<string, unknown>;
    for (const key of ['errorCode', 'error_code', 'code']) {
      const value = fields[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  }
  const text = textOf(error)?.trim();
  if (!text) return undefined;
  const sqlState = /\(SQLState:\s*([^)\s]+)\)/.exec(text);
  if (sqlState) return sqlState[1];
  // The server sometimes answers with the code alone (PERMISSION_DENIED).
  return /^[A-Z][A-Z0-9_]{2,}$/.test(text) ? text : undefined;
}

/** The `code` of the gateway's answer while the facility's server is being upgraded (HTTP 503, docs/API_CONTRACT.md). */
export const UPGRADING_CODE = 'upgrading';

/** `code` of the error discovery throws for an HTTP 429 (the facility answered: it is rate limiting this phone). */
export const DISCOVERY_BUSY_CODE = 'discovery_busy';

/**
 * True when the gateway answered "the server is being updated". It answered before anything reached a service, so
 * the request did NOT run: it is a definite "not saved", neither a lost answer nor a lost connection.
 */
export function isUpgradingAnswer(error: unknown): boolean {
  return errorCodeOf(error) === UPGRADING_CODE;
}

/**
 * The body of an edge function's answer when it is the gateway's upgrading answer (`/functions/v1/` is answered with the
 * same 503 body as the REST API), else undefined. The functions are called with plain fetch, so there is no error object
 * to carry the code: a caller shows `serverText(upgradingBody(body) ?? body.error, ...)`, which words it in the app's language.
 */
export function upgradingBody(body: unknown): { code: string } | undefined {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === UPGRADING_CODE
    ? (body as { code: string })
    : undefined;
}

/**
 * A gateway's own answer (Kong's JSON 502 "An invalid response was received from the upstream server",
 * 504 "The upstream server is timing out"): an error object that carries the HTTP status (`status`, as
 * the PostgREST client's answer has it) of 502 or more and none of PostgREST's own codes (PGRST...).
 * The request reached the gateway and the server did not answer it, so a write may have been applied.
 */
function isGatewayAnswer(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status } = error as { status?: unknown };
  if (typeof status !== 'number' || status < 502) return false;
  return !/^PGRST/i.test(errorCodeOf(error) ?? '');
}

/** True when the request got no answer: no connection, a dropped or aborted request, a gateway that gave up. */
export function isNetworkError(error: unknown): boolean {
  if (getAppErrorCode(error) === 'NETWORK') return true;
  // The upgrade answer is a 503 too, but a request it refuses never ran: not a lost connection, not a gateway that gave up.
  if (isUpgradingAnswer(error)) return false;
  if (isTimeoutError(error)) return false;
  if (errorCodeOf(error) === 'NETWORK') return true;
  if (isGatewayAnswer(error)) return true;
  return textsOf(error).some(text => NETWORK_TEXT.test(text) || PROXY_TEXT.test(text) || PROXY_CODE_TEXT.test(text.trim()));
}

/** True when an error, or a text that starts with the name of one, is of the named class ("TimeoutError"). */
function hasErrorName(error: unknown, name: string): boolean {
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === name) return true;
  return textsOf(error).some(text => NAME_PREFIX.exec(text)?.[1] === name);
}

/**
 * The app's own sentences for a request it stopped waiting for. A timeout thrown inside the gated
 * fetch comes back from the PostgREST client as "AppError: <the sentence>" with its code lost; in
 * Gujarati the sentence has none of the English words, so it is told by being the app's own.
 */
const APP_TIMEOUT_TEXT: TranslationKey[] = [
  'errors.network.requestTimedOut',
  'errors.network.authTimedOut',
  'errors.network.rpcTimedOut30',
  'errors.code.timeout',
  'errors.category.timeout',
];

/** True when the app or the server stopped waiting (TimeoutError, 57014, "timed out"). */
export function isTimeoutError(error: unknown): boolean {
  if (getAppErrorCode(error) === 'TIMEOUT') return true;
  // The name of the error class is not translated; the PostgREST client keeps it as the first word of the text.
  if (hasErrorName(error, 'TimeoutError')) return true;
  const code = errorCodeOf(error);
  if (code === 'TIMEOUT' || code === '57014' || code === 'ETIMEDOUT') return true;
  const texts = textsOf(error);
  if (texts.some(text => APP_TIMEOUT_TEXT.some(key => stripErrorPrefix(text).trim() === t(key)))) return true;
  return texts.some(text => TIMEOUT_TEXT.test(text));
}

/**
 * True when a network failure or a timeout came before the request left the device, so nothing
 * can have been saved:
 *  - the app raised it itself, without asking (an AppError with code NETWORK from the offline
 *    check or from a session that could not be renewed, or the gate's "Session changed");
 *  - the system could not open the connection (host not found, refused, no route, connect timeout).
 * Everything else after the request was handed over is "after": a dropped or reset connection, a
 * proxy's error page, a timeout. The server may have applied the write.
 */
function failedBeforeSending(error: unknown): boolean {
  const appCode = getAppErrorCode(error);
  if (appCode) return appCode !== 'TIMEOUT';
  // A gateway answered 502 or more: the request had been handed over.
  if (isGatewayAnswer(error)) return false;
  const texts = textsOf(error);
  if (texts.some(text => NOT_SENT_TEXT.test(text) || PROXY_NOT_REACHED_TEXT.test(text.trim()))) return true;
  if (isTimeoutError(error)) return false;
  // A network failure with none of the system's words for a lost connection and no proxy page is a
  // sentence of the app's own ("No internet connection", with the code NETWORK): it never asked.
  return !texts.some(text => NETWORK_TEXT.test(text) || PROXY_TEXT.test(text) || PROXY_CODE_TEXT.test(text.trim()));
}

/**
 * True when a write that failed this way may have been applied: the failure is a timeout or a
 * network failure that came after the request went out (see failedBeforeSending). False for a
 * failure before sending, for a statement timeout (the server rolled it back) and for any answer.
 */
export function requestMayHaveBeenSent(error: unknown, code?: string): boolean {
  if (isStatementTimeout(error, code)) return false;
  if (!isTimeoutError(error) && !isNetworkError(error)) return false;
  return !failedBeforeSending(error);
}

/**
 * True when a change failed with no answer after the request may have reached the server (a timeout, a dropped
 * connection, a gateway's 502 / 504 answer or error page): a LOST ANSWER (owner rule D22). False for a failure before
 * the request left the phone (offline, no session), for any answer the server gave, and for SQLSTATE 57014: a
 * statement timeout rolled back, so nothing was saved. `err` is whatever failed (an Error, a Supabase error carrying
 * its HTTP `status`, a service result `{ error, message }`); `code` is its code when `err` does not carry it.
 *
 * This is the one definition. `executeRPC` (utils/serviceErrorHandler) computes it where it still has the HTTP status
 * and the SQL code and returns it as `lostAnswer`; services that call `rpc` themselves merge the status into the error
 * and ask here. Nothing else re-classifies a failure from its text.
 */
export function isLostAnswer(error: unknown, code?: string): boolean {
  return requestMayHaveBeenSent(error, code);
}

/**
 * A PostgREST error with the HTTP status of its answer, so a gateway's 502 / 504 is told from the server's own refusals
 * (`isLostAnswer` reads `status`). Copied field by field: postgrest-js hands a transport failure back as a
 * PostgrestError, a class that extends Error whose `message` is not enumerable, so a spread would drop the text that says
 * "Network request failed". Without a status (or a non-object error) the error comes back as it is.
 */
export function withHttpStatus(error: unknown, status?: number): unknown {
  if (typeof status !== 'number' || typeof error !== 'object' || error === null) return error;
  const raised = error as { message?: unknown; name?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    ...(error as object),
    ...(typeof raised.message === 'string' ? { message: raised.message } : {}),
    ...(typeof raised.name === 'string' ? { name: raised.name } : {}),
    ...(typeof raised.code === 'string' ? { code: raised.code } : {}),
    ...(typeof raised.details === 'string' ? { details: raised.details } : {}),
    ...(typeof raised.hint === 'string' ? { hint: raised.hint } : {}),
    status,
  };
}

/**
 * True when a failure is NOT the server's answer to the request: it says nothing about whether the change was applied.
 * A lost answer (see `isLostAnswer`), a statement timeout (57014: also what a request waiting behind the original,
 * still running, runs into), a failure before the request left the phone (offline, no session, "Session changed"), an
 * expired token (refused before it ran). Used for a RESEND after a lost answer (owner rule D22): such a failure does
 * not settle the attempt, so the screen stays locked and goes back to the check; it never unlocks the form for a
 * changed body. An answer the server gave (a refusal such as insufficient stock, the number is taken) is not one.
 */
export function isUnsettledFailure(error: unknown, code?: string): boolean {
  const appCode = getAppErrorCode(error);
  if (appCode) return appCode !== 'REFUSED';
  // A RESEND refused by the upgrade answer says nothing about the ORIGINAL request, which may have landed before the
  // gateway closed: the attempt stays unsettled and goes back to the check.
  if (isUpgradingAnswer(error)) return true;
  if (isStatementTimeout(error, code)) return true;
  if (isTimeoutError(error) || isNetworkError(error)) return true;
  if (isSessionExpiredError(error, code)) return true;
  return textsOf(error).some(text => NOT_SENT_TEXT.test(text));
}

/**
 * True when the server found the access token expired (PostgREST PGRST301 / PGRST303, or the text
 * "JWT expired" of a 401). The person is told their login has expired.
 */
export function isSessionExpiredError(error: unknown, code?: string): boolean {
  const found = code ?? errorCodeOf(error);
  if (found === 'PGRST301' || found === 'PGRST303') return true;
  return textsOf(error).some(text => /^jwt expired$/i.test(stripErrorPrefix(text).trim()));
}

/**
 * The sentence for an expired access token, or undefined when the error is not one.
 *
 * The app renews the session by itself, but a request that was refused for an expired token is not sent
 * again. For a change (`write` or `delete`) that was refused with PGRST303 or the bare text "JWT expired"
 * the session is already renewed, so the person is told to press the button again. PGRST301 and a read
 * keep the "session expired, sign in again" text; a session that could not be renewed at all ends in the
 * sign-in screen, not here.
 */
export function expiredSessionText(error: unknown, options: ServerTextOptions = {}): string | undefined {
  if (!isSessionExpiredError(error, options.code)) return undefined;
  const code = options.code ?? errorCodeOf(error);
  if ((options.write || options.delete) && code !== 'PGRST301') {
    return t(options.delete ? 'errors.code.signInRenewedDelete' : 'errors.code.signInRenewed');
  }
  return t('errors.code.sessionExpired');
}

/** True for SQLSTATE 57014: the server cancelled the statement, which rolled back. Nothing was saved. */
export function isStatementTimeout(error: unknown, code?: string): boolean {
  return (code ?? errorCodeOf(error)) === '57014';
}

export interface ServerTextOptions {
  /**
   * The request changes data. A timeout, and any other network failure that came after the request
   * went out, then says it may have been saved; for a read, and for a failure before the request
   * left the device (offline, no session), it is only a network failure ("Check your connection").
   * A screen that runs the lost-answer check itself (`isLostAnswer`, `checkSubmission` in
   * `@/utils/lostAnswer`: the forms and the order lines) does not show these "may have been saved"
   * texts; they are for the places that have no check (lists, user and settings screens).
   */
  write?: boolean;
  /**
   * With `write`: the screen is a form (no pull to refresh; the person typed and pressed Save or Add).
   * A timeout then says to go back to the list and check, not to pull down. A text that a shared
   * service already worded for a list ("... Pull down to check.") is changed to the form's wording, and the other way round.
   */
  form?: boolean;
  /**
   * With `write`: the request is a photo upload, removal or delete. A timeout then says the photo
   * change may have gone through and to check the photos on this screen (wins over `form`).
   */
  photo?: boolean;
  /**
   * The request deletes something (it counts as a `write`). A timeout then says it may have been deleted,
   * not saved (`form` still picks the detail-screen wording; `photo` wins over this).
   */
  delete?: boolean;
  /** The failure's code, when the text passed in does not carry it. */
  code?: string;
}

const TIMEOUT_WRITE_KEYS: TranslationKey[] = [
  'errors.parsed.timeoutWrite',
  'errors.parsed.timeoutWriteForm',
  'errors.parsed.timeoutWritePhoto',
  'errors.parsed.timeoutDelete',
  'errors.parsed.timeoutDeleteForm',
];

/** Which timeout sentence a write gets: photo, delete, form or list (pull to refresh). */
function timeoutWriteKey(options: ServerTextOptions): TranslationKey {
  if (options.photo) return 'errors.parsed.timeoutWritePhoto';
  if (options.delete) return options.form ? 'errors.parsed.timeoutDeleteForm' : 'errors.parsed.timeoutDelete';
  return options.form ? 'errors.parsed.timeoutWriteForm' : 'errors.parsed.timeoutWrite';
}

/** The app's sentence for a network failure or a timeout; undefined for any other error. */
export function transportText(error: unknown, options: ServerTextOptions = {}): string | undefined {
  if (isStatementTimeout(error, options.code)) return t('errors.parsed.timeoutNotSaved');
  if (!isTimeoutError(error) && !isNetworkError(error)) return undefined;
  // A write that failed after the request went out may have been applied: the person is told to check.
  if ((options.write || options.delete) && requestMayHaveBeenSent(error, options.code)) return t(timeoutWriteKey(options));
  return t('errors.parsed.network');
}

/**
 * What a code stands for, in the app's words. Codes come from Postgres, PostgREST and the server's own answers.
 * 42501 is not here on purpose: the server raises it with many sentences of its own ("Session expired
 * or revoked", "Item belongs to another customer" ...), and the text rules word those better than one
 * generic permission text would. PGRST116 and NOT_FOUND are not here either: the caller's own
 * not-found fallback says more.
 */
const REASON_BY_CODE: Record<string, TranslationKey> = {
  PERMISSION_DENIED: 'errors.parsed.noPermission',
  FORBIDDEN: 'errors.parsed.noPermission',
  SELF_EDIT_FORBIDDEN: 'errors.parsed.noPermission',
  CANNOT_MODIFY_ADMIN: 'errors.parsed.noPermission',
  CANNOT_PROMOTE_TO_ADMIN: 'errors.parsed.noPermission',
  [UPGRADING_CODE]: 'components.upgrading.message',
  PGRST301: 'errors.code.sessionExpired',
  PGRST303: 'errors.code.sessionExpired',
  SESSION_EXPIRED: 'errors.code.sessionExpired',
  NOT_AUTHENTICATED: 'errors.code.sessionExpired',
  INSUFFICIENT_STOCK: 'errors.code.insufficientStock',
  '23505': 'errors.parsed.duplicate',
  '23503': 'errors.parsed.inUse',
  '40001': 'errors.parsed.busy',
  '40P01': 'errors.parsed.busy',
};

/**
 * Text a person cannot use: a stack trace, JSON, SQL, a class name such as
 * TypeError, a code in capitals. Sentences the server wrote for people do not look like this.
 */
function looksLikeDeveloperText(text: string): boolean {
  const trimmed = text.trim();
  return (
    /^[{[]/.test(trimmed) ||
    /\n\s+at\s|\bat\s+\S+\s+\(.*:\d+:\d+\)/.test(trimmed) ||
    /\b[A-Z][A-Za-z]*(Error|Exception)\b/.test(trimmed) ||
    /\[object |\bundefined\b|cannot read propert(y|ies)|json parse error|unexpected token|is not a function|is not iterable/i.test(trimmed) ||
    /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|^[A-Z0-9]{4,}$/.test(trimmed) ||
    /\b(select|delete)\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\b[\s\S]*\bset\b/i.test(trimmed) ||
    /violates|invalid input syntax|syntax error|sqlstate|pgrst\d*|permission denied for|null value in column|unique constraint|foreign key|schema cache|could not find the function|could not serialize|deadlock|\bjwt\b|\buuid\b/i.test(trimmed) ||
    /\b(relation|column|function|table|type|schema)\s+"?[\w.()]+"?\s+does not exist/i.test(trimmed)
  );
}

/**
 * What to show for a text the server sent.
 *
 * A network failure or a timeout is worded first (see transportText). Then a
 * code, if the failure has one, is worded. In English the server's own sentence
 * is shown when it is written for people; developer text (see
 * looksLikeDeveloperText) gives the reason it names, or the fallback.
 *
 * @param text the server's own text, if it sent one; an Error or error object is read too
 * @param fallback the app's message for this action, already translated
 * @param options `write` for a request that changes data (`form` too on a form screen, `photo` for a photo upload or removal, `delete` for a delete); `code` when the text does not carry it
 *
 * A class name in front of the text ("AppError: ...", "Error: ...") is never shown.
 */
export function serverText(text: unknown, fallback: string, options: ServerTextOptions = {}): string {
  const transport = transportText(text, options);
  if (transport) return transport;
  const expired = expiredSessionText(text, options);
  if (expired) return expired;
  const raw = textOf(text);
  // The same text without the class name the PostgREST client puts in front of a thrown error's message.
  const bare = raw === undefined ? undefined : stripErrorPrefix(raw);
  // A shared service may have worded the timeout for the other kind of screen: this screen says it its own way.
  if ((options.write || options.delete) && TIMEOUT_WRITE_KEYS.some(key => bare?.trim() === t(key))) {
    return t(timeoutWriteKey(options));
  }
  if (raw === undefined || bare === undefined || raw.trim() === '') return fallback;
  // The message of an AppError is written for people, in the app's language (see appError.ts); only its class name is dropped.
  if (/^\s*AppError:/.test(raw) && bare.trim() !== '') return bare;
  // English keeps the server's wording; text the app wrote in Gujarati is already right.
  if (writtenInGujarati(bare)) return bare;
  // The app's own English sentences that pass through twice (a service result shown by a screen) stay as they are.
  if (APP_OWN_TEXT.some(key => bare.trim() === t(key))) return bare;
  const code = options.code ?? errorCodeOf(text);
  const byCode = code ? REASON_BY_CODE[code] : undefined;
  if (byCode) return t(byCode);
  if (getLanguage() === 'en') {
    const unwrapped = unwrapDatabaseError(raw);
    const lower = stripErrorPrefix(unwrapped).trim().toLowerCase();
    const worded = REASONS.find(([pattern, key]) => APP_WORDED.includes(key) && pattern.test(lower));
    if (worded) return t(worded[1]);
    // The developer test looks at the whole text, class name included: "TypeError: ..." is not for people.
    if (looksLikeDeveloperText(unwrapped)) return serverReason(unwrapped) ?? fallback;
    return stripErrorPrefix(unwrapped) || fallback;
  }
  return serverReason(raw) ?? fallback;
}

/**
 * What to show when a request failed and the caller holds both the server's raw error
 * text and the app's own message for the action. The raw text is developer wording
 * ("permission denied for function ...", "invalid input syntax for type uuid") and is
 * never shown; when it names a reason the app knows, that reason is shown in the app's
 * words, otherwise the app's own message.
 */
export function failureText(rawError: unknown, ownMessage: unknown, fallback: string, options: ServerTextOptions = {}): string {
  const transport = transportText(rawError, options);
  if (transport) return transport;
  const reason = typeof rawError === 'string' ? serverReason(rawError) : undefined;
  if (reason) return reason;
  return typeof ownMessage === 'string' && stripErrorPrefix(ownMessage).trim() !== '' ? stripErrorPrefix(ownMessage) : fallback;
}
