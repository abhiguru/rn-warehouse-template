/**
 * The words for a save the server refused with `NUMBER_FORMAT` (backend migration 127): the number does not follow the
 * facility's numbering rule. With a pattern the sentence names it ("A####"); without one the number was only too long,
 * and the server's own sentence is shown in English (any other language gets the app's text for it).
 */
import { formatIdentifier, t } from '@/i18n';
import { refusalString, REFUSAL, type ServerRefusal } from '@/utils/serverRefusal';
import { serverText } from '@/utils/serverText';

export const isNumberFormatRefusal = (refusal: ServerRefusal | undefined): refusal is ServerRefusal =>
  refusal?.reason === REFUSAL.NUMBER_FORMAT;

export function numberFormatText(refusal: ServerRefusal): string {
  const pattern = refusalString(refusal, 'pattern');
  if (pattern) return t('numbering.refusal.format', { pattern: formatIdentifier(pattern) });
  return serverText(refusal.text, t('numbering.refusal.tooLong'));
}
