/**
 * Gujarati texts of the sign-in, settings and users area: a plural, sentences
 * with placeholders, identifiers that keep 0-9 and numbers that do not.
 */
import { localizeDigits, normalizeDigits, setLanguage, t } from '..';
import { roleLabel } from '@/utils/roleLabel';

afterEach(() => setLanguage('en'));

describe('auth, settings and users in Gujarati', () => {
  it('counts customers without changing the noun, in Gujarati digits', () => {
    expect(t('auth.review.approveMessage', { name: 'મીરા', count: 1 }, 'gu')).toBe(
      'મીરા લૉગિન કરી શકશે અને ૧ વેપારીના ઑર્ડર જોઈ શકશે.'
    );
    expect(t('users.list.customersAssigned', { count: 12 }, 'gu')).toBe('૧૨ વેપારી સોંપેલા');
    expect(t('users.list.customersAssigned', { count: 1 })).toBe('1 customer assigned');
    expect(t('users.list.customersAssigned', { count: 12 })).toBe('12 customers assigned');
  });

  it('names the access requests screen once, with અરજી, and has the staff and supervisor wording', () => {
    expect(t('auth.review.screenTitle', undefined, 'gu')).toBe('મંજૂરીની અરજીઓ');
    expect(t('nav.screens.enrollmentReview', undefined, 'gu')).toBe(t('auth.review.screenTitle', undefined, 'gu'));
    expect(t('auth.review.screenTitle')).toBe('Access requests');
    expect(t('nav.screens.enrollmentReview')).toBe('Access requests');
    expect(t('auth.review.approveTitleStaff', { name: 'મીરા' }, 'gu')).toBe('મીરાને સ્ટાફ તરીકે મંજૂરી આપવી છે?');
    expect(t('auth.review.approveAsSupervisor', undefined, 'gu')).toBe('સુપરવાઇઝર તરીકે મંજૂર કરો');
    expect(t('auth.review.removeCustomer', { name: 'પટેલ ટ્રેડર્સ' }, 'gu')).toBe('પટેલ ટ્રેડર્સ કાઢી નાખો');
  });

  it('keeps a phone number as stored and puts it where the sentence needs it', () => {
    expect(t('auth.otp.codeSentMessage', { phone: '+91 98765 43210' }, 'gu')).toBe(
      '+91 98765 43210 પર નવો OTP મોકલવામાં આવ્યો છે.'
    );
    expect(t('auth.login.countryCodeHint', { code: '+91' }, 'gu')).toBe('દેશનો કોડ +91 આપમેળે ઉમેરાય છે');
  });

  it('shows a countdown in Gujarati digits', () => {
    expect(t('auth.otp.resendIn', { time: localizeDigits('0:30', 'gu') }, 'gu')).toBe('૦:૩૦ પછી ફરી મોકલો');
    expect(t('auth.otp.resendIn', { time: localizeDigits('0:30', 'en') })).toBe('Resend in 0:30');
    expect(t('auth.otp.codeProgress', { entered: 4, total: 6 }, 'gu')).toBe('OTP, ૬માંથી ૪ આંકડા નાખ્યા');
  });

  it('reads a typed code or phone number in either digit set', () => {
    expect(normalizeDigits('૧૨૩૪૫૬')).toBe('123456');
    expect(normalizeDigits('૯૮૭૬૫ 43210').replace(/\D/g, '')).toBe('9876543210');
  });

  it('names a stored role through its key, never from the stored value', () => {
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel(undefined)).toBe('User');
    setLanguage('gu');
    expect(roleLabel('admin')).toBe('એડમિન');
    expect(roleLabel('customer')).toBe('વેપારી');
    expect(roleLabel('something-new')).toBe('યુઝર');
    expect(t('users.edit.roleChanged.supervisor', { name: 'મીરા' })).toBe('મીરા હવે સુપરવાઇઝર છે.');
  });

  it('keeps the two legal links as placeholders of one sentence', () => {
    expect(t('auth.legal.agreement', undefined, 'gu').split(/(\{\{terms\}\}|\{\{privacy\}\})/)).toEqual([
      'આગળ વધીને તમે અમારી ',
      '{{terms}}',
      ' અને ',
      '{{privacy}}',
      ' સ્વીકારો છો',
    ]);
    expect(t('auth.legal.agreement').split(/(\{\{terms\}\}|\{\{privacy\}\})/)).toEqual([
      'By continuing, you agree to our ',
      '{{terms}}',
      ' and ',
      '{{privacy}}',
      '',
    ]);
  });
});
