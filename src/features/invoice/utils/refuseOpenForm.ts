import { router, type Href } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { t as tr, formatIdentifier } from '@/i18n';
import { invoiceFormRoute, type OpenInvoiceForm } from './openInvoiceForms';

/**
 * Tells the person that another invoice form is open and this one is not opened over it (J1). "Open it" takes them
 * back to that form, which may be hidden under other screens. `number` is the open invoice's own number when the
 * caller knows it (the form's baseline); a form that has told the registry its number is named by that.
 */
export function showOpenFormRefusal(blocker: OpenInvoiceForm, number?: number): void {
  const known = number || (blocker.kind === 'edit' ? blocker.number : undefined);
  const message =
    blocker.kind === 'create'
      ? tr('invoice.edit.finishOtherNew')
      : known && known > 0
        ? tr('invoice.edit.finishOtherEdit', { number: formatIdentifier(known) })
        : tr('invoice.edit.finishOtherEditNoNumber');
  showAlert(tr('invoice.edit.finishOtherTitle'), message, [
    { text: tr('common.close'), style: 'cancel' },
    { text: tr('invoice.edit.openIt'), onPress: () => router.dismissTo(invoiceFormRoute(blocker) as Href) },
  ]);
}
