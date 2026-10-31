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
