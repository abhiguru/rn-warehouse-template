import { orderEffectLines, orderEffectsNotice, parseOrderEffects, previewCreateDispatch, previewDeleteGrn, previewUpdateDispatch, previewUpdateGrn, withOrderEffects, type OrderEffect } from '../orderEffects';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  setLanguage('en');
});

const effect = (over: Partial<OrderEffect>): OrderEffect => ({
  customerId: 'c1', customerName: 'Fictional Spices', orderId: 'o1', orderNo: 'ORD-1', orderItemId: 'oi1', grnItemId: 'g1',
  itemName: 'Onions', packageMark: null, grnNo: 'X0001', oldQuantity: 20, newQuantity: 15, removed: false, change: 'reduced',
  availableStock: null, orderLinesLeft: 2, ...over,
});

const header = {
  disp_no: 'D1', disp_date: '2026-10-31', registration: 'ab12', customer_id: 'c1', customer_name: 'Fictional Spices',
  supervisor_id: 's1', supervisor_name: 'Sup', note: '', source_order_id: undefined,
} as never;
const items = [{ grnItems_id: 'g1', disp_quantity: 5 }] as never;

describe('parseOrderEffects', () => {
  it('reads the server fields and drops unreadable entries and unknown kinds', () => {
    const parsed = parseOrderEffects([
      { customer_id: 'c1', customer_name: 'A', order_id: 'o', order_no: 'ORD-9', order_item_id: 'i', grn_item_id: 'g', item_name: 'Onions', grn_no: 'X1', old_quantity: 20, new_quantity: 15, removed: false, change: 'reduced', available_stock: null, order_lines_left: 1 },
      { change: 'something_new' },
      null,
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ orderNo: 'ORD-9', oldQuantity: 20, newQuantity: 15, change: 'reduced', orderLinesLeft: 1 });
    expect(parseOrderEffects(undefined)).toEqual([]);
  });
});

describe('texts', () => {
  it('names each kind of change in English', () => {
    expect(orderEffectLines([effect({ customerName: 'Lakeview Spices' })])).toEqual(["Lakeview Spices' order: Onions (X0001) 20 → 15 bags"]);
    expect(orderEffectLines([effect({ customerName: 'Chips', change: 'reduced', oldQuantity: 3, newQuantity: 1 })])).toEqual(["Chips' order: Onions (X0001) 3 → 1 bag"]);
    expect(orderEffectLines([effect({ change: 'increased', oldQuantity: 5, newQuantity: 8 })])).toEqual(["Fictional Spices' order: Onions (X0001) 5 → 8 bags"]);
    expect(orderEffectLines([effect({ change: 'removed', removed: true, newQuantity: 0 })])).toEqual(["Onions (X0001) is removed from Fictional Spices' order."]);
    expect(orderEffectLines([effect({ change: 'removed', removed: true, newQuantity: 0, orderLinesLeft: 0 })])[0]).toMatch(/is removed from .*No line is left, so the order is removed\.$/);
    expect(orderEffectLines([effect({ change: 'exceeds_stock', oldQuantity: 5, newQuantity: 5, availableStock: 3 })])).toEqual(["Fictional Spices' order: Onions (X0001) asks for 5 bags, but only 3 bags will be in stock."]);
    expect(orderEffectLines([effect({ change: 'added', oldQuantity: 0, newQuantity: 4 })])[0]).toContain('is added, 4 bags');
  });

  it('uses Gujarati words and digits for counts, identifiers stay 0-9', () => {
    setLanguage('gu');
    const [line] = orderEffectLines([effect({})]);
    expect(line).toContain('નો ઑર્ડર');
    expect(line).toContain('X0001');
    expect(line).toContain('૨૦ → ૧૫ નંગ');
  });

  it('leaves the message alone without effects and appends a lead and bullets with them', () => {
    expect(withOrderEffects('Save?', null)).toBe('Save?');
    expect(withOrderEffects('Save?', [])).toBe('Save?');
    expect(withOrderEffects('Save?', [effect({})])).toBe("Save?\n\nThis also changes orders:\n• Fictional Spices' order: Onions (X0001) 20 → 15 bags");
    expect(withOrderEffects('Saved.', [effect({})], 'doneLead')).toContain('Orders changed:');
    expect(orderEffectsNotice([effect({})])).toMatch(/^These orders change when you save\n• /);
    expect(orderEffectsNotice(null)).toBe('');
  });
});

describe('previews', () => {
  const answer = { success: true, preview: true, order_effects: [{ change: 'reduced', customer_name: 'A', item_name: 'Onions', grn_no: 'X1', old_quantity: 20, new_quantity: 15 }] };

  it('call the preview functions with the data the save sends', async () => {
    rpc.mockResolvedValue({ data: answer, error: null });
    const created = await previewCreateDispatch(header, items);
    expect(created).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith('preview_create_dispatch', {
      p_dispatch_data: expect.objectContaining({ disp_no: 'D1', registration: 'AB12', customer_id: 'c1', disp_date: '2026-10-31' }),
      p_dispatch_items: [{ gr_trl_id: 'g1', disp_qty: 5 }],
    });
    await previewUpdateDispatch('d1', header, items, 'v1');
    expect(rpc).toHaveBeenLastCalledWith('preview_update_dispatch', expect.objectContaining({ p_dispatch_id: 'd1', p_dispatch_data: expect.objectContaining({ expected_updated_at: 'v1' }) }));
    await previewUpdateGrn({ p_grn_id: 'g' });
    expect(rpc).toHaveBeenLastCalledWith('preview_update_grn', { p_grn_id: 'g' });
    await previewDeleteGrn('g');
    expect(rpc).toHaveBeenLastCalledWith('preview_delete_grn', { p_grn_id: 'g' });
  });

  it('answer [] when nothing changes', async () => {
    rpc.mockResolvedValue({ data: { success: true, preview: true, order_effects: [] }, error: null });
    expect(await previewDeleteGrn('g')).toEqual([]);
  });

  it('answer null on an older server (function not found), a refusal, a transport error or a thrown call', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await previewDeleteGrn('g')).toBeNull();
    rpc.mockResolvedValueOnce({ data: { success: false, preview: true, error: 'Stock', reason: 'X' }, error: null });
    expect(await previewDeleteGrn('g')).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    expect(await previewDeleteGrn('g')).toBeNull();
    rpc.mockRejectedValueOnce(new Error('boom'));
    expect(await previewDeleteGrn('g')).toBeNull();
  });

  it('give up after the time limit and answer null', async () => {
    jest.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => undefined));
    const pending = previewDeleteGrn('g');
    await jest.advanceTimersByTimeAsync(8001);
    expect(await pending).toBeNull();
    jest.useRealTimers();
  });
});
