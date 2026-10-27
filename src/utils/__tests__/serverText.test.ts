import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { TimeoutError } from '../rpcClient';
import { AppError } from '../appError';
import {
  errorCodeOf,
  failureText,
  isNetworkError,
  isSessionExpiredError,
  isTimeoutError,
  requestMayHaveBeenSent,
  serverReason,
  serverText,
  stripErrorPrefix,
  transportText,
} from '../serverText';

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

// Review 2026-10-10, M4-3, M4-4, M4-5.
describe('business-rule refusals in Gujarati', () => {
  beforeEach(() => setLanguage('gu'));

  // M4-3: "duplicate" in this sentence is not "this entry already exists".
  it('an invoice whose dispatch lines changed is not called a duplicate entry', () => {
    const text = 'Invoice contains a missing, duplicate or unrelated dispatch line';
    expect(serverText(text, 'x')).toBe(t('errors.parsed.invoiceLinesChanged'));
    expect(serverText(`Database error: ${text} (SQLState: P0001)`, 'x')).toBe(t('errors.parsed.invoiceLinesChanged'));
    expect(serverReason(text)).not.toBe(t('errors.parsed.duplicate'));
  });

  // M4-5: refusals that say what to change used to become the caller's "could not save".
  it.each([
    ['Invoice requires at least one dispatch line', 'errors.parsed.invoiceNeedsLine'],
    ['Invoice customer and GRN must match', 'errors.parsed.invoiceCustomerMismatch'],
    ['Discount exceeds the invoice amount', 'errors.parsed.discountTooLarge'],
    ['A reason is required for an invoice discount', 'errors.parsed.discountReasonRequired'],
    ['Enter a reason for the zero charge', 'errors.parsed.zeroChargeReasonRequired'],
    ['Expected a 10-digit Indian mobile number', 'errors.parsed.mobileInvalid'],
    ['At least one valid customer assignment is required', 'errors.parsed.customerAssignmentRequired'],
    ['Pending enrollment must be reviewed with a customer assignment', 'errors.parsed.customerAssignmentRequired'],
    ['Item belongs to another customer', 'errors.parsed.otherCustomer'],
  ] as const)('%s', (text, key) => {
    expect(serverText(text, 'સાચવી શકાયું નથી')).toBe(t(key));
    expect(t(key)).toMatch(/[઀-૿]/);
  });

  // Server migration 48: the one-argument save wraps the refusal.
  it('a missing zero-charge reason is read inside the database-error wrapper too', () => {
    const wrapped = 'Database error: Enter a reason for the zero charge (SQLState: 22023)';
    expect(serverText(wrapped, 'સાચવી શકાયું નથી')).toBe(t('errors.parsed.zeroChargeReasonRequired'));
  });

  // M4-4: a Gujarati item or customer name inside an English sentence is not "already Gujarati".
  it('an English sentence that names a Gujarati item is still read for its reason', () => {
    expect(serverText('Cannot delete item "લસણ" - has 3 existing dispatches', 'x')).toBe(t('errors.parsed.inUse'));
    expect(serverText('Insufficient stock: લસણ (Available: 4, Requested: 9)', 'x')).toBe(t('errors.code.insufficientStock'));
    expect(serverText('Customer not found: પટેલ ટ્રેડર્સ', 'x')).toBe(t('errors.parsed.itemNotFound'));
  });

  it('an English sentence with a Gujarati name and no known reason gives the fallback, not English', () => {
    expect(serverText('Unexpected state for item "લસણ" while processing', 'સાચવી શકાયું નથી')).toBe('સાચવી શકાયું નથી');
  });

  it('a sentence the app wrote in Gujarati is shown as it is, also with a Latin word in it', () => {
    for (const own of ['આવક પાવતી સાચવી શકાઈ નથી', 'GRN સાચવી શકાયું નથી', 'A0010 નંબર પહેલેથી વપરાયેલો છે', 'OTP મોકલી શકાયો નથી']) {
      expect(serverText(own, 'x')).toBe(own);
    }
  });
});

describe('business-rule refusals in English', () => {
  it('keep the server sentence, including one that names a Gujarati item', () => {
    expect(serverText('Cannot delete item "લસણ" - has 3 existing dispatches', 'x')).toBe('Cannot delete item "લસણ" - has 3 existing dispatches');
    expect(serverText('Discount exceeds the invoice amount', 'x')).toBe('Discount exceeds the invoice amount');
  });
});

// The server's refusals in user management (migration 45) and the last-administrator
// rule are permission refusals to the reader, not "customer assignment required".
describe('user management refusals', () => {
  it.each([
    "Supervisors cannot change their own or an administrator's customer assignments",
    'Administrator required',
    'Supervisors cannot modify admin users',
    'You cannot change your own role',
    'You cannot change your own status',
    'Staff access required',
    'Customer access denied',
  ])('"%s" is a permission refusal in Gujarati', (text) => {
    setLanguage('gu');
    expect(serverText(text, 'x')).toBe(t('errors.parsed.noPermission'));
  });
});

describe('a failed request with a raw error and the app message', () => {
  it.each([
    ['permission denied for function get_grn_item_dispatches', 'errors.parsed.noPermission'],
    ['Staff access required', 'errors.parsed.noPermission'],
    ['GRN item not found or access denied', 'errors.parsed.itemNotFound'],
  ] as const)('names the reason of "%s" in the app words', (raw, key) => {
    expect(failureText(raw, 'Failed to load dispatches', 'fallback')).toBe(t(key));
  });

  it('never shows developer text: an unknown raw error gives the app message', () => {
    const raw = 'invalid input syntax for type uuid: "2660"';
    expect(failureText(raw, 'Failed to load dispatches', 'fallback')).toBe('Failed to load dispatches');
    expect(failureText(raw, undefined, 'fallback')).toBe('fallback');
    expect(failureText(undefined, '  ', 'fallback')).toBe('fallback');
  });
});

describe('business state refusals (migrations 82 and 83)', () => {
  const DEACTIVATED = 'This business is deactivated. Activate it in Customers to receive new goods.';
  it('says the same clear sentence in English', () => {
    expect(serverText(DEACTIVATED, 'x')).toBe(DEACTIVATED);
    expect(serverText('Business is not active', 'x')).toBe(
      'This business is not active, so nothing new can be added for it. Activate it in Customers first.',
    );
  });
  it('words both in Gujarati, not the fallback', () => {
    setLanguage('gu');
    expect(serverText(DEACTIVATED, 'FALLBACK')).toBe('આ વેપારી નિષ્ક્રિય છે. નવો માલ લેવા માટે વેપારીઓમાં તેને સક્રિય કરો.');
    expect(serverText('Business is not active', 'FALLBACK')).toContain('વેપારી');
    expect(serverText('Business is not active', 'FALLBACK')).not.toBe('FALLBACK');
  });
  it('leaves a longer message that only contains those words as it was', () => {
    const longer = 'Cannot continue: business is not active for this facility';
    expect(serverText(longer, 'x')).toBe(longer);
    setLanguage('gu');
    expect(serverText(longer, 'FALLBACK')).toBe('FALLBACK');
    expect(serverText(`Error creating GRN: ${DEACTIVATED}`, 'FALLBACK')).toBe('FALLBACK');
  });
});

describe('failures that are not a server sentence (English)', () => {
  it('a network failure says to check the connection', () => {
    for (const failure of ['TypeError: Network request failed', { message: 'Network request failed', code: '' }, new TypeError('Failed to fetch')]) {
      expect(serverText(failure, 'x')).toBe('Check your connection and try again.');
      expect(isNetworkError(failure)).toBe(true);
    }
  });

  it('a timeout on a write says it may have been saved; on a read it is the network text', () => {
    const timeout = new TimeoutError('Save timed out after 30 seconds', 30000);
    expect(isTimeoutError(timeout)).toBe(true);
    expect(isNetworkError(timeout)).toBe(false);
    expect(serverText(timeout, 'x', { write: true })).toBe('No answer from the server. It may have been saved. Pull down to check.');
    expect(serverText(timeout, 'x')).toBe('Check your connection and try again.');
    expect(transportText(new Error('Plain failure'))).toBeUndefined();
  });

  it('a timeout on a form says to go back to the list; on a photo change to check the photos (photo wins over form)', () => {
    const timeout = new TimeoutError('Save timed out after 30 seconds', 30000);
    expect(serverText(timeout, 'x', { write: true, form: true })).toBe(t('errors.parsed.timeoutWriteForm'));
    expect(serverText(timeout, 'x', { write: true, photo: true })).toBe(t('errors.parsed.timeoutWritePhoto'));
    expect(serverText(timeout, 'x', { write: true, form: true, photo: true })).toBe(t('errors.parsed.timeoutWritePhoto'));
    expect(transportText(timeout, { write: true, form: true })).toBe(t('errors.parsed.timeoutWriteForm'));
    expect(t('errors.parsed.timeoutWriteForm')).not.toBe(t('errors.parsed.timeoutWrite'));
    expect(t('errors.parsed.timeoutWritePhoto')).not.toBe(t('errors.parsed.timeoutWrite'));
  });

  it('form and photo change nothing for a read, a network failure or a statement timeout', () => {
    const timeout = new TimeoutError('Load timed out', 30000);
    expect(serverText(timeout, 'x', { form: true })).toBe(t('errors.parsed.network'));
    expect(serverText(timeout, 'x', { photo: true })).toBe(t('errors.parsed.network'));
    // Nothing was sent: the app's own refusal to ask (no session that could be renewed) is only a connection failure.
    expect(serverText('Network request failed: session refresh unavailable', 'x', { write: true, form: true, photo: true })).toBe(t('errors.parsed.network'));
    expect(serverText({ message: 'canceling statement due to statement timeout', code: '57014' }, 'x', { write: true, form: true })).toBe(
      t('errors.parsed.timeoutNotSaved'),
    );
  });

  it('a timeout on a delete says it may have been deleted (list or detail wording); photo still wins', () => {
    const timeout = new TimeoutError('Delete timed out after 30 seconds', 30000);
    expect(serverText(timeout, 'x', { write: true, delete: true })).toBe(
      'No answer from the server. It may have been deleted. Pull down to check.'
    );
    expect(serverText(timeout, 'x', { write: true, form: true, delete: true })).toBe(
      'No answer from the server. It may have been deleted. Go back to the list and check before trying again.'
    );
    expect(serverText(timeout, 'x', { write: true, photo: true, delete: true })).toBe(t('errors.parsed.timeoutWritePhoto'));
    // A text a shared service worded as a save timeout is swapped for the delete wording, and the other way round.
    expect(serverText(t('errors.parsed.timeoutWrite'), 'x', { write: true, delete: true })).toBe(t('errors.parsed.timeoutDelete'));
    expect(serverText(t('errors.parsed.timeoutDelete'), 'x', { write: true, form: true })).toBe(t('errors.parsed.timeoutWriteForm'));
    expect(serverText(t('errors.parsed.timeoutDeleteForm'), 'x')).toBe(t('errors.parsed.timeoutDeleteForm'));
    // A statement timeout (57014) still says nothing was saved.
    expect(serverText({ message: 'canceling statement due to statement timeout', code: '57014' }, 'x', { write: true, delete: true })).toBe(
      t('errors.parsed.timeoutNotSaved')
    );
  });

  it('swaps a timeout sentence a shared service worded for the other kind of screen', () => {
    const list = t('errors.parsed.timeoutWrite');
    const form = t('errors.parsed.timeoutWriteForm');
    const photo = t('errors.parsed.timeoutWritePhoto');
    expect(serverText(list, 'x', { write: true, form: true })).toBe(form);
    expect(serverText(form, 'x', { write: true })).toBe(list);
    expect(serverText(list, 'x', { write: true, photo: true })).toBe(photo);
    expect(serverText(photo, 'x', { write: true, form: true })).toBe(form);
    expect(serverText({ message: form }, 'x', { write: true })).toBe(list);
    // Without write the sentence is not swapped: it is the app's own text and passes through.
    expect(serverText(form, 'x')).toBe(form);
    expect(serverText(list, 'x', { write: true })).toBe(list);
  });

  it('words a code, from the object or from the text', () => {
    // 42501 is not worded by code: the server's own sentences for it keep their meaning
    expect(serverText({ message: 'Item belongs to another customer', code: '42501' }, 'x')).toBe('Item belongs to another customer');
    expect(serverText({ message: 'permission denied for function get_grn', code: '42501' }, 'x')).toBe(t('errors.parsed.noPermission'));
    expect(serverText('PERMISSION_DENIED', 'x')).toBe(t('errors.parsed.noPermission'));
    expect(serverText('boom', 'x', { code: '23505' })).toBe(t('errors.parsed.duplicate'));
    expect(errorCodeOf('Database error: x (SQLState: WH409)')).toBe('WH409');
  });

  it('tells a network failure or a timeout from a service result', () => {
    expect(isNetworkError({ message: 'Check your connection and try again.', error: 'Network request failed', errorCode: '' })).toBe(true);
    expect(isNetworkError({ message: 'x', error: 'x', errorCode: 'NETWORK' })).toBe(true);
    expect(isTimeoutError({ message: 'x', error: 'x', errorCode: 'TIMEOUT' })).toBe(true);
    expect(isNetworkError('current transaction is aborted, commands ignored until end of transaction block')).toBe(false);
    expect(isTimeoutError('time outside the range')).toBe(false);
  });

  it('a proxy error page is a connection failure', () => {
    for (const page of ['<html><body>502 Bad Gateway</body></html>', 'error code: 1033']) {
      expect(isNetworkError(page)).toBe(true);
      expect(serverText(page, 'x')).toBe('Check your connection and try again.');
    }
  });

  it('a statement timeout says nothing was saved', () => {
    expect(serverText({ message: 'canceling statement due to statement timeout', code: '57014' }, 'x', { write: true })).toBe(
      'The server took too long and nothing was saved. Try again.',
    );
  });

  it('keeps the app\'s own sentence when it passes through twice', () => {
    expect(serverText(t('errors.code.businessRuleViolation'), 'x')).toBe(t('errors.code.businessRuleViolation'));
  });

  it('never shows JavaScript engine text', () => {
    for (const raw of ["Cannot read property 'id' of null", 'Cannot read properties of undefined (reading id)', 'JSON Parse error: Unexpected character', 'Unexpected token < in JSON']) {
      expect(serverText(raw, 'Could not save')).toBe('Could not save');
    }
  });

  it('never shows developer text', () => {
    for (const raw of ['TypeError: undefined is not a function', 'SOMETHING_WENT_WRONG', '{"code":"22P02"}', 'invalid input syntax for type uuid: "2660"', 'relation "grns" does not exist']) {
      expect(serverText(raw, 'Could not save')).toBe('Could not save');
    }
    expect(serverText('permission denied for function get_grn', 'x')).toBe(t('errors.parsed.noPermission'));
  });
});

// Review 2026-10-20 (I5, G13): a write that failed after the request went out may have been applied.
describe('a failed write: before or after the request was sent', () => {
  const FORM = { write: true, form: true } as const;
  const MAYBE_SAVED = () => t('errors.parsed.timeoutWriteForm');

  it.each([
    ['expo/fetch on Android: the connection dropped', { message: 'Error: fetch failed: Software caused connection abort', code: '' }],
    ['expo/fetch on Android: the connection was reset', 'Error: fetch failed: unexpected end of stream on https://example.test/...'],
    ['react-native fetch', new TypeError('Network request failed')],
    ['the browser fetch', new TypeError('Failed to fetch')],
    ['a socket error', new Error('read ECONNRESET')],
    ['a gateway page', '<html><body>502 Bad Gateway</body></html>'],
    ['a proxy status', 'error code: 524'],
    ['a gateway\'s JSON 502', { message: 'An invalid response was received from the upstream server', code: '' }],
    ['a gateway\'s JSON 504', 'The upstream server is timing out'],
    ['an answer with the HTTP status 502 and no PostgREST code', { message: 'unexpected', status: 502, code: '' }],
    ['the 60 s limit of the gated fetch', { message: 'TimeoutError: Request timeout', code: '' }],
    ['the 60 s limit as an error object', new TimeoutError('Save timed out after 60 seconds', 60000)],
  ])('%s: may have been saved', (_name, failure) => {
    expect(requestMayHaveBeenSent(failure)).toBe(true);
    expect(serverText(failure, 'x', FORM)).toBe(MAYBE_SAVED());
    expect(transportText(failure, FORM)).toBe(MAYBE_SAVED());
    // A read has nothing that could have been saved.
    expect(serverText(failure, 'x')).toBe(t('errors.parsed.network'));
  });

  it.each([
    ['no session that could be renewed', new AppError('NETWORK', 'Network request failed: session refresh unavailable')],
    ['the offline check', new AppError('NETWORK', t('errors.network.noInternet'))],
    ['the app text with the code NETWORK', { message: t('errors.network.noInternet'), error: t('errors.network.noInternet'), errorCode: 'NETWORK' }],
    ['the name could not be looked up', { message: 'Error: fetch failed: Unable to resolve host "example.test": No address associated with hostname', code: '' }],
    ['the connection was refused', 'Error: fetch failed: Failed to connect to example.test/203.0.113.7 (port 443)'],
    ['the connection could not be opened in time', 'Error: fetch failed: connect timed out'],
    ['no route', new Error('Network is unreachable')],
    ['a tunnel that is down (Cloudflare 1033)', 'error code: 1033'],
    ['iOS: offline', 'Error: fetch failed: The Internet connection appears to be offline.'],
    ['iOS: host not found', 'TypeError: Network request failed: A server with the specified hostname could not be found.'],
    ['iOS: could not connect', 'Error: fetch failed: Could not connect to the server.'],
    ['Android: the certificate is not trusted', 'Error: fetch failed: javax.net.ssl.SSLHandshakeException: java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.'],
  ])('%s: nothing was sent, check the connection', (_name, failure) => {
    expect(isNetworkError(failure) || isTimeoutError(failure)).toBe(true);
    expect(requestMayHaveBeenSent(failure)).toBe(false);
    expect(serverText(failure, 'x', FORM)).toBe(t('errors.parsed.network'));
    expect(serverText(failure, 'x', { write: true })).toBe(t('errors.parsed.network'));
  });

  it('is no failure to word when the server answered', () => {
    expect(requestMayHaveBeenSent({ message: 'Item belongs to another customer', code: '42501' })).toBe(false);
    expect(requestMayHaveBeenSent({ message: 'canceling statement due to statement timeout', code: '57014' })).toBe(false);
    expect(requestMayHaveBeenSent(undefined)).toBe(false);
    expect(serverText({ message: 'Item belongs to another customer', code: '42501' }, 'x', FORM)).toBe('Item belongs to another customer');
  });

  it('words the failure the same way from a service result that kept the raw text', () => {
    const result = { success: false, message: 'Failed to save', error: 'Error: fetch failed: Connection reset by peer', errorCode: 'NETWORK' };
    expect(serverText(result, 'x', FORM)).toBe(MAYBE_SAVED());
    expect(serverText(result, 'x', { write: true })).toBe(t('errors.parsed.timeoutWrite'));
  });

  it('says it in Gujarati too', () => {
    setLanguage('gu');
    expect(serverText('Error: fetch failed: Connection reset by peer', 'x', FORM)).toBe(t('errors.parsed.timeoutWriteForm'));
    expect(t('errors.parsed.timeoutWriteForm')).toMatch(/[઀-૿]/);
    expect(serverText(new AppError('NETWORK', 'Network request failed: session refresh unavailable'), 'x', FORM)).toBe(t('errors.parsed.network'));
  });

  it('a delete that failed after sending says it may have been deleted (detail wording through executeRPC options)', () => {
    const failure = 'Error: fetch failed: Connection reset by peer';
    expect(serverText(failure, 'x', { delete: true, form: true })).toBe(t('errors.parsed.timeoutDeleteForm'));
    expect(serverText(failure, 'x', { delete: true })).toBe(t('errors.parsed.timeoutDelete'));
    expect(serverText('Network request failed: session refresh unavailable', 'x', { delete: true, form: true })).toBe(t('errors.parsed.network'));
    expect(t('errors.parsed.timeoutDeleteForm')).toBe(
      'No answer from the server. It may have been deleted. Go back to the list and check before trying again.'
    );
  });
});

describe('a timeout is told by the error, not by English words (G13)', () => {
  beforeEach(() => setLanguage('gu'));

  it('reads the class name the PostgREST client puts in front of the message', () => {
    // A timeout thrown inside fetch: the message is translated, the class name is not.
    const failure = { message: 'TimeoutError: સમય પૂરો થયો', details: '', hint: '', code: '' };
    expect(isTimeoutError(failure)).toBe(true);
    expect(serverText(failure, 'x', { write: true, form: true })).toBe(t('errors.parsed.timeoutWriteForm'));
  });

  it("reads the app's own timeout sentence behind the name 'AppError'", () => {
    for (const key of ['errors.network.requestTimedOut', 'errors.network.authTimedOut', 'errors.code.timeout'] as const) {
      const failure = { message: `AppError: ${t(key)}`, code: '' };
      expect(isTimeoutError(failure)).toBe(true);
      expect(serverText(failure, 'x', { write: true, form: true })).toBe(t('errors.parsed.timeoutWriteForm'));
      expect(serverText(failure, 'x')).toBe(t('errors.parsed.network'));
    }
  });

  it('reads a timeout error that carries the code of the app', () => {
    expect(isTimeoutError(new AppError('TIMEOUT', 'સમય પૂરો થયો'))).toBe(true);
    expect(isTimeoutError({ message: 'x', error: 'x', errorCode: 'TIMEOUT' })).toBe(true);
  });

  it('is not fooled by a text that only looks like a name', () => {
    expect(isTimeoutError('Error creating GRN: weight must be positive')).toBe(false);
    expect(isTimeoutError({ message: 'AppError: સર્વર સાથે કામ થઈ શક્યું નથી' })).toBe(false);
  });
});

describe('a class name is never shown', () => {
  it('is stripped from the front of a text, once or several times', () => {
    expect(stripErrorPrefix('AppError: Something')).toBe('Something');
    expect(stripErrorPrefix('Error: TypeError: Something')).toBe('Something');
    expect(stripErrorPrefix('Something')).toBe('Something');
    expect(stripErrorPrefix('Error creating GRN: x')).toBe('Error creating GRN: x');
  });

  it('is dropped from an AppError message in both languages', () => {
    expect(serverText({ message: 'AppError: Your session has changed.' }, 'x')).toBe('Your session has changed.');
    setLanguage('gu');
    expect(serverText({ message: 'AppError: સર્વર સાથે કામ થઈ શક્યું નથી' }, 'x')).toBe('સર્વર સાથે કામ થઈ શક્યું નથી');
    expect(serverText({ message: 'AppError: OTP મોકલી શકાયો નથી' }, 'x')).toBe('OTP મોકલી શકાયો નથી');
    expect(failureText('x', 'AppError: સર્વર સાથે કામ થઈ શક્યું નથી', 'fallback')).toBe('સર્વર સાથે કામ થઈ શક્યું નથી');
  });

  it('is dropped from a plain "Error: " sentence of the server, but a class name still marks developer text', () => {
    expect(serverText('Error: Quantity must be greater than zero', 'x')).toBe('Quantity must be greater than zero');
    expect(serverText('TypeError: Quantity must be greater than zero', 'Could not save')).toBe('Could not save');
  });
});

describe('an expired sign-in (contract item 9)', () => {
  it.each([
    [{ message: 'JWT expired', code: 'PGRST301' }],
    [{ message: 'JWT expired', code: 'PGRST303' }],
    [{ message: 'JWT expired', code: '' }],
    ['JWT expired'],
  ])('%j reads as an expired sign-in', failure => {
    expect(isSessionExpiredError(failure)).toBe(true);
    for (const language of ['en', 'gu'] as const) {
      setLanguage(language);
      // A read, or a change refused with PGRST301: sign in again.
      expect(serverText(failure, 'x')).toBe(t('errors.code.sessionExpired'));
      // A change that was refused for an expired token (the session is renewed, the change was not sent again): press the button again.
      const rejected = typeof failure === 'object' && failure.code === 'PGRST301';
      expect(serverText(failure, 'x', { write: true, form: true })).toBe(t(rejected ? 'errors.code.sessionExpired' : 'errors.code.signInRenewed'));
      expect(serverText(failure, 'x', { delete: true })).toBe(t(rejected ? 'errors.code.sessionExpired' : 'errors.code.signInRenewedDelete'));
    }
  });

  it('is not claimed by another failure', () => {
    expect(isSessionExpiredError({ message: 'permission denied for function f', code: '42501' })).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
  });
});
