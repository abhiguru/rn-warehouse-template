/**
 * The refusals of Design 4.3 for sign-out, leaving or switching the facility and removing the account while the phone holds
 * unsent work (WH-301, contract section 6). Unfinished forms never refuse (Product PQ1); waiting photos do (PQ2).
 */
import { router } from 'expo-router';
import { t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { accountActionAllowed, type RefusedAction } from './workGate';

export type { RefusedAction };

const TITLES: Record<RefusedAction, 'signOutTitle' | 'leaveTitle' | 'switchTitle' | 'deleteAccountTitle'> = {
  signOut: 'signOutTitle',
  leaveFacility: 'leaveTitle',
  switchFacility: 'switchTitle',
  deleteAccount: 'deleteAccountTitle',
};

/**
 * The row's subtitle while its action is refused ("3 items not sent yet. Send them first."), or null when it is allowed.
 * An unreadable file has no count, so the row says what the bar says.
 */
export function refusedSubtitle(): string | null {
  const gate = accountActionAllowed();
  if (gate.ok) return null;
  return gate.count === null ? t('components.offlineStatus.unsentUnreadable') : t('offline.refuse.subtitle', { count: gate.count });
}

/**
 * True when the action is refused, after telling the person why: the title of the action, the count, and a way to the list
 * ("Unsent items", primary, and "Close"). An unreadable file gets its own words and only "Close". Today's confirmation is
 * not shown, because the caller stops.
 */
export function refuseIfUnsent(action: RefusedAction): boolean {
  const gate = accountActionAllowed(action);
  if (gate.ok) return false;
  const title = t(`offline.refuse.${TITLES[action]}`);
  if (gate.count === null) {
    showAlert(title, t('components.offlineStatus.unsentUnreadable'), [{ text: t('common.close'), style: 'cancel' }]);
  } else {
    showAlert(title, t('offline.refuse.message', { count: gate.count }), [
      { text: t('offline.unsent.title'), onPress: () => router.push('/unsent-items') },
      { text: t('common.close'), style: 'cancel' },
    ]);
  }
  return true;
}
