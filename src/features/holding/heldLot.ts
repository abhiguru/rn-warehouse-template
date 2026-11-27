/**
 * A held rack and mark change in the quick-change sheet (WH-304, contract 5.2, Design 7.9 DQ4): the sheet opens with the held values
 * and its Save reads "Accept with changes". This file builds what the sheet is shown and the body it sends.
 */
import { isLotChangeBody, type FieldChange, type LotChangeBody, type LotField } from '@/features/unsent/lotChangeKind';
import { normaliseLotValue, type LotValues } from '@/features/quick-change/lotChangeService';
import type { QuickChangeTarget } from '@/features/quick-change/useQuickChange';
import type { HeldItemDetail } from './holdingApi';

const isFields = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The GRN number the phone put in the item's `what`, an identifier. */
function numberOfWhat(what: unknown): string {
  const params = isFields(what) && isFields(what.params) ? what.params : {};
  return typeof params.number === 'string' ? params.number : '';
}

/** The sheet's target for a held `lotChange`: what is shown is the held value of each field, else the value it was changed from. */
export function heldLotTarget(item: HeldItemDetail): QuickChangeTarget | null {
  if (item.kind !== 'lotChange' || !isLotChangeBody(item.body)) return null;
  const { changes } = item.body;
  const shown: LotValues = {
    rack: (changes.rack ? changes.rack.to : changes.rack) ?? null,
    package_mark: (changes.package_mark ? changes.package_mark.to : changes.package_mark) ?? null,
  };
  return { lotId: item.body.lotId, grnId: item.body.grnId, grnNumber: numberOfWhat(item.what), customer: item.customerName, itemName: '', shown };
}

/** The held body with the sheet's values as each field's `to`; a field the held change did not carry is added only when changed. */
export function correctedLotBody(held: LotChangeBody, values: Partial<Record<LotField, string | null>>): LotChangeBody {
  const changes: LotChangeBody['changes'] = { ...held.changes };
  for (const field of ['rack', 'package_mark'] as const) {
    if (!(field in values)) continue;
    const before: FieldChange | undefined = held.changes[field];
    changes[field] = { to: normaliseLotValue(values[field] ?? null), from: before ? before.from : null };
  }
  return { ...held, changes };
}
