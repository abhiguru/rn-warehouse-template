/**
 * The short reason of a refused item (Design 7.5 and 7.9 DQ1, and 4.10's ruling of 2026-11-27): the server's answer gives a
 * code and no figures, so the footnote shows the reason's tag, never the server's raw text. The code-to-reason table is
 * product/tech/app-offline-holding-list.md section 2; a code with no row has no tag (`refusedGeneric` is shown).
 */
export type RefusalFamily = 'stockShort' | 'noRate' | 'numberUsed' | 'numberFormat' | 'deleted' | 'locked' | 'dateRefused' | 'duplicate' | 'belowDispatched';

const FAMILY_OF_CODE: Readonly<Record<string, RefusalFamily>> = {
  STOCK_SHORT: 'stockShort',
  RATE_MISSING: 'noRate',
  NUMBER_TAKEN: 'numberUsed',
  NUMBER_FORMAT: 'numberFormat',
  GRN_NUMBER_SPACES: 'numberFormat',
  DISPATCH_NUMBER_SPACES: 'numberFormat',
  GRN_DATE_FUTURE: 'dateRefused',
  DISPATCH_DATE_FUTURE: 'dateRefused',
  DISPATCH_BEFORE_GRN: 'dateRefused',
  GRN_DATE_AFTER_DISPATCH: 'dateRefused',
  RECORDED_TIME_FUTURE: 'dateRefused',
  POSSIBLE_DUPLICATE: 'duplicate',
  LOT_NOT_FOUND: 'deleted',
  GRN_NOT_FOUND: 'deleted',
  RECORD_DELETED: 'deleted',
  GRN_DATE_LOCKED: 'locked',
  GRN_INVOICED: 'locked',
  LOT_INVOICED: 'locked',
  LOT_DISPATCHED: 'locked',
  LINE_DISPATCHED_BEFORE: 'locked',
  LINE_ON_ORDER: 'locked',
  GRN_CUSTOMER_LOCKED: 'locked',
  GRN_PRICING_MODE_LOCKED: 'locked',
  QTY_BELOW_DISPATCHED: 'belowDispatched',
};

/** The family of a refusal code, or null when 7.5 has no row for it. */
export const refusalFamilyOf = (code: string | null): RefusalFamily | null => (code === null ? null : (FAMILY_OF_CODE[code] ?? null));

/** The code kept with a refused item (its `result`), or null. */
export function refusalCodeOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  const code = (result as { code?: unknown }).code;
  return typeof code === 'string' && code !== '' ? code : null;
}
