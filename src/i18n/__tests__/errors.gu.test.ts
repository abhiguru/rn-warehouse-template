import { setLanguage, t } from '..';
import { AppError } from '@/utils/appError';
import { ErrorCode, getUserFriendlyError, handleError, parseErrorToFriendly } from '@/utils/errorHandler';
import { categorizeError, isOfflineFailure } from '@/utils/serviceErrorHandler';
import { TimeoutError } from '@/utils/rpcClient';
import { getStockLabel, getStockStatus } from '@/utils/stockStatus';
import { BootstrapValidationError, httpOrigin } from '@/config/bootstrapValidation';
import { localizeBootstrapError } from '@/config/bootstrapErrors';
import { parseOperatorOrigin } from '@/config/operatorServer';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

afterEach(() => setLanguage('en'));

describe('errors in Gujarati', () => {
  it('writes whole sentences with the verb last and the glossary words', () => {
    expect(t('errors.customer.fetchListFailed', undefined, 'gu')).toBe('વેપારીઓ લોડ કરી શકાયા નથી');
    expect(t('errors.grn.notFoundOrDenied', undefined, 'gu')).toBe('આવક પાવતી મળી નથી અથવા તમને તે જોવાની પરવાનગી નથી');
    expect(t('errors.dispatch.deletedWithRestore', undefined, 'gu')).toBe('જાવક ડિલીટ થઈ. ઑર્ડર અને સ્ટોક પહેલાં જેવા કરી દીધા છે.');
  });

  it('fills placeholders; an HTTP status and a version stay as they are', () => {
    expect(t('errors.server.discoveryFailedHttp', { status: '503' }, 'gu')).toBe('સર્વરની માહિતી મેળવી શકાઈ નથી (HTTP 503).');
    expect(t('errors.server.requiresAppVersion', { version: '1.4.0' }, 'gu')).toBe('આ સર્વર માટે ઍપનું વર્ઝન 1.4.0 અથવા તેનાથી નવું જોઈએ.');
    expect(t('errors.biometric.unlockWith', { method: t('errors.biometric.fingerprint', undefined, 'gu') }, 'gu')).toBe('ફિંગરપ્રિન્ટ વડે અનલૉક કરો');
  });

  it('keeps the noun unchanged after a count', () => {
    expect(t('errors.auth.missingParams', { count: 1, names: 'id' }, 'gu')).toBe('જરૂરી માહિતી મળી નથી: id');
    expect(t('errors.auth.missingParams', { count: 2, names: 'id, mode' })).toBe('Missing required parameters: id, mode');
    expect(t('errors.auth.missingParams', { count: 1, names: 'id' })).toBe('Missing required parameter: id');
  });

  it('shows a wait time in Gujarati digits', () => {
    setLanguage('gu');
    expect(parseErrorToFriendly('Too many requests, wait 45 seconds')).toBe('ઘણી બધી વિનંતીઓ થઈ. ફરી પ્રયાસ કરતાં પહેલાં ૪૫ સેકન્ડ રાહ જુઓ.');
  });
});

describe('error handling does not read translated text', () => {
  it('classifies an app error by its code in either language', () => {
    for (const language of ['en', 'gu'] as const) {
      setLanguage(language);
      const offline = new AppError('NETWORK', t('errors.network.noInternet'));
      const signIn = new AppError('SIGN_IN_REQUIRED', t('errors.auth.signInRequired'));
      const switching = new AppError('SERVER_SWITCH', t('errors.auth.serverSwitchInProgress'));
      const timeout = new TimeoutError(t('errors.network.timedOutAfter', { context: 'RPC get_items', seconds: '30' }), 30000);

      expect(categorizeError(offline)).toMatchObject({ category: 'network', retryable: true });
      expect(categorizeError(timeout)).toMatchObject({ category: 'timeout', retryable: true });
      expect(categorizeError(signIn)).toMatchObject({ category: 'unknown', retryable: false });
      expect(isOfflineFailure(offline)).toBe(true);
      expect(isOfflineFailure(timeout)).toBe(true);
      expect(isOfflineFailure(signIn)).toBe(false);
      expect(isOfflineFailure(switching)).toBe(false);
      expect(isOfflineFailure(new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged')))).toBe(false);
      expect(handleError(offline, 'test').errorCode).toBe(ErrorCode.NETWORK_ERROR);
      expect(handleError(timeout, 'test').errorCode).toBe(ErrorCode.TIMEOUT);
    }
  });

  it('still classifies English server text by its words', () => {
    setLanguage('gu');
    expect(categorizeError(new TypeError('Network request failed')).category).toBe('network');
    expect(isOfflineFailure({ message: 'Error: Session changed', code: '' })).toBe(false);
    expect(handleError(new Error('duplicate key value'), 'test')).toMatchObject({
      errorCode: ErrorCode.DUPLICATE_ENTRY,
      message: 'આ નોંધ પહેલેથી છે.',
    });
    expect(categorizeError(new Error('JWT expired')).userMessage).toBe('તમારા લૉગિનનો સમય પૂરો થયો છે. ફરી લૉગિન કરો.');
  });

  it('gives the friendly message of the language at the time of the call', () => {
    expect(getUserFriendlyError('grn', 'load')).toBe('Unable to load GRN details. Please try again.');
    setLanguage('gu');
    expect(getUserFriendlyError('grn', 'load')).toBe('આવક પાવતીની વિગતો લોડ કરી શકાઈ નથી. ફરી પ્રયાસ કરો.');
    expect(getUserFriendlyError('nothing', 'nothing')).toBe('ભૂલ આવી. ફરી પ્રયાસ કરો.');
  });

  it('turns English server text into a Gujarati sentence and shows an app message as it is', () => {
    expect(parseErrorToFriendly('Invoice not found', 'Invoice')).toBe('Invoice not found. It may have been deleted.');
    setLanguage('gu');
    expect(parseErrorToFriendly('Invoice not found', 'Invoice')).toBe('ઇન્વૉઇસ મળ્યું નથી. કદાચ તે ડિલીટ થઈ ગયું છે.');
    expect(parseErrorToFriendly('Invalid OTP')).toBe('તમે લખેલો OTP ખોટો છે. તપાસીને ફરી પ્રયાસ કરો.');
    // Already the app's own Gujarati message: never matched against English words.
    expect(parseErrorToFriendly(t('errors.auth.otpSendFailed'))).toBe('OTP મોકલી શકાયો નથી');
  });

  it('localizes a configuration failure by its code, not its text', () => {
    let thrown: unknown;
    try {
      httpOrigin('not a url');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BootstrapValidationError);
    expect((thrown as BootstrapValidationError).message).toBe('Configure an HTTP(S) origin.');
    setLanguage('gu');
    // The validator itself stays English (it also runs in the Node CLI)…
    expect(() => httpOrigin('not a url')).toThrow('Configure an HTTP(S) origin.');
    // …and the app shows the text of its code.
    expect((localizeBootstrapError(thrown) as Error).message).toBe('સર્વરનું સાચું સરનામું લખો (HTTPS થી શરૂ થતું).');
    expect(() => parseOperatorOrigin('not a url')).toThrow('સર્વરનું સાચું સરનામું લખો (HTTPS થી શરૂ થતું).');
    expect(() => parseOperatorOrigin('http://cold.example.test')).toThrow('HTTPS થી શરૂ થતું સર્વરનું સરનામું લખો.');
    const other = new Error('boom');
    expect(localizeBootstrapError(other)).toBe(other);
  });

  it('labels a stock level in the app language and keeps the English constant', () => {
    expect(getStockStatus(10, 100).label).toBe('Low stock');
    setLanguage('gu');
    expect(getStockStatus(10, 100).label).toBe('ઓછો સ્ટોક');
    expect(getStockLabel('negative')).toBe('સ્ટોક નથી');
  });
});
