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
  [/session expired|not authenticated|authentication required|active account required|invalid refresh token/, 'errors.code.sessionExpired'],
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
  'errors.general.businessRuleViolation',
  'errors.parsed.network',
  'errors.parsed.timeoutWrite',
  'errors.parsed.timeoutWriteForm',
  'errors.parsed.timeoutWritePhoto',
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

/** The reason a server text names, in the app's language; undefined when it names none the app knows. */
export function serverReason(text: string): string | undefined {
  const lower = unwrapDatabaseError(text).trim().toLowerCase();
  const match = REASONS.find(([pattern]) => pattern.test(lower));
  return match ? t(match[1]) : undefined;
}

// -----------------------------------------------------------------------------
// What kind of failure was it? Screens that want their own text for a network
// failure, a timeout or one code ask here instead of reading error text.
//
//   isNetworkError(err)   no answer could be had: no connection, a dropped or aborted request
//   isTimeoutError(err)   the app (or the server) gave up waiting
//   errorCodeOf(err)      the code: Postgres SQLState, PostgREST code, or the server's own
//                         (PERMISSION_DENIED ...); undefined when there is none
//   transportText(err)    the app's sentence for a network failure or timeout; undefined for any other error
//
// `err` is whatever failed: an Error, a Supabase error object, a service result
// ({ error, errorCode }) or the server's text. Nothing here reads translated
// text, only the app's error codes and the English text of the system and the server.
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
  /network request failed|network connection|network error|networkerror|failed to fetch|fetch failed|load failed|no internet|internet is not reachable|connection (error|failed|lost|refused|reset)|econn(refused|reset|aborted)|enotfound|socket/i;

/**
 * A proxy's own answer reached the app instead of the server's: an HTML error page, or
 * Cloudflare's plain "error code: 1033". Nobody can use it, and it means the server was not reached.
 */
const PROXY_TEXT = /^\s*</;
const PROXY_CODE_TEXT = /^error code:\s*\d+/i;

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

/** True when the request got no answer: no connection, a dropped or aborted request. */
export function isNetworkError(error: unknown): boolean {
  if (getAppErrorCode(error) === 'NETWORK') return true;
  if (isTimeoutError(error)) return false;
  if (errorCodeOf(error) === 'NETWORK') return true;
  return textsOf(error).some(text => NETWORK_TEXT.test(text) || PROXY_TEXT.test(text) || PROXY_CODE_TEXT.test(text.trim()));
}

/** True when the app or the server stopped waiting (TimeoutError, 57014, "timed out"). */
export function isTimeoutError(error: unknown): boolean {
  if (getAppErrorCode(error) === 'TIMEOUT') return true;
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError') return true;
  const code = errorCodeOf(error);
  if (code === 'TIMEOUT' || code === '57014' || code === 'ETIMEDOUT') return true;
  return textsOf(error).some(text => TIMEOUT_TEXT.test(text));
}

/** True for SQLSTATE 57014: the server cancelled the statement, which rolled back. Nothing was saved. */
export function isStatementTimeout(error: unknown, code?: string): boolean {
  return (code ?? errorCodeOf(error)) === '57014';
}

export interface ServerTextOptions {
  /**
   * The request changes data. A timeout then says it may have been saved; for a
   * read it is only a network failure.
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
  /** The failure's code, when the text passed in does not carry it. */
  code?: string;
}

const TIMEOUT_WRITE_KEYS: TranslationKey[] = ['errors.parsed.timeoutWrite', 'errors.parsed.timeoutWriteForm', 'errors.parsed.timeoutWritePhoto'];

/** Which timeout sentence a write gets: photo, form or list (pull to refresh). */
function timeoutWriteKey(options: ServerTextOptions): TranslationKey {
  if (options.photo) return 'errors.parsed.timeoutWritePhoto';
  return options.form ? 'errors.parsed.timeoutWriteForm' : 'errors.parsed.timeoutWrite';
}

/** The app's sentence for a network failure or a timeout; undefined for any other error. */
export function transportText(error: unknown, options: ServerTextOptions = {}): string | undefined {
  if (isStatementTimeout(error, options.code)) return t('errors.parsed.timeoutNotSaved');
  if (isTimeoutError(error)) {
    if (!options.write) return t('errors.parsed.network');
    return t(timeoutWriteKey(options));
  }
  if (isNetworkError(error)) return t('errors.parsed.network');
  return undefined;
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
  PGRST301: 'errors.code.sessionExpired',
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
 * @param options `write` for a request that changes data (`form` too on a form screen, `photo` for a photo upload or removal); `code` when the text does not carry it
 */
export function serverText(text: unknown, fallback: string, options: ServerTextOptions = {}): string {
  const transport = transportText(text, options);
  if (transport) return transport;
  const raw = textOf(text);
  // A shared service may have worded the timeout for the other kind of screen: this screen says it its own way.
  if (options.write && TIMEOUT_WRITE_KEYS.some(key => raw?.trim() === t(key))) {
    return t(timeoutWriteKey(options));
  }
  if (raw === undefined || raw.trim() === '') return fallback;
  // English keeps the server's wording; text the app wrote in Gujarati is already right.
  if (writtenInGujarati(raw)) return raw;
  // The app's own English sentences that pass through twice (a service result shown by a screen) stay as they are.
  if (APP_OWN_TEXT.some(key => raw.trim() === t(key))) return raw;
  const code = options.code ?? errorCodeOf(text);
  const byCode = code ? REASON_BY_CODE[code] : undefined;
  if (byCode) return t(byCode);
  if (getLanguage() === 'en') {
    const unwrapped = unwrapDatabaseError(raw);
    const lower = unwrapped.trim().toLowerCase();
    const worded = REASONS.find(([pattern, key]) => APP_WORDED.includes(key) && pattern.test(lower));
    if (worded) return t(worded[1]);
    if (looksLikeDeveloperText(unwrapped)) return serverReason(unwrapped) ?? fallback;
    return unwrapped || fallback;
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
  return typeof ownMessage === 'string' && ownMessage.trim() !== '' ? ownMessage : fallback;
}
