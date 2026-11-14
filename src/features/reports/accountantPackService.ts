/**
 * The accountant pack (WH-158, backend migration 204): the edge function generate-accountant-pack answers with a zip
 * of the period's invoices, receipts and stock, or with a refusal. The app only asks, receives the bytes and passes them
 * to the share sheet; every figure in the files is the server's.
 *
 * The request is a write on the server's side (it records that a pack was made), so it is sent once: a failure is shown
 * and the person taps Make pack again, as a new request.
 */
import { createAuthenticatedFetch, getCurrentConfig } from '@/config/supabaseConfig';
import { discardBody } from '@/config/discardBody';
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { serverText, transportText, upgradingBody } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';

const log = createLogger('accountantPack');

export type AccountantPackResult =
  | { success: true; bytes: ArrayBuffer; fileName: string }
  | { success: false; code?: string; message: string };

/** The refusal codes of the edge function that a screen words itself (contract section 4). */
export const PACK_CODE = {
  NOTHING_IN_PERIOD: 'NOTHING_IN_PERIOD',
  PERIOD_ACROSS_YEARS: 'PERIOD_ACROSS_YEARS',
  PACK_TOO_LONG: 'PACK_TOO_LONG',
  PACK_FORBIDDEN: 'PACK_FORBIDDEN',
  INVALID_PERIOD: 'INVALID_PERIOD',
  PACK_UNAVAILABLE: 'PACK_UNAVAILABLE',
} as const;

const DEFAULT_FILE_NAME = 'accountant-pack.zip';

/** The name from `filename*=UTF-8''<percent-encoded>` (else `filename="..."`); a name that cannot be read gives the default. */
function fileNameOf(disposition: string | null | undefined): string {
  if (!disposition) return DEFAULT_FILE_NAME;
  try {
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
    if (star) return decodeURIComponent(star.trim()) || DEFAULT_FILE_NAME;
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)?.[1];
    if (plain) return plain.trim() || DEFAULT_FILE_NAME;
  } catch {
    // A malformed percent sequence: the default name is used.
  }
  return DEFAULT_FILE_NAME;
}

/** The app's words for a refusal code; the codes the screen words itself give their own text, the others the server's sentence or the failure text. */
function refusalText(code: string | undefined, body: unknown): string {
  switch (code) {
    case PACK_CODE.NOTHING_IN_PERIOD:
      return t('reports.accountantPack.packEmpty');
    case PACK_CODE.PERIOD_ACROSS_YEARS:
      return t('reports.accountantPack.packOneYear');
    case PACK_CODE.PACK_TOO_LONG:
      return t('reports.accountantPack.packTooLarge');
    case PACK_CODE.PACK_FORBIDDEN:
      return t('reports.export.notAvailable');
    case PACK_CODE.PACK_UNAVAILABLE:
      return t('errors.pdf.generateFailed');
    default: {
      const text = (body as { error?: unknown } | null)?.error;
      return serverText(upgradingBody(body) ?? text, t('errors.pdf.generateFailed'));
    }
  }
}

/**
 * Asks the server for the pack of `fromDate` to `toDate` (India dates, YYYY-MM-DD). Never throws: a refusal carries its
 * `code` when the server sent one; a request that got no answer has none and its `message` is the app's connection text.
 */
export async function makeAccountantPack(fromDate: string, toDate: string): Promise<AccountantPackResult> {
  try {
    const token = await getAuthTokenString();
    if (!token) return { success: false, message: t('errors.auth.loginAgain') };

    const response = await createAuthenticatedFetch()(`${getCurrentConfig().url}/functions/v1/generate-accountant-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ from_date: fromDate, to_date: toDate }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.includes('application/zip')) {
      const bytes = await response.arrayBuffer();
      return { success: true, bytes, fileName: fileNameOf(response.headers.get('content-disposition')) };
    }

    if (!contentType.includes('application/json')) {
      discardBody(response);
      log.warn('Accountant pack: answer is not a zip or JSON', { status: response.status });
      return { success: false, message: t('errors.pdf.serviceUnavailable', { status: String(response.status) }) };
    }

    const body: unknown = await response.json();
    const code = typeof (body as { code?: unknown } | null)?.code === 'string' ? (body as { code: string }).code : undefined;
    log.warn('Accountant pack refused', { status: response.status, code });
    return { success: false, ...(code ? { code } : {}), message: refusalText(code, body) };
  } catch (error) {
    // A timeout or a network failure is worded by the app; the error itself (it may name the host) is never shown or logged.
    log.warn('Accountant pack request failed');
    return { success: false, message: transportText(error) ?? t('errors.pdf.generateFailed') };
  }
}
