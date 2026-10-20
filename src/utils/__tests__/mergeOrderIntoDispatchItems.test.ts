/**
 * What happens to the lines of a dispatch form when the order it was made from changed (wave B, D5): the order's lines
 * are read again and merged into the form by their lot.
 */
import { mergeOrderIntoDispatchItems, orderLotsOfItems } from '../orderToDispatchConverter';
import type { DispatchItemData, OrderLotAsk } from '@/types/dispatch.types';

const line = (lot: string, quantity: number, stock = 100, uniqueId = `form-${lot}`): DispatchItemData =>
  ({
    unique_id: uniqueId,
    grns_id: 'grn-1',
    grns_gr_no: 'A0010',
    grnItems_id: lot,
    grnItems_item_name: `Fictional ${lot}`,
    grnItems_quantity: 100,
    grnItems_stock: stock,
    disp_quantity: quantity,
  }) as DispatchItemData;
/** The line `convertOrderToDispatchData` makes now (another unique id every time it is read). */
const fresh = (lot: string, quantity: number, stock = 100) => line(lot, quantity, stock, `order-${lot}-new`);
const asked = (requested: number, defaultQuantity = requested): OrderLotAsk => ({ requested, defaultQuantity });
const quantities = (items: DispatchItemData[]) => items.map((item) => [item.grnItems_id, item.disp_quantity]);

describe('mergeOrderIntoDispatchItems', () => {
  it('a lot whose quantity the person changed keeps it, and keeps its place and id in the form', () => {
    const merged = mergeOrderIntoDispatchItems(
      [line('a', 7), line('b', 20)],
      [fresh('a', 30), fresh('b', 20)],
      { a: asked(20), b: asked(20) }
    );

    expect(quantities(merged)).toEqual([['a', 7], ['b', 20]]);
    expect(merged.map((item) => item.unique_id)).toEqual(['form-a', 'form-b']);
  });

  it('a lot still at the quantity the form was given takes the order\'s new quantity', () => {
    const merged = mergeOrderIntoDispatchItems([line('a', 20)], [fresh('a', 35)], { a: asked(20) });
    expect(quantities(merged)).toEqual([['a', 35]]);
  });

  it('a quantity the person typed is cut to the stock now, and is never below 1', () => {
    expect(quantities(mergeOrderIntoDispatchItems([line('a', 50)], [fresh('a', 10, 12)], { a: asked(20) }))).toEqual([['a', 12]]);
    expect(quantities(mergeOrderIntoDispatchItems([line('a', 0)], [fresh('a', 0, 5)], { a: asked(20) }))).toEqual([['a', 1]]);
  });

  it('a line from the order whose lot is no longer on it is dropped', () => {
    const merged = mergeOrderIntoDispatchItems([line('a', 20), line('b', 20)], [fresh('b', 20)], { a: asked(20), b: asked(20) });
    expect(quantities(merged)).toEqual([['b', 20]]);
  });

  it('a lot new on the order comes in last, with its default quantity', () => {
    const merged = mergeOrderIntoDispatchItems([line('a', 20)], [fresh('c', 8), fresh('a', 20)], { a: asked(20) });
    expect(quantities(merged)).toEqual([['a', 20], ['c', 8]]);
  });

  it('a lot the person removed does not come back', () => {
    const merged = mergeOrderIntoDispatchItems([line('a', 20)], [fresh('a', 20), fresh('b', 20)], { a: asked(20), b: asked(20) });
    expect(quantities(merged)).toEqual([['a', 20]]);
  });

  it('a line the person added by hand stays, in its place; it becomes the order\'s line when the order has the lot now', () => {
    const before = { a: asked(20) };
    expect(quantities(mergeOrderIntoDispatchItems([line('hand', 5), line('a', 20)], [fresh('a', 25)], before))).toEqual([['hand', 5], ['a', 25]]);
    const taken = mergeOrderIntoDispatchItems([line('hand', 5)], [fresh('hand', 9)], before);
    expect(quantities(taken)).toEqual([['hand', 5]]);
    expect(taken[0].unique_id).toBe('form-hand');
  });

  it('a form with no record of the order (null) treats every lot of the order as new', () => {
    expect(quantities(mergeOrderIntoDispatchItems([], [fresh('a', 4)], null))).toEqual([['a', 4]]);
  });

  it('an order with no lot left empties a form made only from the order', () => {
    expect(mergeOrderIntoDispatchItems([line('a', 20)], [], { a: asked(20) })).toEqual([]);
  });
});

describe('orderLotsOfItems', () => {
  it('takes every line as one the order gave, with the quantity it holds as its default', () => {
    expect(orderLotsOfItems([line('a', 12), line('b', 3)])).toEqual({ a: { requested: 12, defaultQuantity: 12 }, b: { requested: 3, defaultQuantity: 3 } });
  });
});
