/**
 * The invoice items table groups lines by item group and by dispatch. It did
 * that with `dispatches.find` inside the loop: n(n-1)/2 comparisons for a group
 * of n distinct dispatches, on every group-rate key press (review finding F1).
 */
import type { InvoiceItemData } from '@/types/invoice.types';
import type { GroupedInvoiceItems } from '@/types/invoice.types';
import { groupInvoiceItems, invoiceGroupTotal, invoiceGroupTotals } from '../groupInvoiceItems';

type OldGroup = GroupedInvoiceItems & { allItems: InvoiceItemData[] };

/**
 * The grouping as InvoiceItemsTable did it before (main 92a2a09), copied unchanged but for the
 * weight. The old group held one weight, the first line's, in a field called `total_weight`. A
 * group can hold lots of different weights, so it now carries the distinct weights of its lines
 * (`weights_each`), worked out here in another way than the grouping does.
 */
function oldGrouping(items: InvoiceItemData[]): OldGroup[] {
  const groups: OldGroup[] = [];
  const itemMap = new Map<string, OldGroup>();
  items.forEach((item) => {
    const groupKey = `${item.item_id}:::${item.package_mark}`;
    if (!itemMap.has(groupKey)) {
      itemMap.set(groupKey, {
        item_id: item.item_id,
        item_name: item.item_name,
        package_mark: item.package_mark,
        weights_each: [],
        gr_quantity: item.grn_original_qty,
        total_dispatched: 0,
        rack: item.rack,
        dispatches: [],
        allItems: [],
      });
    }
    const itemGroup = itemMap.get(groupKey)!;
    let dispatchGroup = itemGroup.dispatches.find((d) => d.dispatch_id === item.dispatch_id);
    if (!dispatchGroup) {
      dispatchGroup = { dispatch_no: item.dispatch_no, dispatch_id: item.dispatch_id, dispatch_date: item.dispatch_date, items: [] };
      itemGroup.dispatches.push(dispatchGroup);
    }
    dispatchGroup.items.push(item);
    itemGroup.allItems.push(item);
    itemGroup.total_dispatched += item.qty;
  });
  itemMap.forEach((group) => {
    group.weights_each = group.allItems
      .map((item) => item.weight)
      .filter((weight, index, all) => weight > 0 && all.indexOf(weight) === index)
      .sort((a, b) => a - b);
    groups.push(group);
  });
  return groups;
}
const oldTotal = (group: GroupedInvoiceItems) =>
  group.dispatches.reduce((sum, dispatch) => sum + dispatch.items.reduce((s, item) => s + item.item_total, 0), 0);

const line = (n: number, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: `t${n}`, disp_trl_id: `dt${n}`, grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional onions', qty: 1 + (n % 7),
  grn_original_qty: 500, package_mark: 'FX', rack: 'B2', weight: 40, dispatch_id: `d${n}`, dispatch_no: `I${String(n).padStart(4, '0')}`,
  dispatch_date: '2026-09-01', grn_id: 'g', grn_no: 'FX9', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 5, labour_amount: 2, tax_amount: 0.35, item_total: 7.35 + (n % 11) * 0.1,
  ...overrides,
});

/**
 * 500 lines in 41 groups: groups interleaved, dispatch ids repeated within a
 * group and across groups, some lines without a dispatch id.
 */
function fixture(): InvoiceItemData[] {
  return Array.from({ length: 500 }, (_, n) => {
    const group = (n * 7) % 41;
    const dispatchId = n % 13 === 0 ? (undefined as unknown as string) : `d${n % 37}`;
    return line(n, { item_id: `item-${group % 20}`, package_mark: `M${Math.floor(group / 20)}`, item_name: `Fictional item ${group}`, dispatch_id: dispatchId });
  });
}

describe('groupInvoiceItems', () => {
  it('gives the same groups, dispatches, lines, order and totals as the old grouping (500 lines, 41 groups)', () => {
    const items = fixture();
    const groups = groupInvoiceItems(items);
    const old = oldGrouping(items);

    expect(old).toHaveLength(41);
    expect(groups).toEqual(old);
    // The same order of groups, dispatches and lines, not only equal contents.
    expect(groups.map((g) => `${g.item_id}:::${g.package_mark}`)).toEqual(old.map((g) => `${g.item_id}:::${g.package_mark}`));
    groups.forEach((group, i) => {
      expect(group.dispatches.map((d) => d.dispatch_id)).toEqual(old[i].dispatches.map((d) => d.dispatch_id));
      group.allItems.forEach((item, j) => expect(item).toBe(old[i].allItems[j]));
      expect(invoiceGroupTotal(group)).toBe(oldTotal(old[i]));
    });
    const totals = invoiceGroupTotals(groups);
    old.forEach((group) => expect(totals.get(`${group.item_id}:::${group.package_mark}`)).toBe(oldTotal(group)));
  });

  it('makes no Array.find call for a group of 1,000 distinct dispatches', () => {
    const items = Array.from({ length: 1000 }, (_, n) => line(n));
    const find = jest.spyOn(Array.prototype, 'find');
    try {
      const groups = groupInvoiceItems(items);
      expect(find).not.toHaveBeenCalled();
      expect(groups).toHaveLength(1);
      expect(groups[0].dispatches).toHaveLength(1000);
    } finally {
      find.mockRestore();
    }
  });

  it('gives a new object only for the group whose line changed', () => {
    const items = fixture();
    const first = groupInvoiceItems(items);
    const groupB = first[5];
    const changedLine = groupB.allItems[2];
    const index = items.indexOf(changedLine);
    const next = [...items];
    next[index] = { ...changedLine, charge: 9, item_total: changedLine.item_total + 4 };

    const second = groupInvoiceItems(next, first);

    expect(second).toHaveLength(first.length);
    second.forEach((group, i) => {
      if (i === 5) expect(group).not.toBe(first[i]);
      else expect(group).toBe(first[i]);
    });
    expect(second[5].allItems[2].charge).toBe(9);

    const totals = invoiceGroupTotals(second, { groups: first, totals: invoiceGroupTotals(first) });
    oldGrouping(next).forEach((group) => expect(totals.get(`${group.item_id}:::${group.package_mark}`)).toBe(oldTotal(group)));
  });

  it('gives a new object for a group that lost or gained a line', () => {
    const items = fixture();
    const first = groupInvoiceItems(items);
    // A line that is not the first of its group, so the order of the groups stays.
    const removed = first[3].allItems[1];
    const second = groupInvoiceItems(items.filter((item) => item !== removed), first);
    expect(second[3]).not.toBe(first[3]);
    expect(second[3].allItems).toHaveLength(first[3].allItems.length - 1);
    second.forEach((group, i) => { if (i !== 3) expect(group).toBe(first[i]); });
  });
});

/**
 * Lines are grouped by catalogue item and mark, not by lot, so one group can hold lots whose
 * bags weigh differently (a GRN with a 50 kg line and a 25 kg line of the same item and mark).
 * The group took its one weight from the first line, and the header said "50 kg each" over the
 * 25 kg lot too. The server prices every line by its own weight.
 */
describe('the weights of a group', () => {
  /** One group (same item and mark) with a line for each given weight, in that order. */
  const groupOf = (...lots: (number | null | undefined)[]) => {
    const groups = groupInvoiceItems(lots.map((weight, n) => line(n, { weight: weight as number })));
    expect(groups).toHaveLength(1);
    expect(groups[0].allItems).toHaveLength(lots.length);
    return groups[0];
  };

  it.each<[string, (number | null | undefined)[], number[]]>([
    ['lots of 50 kg and 25 kg: both weights, lightest first', [50, 25], [25, 50]],
    ['two lots of 50 kg: the one weight, once', [50, 50], [50]],
    ['a lot without a weight and a lot of 50 kg: the 50 kg alone', [0, 50], [50]],
    ['three lots, one weight twice', [50, 25, 37.5, 25], [25, 37.5, 50]],
    ['no lot with a weight: none', [0, null, undefined, NaN, Infinity, -5], []],
    ['a weight sent as text is its number: "50" and 50 are one weight', ['50' as unknown as number, 50, '25' as unknown as number], [25, 50]],
  ])('%s', (_name, lots, expected) => {
    expect(groupOf(...lots).weights_each).toEqual(expected);
  });

  it('holds no single weight that could stand for every lot', () => {
    const group = groupOf(50, 25);
    expect(group).not.toHaveProperty('weight_each');
    expect(group).not.toHaveProperty('total_weight');
  });

  it('keeps the lines, their order and the dispatched quantity as they were', () => {
    const group = groupOf(50, 25);
    expect(group.allItems.map((item) => item.weight)).toEqual([50, 25]);
    expect(group.total_dispatched).toBe(group.allItems[0].qty + group.allItems[1].qty);
  });

  it('a group that is reused keeps its weights, and a changed line gives the new ones', () => {
    const items = [line(0, { weight: 50 }), line(1, { weight: 25 })];
    const first = groupInvoiceItems(items);
    const again = groupInvoiceItems([...items], first);
    expect(again[0]).toBe(first[0]);
    expect(again[0].weights_each).toEqual([25, 50]);

    const changed = groupInvoiceItems([items[0], { ...items[1], weight: 50 }], first);
    expect(changed[0]).not.toBe(first[0]);
    expect(changed[0].weights_each).toEqual([50]);
  });
});
