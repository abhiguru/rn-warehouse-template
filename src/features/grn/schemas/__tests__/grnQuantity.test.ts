import {
  isValidReceiptQuantity,
  parseReceiptQuantity,
  parseReceiptWeight,
  parseWholeNumberInput,
  validateStep2,
} from '../grnValidation';

// Items carry the typed text exactly as the form does: the schema's own
// whole-number transform decides what it means.
const item = (qty: string, overrides: Partial<{ stock: string | number; weight: string }> = {}) => ({
  item_table_id: 'a8255110-bdb6-11f1-b1c0-532da39b4765',
  item_name: 'Backend Test Potatoes',
  packaging: 'Bag',
  qty,
  stock: overrides.stock ?? qty,
  weight: overrides.weight ?? '10',
  rack: '',
  package_mark: '',
  trl_images: [],
});

describe('parseWholeNumberInput', () => {
  it.each([
    ['1 2'],
    ['1 000'],
    ['1e3'],
    ['0x10'],
    ['3000000000'],
    ['+5'],
    ['-1'],
    ['1.0'],
    ['1.5'],
    [''],
    ['   '],
    ['2bags'],
    ['Infinity'],
    ['NaN'],
    ['１２'],
  ])('returns null for %p instead of coercing it', text => {
    expect(parseWholeNumberInput(text)).toBeNull();
  });

  it.each([
    [' 7 ', 7],
    ['0', 0],
    ['1', 1],
    ['20', 20],
    ['999999999', 999_999_999],
  ])('parses %p as %d', (text, expected) => {
    expect(parseWholeNumberInput(text)).toBe(expected);
  });
});

describe('receipt quantity and weight parsers', () => {
  it('requires a quantity of at least 1', () => {
    expect(parseReceiptQuantity('0')).toBeNull();
    expect(parseReceiptQuantity('1')).toBe(1);
    expect(parseReceiptQuantity(' 7 ')).toBe(7);
    expect(parseReceiptQuantity('3000000000')).toBeNull();
  });

  it('allows a zero weight but no negative or non-whole weight', () => {
    expect(parseReceiptWeight('0')).toBe(0);
    expect(parseReceiptWeight('12')).toBe(12);
    expect(parseReceiptWeight('-1')).toBeNull();
    expect(parseReceiptWeight('1.5')).toBeNull();
    expect(parseReceiptWeight('')).toBeNull();
  });
});

describe('receipt quantity admission and validation', () => {
  it.each(['', '0', '-1', '1.5', '2bags', 'Infinity', '1 2', '1 000', '1e3', '0x10', '3000000000', '+5', '1.0'])(
    'rejects entered quantity %p without truncation',
    async value => {
      expect(isValidReceiptQuantity(value)).toBe(false);
      const result = await validateStep2({ items: [item(value)] });
      expect(result.isValid).toBe(false);
      expect(result.errors['items[0].qty']).toBeDefined();
    }
  );

  it.each(['1', '2', '20', ' 7 '])('preserves ordinary positive whole quantity %p', async value => {
    expect(isValidReceiptQuantity(value)).toBe(true);
    expect((await validateStep2({ items: [item(value)] })).isValid).toBe(true);
  });

  it('casts surrounding whitespace away without changing the digits', async () => {
    expect(parseReceiptQuantity(' 7 ')).toBe(7);
    expect((await validateStep2({ items: [item(' 7 ', { stock: ' 7 ' })] })).isValid).toBe(true);
  });

  it('reports a fractional value through the whole-number rule', async () => {
    const result = await validateStep2({ items: [item('1.5')] });
    expect(result.errors['items[0].qty']).toBe('Quantity must be a whole number');
  });

  it('reports an empty quantity as required rather than as zero', async () => {
    const result = await validateStep2({ items: [item('')] });
    expect(result.errors['items[0].qty']).toBe('Quantity is required');
  });

  it('rejects a fractional numeric quantity already stored as a number', async () => {
    const result = await validateStep2({ items: [{ ...item('1'), qty: 1.5, stock: 1 }] });
    expect(result.isValid).toBe(false);
    expect(result.errors['items[0].qty']).toBe('Quantity must be a whole number');
  });

  it('accepts a zero weight and rejects a negative or garbled weight', async () => {
    expect((await validateStep2({ items: [item('3', { weight: '0' })] })).isValid).toBe(true);
    expect((await validateStep2({ items: [item('3', { weight: '' })] })).isValid).toBe(true);
    const negative = await validateStep2({ items: [item('3', { weight: '-1' })] });
    expect(negative.isValid).toBe(false);
    expect(negative.errors['items[0].weight']).toBeDefined();
    const garbled = await validateStep2({ items: [item('3', { weight: '1e3' })] });
    expect(garbled.isValid).toBe(false);
    expect(garbled.errors['items[0].weight']).toBe('Weight must be a whole number');
  });

  it('rejects stock above the received quantity', async () => {
    const result = await validateStep2({ items: [item('3', { stock: '4' })] });
    expect(result.isValid).toBe(false);
    expect(result.errors['items[0].stock']).toBe('Stock cannot exceed the received quantity');
    expect((await validateStep2({ items: [item('3', { stock: '3' })] })).isValid).toBe(true);
    expect((await validateStep2({ items: [item('3', { stock: 0 })] })).isValid).toBe(true);
  });
});
