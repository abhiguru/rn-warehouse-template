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

describe('invoice refusals', () => {
  it('are not mistaken for a duplicate entry', () => {
    for (const text of ['GRN is already invoiced', 'A dispatch line is already on another invoice']) {
      expect(serverReason(text)).toBeDefined();
      expect(serverReason(text)).not.toBe(t('errors.parsed.duplicate'));
    }
  });

  it('are shown in English without the database wrapper', () => {
    expect(serverText('Database error: GRN is already invoiced (SQLState: WH409)', 'x')).toBe('GRN is already invoiced');
    expect(serverText('Database error: Invoice line charge must be between 0 and 999999 (SQLState: 22023)', 'x')).toBe(
      'Invoice line charge must be between 0 and 999999'
    );
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
    ['Lot A0010 belongs to another customer', 'errors.parsed.otherCustomer'],
    ['Dispatch items must come from GRNs of the dispatch customer; GRN B0007 belongs to a different customer', 'errors.parsed.otherCustomer'],
    ['Item belongs to another customer', 'errors.parsed.otherCustomer'],
    ['Item belongs to another customer: Example Potatoes (A0010)', 'errors.parsed.otherCustomer'],
    ['Cannot change the dispatch customer: items belong to another customer: Example Potatoes (A0010)', 'errors.parsed.otherCustomer'],
    ['Cannot change the customer of a GRN that has dispatches, invoices or order items', 'errors.parsed.grnCustomerLocked'],
    ['Invoice line charge must be between 0 and 999999', 'errors.parsed.invoiceChargeRange'],
    ['Invoice line labour rate must be between 0 and 999999', 'errors.parsed.invoiceLabourRange'],
    ['Invoice line tax must be between 0 and 100', 'errors.parsed.invoiceTaxRange'],
    ['GRN is already invoiced', 'errors.parsed.grnAlreadyInvoiced'],
    ['A dispatch line is already on another invoice', 'errors.parsed.lineOnOtherInvoice'],
    ['Cannot delete an invoice that has payments', 'errors.parsed.invoiceHasPayments'],
    // save_invoice(jsonb) wraps the text of every refusal.
    ['Database error: GRN is already invoiced (SQLState: WH409)', 'errors.parsed.grnAlreadyInvoiced'],
    ['Database error: A dispatch line is already on another invoice (SQLState: WH409)', 'errors.parsed.lineOnOtherInvoice'],
    ['Database error: Invoice line tax must be between 0 and 100 (SQLState: 22023)', 'errors.parsed.invoiceTaxRange'],
    // Photo refusals of server migration 43; save_grn wraps them.
    ['Image path does not belong to this GRN', 'errors.parsed.imageWrongDocument'],
    ['Image path does not belong to this dispatch', 'errors.parsed.imageWrongDocument'],
    ['Image file is not in storage', 'errors.parsed.imageNotStored'],
    ['Image path is attached to a different image record', 'errors.parsed.imageAlreadyAttached'],
    ['Image line does not belong to this GRN', 'errors.parsed.imageWrongLine'],
    ['Image path is required', 'errors.parsed.imagePathRequired'],
    ['Error creating GRN: Image path does not belong to this GRN', 'errors.parsed.imageWrongDocument'],
    ['Error creating GRN: Image file is not in storage', 'errors.parsed.imageNotStored'],
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
