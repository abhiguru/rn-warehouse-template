/**
 * Gujarati texts of central login (the `central` area and its screen titles):
 * sentences with a facility name or a wait, identifiers that keep 0-9, and the
 * words the glossary fixes.
 */
import { localizeDigits, setLanguage, t } from '..';
import { central as english } from '../locales/en/central';
import { central as gujarati } from '../locales/gu/central';

afterEach(() => setLanguage('en'));

/** Every text of a table, by key path. */
function leaves(node: unknown, prefix = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}

describe('central login in Gujarati', () => {
  it('has a Gujarati text for every English one, with the same placeholders', () => {
    const en = new Map(leaves(english));
    const gu = new Map(leaves(gujarati));
    expect([...gu.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, text] of en) {
      const placeholders = (value: string) => (value.match(/\{\{\w+\}\}/g) ?? []).sort();
      expect([key, placeholders(gu.get(key)!)]).toEqual([key, placeholders(text)]);
    }
  });

  it('is written in Gujarati script, apart from the words the glossary keeps in English letters', () => {
    for (const [key, text] of leaves(gujarati)) {
      const withoutPlaceholders = text.replace(/\{\{\w+\}\}/g, '');
      // OTP stays in English letters (glossary rule 6); nothing else does.
      expect([key, withoutPlaceholders.replace(/OTP/g, '').match(/[A-Za-z]+/g)]).toEqual([key, null]);
      if (withoutPlaceholders.replace(/[\s,]/g, '') !== '') expect([key, /[઀-૿]/.test(text)]).toEqual([key, true]);
    }
  });

  it('never writes a digit by hand in Latin form', () => {
    for (const [key, text] of leaves(gujarati)) expect([key, /[0-9]/.test(text)]).toEqual([key, false]);
  });

  it('uses the glossary words: કોલ્ડ સ્ટોરેજ for a facility, લૉગિન and લૉગઆઉટ, મંજૂરી for access, OTP for the code', () => {
    expect(t('central.facilities.title', undefined, 'gu')).toBe('મારાં કોલ્ડ સ્ટોરેજ');
    expect(t('central.facilities.add', undefined, 'gu')).toBe('કોલ્ડ સ્ટોરેજ ઉમેરો');
    expect(t('central.switch.action', undefined, 'gu')).toBe('કોલ્ડ સ્ટોરેજ બદલો');
    expect(t('central.errors.sessionEnded', undefined, 'gu')).toContain('ઍસોસિએશનમાં તમારું લૉગિન પૂરું થઈ ગયું છે. ફરી લૉગિન કરો.');
    expect(t('central.signIn.endedTitle', undefined, 'gu')).toBe('લૉગઆઉટ થયું');
    expect(t('central.errors.tooManyAttempts', undefined, 'gu')).toBe('ઘણી વાર ખોટો OTP નખાયો છે. નવો OTP મગાવો.');
    const all = leaves(gujarati).map(([, text]) => text).join(' ');
    for (const avoided of ['સાઇન ઇન', 'સાઇન આઉટ', 'સેશન', 'ઍક્સેસ', 'વપરાશકર્તા', 'નોંધણી']) expect(all).not.toContain(avoided);
  });

  it('puts a facility name where the Gujarati sentence needs it and never translates it', () => {
    expect(t('central.link.heading', { facility: 'North Cold Store' }, 'gu')).toBe('North Cold Storeનો OTP નાખો');
    expect(t('central.link.heading', { facility: 'North Cold Store' })).toBe('Enter the code from North Cold Store');
    expect(t('central.open.failedTitle', { facility: 'ગોંડલ કોલ્ડ સ્ટોરેજ' }, 'gu')).toBe('ગોંડલ કોલ્ડ સ્ટોરેજ ખોલી શકાયું નથી');
    expect(t('central.open.revoked', { facility: 'North Cold Store' }, 'gu')).toBe(
      'North Cold Storeએ તમારી મંજૂરી પાછી લઈ લીધી છે. આ ભૂલ લાગતી હોય તો કોલ્ડ સ્ટોરેજના એડમિનનો સંપર્ક કરો.'
    );
    expect(t('central.leave.confirmTitle', { facility: 'North Cold Store' }, 'gu')).toBe('North Cold Storeમાંથી નીકળવું છે?');
  });

  it('shows a wait in Gujarati digits and a phone number as stored', () => {
    expect(t('central.errors.rateLimitedMinutes', { minutes: localizeDigits('15', 'gu') }, 'gu')).toBe(
      'ઘણા વધારે પ્રયાસ થયા છે. ૧૫ મિનિટ પછી ફરી પ્રયાસ કરો.'
    );
    expect(t('central.errors.rateLimitedMinutes', { minutes: localizeDigits('15', 'en') })).toBe('Too many attempts. Try again in 15 minutes.');
    expect(t('central.open.rateLimitedSeconds', { facility: 'North Cold Store', seconds: localizeDigits('45', 'gu') }, 'gu')).toBe(
      'North Cold Storeમાં ઘણા વધારે પ્રયાસ થયા છે. ૪૫ સેકન્ડ પછી ફરી પ્રયાસ કરો.'
    );
    expect(t('central.account.signedInAs', { phone: '+91 90000 00001' }, 'gu')).toBe('+91 90000 00001થી લૉગિન કરેલું છે');
    expect(t('central.account.nameInvalid', undefined, 'gu')).toBe('૮૦ અક્ષર સુધીનું નામ નાખો.');
  });

  it('names a list entry for a screen reader with or without a city', () => {
    expect(t('central.facilities.cellLabelCity', { name: 'North Cold Store', city: 'Rajkot', status: t('auth.enrollment.status.approved', undefined, 'gu') }, 'gu')).toBe(
      'North Cold Store, Rajkot, મંજૂર'
    );
    expect(t('central.facilities.cellLabel', { name: 'North Cold Store', status: t('central.facilities.status.linkNeeded', undefined, 'gu') }, 'gu')).toBe(
      'North Cold Store, OTP જોઈએ'
    );
  });

  it('keeps the delete confirmation in two paragraphs and says who keeps the records', () => {
    const message = t('central.account.deleteMessage', undefined, 'gu');
    expect(message.split('\n\n')).toHaveLength(2);
    expect(message).toContain('કોલ્ડ સ્ટોરેજના રેકોર્ડ તે કોલ્ડ સ્ટોરેજ પાસે જ રહે છે.');
    expect(t('central.account.deleteMessage')).toContain('Records at a cold storage are kept by that cold storage.');
  });

  it('words "Sign out on all phones" with the glossary words, in two paragraphs (a draft for the owner)', () => {
    expect(t('central.account.signOutAll')).toBe('Sign out on all phones');
    expect(t('central.account.signOutAll', undefined, 'gu')).toBe('બધા ફોનમાંથી લૉગઆઉટ કરો');
    const message = t('central.account.signOutAllMessage', undefined, 'gu');
    expect(message.split('\n\n')).toHaveLength(2);
    expect(message).toContain('ત્યાં ખુલ્લું રહેશે');
    expect(t('central.account.signOutAllMessage')).toContain('stays open there until you sign out on that phone.');
    expect(t('central.errors.notSupported', undefined, 'gu')).toContain('હજુ');
  });

  it('gives the new screens their titles in both languages', () => {
    expect(t('nav.screens.myFacilities')).toBe('My facilities');
    expect(t('nav.screens.myFacilities', undefined, 'gu')).toBe('મારાં કોલ્ડ સ્ટોરેજ');
    expect(t('nav.screens.addFacility', undefined, 'gu')).toBe('કોલ્ડ સ્ટોરેજ ઉમેરો');
    expect(t('nav.screens.facilityAddress', undefined, 'gu')).toBe('કોલ્ડ સ્ટોરેજનું સરનામું');
    expect(t('nav.screens.account', undefined, 'gu')).toBe('એકાઉન્ટ');
    expect(t('nav.screens.confirmNumber', undefined, 'gu')).toBe('કોલ્ડ સ્ટોરેજનો OTP');
  });
});
