import {
  LOW_STOCK_RATIO,
  getStockLevel,
  getStockStatus,
  isLowStock,
  getStockBadgeLabel,
  getStockValueLevel,
  STOCK_VALUE_ICONS,
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

describe('the GRN list card: value colour and badge word (WH-57, WH-58)', () => {
  it.each([
    [100, 100, 'positive'],
    [80, 100, 'positive'],
    [79, 100, 'critical'],
    [20, 100, 'critical'],
    [19, 100, 'negative'],
    [1, 100, 'negative'],
    [0, 100, 'negative'],
    [-5, 100, 'negative'],
    [0, 0, 'neutral'],
    [5, 0, 'neutral'],
    [5, -1, 'neutral'],
  ] as const)('%p left of %p reads %s', (stock, qty, level) => {
    expect(getStockValueLevel(stock, qty)).toBe(level);
  });

  it.each([
    [0, 0, 'N/A'],
    [5, 0, 'N/A'],
    [0, 100, 'Empty'],
    [-2, 100, 'Empty'],
    [1, 100, 'Partial'],
    [85, 100, 'Partial'],
    [99, 100, 'Partial'],
    [100, 100, 'Full'],
    [120, 100, 'Full'],
  ] as const)('%p left of %p says %s', (stock, qty, word) => {
    expect(getStockBadgeLabel(stock, qty)).toBe(word);
  });

  it('colours by how much is left while the word only says empty, partial or full: 85% left is a green Partial, 10% a red one', () => {
    expect(getStockValueLevel(85, 100)).toBe('positive');
    expect(getStockBadgeLabel(85, 100)).toBe('Partial');
    expect(getStockValueLevel(10, 100)).toBe('negative');
    expect(getStockBadgeLabel(10, 100)).toBe('Partial');
  });

  it('has an icon for each level', () => {
    expect(Object.keys(STOCK_VALUE_ICONS).sort()).toEqual(['critical', 'negative', 'neutral', 'positive']);
  });
});
