/**
 * The gateway's "upgrading" answer (HTTP 503 {"code":"upgrading", ...}) as the error classes read it: the request never
 * ran, so it is neither a lost answer nor a lost connection; a RESEND that gets it is unsettled; the words shown are the
 * app's own, in the app's language.
 */
import { setLanguage, t } from '@/i18n';
import { isNetworkError, isUnsettledFailure, isUpgradingAnswer, serverText } from '../serverText';
import { isLostAnswer, requestMayHaveBeenSent } from '../serverText';

afterEach(() => setLanguage('en'));

const upgrading = (extra: object = {}) => ({
  status: 503,
  code: 'upgrading',
  message: "The facility's server is being updated. Try again in a few minutes.",
  ...extra,
});
const otherGateway503 = { status: 503, message: 'The upstream server is unavailable' };

describe('the upgrading answer', () => {
  it.each([
    ['is recognised by its code', () => isUpgradingAnswer(upgrading()), true],
    ['is not a lost answer (the save did not run)', () => isLostAnswer(upgrading()), false],
    ['may not have been sent', () => requestMayHaveBeenSent(upgrading()), false],
    ['is not a lost connection', () => isNetworkError(upgrading()), false],
    ['is unsettled for a RESEND', () => isUnsettledFailure(upgrading()), true],
  ])('%s', (_name, ask, expected) => {
    expect(ask()).toBe(expected);
  });

  it('another gateway 503 is still a lost answer (the old rule)', () => {
    expect(isUpgradingAnswer(otherGateway503)).toBe(false);
    expect(isLostAnswer(otherGateway503)).toBe(true);
  });

  it('is shown in the app\'s words, in English and in Gujarati', () => {
    expect(serverText(upgrading(), 'fallback', { write: true, form: true })).toBe(t('components.upgrading.message'));
    setLanguage('gu');
    const shown = serverText(upgrading(), 'fallback', { write: true, form: true });
    expect(shown).toBe(t('components.upgrading.message'));
    expect(shown).not.toMatch(/[A-Za-z]/);
  });
});

describe('"Active account required" is no longer read as a session that ended', () => {
  it('(it cannot reach the app over HTTP; the session check answers first)', () => {
    setLanguage('gu');
    expect(serverText(new Error('Active account required'), 'fallback')).not.toBe(t('errors.code.sessionExpired'));
  });
});
