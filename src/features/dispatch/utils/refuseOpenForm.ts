import { router, type Href } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { t as tr, formatIdentifier } from '@/i18n';
import { dispatchFormRoute, type OpenDispatchForm } from './openDispatchForms';

/**
 * Tells the person that another dispatch form is open and this one is not opened over it. "Open it" takes them back
 * to that form, which may be hidden under other screens. `number` is the open dispatch's own number when the caller
 * knows it; a form that has told the registry its number is named by that.
 */
export function showOpenDispatchFormRefusal(blocker: OpenDispatchForm, number?: string): void {
  const known = number || (blocker.kind === 'edit' ? blocker.number : undefined);
  const message =
    blocker.kind === 'create'
      ? tr('dispatch.edit.finishOtherNew')
      : known
        ? tr('dispatch.edit.finishOtherEdit', { number: formatIdentifier(known) })
        : tr('dispatch.edit.finishOtherEditNoNumber');
  showAlert(tr('dispatch.edit.finishOtherTitle'), message, [
    { text: tr('common.close'), style: 'cancel' },
    { text: tr('dispatch.edit.openIt'), onPress: () => router.dismissTo(dispatchFormRoute(blocker) as Href) },
  ]);
}
