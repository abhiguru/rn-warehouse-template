/**
 * WH-180: the app's sentence for the server's IMPORTED_READ_ONLY refusal (an edit or delete of a document imported from the
 * previous system). `{{document}}` is filled with the app's own word for the document the refusal names.
 */
import { t } from '@/i18n';
import { REFUSAL, refusalOf } from '@/utils/serverRefusal';

const DOCUMENTS = ['grn', 'dispatch', 'invoice', 'payment'] as const;

/** The sentence when `answer` is that refusal (a body, an RPCResult or a service result carrying one); undefined otherwise. */
export function importedReadOnlyText(answer: unknown): string | undefined {
  const refusal = refusalOf(answer);
  if (refusal?.reason !== REFUSAL.IMPORTED_READ_ONLY) return undefined;
  const named = refusal.fields.document;
  const key = DOCUMENTS.find(d => d === named) ?? 'invoice';
  return t('common.importedReadOnly', { document: t(`common.importedDocument.${key}`) });
}
