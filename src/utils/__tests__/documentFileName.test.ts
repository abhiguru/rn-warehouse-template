/** WH-197: the file name of a shared PDF keeps the whole name, and two different numbers never share one name. */
import { invoiceFileName, nameFileNamePart } from '../invoiceLabel';

describe('invoiceFileName', () => {
  it('turns "/" into "_" and any other odd character into "-"', () => {
    expect(invoiceFileName('GRN/26-27/0042')).toBe('GRN_26-27_0042');
    expect(invoiceFileName('A B:C*1')).toBe('A-B-C-1');
    expect(invoiceFileName('I0000554.v2')).toBe('I0000554.v2');
  });

  it('gives two different numbers two different names', () => {
    expect(invoiceFileName('GRN/26-27/0042')).not.toBe(invoiceFileName('GRN-26-27/0042'));
    expect(invoiceFileName('GRN-26-27/0042')).toBe('GRN-26-27_0042');
  });

  it('gives "document" (or the fallback given) for a missing number, never "null"', () => {
    for (const missing of [null, undefined, '', '   ', 'null', 'undefined']) {
      expect(invoiceFileName(missing)).toBe('document');
      expect(invoiceFileName(missing, 'abc-123')).toBe('abc-123');
    }
  });
});

describe('nameFileNamePart', () => {
  it('keeps the whole customer or sensor name and replaces each slash with "_"', () => {
    expect(nameFileNamePart('A/B Traders')).toBe('A_B Traders');
    expect(nameFileNamePart('Cold Room 2\\North')).toBe('Cold Room 2_North');
    expect(nameFileNamePart('Plain Name')).toBe('Plain Name');
  });

  it('gives an empty text for no name', () => {
    expect(nameFileNamePart(null)).toBe('');
    expect(nameFileNamePart(undefined)).toBe('');
  });
});
