/**
 * What the Add items picker holds while it is open (phone review 2026-10-14, OI-01).
 *
 * `base` is the order's saved open lines as they were when the picker opened,
 * `selection` is what the user has chosen since, and `failed` holds the reason for
 * each lot the server refused on the last Add. The picker is seeded once per
 * opening and then left alone: a refresh, a return from the background or a line
 * another user adds never changes it. Add sends only `changesOf(draft)`, the
 * difference between the two, so a lot the user did not touch is never sent.
 *
 * Kept in memory only; nothing here is stored on the phone.
 */
import type { GRNItem } from '@/types/order.types';

/** One lot with the number of bags chosen for it. */
export interface PickerLine {
  grnItemId: string;
  quantity: number;
  item: GRNItem;
}

/** One thing to save: the quantity a lot should have. Quantity 0 takes the lot off the order. */
export interface PickerChange {
  grnItemId: string;
  quantity: number;
}

/** The answer for one change: saved, or not saved with the reason to show on the lot. */
export interface PickerResult {
  grnItemId: string;
  ok: boolean;
  reason?: string;
}

export interface PickerDraft {
  base: ReadonlyMap<string, PickerLine>;
  selection: ReadonlyMap<string, PickerLine>;
  failed: ReadonlyMap<string, string>;
}

const NO_REASONS: ReadonlyMap<string, string> = new Map();

/** A draft for a picker that just opened: nothing chosen beyond the saved open lines. */
export function seedDraft(saved: readonly PickerLine[]): PickerDraft {
  const base = new Map<string, PickerLine>();
  for (const line of saved) {
    if (line.quantity > 0) base.set(line.grnItemId, { grnItemId: line.grnItemId, quantity: line.quantity, item: line.item });
  }
  return { base, selection: new Map(base), failed: NO_REASONS };
}

/**
 * The draft after the user set a lot to `quantity` bags (0 deselects it). A
 * reason left on that lot by the last Add no longer describes it and is dropped.
 */
export function withQuantity(draft: PickerDraft, item: GRNItem, quantity: number): PickerDraft {
  const selection = new Map(draft.selection);
  if (quantity > 0) selection.set(item.id, { grnItemId: item.id, quantity, item });
  else selection.delete(item.id);
  if (!draft.failed.has(item.id)) return { ...draft, selection };
  const failed = new Map(draft.failed);
  failed.delete(item.id);
  return { ...draft, selection, failed };
}

/** The draft with no reasons on it, as it is while an Add is being saved. */
export function withoutReasons(draft: PickerDraft): PickerDraft {
  return draft.failed.size === 0 ? draft : { ...draft, failed: NO_REASONS };
}

/**
 * What the user changed since the picker opened, quantities first, removals last:
 * a lot chosen that was not saved, a saved lot with another quantity, and a saved
 * lot that is no longer chosen (quantity 0).
 */
export function changesOf(draft: PickerDraft): PickerChange[] {
  const changes: PickerChange[] = [];
  draft.selection.forEach((line, grnItemId) => {
    if (draft.base.get(grnItemId)?.quantity !== line.quantity) changes.push({ grnItemId, quantity: line.quantity });
  });
  draft.base.forEach((_line, grnItemId) => {
    if (!draft.selection.has(grnItemId)) changes.push({ grnItemId, quantity: 0 });
  });
  return changes;
}

export const isDirty = (draft: PickerDraft): boolean => changesOf(draft).length > 0;

/**
 * The draft after an Add was answered. A saved lot moves into `base` (or leaves
 * it, when the change was a removal), so it is no longer a change. A lot that was
 * not saved stays as the user chose it and takes its reason.
 */
export function applyResults(draft: PickerDraft, results: readonly PickerResult[]): PickerDraft {
  const base = new Map(draft.base);
  const failed = new Map(draft.failed);
  for (const result of results) {
    if (result.ok) {
      const chosen = draft.selection.get(result.grnItemId);
      if (chosen) base.set(result.grnItemId, chosen);
      else base.delete(result.grnItemId);
      failed.delete(result.grnItemId);
    } else {
      failed.set(result.grnItemId, result.reason ?? '');
    }
  }
  return { base, selection: draft.selection, failed };
}
