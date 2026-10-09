import { getGRNStockStatus } from '../grnStockStatus';

describe('getGRNStockStatus', () => {
  it('shows a fully dispatched GRN as neutral, not as an error', () => {
    expect(getGRNStockStatus(0, 120)).toEqual({ status: 'neutral', label: 'Fully dispatched', icon: 'check-all' });
  });

  it('flags stock under 20% as low', () => {
    expect(getGRNStockStatus(19, 100)).toMatchObject({ status: 'critical', label: 'Low stock' });
  });

  it('treats 20% or more as in stock', () => {
    expect(getGRNStockStatus(20, 100)).toMatchObject({ status: 'positive', label: 'In stock' });
    expect(getGRNStockStatus(100, 100)).toMatchObject({ status: 'positive', label: 'In stock' });
  });

  it('returns null when nothing was received', () => {
    expect(getGRNStockStatus(0, 0)).toBeNull();
  });
});
