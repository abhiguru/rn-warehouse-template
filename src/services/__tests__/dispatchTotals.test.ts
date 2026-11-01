import { mapBackendDispatch } from '../dispatch-service';

// Decision 2026-10-14: total weights are shown nowhere, so the mapper no longer computes one.
describe('mapBackendDispatch: no total weight', () => {
  it('keeps the quantities and the per-package weight, and carries no total weight', () => {
    const mapped = mapBackendDispatch({
      id: 'd1',
      disp_no: 'DD0001',
      customer_id: 'c1',
      customer_name: 'Example Customer',
      total_weight: 500,
      items: [{ item_id: 'i1', item_name: 'Potatoes', disp_qty: 5, weight: 50, gr_no: 'A0001' }],
    } as never);

    expect(mapped).not.toHaveProperty('total_weight');
    expect(mapped.total_qty).toBe(5);
    expect(mapped.items?.[0].weight).toBe(50);
  });
});

describe('mapBackendDispatch: the GRN of a line', () => {
  const dispatch = (item: Record<string, unknown>) =>
    mapBackendDispatch({ id: 'd1', disp_no: 'DD0001', customer_id: 'c1', customer_name: 'Example Customer', items: [{ item_id: 'i1', item_name: 'Potatoes', disp_qty: 5, gr_no: 'A0001', ...item }] } as never);

  it('keeps the GRN id the server sends, so the list can open the GRN', () => {
    expect(dispatch({ grn_id: 'grn-1' }).items?.[0].grn_id).toBe('grn-1');
  });

  it('leaves it null for an older server that sends none', () => {
    expect(dispatch({}).items?.[0].grn_id).toBeNull();
  });
});

describe('mapBackendDispatch: the packaging of a line', () => {
  const dispatch = (item: Record<string, unknown>) =>
    mapBackendDispatch({ id: 'd1', disp_no: 'DD0001', customer_id: 'c1', customer_name: 'Example Customer', items: [{ item_id: 'i1', item_name: 'Potatoes', disp_qty: 5, gr_no: 'A0001', ...item }] } as never);

  it('keeps the packaging the server sends, so the list card can count in boxes', () => {
    expect(dispatch({ packaging: 'Box' }).items?.[0].packaging).toBe('Box');
  });

  it('leaves it null for an older server, or an empty text', () => {
    expect(dispatch({}).items?.[0].packaging).toBeNull();
    expect(dispatch({ packaging: '' }).items?.[0].packaging).toBeNull();
  });
});
