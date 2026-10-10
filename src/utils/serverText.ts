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

const GUJARATI_SCRIPT = /[઀-૿]/;

/** Reasons the server gives, by the words it uses for them. The first match wins. */
const REASONS: [RegExp, TranslationKey][] = [
  // "X not found or access denied": the record is missing as far as this person can tell.
  [/not found or access denied/, 'errors.parsed.itemNotFound'],
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
 * save_invoice(jsonb) reports a refusal as "Database error: <text> (SQLState: <code>)".
 * The wrapper says nothing to the reader, so only the text inside is kept.
 */
function unwrapDatabaseError(text: string): string {
  const wrapped = /^Database error:\s*([\s\S]*?)\s*\(SQLState:\s*[^)]*\)\s*$/.exec(text);
  return wrapped ? wrapped[1] : text;
}

/** The reason a server text names, in the app's language; undefined when it names none the app knows. */
export function serverReason(text: string): string | undefined {
  const lower = text.toLowerCase();
  const match = REASONS.find(([pattern]) => pattern.test(lower));
  return match ? t(match[1]) : undefined;
}

/**
 * What to show for a text the server sent.
 *
 * @param text the server's own text, if it sent one
 * @param fallback the app's message for this action, already translated
 */
export function serverText(text: unknown, fallback: string): string {
  if (typeof text !== 'string' || text.trim() === '') return fallback;
  // English keeps the server's wording; text the app wrote in Gujarati is already right.
  if (GUJARATI_SCRIPT.test(text)) return text;
  if (getLanguage() === 'en') return unwrapDatabaseError(text) || fallback;
  return serverReason(text) ?? fallback;
}
