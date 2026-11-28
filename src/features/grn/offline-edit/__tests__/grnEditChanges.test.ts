/**
 * WH-303 slice A-1, test first (product/tech/app-offline-edit-grn.md section 3.1-3.3 and 10, cases E1-E8). The module
 * `src/features/grn/offline-edit/grnEditChanges.ts` does not exist yet: these fail until it is built.
 *
 * Real: the pure functions only. Nothing is faked.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - `diffGrnEdit(baseline, form, meta)`: baseline and form are `loadGRNData`'s own `data` shape `{ header, items }`
 *    (header: gr_no, registration, date, sender_id, sender_name, customer_id, customer_name, supervisor_id,
 *    supervisor_name, note, leon, pricing_mode; item: grn_trl_id, item_table_id, item_name, packaging, qty, weight, rack,
 *    package_mark), meta = { grnId, loadedAt, recordedAt }. A form line whose `grn_trl_id` is not in the baseline is an
 *    added line and that id is its `clientLineId`; a baseline line missing from the form is a removed one.
 *    Blank text ('') is `null` in a body (rack, mark, packaging, note, registration), as the server stores it.
 *  - `mergeGrnEdit(earlier, later)` takes two bodies; a later body that removes a line the earlier one added names it by
 *    `linesRemoved[].lotId = clientLineId` (the form diffs against the overlaid baseline, section 3.3).
 *  - `changedFieldLabels(body)` returns the labels' locale keys or their English text: the cases translate both alike
 *    through `t` and check only the order and the two line labels (English "Lines added" / "Lines removed").
 *  - The empty-result case of `mergeGrnEdit` is `null` (the signature says `GrnEditBody | null`).
 * ====================================================================
 */
import { t } from '@/i18n';

type Body = Record<string, any>;
interface Changes {
  diffGrnEdit(baseline: unknown, form: unknown, meta: { grnId: string; loadedAt: string | null; recordedAt: string }): Body | null;
  mergeGrnEdit(earlier: Body, later: Body): Body | null;
  changedFieldLabels(body: Body): string[];
}
const changes = (): Changes => require('@/features/grn/offline-edit/grnEditChanges');

const META = { grnId: 'g-B1', loadedAt: '2026-11-25T10:00:00+00:00', recordedAt: '2026-11-27T10:00:00.000Z' };
const header = () => ({
  gr_no: 'B1', registration: 'GJ01AB1234', date: '2026-11-21T05:00:00+00:00', sender_id: 's1', sender_name: 'Sunil Fictional',
  customer_id: 'c1', customer_name: 'asha Traders', supervisor_id: 'p1', supervisor_name: 'Meera Fictional', note: '',
  leon: false, pricing_mode: 'MONTHLY',
});
const line = (id: string, over: Record<string, unknown> = {}) => ({
  grn_trl_id: id, item_table_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 50, weight: 26, rack: 'D-4', package_mark: 'pk-99', ...over,
});
const baseline = () => ({ header: header(), items: [line('l06'), line('l09', { item_table_id: 'i2', item_name: 'Beans', qty: 100, weight: 30, rack: 'B-3', package_mark: null })] });
const edited = (headerOver: Record<string, unknown> = {}, lineOver: Record<string, Record<string, unknown>> = {}) => {
  const b = baseline();
  return { header: { ...b.header, ...headerOver }, items: b.items.map(l => ({ ...l, ...(lineOver[l.grn_trl_id] ?? {}) })) };
};

describe('E1, E2, E3, E8: the diff', () => {
  it('E1: one changed field gives a body with only that field, the baseline value as from', () => {
    expect(changes().diffGrnEdit(baseline(), edited({}, { l06: { rack: 'C-2' } }), META)).toEqual({
      v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt: META.recordedAt, lots: { l06: { rack: { from: 'D-4', to: 'C-2' } } },
    });
  });

  it('E1: header fields go under header, lot fields under their lot id; a typed number is a number', () => {
    const body = changes().diffGrnEdit(baseline(), edited({ note: 'Fictional note', leon: true }, { l09: { qty: 120, weight: 31 } }), META) as Body;
    expect(body.header).toEqual({ note: { from: null, to: 'Fictional note' }, leon: { from: false, to: true } });
    expect(body.lots).toEqual({ l09: { qty: { from: 100, to: 120 }, weight: { from: 30, to: 31 } } });
  });

  it('E2: nothing changed gives null (nothing is queued)', () => {
    expect(changes().diffGrnEdit(baseline(), edited(), META)).toBeNull();
  });

  it('E2: a blank text typed over a blank one is not a change', () => {
    expect(changes().diffGrnEdit(baseline(), edited({ note: '' }, { l09: { package_mark: '' } }), META)).toBeNull();
  });

  it('E3: paired fields travel as one field with id and name', () => {
    const body = changes().diffGrnEdit(
      baseline(),
      edited({ customer_id: 'c2', customer_name: 'Bhavin Foods', sender_id: 's2', sender_name: 'Tara Fictional' }, { l06: { item_table_id: 'i3', item_name: 'Rice' } }),
      META
    ) as Body;
    expect(body.header.customer_id).toEqual({ from: { id: 'c1', name: 'asha Traders' }, to: { id: 'c2', name: 'Bhavin Foods' } });
    expect(body.header.sender).toEqual({ from: { id: 's1', name: 'Sunil Fictional' }, to: { id: 's2', name: 'Tara Fictional' } });
    expect(body.lots.l06.item).toEqual({ from: { id: 'i1', name: 'Peas' }, to: { id: 'i3', name: 'Rice' } });
    // The id and the name are never separate members of the body.
    expect(Object.keys(body.header)).not.toContain('customer_name');
    expect(Object.keys(body.header)).not.toContain('sender_id');
  });

  it('E8: the GRN number is never in a body, even when the form says it changed', () => {
    const body = changes().diffGrnEdit(baseline(), edited({ gr_no: 'B99', note: 'x' }), META) as Body;
    expect(JSON.stringify(body)).not.toContain('gr_no');
    expect(Object.keys(body.header)).toEqual(['note']);
  });

  it('E4: a line added and a line removed in one form go only into linesAdded and linesRemoved', () => {
    const form = edited();
    form.items = [form.items[0], line('new-1', { item_table_id: 'i3', item_name: 'Rice', qty: 4, weight: 24, rack: 'F-1', package_mark: '' })];
    const body = changes().diffGrnEdit(baseline(), form, META) as Body;
    expect(body.linesAdded).toEqual([{ clientLineId: 'new-1', item_id: 'i3', item_name: 'Rice', packaging: 'Bag', qty: 4, weight: 24, rack: 'F-1', package_mark: null }]);
    expect(body.linesRemoved).toEqual([{ lotId: 'l09', item_name: 'Beans', qty: 100 }]);
    expect(body.lots).toBeUndefined();
    expect(body.header).toBeUndefined();
  });
});

describe('E5, E5b, E6: merging two unsent bodies', () => {
  const rack = (from: string, to: string, recordedAt = META.recordedAt): Body => ({ v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt, lots: { l06: { rack: { from, to } } } });

  it('E5: the earlier from is kept, the later to is taken, and the later Save time is the body time', () => {
    const merged = changes().mergeGrnEdit(rack('D-4', 'C-2'), { ...rack('C-2', 'E-9', '2026-11-27T11:00:00.000Z'), header: { note: { from: null, to: 'x' } } }) as Body;
    expect(merged.lots.l06.rack).toEqual({ from: 'D-4', to: 'E-9' });
    expect(merged.header.note).toEqual({ from: null, to: 'x' });
    expect(merged.recordedAt).toBe('2026-11-27T11:00:00.000Z');
  });

  it('E5: a field put back to where it started is kept, and so is the body (the server decides a no-op)', () => {
    const merged = changes().mergeGrnEdit(rack('D-4', 'C-2'), rack('C-2', 'D-4')) as Body;
    expect(merged).not.toBeNull();
    expect(merged.lots.l06.rack).toEqual({ from: 'D-4', to: 'D-4' });
  });

  it('E5: a line added and then removed again before any send is gone from the body', () => {
    const earlier: Body = { ...rack('D-4', 'C-2'), linesAdded: [{ clientLineId: 'new-1', item_id: 'i3', item_name: 'Rice', packaging: 'Bag', qty: 4, weight: 24, rack: null, package_mark: null }] };
    const later: Body = { v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt: META.recordedAt, linesRemoved: [{ lotId: 'new-1', item_name: 'Rice', qty: 4 }] };
    const merged = changes().mergeGrnEdit(earlier, later) as Body;
    expect(merged.linesAdded ?? []).toEqual([]);
    expect(merged.linesRemoved ?? []).toEqual([]);
    expect(merged.lots.l06.rack.to).toBe('C-2');
  });

  it('E5: an added line that is only added and removed leaves nothing at all: null', () => {
    const earlier: Body = { v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt: META.recordedAt, linesAdded: [{ clientLineId: 'new-1', item_id: 'i3', item_name: 'Rice', packaging: null, qty: 4, weight: 24, rack: null, package_mark: null }] };
    const later: Body = { v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt: META.recordedAt, linesRemoved: [{ lotId: 'new-1', item_name: 'Rice', qty: 4 }] };
    expect(changes().mergeGrnEdit(earlier, later)).toBeNull();
  });

  it('E5: a line of the server that was removed stays removed after a merge', () => {
    const removed: Body = { v: 1, grnId: 'g-B1', loadedAt: META.loadedAt, recordedAt: META.recordedAt, linesRemoved: [{ lotId: 'l09', item_name: 'Beans', qty: 100 }] };
    const merged = changes().mergeGrnEdit(rack('D-4', 'C-2'), removed) as Body;
    expect(merged.linesRemoved).toEqual([{ lotId: 'l09', item_name: 'Beans', qty: 100 }]);
  });
});

describe('E7: the labels of what changed', () => {
  const body: Body = {
    v: 1, grnId: 'g-B1', loadedAt: null, recordedAt: META.recordedAt,
    lots: { l06: { package_mark: { from: 'a', to: 'b' }, rack: { from: 'a', to: 'b' }, qty: { from: 1, to: 2 } } },
    linesAdded: [{ clientLineId: 'n', item_id: 'i3', item_name: 'Rice', packaging: null, qty: 1, weight: 1, rack: null, package_mark: null }],
    linesRemoved: [{ lotId: 'l09', item_name: 'Beans', qty: 100 }],
  };
  it('lists the form fields in form order (Quantity, Rack, Mark), then Lines added, then Lines removed', () => {
    const words = changes().changedFieldLabels(body).map(label => t(label as never));
    expect(words).toEqual(['Quantity', 'Rack', 'Mark', 'Lines added', 'Lines removed']);
  });
});
