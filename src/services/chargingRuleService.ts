/**
 * The facility's charging rule (backend migration 164, WH-137) and its switch "Invoice goods as they leave"
 * (migration 165, WH-138): read and changed by administrators on the Charging screen. The server alone works out
 * durations, amounts and totals from the rule; the app only reads and writes it.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { emptyAnswerAsError, errorCodeOf, isLostAnswer, transportText, withHttpStatus } from '@/utils/serverText';
import { refusalOf } from '@/utils/serverRefusal';
import { parseChargingRule, type ChargingRule } from '@/features/charging/chargingRule';

/** The rule as the server holds it, with who changed it last. */
export interface StoredChargingRule {
  rule: ChargingRule;
  /** WH-138: null on a backend before migration 165 (no such setting). */
  invoiceAsGoodsLeave: boolean | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface SetChargingResult {
  changed: boolean;
  stored: StoredChargingRule;
}

/** Turning "Invoice goods as they leave" off was refused: GRNs with goods in store already have an invoice (WH409). */
export class PartialInvoicesOpenError extends Error {
  constructor(readonly count: number, readonly grNos: string[]) {
    super(t('charging.goodsLeave.turnOffRefused', { count }));
  }
}

/** The change was sent and no answer came: the server may hold the new rule. */
export class ChargingUnconfirmedError extends Error {
  constructor() {
    super(t('charging.screen.unconfirmed'));
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function unchanged(generation: number): void {
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
}

function readStored(value: unknown): StoredChargingRule | null {
  if (!isRecord(value)) return null;
  const rule = parseChargingRule(value);
  if (!rule) return null;
  return {
    rule,
    invoiceAsGoodsLeave: typeof value.invoice_as_goods_leave === 'boolean' ? value.invoice_as_goods_leave : null,
    updatedAt: textOrNull(value.updated_at),
    updatedByName: textOrNull(value.updated_by_name),
  };
}

/** The rule the server holds. Throws in the app's own words when it cannot be read. */
export async function getChargingRule(): Promise<StoredChargingRule> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_charging_rule');
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    throw new Error(transportText(error) ?? t('charging.screen.loadFailed'));
  }
  const stored = isRecord(data) && data.success !== false ? readStored(data.rule) : null;
  if (!stored) throw new Error(t('charging.screen.loadFailed'));
  return stored;
}

/**
 * Changes the rule. All four fields go every time (the server requires them). `invoiceAsGoodsLeave` is sent only when
 * given: a key left out keeps the stored value, and a backend before migration 165 never gets the key.
 * Throws PartialInvoicesOpenError (turning the switch off refused), ChargingUnconfirmedError (no answer) or an Error
 * worded for the person.
 */
export async function setChargingRule(rule: ChargingRule, invoiceAsGoodsLeave?: boolean): Promise<SetChargingResult> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const answered = await client.rpc('set_charging_rule', {
    p_rule: { ...rule, ...(invoiceAsGoodsLeave === undefined ? {} : { invoice_as_goods_leave: invoiceAsGoodsLeave }) },
  });
  const { data, status } = answered;
  const error = answered.error ?? emptyAnswerAsError(answered);
  unchanged(generation);
  if (error) {
    if (isLostAnswer(withHttpStatus(error, status)) || (typeof status === 'number' && status >= 500)) throw new ChargingUnconfirmedError();
    handleGlobalAuthError(error);
    const refused = errorCodeOf(error) === '22023';
    throw new Error(transportText(error, { write: true, form: true }) ?? t(refused ? 'charging.screen.refused' : 'charging.screen.saveFailed'));
  }
  const refusal = refusalOf(data);
  if (refusal?.reason === 'PARTIAL_INVOICES_OPEN') {
    const count = Number(refusal.fields.count);
    const numbers = Array.isArray(refusal.fields.gr_nos) ? refusal.fields.gr_nos.filter((n): n is string => typeof n === 'string').slice(0, 5) : [];
    throw new PartialInvoicesOpenError(Number.isFinite(count) ? count : numbers.length, numbers);
  }
  const stored = isRecord(data) && data.success === true ? readStored(data.rule) : null;
  if (!stored) throw new Error(t('charging.screen.saveFailed'));
  return { changed: data.changed === true, stored };
}
