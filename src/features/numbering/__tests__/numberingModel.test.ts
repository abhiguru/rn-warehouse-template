import type { NumberingRule } from '@/services/documentNumberingService';
import {
  SCHEMES_BY_TYPE,
  draftChanged,
  draftErrors,
  draftFor,
  exampleNumber,
  fieldsOf,
  financialYearLabelOf,
  hasCheck,
  ruleInputOf,
  ruleInputOfRule,
} from '../numberingModel';

const rule = (over: Partial<NumberingRule> = {}): NumberingRule => ({
  document_type: 'grn', scheme: 'letters', prefix: '', width: 4, start: 1, first_letter: 'A', per_letter: 1000, check: true,
  fy_reset: false, hint: 'A####', existing_documents: 0, not_following: 0, updated_at: null, updated_by: null, ...over,
});

it('allows an invoice the two whole-number schemes only', () => {
  expect(SCHEMES_BY_TYPE.invoice).toEqual(['year', 'sequence']);
  expect(SCHEMES_BY_TYPE.grn).toEqual(['letters', 'year', 'sequence', 'free']);
  expect(SCHEMES_BY_TYPE.dispatch).toEqual(['letters', 'year', 'sequence', 'free']);
});

it('has the fields of a scheme and no others', () => {
  expect(fieldsOf('grn', 'letters')).toEqual(['firstLetter', 'width', 'perLetter']);
  expect(fieldsOf('dispatch', 'year')).toEqual(['prefix', 'width', 'start']);
  expect(fieldsOf('dispatch', 'sequence')).toEqual(['prefix', 'width', 'start']);
  expect(fieldsOf('grn', 'free')).toEqual([]);
  expect(fieldsOf('invoice', 'year')).toEqual(['start']);
  expect(fieldsOf('invoice', 'sequence')).toEqual(['start']);
});

it('has the check switch for a GRN or dispatch rule that is not free text', () => {
  expect(hasCheck('grn', 'letters')).toBe(true);
  expect(hasCheck('dispatch', 'sequence')).toBe(true);
  expect(hasCheck('grn', 'free')).toBe(false);
  expect(hasCheck('invoice', 'year')).toBe(false);
});

describe('the financial year in an example', () => {
  it.each([
    ['2027-03-31', '26-27'],
    ['2027-04-01', '27-28'],
    ['2026-10-28', '26-27'],
  ])('%s is in %s', (day, label) => expect(financialYearLabelOf(day)).toBe(label));
});

describe('the example number', () => {
  const grn = rule();
  it.each([
    ['letters', { firstLetter: 'X', width: '3' }, 'X001'],
    ['year', { prefix: 'GRN/', width: '4', start: '1' }, 'GRN/26-27/0001'],
    ['year', { prefix: '', width: '3', start: '418' }, '26-27/418'],
    ['sequence', { prefix: 'I', width: '4', start: '1' }, 'I0001'],
    ['sequence', { prefix: '', width: '1', start: '1001' }, '1001'],
  ] as const)('%s %j gives %s', (scheme, patch, expected) => {
    expect(exampleNumber('grn', { ...draftFor(grn, scheme), ...patch }, '2026-10-28')).toBe(expected);
  });
  it('is the first number of an invoice, and none for free text or a wrong draft', () => {
    expect(exampleNumber('invoice', { ...draftFor(rule({ document_type: 'invoice', scheme: 'year', width: 1 })), start: '1001' })).toBe('1001');
    expect(exampleNumber('grn', draftFor(grn, 'free'))).toBeNull();
    expect(exampleNumber('grn', { ...draftFor(grn), width: '0' })).toBeNull();
  });
});

describe('what a draft may hold', () => {
  const grn = rule();
  it('takes the stored values for the stored scheme and the defaults for another', () => {
    const stored = rule({ scheme: 'sequence', prefix: 'I', width: 5, start: 9 });
    expect(draftFor(stored)).toMatchObject({ scheme: 'sequence', prefix: 'I', width: '5', start: '9' });
    expect(draftFor(stored, 'year')).toMatchObject({ scheme: 'year', prefix: '', width: '4', start: '1' });
    expect(draftFor(stored, 'letters')).toMatchObject({ firstLetter: 'A', perLetter: '1000' });
  });

  it.each([
    [{ firstLetter: 'a' }, 'firstLetter'],
    [{ firstLetter: 'AB' }, 'firstLetter'],
    [{ width: '0' }, 'width'],
    [{ width: '8' }, 'width'],
    [{ width: '' }, 'width'],
    [{ perLetter: '0' }, 'perLetter'],
    [{ perLetter: '10000000' }, 'perLetter'],
  ] as const)('refuses %j for the letters scheme', (patch, field) => {
    expect(Object.keys(draftErrors('grn', { ...draftFor(grn), ...patch }))).toEqual([field]);
  });

  it('refuses a prefix with a lower-case letter, a space or more than 10 characters', () => {
    const year = draftFor(grn, 'year');
    expect(draftErrors('grn', { ...year, prefix: 'grn/' }).prefix).toBeDefined();
    expect(draftErrors('grn', { ...year, prefix: 'G R' }).prefix).toBeDefined();
    expect(draftErrors('grn', { ...year, prefix: 'ABCDEFGHIJK' }).prefix).toBeDefined();
    expect(draftErrors('grn', { ...year, prefix: 'AB/12-CD' })).toEqual({});
  });

  it('refuses a first number of 0 or beyond 9,999,999', () => {
    const sequence = draftFor(grn, 'sequence');
    expect(draftErrors('grn', { ...sequence, start: '0' }).start).toBeDefined();
    expect(draftErrors('grn', { ...sequence, start: '10000000' }).start).toBeDefined();
    expect(draftErrors('grn', { ...sequence, start: '9999999' })).toEqual({});
  });

  it('refuses a financial-year number longer than 20 characters (prefix, "26-27/" and the digits) and no other scheme', () => {
    const year = { ...draftFor(grn, 'year'), prefix: 'ABCDEFGHIJ', width: '4' };
    expect(draftErrors('grn', year)).toEqual({});
    expect(draftErrors('grn', { ...year, width: '5' }).width).toBe('numbering.edit.errors.tooLong');
    expect(draftErrors('grn', { ...year, scheme: 'sequence', width: '7' })).toEqual({});
  });

  it('checks only the fields of the scheme (an invoice has the first number alone)', () => {
    const invoice = { ...draftFor(rule({ document_type: 'invoice', scheme: 'year', width: 1 })), width: '99', prefix: 'zz' };
    expect(draftErrors('invoice', invoice)).toEqual({});
  });
});

describe('the request', () => {
  const grn = rule();
  it('holds the fields of the scheme and the check, and nothing else', () => {
    expect(ruleInputOf('grn', draftFor(grn))).toEqual({ scheme: 'letters', first_letter: 'A', width: 4, per_letter: 1000, check: true });
    expect(ruleInputOf('grn', { ...draftFor(grn, 'year'), prefix: 'GRN/', check: false })).toEqual({ scheme: 'year', prefix: 'GRN/', width: 4, start: 1, check: false });
    expect(ruleInputOf('grn', draftFor(grn, 'free'))).toEqual({ scheme: 'free' });
    expect(ruleInputOf('invoice', { ...draftFor(rule({ document_type: 'invoice', scheme: 'sequence', width: 1 })), start: '1001' })).toEqual({ scheme: 'sequence', start: 1001 });
  });

  it('is the same as the stored rule until something is changed', () => {
    expect(draftChanged(grn, draftFor(grn))).toBe(false);
    expect(draftChanged(grn, { ...draftFor(grn), perLetter: '999' })).toBe(true);
    expect(draftChanged(grn, { ...draftFor(grn), check: false })).toBe(true);
    expect(draftChanged(grn, draftFor(grn, 'free'))).toBe(true);
    expect(ruleInputOfRule(grn)).toEqual(ruleInputOf('grn', draftFor(grn)));
  });
});
