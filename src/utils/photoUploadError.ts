import { t } from '@/i18n';
import { loggableError } from '@/utils/logger';
import { isLostAnswer, isNetworkError, isTimeoutError, serverText } from '@/utils/serverText';

/**
 * The sentence for a photo upload that failed. Only a request that got no (or no readable) answer is worded from the
 * failure, through serverText for a photo change ("No answer from the server. The photo change may have gone through.
 * Check the photos on this screen before trying again." when it may have been applied). Anything else, a refusal of the
 * storage or of the server included, gets the app's own fallback: the library's English sentence is never shown.
 */
export function photoUploadFailureText(error: unknown, fallback: string): string {
  if (isNetworkError(error) || isTimeoutError(error) || isLostAnswer(error)) {
    return serverText(error, fallback, { write: true, photo: true });
  }
  return fallback;
}

/**
 * What a detail screen says when adding a photo failed, and whether it must read its photos again. `failure` is the
 * upload's error text (already the app's) or whatever was thrown. When the answer was lost the photo may be attached, so
 * the screen reads the photos again to show what the server holds.
 */
export function photoAddFailure(failure: unknown, fallback: string): { message: string; reread: boolean } {
  const message = serverText(failure, fallback, { write: true, photo: true });
  return { message, reread: message === t('errors.parsed.timeoutWritePhoto') || isLostAnswer(failure) };
}

/**
 * True for a photo failure that is expected in the field: no connection, a timeout, a lost answer. It is reported to the
 * user by its sentence, so the log keeps it at info (an error log would raise a red LogBox on the phone).
 */
export const isExpectedPhotoFailure = (error: unknown): boolean => isNetworkError(error) || isTimeoutError(error) || isLostAnswer(error);

/**
 * Logs a failed photo step: info for an expected failure (see isExpectedPhotoFailure), the logger's error for anything else.
 *
 * Why info: the logger writes only errors in a release build (logger.ts drops every other level when !__DEV__), and an
 * error raises the red LogBox in development. warn is no better: it is also dropped in release and shows a yellow box in
 * development. No level both survives a release build and stays off the dev banners, so an expected failure leaves no
 * trace in release; the user is told by the sentence on the screen.
 */
export function logPhotoFailure(
  log: { info: (message: string, ...args: unknown[]) => void; error: (message: string, ...args: unknown[]) => void },
  message: string,
  error: unknown,
): void {
  if (isExpectedPhotoFailure(error)) log.info(`${message} (no connection or no answer)`, loggableError(error));
  else log.error(message, loggableError(error));
}
