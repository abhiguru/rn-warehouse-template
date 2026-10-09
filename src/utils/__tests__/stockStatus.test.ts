import {
  LOW_STOCK_RATIO,
  getStockLevel,
  getStockStatus,
  isLowStock,
} from '@/utils/stockStatus';

describe('stock status: one rule for the whole app', () => {
  it('uses 20% of the original quantity as the low-stock threshold', () => {
    expect(LOW_STOCK_RATIO).toBe(0.2);
  });

  it.each([
    [0, 100, 'negative', 'Out of stock'],
    [-3, 100, 'negative', 'Out of stock'],
    [1, 100, 'critical', 'Low stock'],
    [19, 100, 'critical', 'Low stock'],
    [20, 100, 'positive', 'In stock'],
    [50, 100, 'positive', 'In stock'],
    [100, 100, 'positive', 'In stock'],
    [5, 0, 'positive', 'In stock'],
    [0, 0, 'negative', 'Out of stock'],
  ])('%d of %d is %s (%s)', (stock, qty, level, label) => {
    expect(getStockLevel(stock, qty)).toBe(level);
    const status = getStockStatus(stock, qty);
    expect(status.status).toBe(level);
    expect(status.label).toBe(label);
    expect(isLowStock(stock, qty)).toBe(level === 'critical');
  });

  it('reports the remaining percentage clamped to 0–100', () => {
    expect(getStockStatus(10, 100).percentage).toBe(10);
    expect(getStockStatus(150, 100).percentage).toBe(100);
    expect(getStockStatus(5, 0).percentage).toBe(0);
  });

  it('uses the §3.5 status icons', () => {
    expect(getStockStatus(0, 10).icon).toBe('alert-circle');
    expect(getStockStatus(1, 10).icon).toBe('alert');
    expect(getStockStatus(10, 10).icon).toBe('check-circle');
  });
});
