import { setLanguage, t } from '..';
import { formatGST, formatMobile, validateBasicInfo, validateDetails } from '@/features/customer/schemas/customerValidation';

afterEach(() => setLanguage('en'));

describe('customers in Gujarati', () => {
  it('asks for a GST number in English letters and digits, with the example unchanged', () => {
    expect(t('customers.validation.gstInvalid', { length: 15, example: '22AAAAA0000A1Z5' }, 'gu')).toBe(
      '૧૫ અક્ષરનો GST નંબર અંગ્રેજી અક્ષરો અને આંકડામાં લખો, જેમ કે 22AAAAA0000A1Z5.'
    );
  });
  it('counts the fields to fix', () => {
    expect(t('customers.form.fixFields', { count: 1 }, 'gu')).toBe('આગળ વધવા ૧ વિગત સુધારો.');
    expect(t('customers.form.fixFields', { count: 3 }, 'gu')).toBe('આગળ વધવા ૩ વિગતો સુધારો.');
  });
  it('names the duplicate customer and the mobile number it has', () => {
    expect(t('customers.form.duplicateTitle', { name: 'પટેલ ટ્રેડર્સ' }, 'gu')).toBe('પટેલ ટ્રેડર્સ પહેલેથી છે');
    expect(t('customers.form.duplicateMessage', { mobile: '+91 99999 00308' }, 'gu')).toContain('+91 99999 00308');
  });
  it('does not tell a screen-reader user to swipe', () => {
    expect(t('customers.list.rowHint', undefined, 'gu')).toBe('વેપારી ખોલે છે.');
    expect(t('customers.list.rowHint', undefined, 'gu')).not.toMatch(/સ્વાઇપ/);
  });
  it('quotes the search text', () => {
    expect(t('customers.search.noMatchTitle', { search: 'પટેલ' }, 'gu')).toBe('"પટેલ" સાથે મળતો કોઈ વેપારી નથી');
  });
});

describe('customer validation', () => {
  it('keeps the English messages', async () => {
    const result = await validateBasicInfo({ name: 'A', mobile: '123', email: 'x' });
    expect(result.errors).toEqual({
      name: 'Enter at least 2 characters.',
      mobile: 'Enter a 10-digit mobile number.',
      email: 'Enter an email address like name@example.com.',
    });
    const details = await validateDetails({
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
    const result = await validateBasicInfo({ name: '', mobile: '૯૮૭૬૫૪૩૨૧૦', email: '' });
    // An empty name fails two rules; the first one, asking for the name, is shown.
    expect(result.errors).toEqual({ name: 'વેપારીનું નામ લખો.' });
    expect(t('customers.validation.nameRequired')).toBe('વેપારીનું નામ લખો.');
    const short = await validateBasicInfo({ name: 'રમેશ ટ્રેડર્સ', mobile: '૯૮૭', email: '' });
    expect(short.errors).toEqual({ mobile: '૧૦ આંકડાનો મોબાઇલ નંબર લખો.' });
  });
  it('stores typed ૦-૯ as 0-9 in identifiers', () => {
    expect(formatMobile('૯૮૭૬૫૪૩૨૧૦')).toBe('919876543210');
    expect(formatGST('૨૨aaaaa0000a1z5')).toBe('22AAAAA0000A1Z5');
  });
});
