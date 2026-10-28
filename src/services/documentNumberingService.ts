/**
 * Document numbering (backend migration 127): the next GRN, dispatch or invoice number under the facility's rule,
 * and the rules themselves (read by administrators, changed by administrators).
 *
 * A backend older than migration 127 has none of these calls: `nextDocumentNumber` then asks the earlier
 * `get_next_*_number` function, so the same app build keeps working there (backendFeatures.ts; a backend that does not
 * say which migrations it has counts as older).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { backendHasFeature } from '@/config/backendFeatures';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { t, type TranslationKey } from '@/i18n';
import { AppError } from '@/utils/appError';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { errorCodeOf, serverText } from '@/utils/serverText';

export type DocumentType = 'grn' | 'dispatch' | 'invoice';

export interface NumberSuggestion {
  /** The next number; null when there is none (see `reason`). */
  number: string | null;
  /** The pattern of the rule (`A####`, `GRN/26-27/####`), null for free text. */
  hint: string | null;
  scheme: string;
  /** `TYPE_IT`: the rule is free text. `SERIES_FULL`: no number is left. */
  reason: 'TYPE_IT' | 'SERIES_FULL' | null;
}

/** What the rule says about the number box, besides the number itself: its pattern, and why no number was offered. */
export interface NumberOffer {
  hint: string | null;
  reason: NumberSuggestion['reason'];
}

export type NumberingScheme = 'letters' | 'year' | 'sequence' | 'free';

export interface NumberingRule {
  document_type: DocumentType;
  scheme: NumberingScheme;
  prefix: string;
  width: number;
  start: number;
  first_letter: string | null;
  per_letter: number | null;
  check: boolean;
  fy_reset: boolean;
  hint: string | null;
  existing_documents: number;
  not_following: number;
  updated_at: string | null;
  updated_by: string | null;
}

/** The fields of a rule that `set_document_numbering` takes; a field that does not belong to the scheme is left out. */
export interface NumberingRuleInput {
  scheme: NumberingScheme;
  prefix?: string;
  width?: number;
  start?: number;
  first_letter?: string;
  per_letter?: number;
  check?: boolean;
}

export interface SetNumberingResult {
  changed: boolean;
  document_type: DocumentType;
  existing_documents: number;
  not_following: number;
  next_number: string | null;
  hint: string | null;
  reason: NumberSuggestion['reason'];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function unchanged(generation: number): void {
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
}

/**
 * The next number of a document type. `date` (YYYY-MM-DD) matters only under a financial-year rule. Throws when the
 * call fails (the screen then says the number could not be loaded); a type without a number is a normal answer.
 */
export async function suggestDocumentNumber(type: DocumentType, date?: string): Promise<NumberSuggestion> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('suggest_document_number', {
    p_document_type: type,
    ...(date ? { p_date: date } : {}),
  });
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    throw new Error(serverText(error.message, t(NEXT_FAILED[type])));
  }
  if (!isRecord(data) || data.success === false) throw new Error(t(NEXT_FAILED[type]));
  const reason = data.reason === 'TYPE_IT' || data.reason === 'SERIES_FULL' ? data.reason : null;
  return {
    number: textOrNull(data.number),
    hint: textOrNull(data.hint),
    scheme: typeof data.scheme === 'string' ? data.scheme : '',
    reason,
  };
}

/** The text for a number that could not be read, per document type (the texts the forms always had). */
const NEXT_FAILED: Record<DocumentType, TranslationKey> = {
  grn: 'grn.form.nextNumberFailed',
  dispatch: 'dispatch.service.nextNumberFailed',
  invoice: 'invoice.service.nextNumberFailed',
};

const OLD_RPC: Record<'grn' | 'dispatch', string> = { grn: 'get_next_grn_number', dispatch: 'get_next_dispatch_number' };

/** The day of a form's date as YYYY-MM-DD (the form keeps a plain day or a timestamp); undefined when it holds none. */
const dayOf = (date: string | null | undefined): string | undefined => /^\d{4}-\d{2}-\d{2}/.exec(date ?? '')?.[0];

/**
 * The next GRN or dispatch number as text, or '' when the rule offers none (free text, a full series) or an older
 * backend answered with nothing. Never a number the app made up: an empty box is typed by the person.
 * `date` is the form's date: under a financial-year rule the number belongs to the year of that date.
 */
export async function nextDocumentNumber(
  type: 'grn' | 'dispatch',
  date?: string | null,
  onOffer?: (offer: NumberOffer) => void
): Promise<string> {
  if (backendHasFeature('documentNumbering')) {
    const suggestion = await suggestDocumentNumber(type, dayOf(date));
    onOffer?.({ hint: suggestion.hint, reason: suggestion.reason });
    return suggestion.number ?? '';
  }
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc(OLD_RPC[type]);
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    throw new Error(serverText(error.message, t(NEXT_FAILED[type])));
  }
  return typeof data === 'string' ? data : '';
}

/**
 * The number a form should hold after its date moved to another financial year: only under a financial-year rule (the
 * number then belonged to the year before), and only on a backend that has the rule. null: leave the number as it is.
 * Throws like `nextDocumentNumber`.
 */
export async function numberForNewDate(
  type: 'grn' | 'dispatch',
  date: string | null | undefined,
  onOffer?: (offer: NumberOffer) => void
): Promise<string | null> {
  if (!backendHasFeature('documentNumbering')) return null;
  const suggestion = await suggestDocumentNumber(type, dayOf(date));
  onOffer?.({ hint: suggestion.hint, reason: suggestion.reason });
  return suggestion.scheme === 'year' ? suggestion.number ?? '' : null;
}

const asRule = (row: unknown): NumberingRule | null => {
  if (!isRecord(row)) return null;
  const type = row.document_type;
  const scheme = row.scheme;
  if (type !== 'grn' && type !== 'dispatch' && type !== 'invoice') return null;
  if (scheme !== 'letters' && scheme !== 'year' && scheme !== 'sequence' && scheme !== 'free') return null;
  const whole = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    document_type: type,
    scheme,
    prefix: typeof row.prefix === 'string' ? row.prefix : '',
    width: whole(row.width, 4),
    start: whole(row.start, 1),
    first_letter: textOrNull(row.first_letter),
    per_letter: typeof row.per_letter === 'number' ? row.per_letter : null,
    // A rule without the flag is checked, as the backend's own default.
    check: row.check !== false,
    fy_reset: row.fy_reset === true,
    hint: textOrNull(row.hint),
    existing_documents: whole(row.existing_documents, 0),
    not_following: whole(row.not_following, 0),
    updated_at: textOrNull(row.updated_at),
    updated_by: textOrNull(row.updated_by),
  };
};

/** The three rules in the order GRN, dispatch, invoice. */
export async function getDocumentNumbering(): Promise<NumberingRule[]> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_document_numbering');
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    throw new Error(serverText(error.message, t('numbering.screen.loadFailed')));
  }
  const rules = isRecord(data) && Array.isArray(data.rules) ? data.rules.map(asRule).filter((rule): rule is NumberingRule => rule !== null) : [];
  if (rules.length === 0) throw new Error(t('numbering.screen.loadFailed'));
  return rules;
}

/** Changes the rule of one document type. A refusal (SQLSTATE 22023, "Administrator required") is thrown with the server's sentence. */
export async function setDocumentNumbering(type: DocumentType, rule: NumberingRuleInput): Promise<SetNumberingResult> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('set_document_numbering', { p_document_type: type, p_rule: rule });
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    // 22023: the server read the request and refused the values. In English its sentence is shown; in another language
    // the fallback must not blame the connection, which worked.
    const refused = errorCodeOf(error) === '22023';
    throw new Error(serverText(error.message, t(refused ? 'numbering.edit.refused' : 'numbering.edit.saveFailed'), { write: true, form: true }));
  }
  if (!isRecord(data) || data.success === false) throw new Error(t('numbering.edit.saveFailed'));
  const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    changed: data.changed === true,
    document_type: type,
    existing_documents: whole(data.existing_documents),
    not_following: whole(data.not_following),
    next_number: textOrNull(data.next_number),
    hint: textOrNull(data.hint),
    reason: data.reason === 'TYPE_IT' || data.reason === 'SERIES_FULL' ? data.reason : null,
  };
}
