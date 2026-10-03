import { isValidReceiptQuantity, validateStep2 } from '../grnValidation';

const item = (value: string) => ({
  item_table_id: 'a8255110-bdb6-11f1-b1c0-532da39b4765',
  item_name: 'Backend Test Potatoes',
  packaging: 'Bag',
  qty: Number(value) || 0,
  stock: Number(value) || 0,
  weight: 10,
  rack: '',
  package_mark: '',
  trl_images: [],
});

describe('receipt quantity admission and validation', () => {
  it.each(['', '0', '-1', '1.5', '2bags', 'Infinity'])('rejects entered quantity %p without truncation', async value => {
    expect(isValidReceiptQuantity(value)).toBe(false);
    const result = await validateStep2({ items: [item(value)] });
    expect(result.isValid).toBe(false);
    expect(result.errors['items[0].qty']).toBeDefined();
  });

  it.each(['1', '2', '20'])('preserves ordinary positive whole quantity %s', async value => {
    expect(isValidReceiptQuantity(value)).toBe(true);
    expect((await validateStep2({ items: [item(value)] })).isValid).toBe(true);
    expect(item(value).qty).toBe(Number(value));
  });

  it('keeps a fractional value available to the existing integer rule', async () => {
    const result = await validateStep2({ items: [item('1.5')] });
    expect(item('1.5').qty).toBe(1.5);
    expect(result.errors['items[0].qty']).toBe('Quantity must be a whole number');
  });
});
