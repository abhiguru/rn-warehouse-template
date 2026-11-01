/**
 * The reason an invoice is cancelled with (server migration 134, `cancel_invoice`): 3 to 500 characters once trimmed.
 * The server trims spaces, no-break spaces and zero-width characters, so the phone counts the same way: a reason of
 * blanks is no reason, and the counter never promises more room than the server allows.
 */
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

/** Whitespace, no-break spaces and zero-width characters at either end are not part of the reason. */
const EDGE_BLANKS = /^[\s\u00A0\u200B-\u200D\u2060\uFEFF]+|[\s\u00A0\u200B-\u200D\u2060\uFEFF]+$/g;

export const trimCancelReason = (text: string): string => text.replace(EDGE_BLANKS, '');

export type CancelReasonProblem = 'tooShort' | 'tooLong';

/** What is wrong with the typed reason, or null when it can be sent. */
export const cancelReasonProblem = (text: string): CancelReasonProblem | null => {
  const length = Array.from(trimCancelReason(text)).length;
  if (length < CANCEL_REASON_MIN) return 'tooShort';
  if (length > CANCEL_REASON_MAX) return 'tooLong';
  return null;
};

/** How many characters of the reason count, for the counter under the field. */
export const cancelReasonLength = (text: string): number => Array.from(trimCancelReason(text)).length;
