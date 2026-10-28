/**
 * The refusals the server sends as an answer, read by their `reason` (wave B, owner decisions D1 to D24).
 *
 * A refusal is `{ success: false, error_code: 'WH409', reason: '<CONSTANT>', error, message, ...fields }`:
 * `reason` says which rule refused, the other top-level keys are the values the app's own text needs
 * (a line id, an invoice number, a date). A screen switches on `reason` and writes the sentence in the
 * app's language from the fields; it never parses the server's English. `executeRPC` copies `reason` and
 * `fields` into its failed result, and the services pass a `refusal` on to the screens.
 *
 * An old server sends none of these: every reader of a refusal treats it as optional.
 */
import { rpcBody } from '@/utils/rpcRefusal';

/** Every reason the server answers with (migration 121), by the name the server sends. */
export const REFUSAL = {
  /** The record was changed by someone else after this screen read it (D1). */
  STALE_RECORD: 'STALE_RECORD',
  /** A GRN line on an invoice: item, packing and weight are locked (D2). */
  LOT_INVOICED: 'LOT_INVOICED',
  /** A GRN line that was dispatched: item and packing are locked (D2). */
  LOT_DISPATCHED: 'LOT_DISPATCHED',
  /** A dispatch on an invoice: date and number are locked (D2). */
  DISPATCH_INVOICED: 'DISPATCH_INVOICED',
  /** A dispatch dated after today (D3). */
  DISPATCH_DATE_FUTURE: 'DISPATCH_DATE_FUTURE',
  /** A dispatch dated before the GRN of one of its lots (D3). */
  DISPATCH_BEFORE_GRN: 'DISPATCH_BEFORE_GRN',
  /** A GRN dated after its first dispatch (D3). */
  GRN_DATE_AFTER_DISPATCH: 'GRN_DATE_AFTER_DISPATCH',
  /** The order changed after the dispatch form was made from it (D5). */
  ORDER_CHANGED: 'ORDER_CHANGED',
  /** The number of a saved GRN can't be changed (D6). */
  GRN_NUMBER_LOCKED: 'GRN_NUMBER_LOCKED',
  /** The GRN still has stock, so no invoice yet (D9). */
  GRN_HAS_STOCK: 'GRN_HAS_STOCK',
  /** A GRN that is on an invoice takes no new line (D9). */
  GRN_INVOICED: 'GRN_INVOICED',
  /** A staff edit that would remove a rate a manager set for this GRN (D10). */
  RATES_NEED_MANAGER: 'RATES_NEED_MANAGER',
  /** A GRN line that is on a customer's order can't be removed (D11). */
  LINE_ON_ORDER: 'LINE_ON_ORDER',
  /** A GRN line that was dispatched before can't be removed (D11). */
  LINE_DISPATCHED_BEFORE: 'LINE_DISPATCHED_BEFORE',
  /** The business is deactivated: no order line is added or changed (D16). */
  CUSTOMER_DEACTIVATED: 'CUSTOMER_DEACTIVATED',
  /** The invoice total the person confirmed is not what the server worked out (D18). */
  TOTAL_CHANGED: 'TOTAL_CHANGED',
  // Owner updates after the contract was written. The contract fixes no name for these two: the backend's
  // migration 121 must send exactly these, or this list is changed with it.
  /** The GRN date can't be changed once the GRN is invoiced (D23). */
  GRN_DATE_LOCKED: 'GRN_DATE_LOCKED',
  /** A weight or pricing-mode edit would drop a GRN-only rate and the same save sends no new one (D24). */
  RATES_WOULD_DROP: 'RATES_WOULD_DROP',
  // Backend migration 124 (fix batch 2026-10-21).
  /**
   * A GRN or a direct dispatch that looks like one created in the last 30 minutes (same customer, same set of items or
   * lots...). Asked for by the caller (`p_warn_duplicate: true` / `warn_duplicate: true`; without it the server never
   * checks), and a warning, never a block: the person can save anyway, which sends the same save with the flag false.
   */
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
  // Backend migration 127 (document numbering).
  /**
   * A GRN or dispatch number outside the facility's numbering rule, while the rule's check is on (`number`, `document_type`,
   * `pattern`); with the pattern null, a number of more than 20 characters. Nothing was saved.
   */
  NUMBER_FORMAT: 'NUMBER_FORMAT',
} as const;

export type RefusalReason = (typeof REFUSAL)[keyof typeof REFUSAL];

export interface ServerRefusal {
  /** The reason constant the server sent (compare with `REFUSAL`); a string the app does not know is kept as it came. */
  reason: string;
  /** Every other top-level key of the refusal except success, error, message, error_code and reason. */
  fields: Record<string, unknown>;
  /** The server's own English sentence, when it sent one: for a log, never shown to a person. */
  text?: string;
}

/** The keys of a refusal that are not fields. */
const NOT_FIELDS: ReadonlySet<string> = new Set(['success', 'error', 'message', 'error_code', 'reason']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/**
 * The refusal an RPC answer carries, or undefined when it carries none. The answer may be:
 * - the body the server sent (`success === false` and a string `reason`; the fields are the other keys);
 * - an `RPCResult` from `executeRPC` (`success === false`, `reason` and a `fields` object, which is where
 *   executeRPC put them, and no `error_code`; a body's own `fields` is an array, as in LOT_INVOICED, and stays one of
 *   the fields, and a body carrying `error_code` is read as a body even when its `fields` is an object);
 * - a service result that already holds one (`success === false` and a `refusal`).
 */
export function refusalOf(answer: unknown): ServerRefusal | undefined {
  const body = rpcBody(answer);
  if (!isRecord(body) || body.success !== false) return undefined;

  const reason = nonEmpty(body.reason);
  if (reason !== undefined) {
    // A server body always carries `error_code`, an RPCResult never does (executeRPC keeps it as `errorCode`): so a body
    // that has a `fields` object of its own is never taken for an RPCResult.
    if (isRecord(body.fields) && body.error_code === undefined) {
      // An RPCResult: executeRPC already sorted the body into `reason` and `fields`.
      const text = nonEmpty(body.serverMessage);
      return { reason, fields: body.fields, ...(text !== undefined ? { text } : {}) };
    }
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!NOT_FIELDS.has(key)) fields[key] = value;
    }
    const text = nonEmpty(body.error) ?? nonEmpty(body.message);
    return { reason, fields, ...(text !== undefined ? { text } : {}) };
  }

  // A service result that passes the refusal on.
  const carried = body.refusal;
  if (isRecord(carried)) {
    const carriedReason = nonEmpty(carried.reason);
    if (carriedReason !== undefined) {
      const text = nonEmpty(carried.text);
      return {
        reason: carriedReason,
        fields: isRecord(carried.fields) ? carried.fields : {},
        ...(text !== undefined ? { text } : {}),
      };
    }
  }
  return undefined;
}

/** A field that is a non-blank string, otherwise undefined. */
export const refusalString = (r: ServerRefusal, key: string): string | undefined => nonEmpty(r.fields[key]);

/** A field that is a finite number (or a string holding one, as a numeric column can arrive), otherwise undefined. */
export const refusalNumber = (r: ServerRefusal, key: string): number | undefined => {
  const value = r.fields[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * A field that is a list of strings (`fields` of LOT_INVOICED: item, packaging, weight), otherwise undefined.
 * A list holding anything else is not one. Read it as `refusalStrings(r, 'fields')`.
 */
export const refusalStrings = (r: ServerRefusal, key: string): string[] | undefined => {
  const value = r.fields[key];
  return Array.isArray(value) && value.every(entry => typeof entry === 'string') ? (value as string[]) : undefined;
};
