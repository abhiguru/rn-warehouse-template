import { savedLineOverrides } from '../invoiceFormSlice';
import { invoiceLine } from '@/tests/helpers/invoiceFixtures';

// Lines of one card (item i1, mark M1, weight 50) unless a test says otherwise; the ids are edit_<n>_0.
const lines = (charges: number[], over: Record<string, unknown> = {}) =>
  charges.map((charge, n) => invoiceLine({ charge, ...over }, n));

describe('savedLineOverrides: the lines of a saved invoice that keep a figure of their own', () => {
  it('marks nothing for lines that all agree, and nothing for a set of one line', () => {
    expect(savedLineOverrides(lines([5, 5, 5]))).toEqual({});
    expect(savedLineOverrides(lines([9]))).toEqual({});
  });

  it('marks the lines against a strict majority: 5, 5, 9 marks the 9 (Charge)', () => {
    expect(savedLineOverrides(lines([5, 5, 9]))).toEqual({ edit_2_0: ['charge'] });
  });

  it('marks every line outside the majority, whatever the order of the lines', () => {
    expect(savedLineOverrides(lines([9, 5, 7, 5, 5]))).toEqual({ edit_0_0: ['charge'], edit_2_0: ['charge'] });
    expect(savedLineOverrides(lines([5, 5, 5, 7, 9]))).toEqual({ edit_3_0: ['charge'], edit_4_0: ['charge'] });
  });

  it('marks nothing on a tie, so the order of the lines does not decide: 5, 9 and 5, 5, 9, 9', () => {
    expect(savedLineOverrides(lines([5, 9]))).toEqual({});
    expect(savedLineOverrides(lines([9, 5]))).toEqual({});
    expect(savedLineOverrides(lines([5, 5, 9, 9]))).toEqual({});
  });

  it('compares the figures rounded to paise: 5.001 is the majority 5', () => {
    expect(savedLineOverrides(lines([5, 5.001, 8]))).toEqual({ edit_2_0: ['charge'] });
  });

  it('judges Charge and Labour separately, and never marks Tax', () => {
    const set = [
      invoiceLine({ charge: 5, labour_rate: 2, tax: 5 }, 0),
      invoiceLine({ charge: 5, labour_rate: 3, tax: 12 }, 1),
      invoiceLine({ charge: 6, labour_rate: 2, tax: 5 }, 2),
    ];
    expect(savedLineOverrides(set)).toEqual({ edit_1_0: ['labour_rate'], edit_2_0: ['charge'] });
  });

  it('compares only within one bag weight of a card: 50 kg lines never mark a 25 kg line', () => {
    const set = [
      invoiceLine({ charge: 5, weight: 50 }, 0),
      invoiceLine({ charge: 5, weight: 50 }, 1),
      invoiceLine({ charge: 3, weight: 25 }, 2),
    ];
    expect(savedLineOverrides(set)).toEqual({});
    // and a lone exception inside the 25 kg band is still found there
    expect(savedLineOverrides([...set, invoiceLine({ charge: 3, weight: 25 }, 3), invoiceLine({ charge: 4, weight: 25 }, 4)])).toEqual({ edit_4_0: ['charge'] });
  });

  it('compares only within one card (item and mark) and one item', () => {
    const set = [
      invoiceLine({ charge: 5, package_mark: 'M1' }, 0),
      invoiceLine({ charge: 5, package_mark: 'M1' }, 1),
      invoiceLine({ charge: 9, package_mark: 'M2' }, 2),
      invoiceLine({ charge: 9, package_mark: 'M1', item_id: 'i2', item_name: 'Other' }, 3),
    ];
    expect(savedLineOverrides(set)).toEqual({});
  });

  it('falls back to the item name for a facility without line item ids', () => {
    const set = [
      invoiceLine({ charge: 5, item_id: '', item_name: 'Potatoes' }, 0),
      invoiceLine({ charge: 5, item_id: '', item_name: 'Potatoes' }, 1),
      invoiceLine({ charge: 8, item_id: '', item_name: 'Potatoes' }, 2),
    ];
    expect(savedLineOverrides(set)).toEqual({ edit_2_0: ['charge'] });
  });
});
