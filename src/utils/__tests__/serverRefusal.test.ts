/**
 * refusalOf and its field readers (wave B, owner decisions D1 to D24): a refusal is read by its `reason`, in the three
 * shapes it can arrive in, and an answer without one gives undefined.
 */
import { REFUSAL, refusalNumber, refusalOf, refusalString, refusalStrings } from '../serverRefusal';

describe('refusalOf', () => {
  it('reads the body the server sent: reason, the other keys as fields, its own sentence as text', () => {
    const refusal = refusalOf({
      success: false,
      error_code: 'WH409',
      reason: 'STALE_RECORD',
      error: 'The record was changed',
      message: 'ignored when error is there',
      updated_at: '2026-10-20T10:00:00Z',
      invoice_no: 'INV-7',
    });

    expect(refusal).toEqual({
      reason: REFUSAL.STALE_RECORD,
      fields: { updated_at: '2026-10-20T10:00:00Z', invoice_no: 'INV-7' },
      text: 'The record was changed',
    });
  });

  it('takes the first row of an array answer, and the message when there is no error text', () => {
    expect(refusalOf([{ success: false, error_code: 'WH409', reason: 'ORDER_CHANGED', message: 'Order changed' }])).toEqual({
      reason: 'ORDER_CHANGED',
      fields: {},
      text: 'Order changed',
    });
  });

  it('keeps `fields` of a body (an array, as in LOT_INVOICED) as a field', () => {
    const refusal = refusalOf({ success: false, error_code: 'WH409', reason: 'LOT_INVOICED', fields: ['item', 'weight'], invoice_no: 'I-1' });
    expect(refusalStrings(refusal!, 'fields')).toEqual(['item', 'weight']);
    expect(refusalString(refusal!, 'invoice_no')).toBe('I-1');
  });

  it('reads an RPCResult of executeRPC: reason and a fields object, the server sentence as serverMessage', () => {
    expect(refusalOf({ success: false, reason: 'TOTAL_CHANGED', fields: { total: 598 }, serverMessage: 'Total is 598' })).toEqual({
      reason: 'TOTAL_CHANGED',
      fields: { total: 598 },
      text: 'Total is 598',
    });
  });

  it('reads a service result that carries a refusal, and one without fields', () => {
    expect(refusalOf({ success: false, refusal: { reason: 'GRN_INVOICED', fields: { grn: 'A1' }, text: 'x' } })).toEqual({
      reason: 'GRN_INVOICED',
      fields: { grn: 'A1' },
      text: 'x',
    });
    expect(refusalOf({ success: false, refusal: { reason: 'GRN_INVOICED' } })).toEqual({ reason: 'GRN_INVOICED', fields: {} });
  });

  it('keeps a reason the app does not know as it came', () => {
    expect(refusalOf({ success: false, error_code: 'WH409', reason: 'SOMETHING_NEW' })?.reason).toBe('SOMETHING_NEW');
  });

  it.each([
    ['a success', { success: true, reason: 'STALE_RECORD' }],
    ['a refusal of an old server (no reason)', { success: false, error: 'Dispatch not found' }],
    ['a blank reason', { success: false, reason: '  ' }],
    ['a carried refusal without a reason', { success: false, refusal: { fields: {} } }],
    ['null', null],
    ['a string', 'STALE_RECORD'],
    ['an empty array', []],
  ])('gives undefined for %s', (_label, answer) => {
    expect(refusalOf(answer)).toBeUndefined();
  });
});

describe('the field readers', () => {
  const refusal = { reason: 'X', fields: { text: 'abc', blank: '  ', n: 4, s: '2.5', bad: 'x', inf: Infinity, list: ['a', 'b'], mixed: ['a', 1] } };

  it('refusalString gives a non-blank string only', () => {
    expect(refusalString(refusal, 'text')).toBe('abc');
    expect(refusalString(refusal, 'blank')).toBeUndefined();
    expect(refusalString(refusal, 'n')).toBeUndefined();
    expect(refusalString(refusal, 'missing')).toBeUndefined();
  });

  it('refusalNumber gives a finite number, also from a numeric string', () => {
    expect(refusalNumber(refusal, 'n')).toBe(4);
    expect(refusalNumber(refusal, 's')).toBe(2.5);
    expect(refusalNumber(refusal, 'bad')).toBeUndefined();
    expect(refusalNumber(refusal, 'inf')).toBeUndefined();
    expect(refusalNumber(refusal, 'blank')).toBeUndefined();
  });

  it('refusalStrings gives a list of strings only', () => {
    expect(refusalStrings(refusal, 'list')).toEqual(['a', 'b']);
    expect(refusalStrings(refusal, 'mixed')).toBeUndefined();
    expect(refusalStrings(refusal, 'text')).toBeUndefined();
  });
});
