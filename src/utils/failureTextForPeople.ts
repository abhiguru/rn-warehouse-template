/**
 * The text a share or print alert shows for a failure that was thrown (WH-197).
 *
 * A thrown error's own message is never shown as it is: it can be the English of the gated fetch ("Session changed",
 * "Warehouse identity verification required") or of the system or the server. A network failure or a timeout gets the
 * app's connection text, a reason the app knows gets its text in the app's language, the message of an error the app
 * raised itself (already worded for people) is kept, and anything else gets the caller's generic text. The raw message
 * goes nowhere but the log, and then only the error's class and code: the print endpoints' logging rule
 * (services/print-service.ts) forbids logging an error message, which can carry a credential or a document range.
 */
import { getAppErrorCode } from '@/utils/appError';
import { createLogger } from '@/utils/logger';
import { expiredSessionText, serverReason, stripErrorPrefix, transportText } from '@/utils/serverText';

const log = createLogger('failureText');

export function failureTextForPeople(error: unknown, generic: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (error instanceof Error) log.warn('Failure worded for the person', { name: error.name, code: getAppErrorCode(error) });
  const transport = transportText(error);
  if (transport) return transport;
  const expired = expiredSessionText(error);
  if (expired) return expired;
  if (raw === '') return generic;
  const code = getAppErrorCode(error);
  // The message of an AppError is written for people in the app's language (see appError.ts).
  if (code && error instanceof Error && error.message.trim() !== '') return error.message;
  return serverReason(raw) ?? generic;
}
