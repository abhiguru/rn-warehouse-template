/**
 * The one rule that reads a server refusal (WH-161 17.1, WH-304 contract 11.2 and 12.1): its code, and the figures it carries.
 * Shared by the generic `classify()`, the new-record kinds and the hand-over, so every refusal reaches the unsent file the same way.
 */
type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The error code `refuse()` (migration 121) puts in every refusal; it names no reason, so the `reason` is the code. */
const GENERIC_REFUSAL_CODE = 'WH409';

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** The code of a refusal: its `reason` when it has one, else its `error_code` unless that is WH409, else its `code`. */
export function answerCodeOf(answer: unknown): string | null {
  if (!isFields(answer)) return null;
  const reason = text(answer.reason);
  if (reason !== null) return reason;
  const errorCode = text(answer.error_code);
  if (errorCode !== null && errorCode !== GENERIC_REFUSAL_CODE) return errorCode;
  return text(answer.code);
}

/** The members of an answer that are not figures (contract 11.2). */
const NOT_FIGURES: readonly string[] = ['success', 'error_code', 'reason', 'error', 'message', 'idempotent'];

/** The figures of a refusal: the answer without its bookkeeping members; a rate failure's own `data` member when it has one. */
export function answerFiguresOf(answer: unknown): Fields {
  if (!isFields(answer)) return {};
  if (/^RATES?_/.test(answerCodeOf(answer) ?? '') && isFields(answer.data)) return answer.data;
  const figures: Fields = {};
  for (const [key, value] of Object.entries(answer)) if (!NOT_FIGURES.includes(key)) figures[key] = value;
  return figures;
}
