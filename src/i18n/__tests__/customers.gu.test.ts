import { setLanguage, t } from '..';
import { customerNextStepLabel, customerSteps } from '@/features/customer/customerStepLabels';
import { formatGST, formatMobile, validateStep1, validateStep2 } from '@/features/customer/schemas/customerValidation';

afterEach(() => setLanguage('en'));

describe('customers in Gujarati', () => {
  it('asks for a GST number in English letters and digits, with the example unchanged', () => {
    expect(t('customers.validation.gstInvalid', { length: 15, example: '22AAAAA0000A1Z5' }, 'gu')).toBe(
      '૧૫ અક્ષરનો GST નંબર અંગ્રેજી અક્ષરો અને આંકડામાં લખો, જેમ કે 22AAAAA0000A1Z5.'
    );
  });
  it('puts the total before the count', () => {
    expect(t('customers.review.documentCountLabel', { count: 3, max: 10 }, 'gu')).toBe('૧૦ માંથી ૩ દસ્તાવેજ');
  });
  it('quotes the search text', () => {
    expect(t('customers.search.noMatchTitle', { search: 'પટેલ' }, 'gu')).toBe('"પટેલ" સાથે મળતો કોઈ વેપારી નથી');
  });
  it('names the steps in the language of the moment', () => {
    expect(customerSteps().map(step => step.label)).toEqual(['Basic information', 'Address and tax details', 'Documents and review']);
    expect(customerNextStepLabel(1)).toBe('Next: Details');
    expect(customerNextStepLabel(3, true)).toBe('Update Customer');
    setLanguage('gu');
    expect(customerSteps().map(step => step.shortLabel)).toEqual(['મૂળ માહિતી', 'વિગતો', 'ચકાસણી']);
    expect(customerNextStepLabel(2)).toBe('આગળ: ચકાસણી');
  });
});

describe('customer validation', () => {
  it('keeps the English messages', async () => {
    const result = await validateStep1({ name: 'A', mobile: '123', email: 'x' });
    expect(result.errors).toEqual({
      name: 'Enter at least 2 characters.',
      mobile: 'Enter a 10-digit mobile number.',
      email: 'Enter an email address like name@example.com.',
    });
    const details = await validateStep2({
      city: '', state: '', pincode: '12', address: '', gst: 'ABC', pan: 'ABC', contact_name: '', contact_mobile: '', contact_email: '',
    });
    expect(details.errors).toEqual({
      pincode: 'Enter a 6-digit pincode.',
      gst: 'Enter a 15-character GST number, like 22AAAAA0000A1Z5.',
      pan: 'Enter a 10-character PAN, like AAAAA0000A.',
    });
  });
  it('gives Gujarati messages once the language is Gujarati, and accepts ૦-૯ in a mobile number', async () => {
    setLanguage('gu');
    const result = await validateStep1({ name: '', mobile: '૯૮૭૬૫૪૩૨૧૦', email: '' });
    // An empty name fails both rules; the form shows the last one, as it does in English.
    expect(result.errors).toEqual({ name: 'ઓછામાં ઓછા ૨ અક્ષર લખો.' });
    expect(t('customers.validation.nameRequired')).toBe('વેપારીનું નામ લખો.');
    const short = await validateStep1({ name: 'રમેશ ટ્રેડર્સ', mobile: '૯૮૭', email: '' });
    expect(short.errors).toEqual({ mobile: '૧૦ આંકડાનો મોબાઇલ નંબર લખો.' });
  });
  it('stores typed ૦-૯ as 0-9 in identifiers', () => {
    expect(formatMobile('૯૮૭૬૫૪૩૨૧૦')).toBe('919876543210');
    expect(formatGST('૨૨aaaaa0000a1z5')).toBe('22AAAAA0000A1Z5');
  });
});
