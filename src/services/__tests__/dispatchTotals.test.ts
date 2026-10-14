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
