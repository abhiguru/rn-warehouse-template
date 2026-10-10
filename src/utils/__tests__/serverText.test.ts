import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { serverReason, serverText } from '../serverText';

afterEach(() => setLanguage('en'));

describe('server text in English', () => {
  it('is shown as the server wrote it', () => {
    expect(serverText('Insufficient stock: 4 left', 'Could not save')).toBe('Insufficient stock: 4 left');
    expect(serverText('GRN created successfully', 'Saved')).toBe('GRN created successfully');
  });

  it('falls back when the server sent nothing usable', () => {
    for (const nothing of [undefined, null, '', '   ', 42, {}]) {
      expect(serverText(nothing, 'Could not save')).toBe('Could not save');
    }
  });
});

describe('server text in Gujarati', () => {
  beforeEach(() => setLanguage('gu'));

  it('never shows an English sentence', () => {
    const shown = [
      serverText('GRN created successfully', 'આવક પાવતી સચવાઈ ગઈ'),
      serverText('Error creating GRN: null value in column "x"', 'આવક પાવતી સાચવી શકાઈ નથી'),
      serverText('weight_max must be >= weight_min', 'દર સાચવી શકાયો નથી'),
    ];
    expect(shown).toEqual(['આવક પાવતી સચવાઈ ગઈ', 'આવક પાવતી સાચવી શકાઈ નથી', 'દર સાચવી શકાયો નથી']);
  });

  it.each([
    ['Access denied: Admin or supervisor role required', 'errors.parsed.noPermission'],
    ['Only administrators and supervisors can delete GRNs', 'errors.parsed.noPermission'],
    ['Only admin or supervisor can manage pricing', 'errors.parsed.noPermission'],
    ['Staff access required', 'errors.parsed.noPermission'],
    ['You cannot change your own role', 'errors.parsed.noPermission'],
    ['PERMISSION_DENIED', 'errors.parsed.noPermission'],
    ['Session expired or revoked', 'errors.code.sessionExpired'],
    ['Active account required', 'errors.code.sessionExpired'],
    ['Insufficient stock: only 4 bags left', 'errors.code.insufficientStock'],
    ['Delete invoices first before deleting this dispatch', 'errors.parsed.inUse'],
    ['Cannot delete item "Garlic" - has 3 existing dispatches', 'errors.parsed.inUse'],
    ['GRN number already exists: A0005', 'errors.parsed.duplicate'],
    ['Overlapping price configuration exists', 'errors.parsed.duplicate'],
    ['Dispatch not found or already deleted', 'errors.parsed.itemNotFound'],
    ['Transaction conflict: too many retries. Please try again.', 'errors.parsed.busy'],
    ['TypeError: Network request failed', 'errors.parsed.network'],
  ] as const)('gives the reason for "%s"', (text, key) => {
    const shown = serverText(text, 'સાચવી શકાયું નથી');
    expect(shown).toBe(t(key));
    expect(shown).toMatch(/[઀-૿]/);
    expect(shown).not.toBe('સાચવી શકાયું નથી');
  });

  it('reads "not found or access denied" as a missing record', () => {
    expect(serverText('Invoice not found or access denied', 'x')).toBe(t('errors.parsed.itemNotFound'));
  });

  it('keeps text the app already wrote in Gujarati', () => {
    expect(serverText('ઇન્ટરનેટ કનેક્શન નથી.', 'સાચવી શકાયું નથી')).toBe('ઇન્ટરનેટ કનેક્શન નથી.');
  });

  it('has no reason for a text that names none', () => {
    expect(serverReason('Quantity must be greater than zero')).toBeUndefined();
    expect(serverReason('GRN created successfully')).toBeUndefined();
  });
});
