/**
 * The words the item rate card does not use (owner decisions of 2026-10-14), in English and in
 * Gujarati, over every pricing text including the editor's block.
 */
import { en } from '../locales/en';
import { gu } from '../locales/gu';

type Tree = { [key: string]: string | Tree };
const flatten = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : flatten(value as Tree, `${prefix}${key}.`)
  );

const english = flatten(en.pricing as unknown as Tree);
const gujarati = flatten(gu.pricing as unknown as Tree);
// pricing.form keeps only the labels the history screen reads (pricing-spec 0.5); validation is gone.
const OLD_FORM = /^form\./;
const current = (entries: [string, string][]) => entries.filter(([key]) => !OLD_FORM.test(key));

describe('pricing wording', () => {
  it('English never says Expired, Base, Default pricing, Add price, Validity or Include expired', () => {
    const found = current(english).filter(([, value]) => /\bExpired\b|\bBase\b|Default pricing|Add price|Validity|Include expired/i.test(value));
    expect(found).toEqual([]);
  });

  it('the retired groups are gone from the item pricing texts', () => {
    const keys = english.map(([key]) => key);
    expect(keys.filter(key => /^card\./.test(key))).toEqual([]);
    expect(keys).not.toContain('list.addPrice');
    expect(keys).not.toContain('list.settings');
    expect(keys).not.toContain('list.deleteTitle');
    expect(keys.filter(key => /^validation\./.test(key))).toEqual([]);
    expect(keys.filter(key => /^form\./.test(key)).map(key => key.slice(5)).sort()).toEqual(
      ['endDate', 'fixFields.one', 'fixFields.other', 'labelValue', 'labourRate', 'monthlyPrice', 'noEndDate', 'oneTimePrice', 'priceType', 'startDate', 'tax', 'weightRange']
    );
  });

  it('Gujarati never uses મુદત (P-43)', () => {
    expect(current(gujarati).filter(([, value]) => value.includes('મુદત'))).toEqual([]);
  });

  it('every English key has a Gujarati text, and the other way round', () => {
    const gujaratiKeys = new Set(gujarati.map(([key]) => key));
    expect(english.map(([key]) => key).filter(key => !gujaratiKeys.has(key))).toEqual([]);
    const englishKeys = new Set(english.map(([key]) => key));
    expect(gujarati.map(([key]) => key).filter(key => !englishKeys.has(key))).toEqual([]);
  });

  it('rates are named "rate", and "price" appears only in the screen title family', () => {
    const price = current(english).filter(([, value]) => /\bprices?\b/i.test(value));
    // Old history texts (the Changes screen) still say price; they belong to the other worker's screens.
    // "Invoices can't price {{item}}" uses price as a verb (item.noDefault, stop.defaultBody).
    expect(price.filter(([key]) => !key.startsWith('history.') && !['item.noDefault', 'stop.defaultBody'].includes(key))).toEqual([]);
  });
});
