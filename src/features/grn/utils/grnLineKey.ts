/**
 * The identity of one GRN list line, to recognise a line a later page repeats (a receipt created while the list
 * was open shifts every later offset by one): its `grn_item_id`, or the receipt id and the line's `id` when that
 * is missing.
 */
export const grnLineKey = (item: { grn_item_id?: string | null; grn_id?: string | null; id: string }): string =>
  item.grn_item_id || `${item.grn_id ?? ''}+${item.id}`;
