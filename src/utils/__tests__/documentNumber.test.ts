import { compareDocumentNumbers, documentNumberSortKey } from '../documentNumber';

// The same list, in the same order, as the backend's tests/document_number_sort.sql.
// If one changes, change the other: the app and the server must agree.
const ASCENDING = [
  'X0001', 'Y0001', 'Z0001',
  'A0001', 'A0002', 'A9999', 'A10000', 'A10001', 'A1234567', 'a0005',
  'B2', 'B9', 'B10', 'B20', 'B100', 'B1000',
  'C0001', 'C001', 'C01', 'C1',
  'M0500',
  '7', '00077', '12345', ' A77', '2026/01', 'ABCD', 'DV0001', 'DV0010', 'DV0101', 'DV0200',
  'G 14', 'G-12', 'G/13', 'É0001', 'जी01',
];

function shuffled<T>(values: T[]): T[] {
  // Fixed interleave, so the test input is always the same and never already sorted.
  const odd = values.filter((_, index) => index % 2 === 1).reverse();
  const even = values.filter((_, index) => index % 2 === 0);
  return [...odd, ...even];
}

describe('document number order', () => {
  it('matches the backend order for every accepted form', () => {
    expect(shuffled(ASCENDING).sort(compareDocumentNumbers)).toEqual(ASCENDING);
  });

  it('reverses exactly for descending', () => {
    const descending = shuffled(ASCENDING).sort((a, b) => compareDocumentNumbers(b, a));
    expect(descending).toEqual([...ASCENDING].reverse());
  });

  it('compares trailing digits as numbers, not text', () => {
    expect(compareDocumentNumbers('B9', 'B10')).toBeLessThan(0);
    expect(compareDocumentNumbers('A9999', 'A10000')).toBeLessThan(0);
    // Plain text order would put these the other way round.
    expect('B9' < 'B10').toBe(false);
  });

  it('keeps the warehouse prefix rule: X, Y, Z before A', () => {
    expect(compareDocumentNumbers('Z9999', 'A0001')).toBeLessThan(0);
    expect(compareDocumentNumbers('A9999', 'B0001')).toBeLessThan(0);
  });

  it('gives every number a distinct key, including empty and missing ones', () => {
    const keys = new Set([...ASCENDING, ''].map(documentNumberSortKey));
    expect(keys.size).toBe(ASCENDING.length + 1);
    expect(documentNumberSortKey(null)).toBe(documentNumberSortKey(''));
    expect(compareDocumentNumbers(undefined, 'A0001')).toBeGreaterThan(0);
  });
});
