/**
 * The ledger names of the accountant pack (WH-158, backend migration 203): get_accountant_ledgers and set_accountant_ledgers.
 * Administrators only; the server refuses anyone else. The names are the facility's own words for the ledgers its accountant
 * uses in Tally, so the app sends them exactly as typed (the server trims them).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';

/** The 13 ledger keys, in the contract's order (the order of the screen's fields). */
export const LEDGER_KEYS = [
  'storage_taxable',
  'storage_exempt',
  'labour',
  'cgst',
  'sgst',
  'igst',
  'discount',
  'round_off',
  'receipt_cash',
  'receipt_upi',
  'receipt_bank_transfer',
  'receipt_cheque',
  'receipt_other',
] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];
export type LedgerNames = Record<LedgerKey, string>;

export interface AccountantLedgers {
  /** The names in use: the saved ones, else the defaults. */
  ledgers: LedgerNames;
  defaults: LedgerNames;
  /** False until an administrator saves once. */
  saved: boolean;
  /** Set only by a save: whether it changed anything. */
  changed?: boolean;
}

export type LedgersResult =
  | { success: true; data: AccountantLedgers }
  | { success: false; message: string; reason?: string; field?: LedgerKey };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readNames(value: unknown): LedgerNames | null {
  if (!isRecord(value)) return null;
  const names = {} as LedgerNames;
  for (const key of LEDGER_KEYS) {
    if (typeof value[key] !== 'string') return null;
    names[key] = value[key];
  }
  return names;
}

function readLedgers(value: unknown): AccountantLedgers | null {
  if (!isRecord(value)) return null;
  const ledgers = readNames(value.ledgers);
  const defaults = readNames(value.defaults);
  if (!ledgers || !defaults) return null;
  return { ledgers, defaults, saved: value.saved === true, ...(typeof value.changed === 'boolean' ? { changed: value.changed } : {}) };
}

async function call(rpc: string, params: Record<string, unknown> | undefined, write: boolean, failed: string): Promise<LedgersResult> {
  const result = await executeRPC<unknown>(getAuthenticatedClient, rpc, params, {
    context: `AccountantExportService.${rpc}`,
    errorMessage: failed,
    unwrapNested: true,
    write,
  });
  if (!result.success) {
    const field = result.fields?.field;
    return {
      success: false,
      message: result.message || failed,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(typeof field === 'string' && (LEDGER_KEYS as readonly string[]).includes(field) ? { field: field as LedgerKey } : {}),
    };
  }
  const data = readLedgers(result.data);
  return data ? { success: true, data } : { success: false, message: failed };
}

/** The names the facility uses now, and the defaults. */
export function getAccountantLedgers(): Promise<LedgersResult> {
  return call('get_accountant_ledgers', undefined, false, t('settings.accountantExport.loadFailed'));
}

/** Saves all 13 names. A refusal (LEDGER_NAME_REQUIRED, _TOO_LONG, _INVALID, LEDGER_KEYS) carries `reason` and the `field` it names. */
export function setAccountantLedgers(ledgers: LedgerNames): Promise<LedgersResult> {
  return call('set_accountant_ledgers', { p_ledgers: ledgers }, true, t('settings.accountantExport.saveFailed'));
}
