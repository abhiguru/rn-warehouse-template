import { t as tr, formatIdentifier } from '@/i18n';

interface BlockingDependencies {
  invoiced_dispatches?: number;
  dispatches?: number;
}

/**
 * The one sentence for a GRN delete the server refused because dispatch lines depend on it, in the app's words and
 * language. The server's own sentence and instructions are English and say the same thing, so they are not shown.
 * null: the refusal is not of this kind (or the GRN has no number to name), and the caller words it as any other.
 */
export function deleteBlockedText(grNumber: string | null | undefined, deps: BlockingDependencies | undefined): string | null {
  const number = typeof grNumber === 'string' ? grNumber.trim() : '';
  if (!deps || number === '') return null;
  if (deps.invoiced_dispatches) {
    return tr('grn.details.deleteBlockedInvoiced', { number: formatIdentifier(number), count: deps.invoiced_dispatches });
  }
  if (deps.dispatches) {
    return tr('grn.details.deleteBlockedDispatches', { number: formatIdentifier(number), count: deps.dispatches });
  }
  return null;
}
