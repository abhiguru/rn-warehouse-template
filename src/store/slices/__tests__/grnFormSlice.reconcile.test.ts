/**
 * reconcileItems: the GRN items step's Next in one action. It must leave the
 * same lines as the per-line path it replaces (updateItem for a stored line,
 * addItem for a new one), and keep the object of every line it does not change.
 */
import reducer, { addItem, reconcileGrnItems, reconcileItems, updateItem, type GRNItemData } from '../grnFormSlice';

const line = (n: number, overrides: Partial<GRNItemData> = {}): GRNItemData => ({
  grn_trl_id: `line-${n}`,
  item_table_id: `item-${n % 5}`,
  item_name: `Fictional item ${n % 5}`,
  packaging: 'Bag',
  qty: 10 + n,
  stock: 10 + n,
  weight: 40,
  rack: 'R1',
  package_mark: `M${n}`,
  trl_images: [],
  ...overrides,
});

const stateWith = (lines: GRNItemData[]) => lines.reduce((state, item) => reducer(state, addItem(item)), reducer(undefined, { type: 'init' }));

/** The old Next: one action per line, "stored" decided against the lines before Next. */
function perLine(lines: GRNItemData[], given: GRNItemData[]) {
  const before = stateWith(lines);
  return given.reduce(
    (state, item) =>
      before.items.find((stored) => stored.grn_trl_id === item.grn_trl_id)
        ? reducer(state, updateItem({ grn_trl_id: item.grn_trl_id, item }))
        : reducer(state, addItem(item)),
    before
  );
}

describe('reconcileItems', () => {
  it('leaves the same lines as one updateItem/addItem per line, for edited, new, repeated and untouched lines', () => {
    const image = { id: 'img-1', fileName: 'a.webp', imageUrl: 'https://example.test/a.webp', uploadStatus: 'completed' as const };
    const lines = [line(1), line(2, { qty: 100, stock: 60 }), line(3, { trl_images: [image] }), line(4), line(5)];
    const given = [
      line(1),                                   // unchanged
      line(2, { qty: 100, stock: 60, rack: 'R7' }), // edited, a line with dispatches keeps its stock
      line(3, { trl_images: [{ ...image }] }),  // the same photo as an equal copy: unchanged
      line(4, { qty: 99, stock: 99 }),          // edited
      line(9),                                   // new
      line(4, { qty: 98, stock: 98 }),          // the same line twice: the last one wins, as before
      line(10),                                  // new
    ];
    // line 5 is not given: it stays as it is.

    const expected = perLine(lines, given);
    const before = stateWith(lines);
    const after = reducer(before, reconcileItems(given));

    expect(after.items).toEqual(expected.items);
    expect(after.items[0]).toBe(before.items[0]);
    expect(after.items[2]).toBe(before.items[2]);
    expect(after.items[4]).toBe(before.items[4]);
    expect(after.items[1]).toMatchObject({ qty: 100, stock: 60, rack: 'R7' });
    expect(after.items.map((item) => item.grn_trl_id)).toEqual(['line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'line-9', 'line-10']);
  });

  it('keeps the state, the array and every line when nothing changed (500 lines)', () => {
    const lines = Array.from({ length: 500 }, (_, n) => line(n));
    const before = stateWith(lines);

    const after = reducer(before, reconcileItems(lines.map((item) => ({ ...item, trl_images: [] }))));

    expect(after).toBe(before);
    expect(after.items).toBe(before.items);
  });

  it('looks each line up once: no Array.find or findIndex for 500 lines', () => {
    const lines = Array.from({ length: 500 }, (_, n) => line(n));
    const given = lines.map((item, n) => (n % 2 ? { ...item, qty: item.qty + 1, stock: item.stock + 1 } : item));
    const find = jest.spyOn(Array.prototype, 'find');
    const findIndex = jest.spyOn(Array.prototype, 'findIndex');
    try {
      const result = reconcileGrnItems(lines, given);
      expect(find).not.toHaveBeenCalled();
      expect(findIndex).not.toHaveBeenCalled();
      expect(result.filter((item, n) => item !== lines[n])).toHaveLength(250);
    } finally {
      find.mockRestore();
      findIndex.mockRestore();
    }
  });
});
