import { setLanguage } from '@/i18n';
import { deleteBlockedText } from '../deleteRefusal';

afterEach(() => setLanguage('en'));

describe('deleteBlockedText', () => {
  it('says one sentence for lines on invoices, in the singular and the plural', () => {
    expect(deleteBlockedText('Z0010', { invoiced_dispatches: 2, dispatches: 3 })).toBe(
      'GRN Z0010 has 2 dispatch lines on invoices. Delete those invoices first, then the dispatches.'
    );
    expect(deleteBlockedText('Z0010', { invoiced_dispatches: 1 })).toBe(
      'GRN Z0010 has 1 dispatch line on an invoice. Delete that invoice first, then the dispatch.'
    );
  });

  it('says one sentence for dispatches only', () => {
    expect(deleteBlockedText('Z0010', { dispatches: 1 })).toBe('GRN Z0010 has 1 dispatch line. Delete that dispatch first.');
    expect(deleteBlockedText('Z0010', { dispatches: 4 })).toBe('GRN Z0010 has 4 dispatch lines. Delete those dispatches first.');
  });

  it('shows no server English and has Gujarati digits in Gujarati', () => {
    setLanguage('gu');
    const text = deleteBlockedText('Z0010', { invoiced_dispatches: 2 })!;
    expect(text).toContain('૨');
    expect(text).not.toMatch(/manually|instructions|Delete/);
  });

  it('is null when nothing blocks or the GRN has no number, so the caller words it as any other refusal', () => {
    expect(deleteBlockedText('Z0010', {})).toBeNull();
    expect(deleteBlockedText('Z0010', undefined)).toBeNull();
    expect(deleteBlockedText(' ', { dispatches: 1 })).toBeNull();
    expect(deleteBlockedText(undefined, { dispatches: 1 })).toBeNull();
  });
});
