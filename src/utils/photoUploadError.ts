import { t } from '@/i18n';
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
