/**
 * The text a detail page shows when its first load failed (WH-216).
 *
 * A network failure or a timeout says to check the connection (Try again can fix it); a refusal the app knows
 * (permission, session) gets its text in the app's words; anything else gets the page's own fallback. The raw server
 * text is never shown.
 */
import { t } from '@/i18n';
import { failureText, transportText } from '@/utils/serverText';

export function loadFailureText(rawError: unknown, fallback: string): string {
  if (transportText(rawError)) return t('common.checkConnection');
  return failureText(rawError, undefined, fallback);
}
