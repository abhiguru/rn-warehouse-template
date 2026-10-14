/**
 * The Add items picker's draft (phone review 2026-10-14, OI-01): what Add sends
 * is the difference between what the picker opened with and what is chosen now.
 */
import { applyResults, changesOf, isDirty, seedDraft, withQuantity, withoutReasons, type PickerLine } from '../pickerDraft';
import type { GRNItem } from '@/types/order.types';

const lot = (id: string): GRNItem => ({
  id, name: `Fictional lot ${id}`, packaging: 'Bag', current_stock: 40, original_quantity: 50, gr_id: 'grn-fictional',
});
const line = (id: string, quantity: number): PickerLine => ({ grnItemId: id, quantity, item: lot(id) });

describe('seedDraft', () => {
  it('opens with the saved lines selected and nothing to send', () => {
    const draft = seedDraft([line('a', 2), line('b', 5)]);
    expect([...draft.selection.keys()]).toEqual(['a', 'b']);
    expect(changesOf(draft)).toEqual([]);
    expect(isDirty(draft)).toBe(false);
  });

  it('keeps its own copy: a later change to the saved lines does not reach it', () => {
    const saved = [line('a', 2)];
    const draft = seedDraft(saved);
    saved[0].quantity = 9;
    saved.push(line('b', 1));
    expect(draft.base.get('a')?.quantity).toBe(2);
    expect(draft.selection.has('b')).toBe(false);
  });
});

describe('changesOf', () => {
  it('sends a lot that was chosen and not saved', () => {
    const draft = withQuantity(seedDraft([line('a', 2)]), lot('new'), 3);
    expect(changesOf(draft)).toEqual([{ grnItemId: 'new', quantity: 3 }]);
    expect(isDirty(draft)).toBe(true);
  });

  it('sends a saved lot whose quantity changed, and not one set back to what is saved', () => {
    const opened = seedDraft([line('a', 2), line('b', 5)]);
    const changed = withQuantity(opened, lot('a'), 7);
    expect(changesOf(changed)).toEqual([{ grnItemId: 'a', quantity: 7 }]);
    expect(changesOf(withQuantity(changed, lot('a'), 2))).toEqual([]);
  });

  it('sends quantity 0 for a saved lot that is no longer chosen', () => {
    const draft = withQuantity(seedDraft([line('a', 2), line('b', 5)]), lot('b'), 0);
    expect(changesOf(draft)).toEqual([{ grnItemId: 'b', quantity: 0 }]);
  });

  it('sends nothing for a lot chosen and deselected again, and never a lot that was not touched', () => {
    const opened = seedDraft([line('a', 2), line('b', 5)]);
    const draft = withQuantity(withQuantity(opened, lot('new'), 4), lot('new'), 0);
    expect(changesOf(draft)).toEqual([]);
    const mixed = withQuantity(withQuantity(withQuantity(opened, lot('b'), 0), lot('new'), 4), lot('a'), 3);
    // Quantities first, removals last; the untouched lot is not there.
    expect(changesOf(mixed)).toEqual([
      { grnItemId: 'a', quantity: 3 },
      { grnItemId: 'new', quantity: 4 },
      { grnItemId: 'b', quantity: 0 },
    ]);
  });
});

describe('applyResults', () => {
  const opened = seedDraft([line('saved', 2), line('gone', 5)]);
  const chosen = withQuantity(withQuantity(withQuantity(opened, lot('gone'), 0), lot('one'), 1), lot('two'), 8);

  it('leaves nothing to send when every lot was saved', () => {
    const after = applyResults(chosen, changesOf(chosen).map(change => ({ grnItemId: change.grnItemId, ok: true })));
    expect(changesOf(after)).toEqual([]);
    expect(after.failed.size).toBe(0);
    // The saved lots are now what the picker compares with; the removed one is gone from it.
    expect([...after.base.keys()].sort()).toEqual(['one', 'saved', 'two']);
  });

  it('keeps a lot that was not saved as chosen, with its reason, and only that one is sent again', () => {
    const after = applyResults(chosen, [
      { grnItemId: 'one', ok: true },
      { grnItemId: 'two', ok: false, reason: 'Only 3 bags in stock.' },
      { grnItemId: 'gone', ok: true },
    ]);
    expect(changesOf(after)).toEqual([{ grnItemId: 'two', quantity: 8 }]);
    expect(after.selection.get('two')?.quantity).toBe(8);
    expect([...after.failed]).toEqual([['two', 'Only 3 bags in stock.']]);
    expect(after.base.has('one')).toBe(true);
    expect(after.base.has('gone')).toBe(false);
  });

  it('keeps a removal that was refused as a removal, with its reason', () => {
    const after = applyResults(chosen, [
      { grnItemId: 'one', ok: true },
      { grnItemId: 'two', ok: true },
      { grnItemId: 'gone', ok: false, reason: 'This order is closed. Go back and open it again.' },
    ]);
    expect(changesOf(after)).toEqual([{ grnItemId: 'gone', quantity: 0 }]);
    expect(after.failed.get('gone')).toBe('This order is closed. Go back and open it again.');
  });

  it('does not change the draft it was given', () => {
    applyResults(chosen, [{ grnItemId: 'one', ok: true }]);
    expect(chosen.base.has('one')).toBe(false);
    expect(chosen.failed.size).toBe(0);
  });
});

describe('reasons', () => {
  const failed = applyResults(withQuantity(seedDraft([]), lot('one'), 9), [{ grnItemId: 'one', ok: false, reason: 'Only 3 bags in stock.' }]);

  it('drops the reason of a lot when its quantity is changed, and only that one', () => {
    const two = applyResults(withQuantity(failed, lot('two'), 1), [{ grnItemId: 'two', ok: false, reason: 'This lot is already in the order.' }]);
    const edited = withQuantity(two, lot('one'), 3);
    expect([...edited.failed.keys()]).toEqual(['two']);
    expect(changesOf(edited)).toEqual([{ grnItemId: 'one', quantity: 3 }, { grnItemId: 'two', quantity: 1 }]);
  });

  it('are cleared for the next Add without touching what is chosen', () => {
    const cleared = withoutReasons(failed);
    expect(cleared.failed.size).toBe(0);
    expect(changesOf(cleared)).toEqual([{ grnItemId: 'one', quantity: 9 }]);
  });
});
