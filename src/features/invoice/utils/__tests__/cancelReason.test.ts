import { cancelReasonLength, cancelReasonProblem, trimCancelReason } from '../cancelReason';

describe('the reason an invoice is cancelled with', () => {
  it('needs 3 characters once trimmed', () => {
    expect(cancelReasonProblem('')).toBe('tooShort');
    expect(cancelReasonProblem('ab')).toBe('tooShort');
    expect(cancelReasonProblem('  ab  ')).toBe('tooShort');
    expect(cancelReasonProblem('abc')).toBeNull();
    expect(cancelReasonProblem('  abc ')).toBeNull();
  });

  it('counts no-break spaces and zero-width characters as blank, as the server does', () => {
    expect(trimCancelReason('\u00A0\u200B ab \u200D\uFEFF')).toBe('ab');
    expect(cancelReasonProblem('\u00A0\u200B\u200B\u00A0')).toBe('tooShort');
    expect(cancelReasonProblem('\u200Bab\u00A0')).toBe('tooShort');
  });

  it('allows 500 characters and refuses 501', () => {
    expect(cancelReasonProblem('x'.repeat(500))).toBeNull();
    expect(cancelReasonProblem('x'.repeat(501))).toBe('tooLong');
    expect(cancelReasonProblem(`  ${'x'.repeat(500)}  `)).toBeNull();
  });

  it('counts what the server counts for the counter', () => {
    expect(cancelReasonLength('  Wrong customer ')).toBe('Wrong customer'.length);
  });
});
