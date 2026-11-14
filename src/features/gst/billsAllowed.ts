/**
 * Whether a new bill may be made (WH-205): until an administrator has saved the warehouse's GST details, with a GSTIN, the server
 * refuses to make a bill. Every way into the new-bill form asks first (`can_make_bills`), so the person is told before typing
 * anything. The server stays the guard: when this question cannot be answered the form opens as it always did, and the save is
 * refused there (`GST_DETAILS_REQUIRED`).
 */
import { router } from 'expo-router';
import { backendHasFeature } from '@/config/backendFeatures';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { normalizeRole } from '@/config/roles';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';
import { showAlert } from '@/utils/alert';

const log = createLogger('BillsAllowed');

export type BillsAllowed = 'allowed' | 'refused' | 'unknown';

/**
 * Asks the server once. 'unknown' for an older backend (no such function), a failed or unanswered call, or an answer
 * that is not the expected shape. Nothing is remembered: the next tap asks again.
 */
export async function canMakeBills(): Promise<BillsAllowed> {
  if (!backendHasFeature('billsNeedGst')) return 'unknown';
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('can_make_bills');
    if (error || !data || data.success !== true) {
      log.info('can_make_bills gave no answer', { code: error?.code ?? data?.error_code });
      return 'unknown';
    }
    const allowed = data.data?.allowed;
    if (allowed === true) return 'allowed';
    if (allowed === false) return 'refused';
    return 'unknown';
  } catch (error) {
    log.info('can_make_bills failed', { message: error instanceof Error ? error.message : String(error) });
    return 'unknown';
  }
}

/** The alert for a refused new bill: an administrator may open the GST details, anyone else is told whom to ask. Returns the message. */
export function refuseBillAlert(role: string | null | undefined): string {
  if (normalizeRole(role) === 'admin') {
    const message = t('gst.billsBlocked.admin');
    showAlert(t('gst.billsBlocked.title'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('gst.billsBlocked.open'), onPress: () => router.push('/gst-details') },
    ]);
    return message;
  }
  const message = t('gst.billsBlocked.other');
  showAlert(t('gst.billsBlocked.title'), message, [{ text: t('common.ok') }]);
  return message;
}

/** For an entry to the new-bill form: false when the person was told no bill can be made (and the form must not open). */
export async function billsMayStart(role: string | null | undefined): Promise<boolean> {
  if ((await canMakeBills()) !== 'refused') return true;
  refuseBillAlert(role);
  return false;
}
