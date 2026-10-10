import { t, setLanguage } from '..';
import { validateDispatchDateVsGRNDates, validateStep1 } from '@/features/dispatch/schemas/dispatchValidation';

afterEach(() => setLanguage('en'));

const header = {
  disp_no: 'DD0006',
  disp_date: '2026-01-01',
  registration: 'GJ01AB1234',
  customer_id: '22222222-0000-4000-8000-000000000001',
  customer_name: 'Disposable Customer',
  supervisor_id: '11111111-0000-4000-8000-000000000001',
  supervisor_name: 'Demo Admin',
  note: '',
};

describe('dispatch texts in Gujarati', () => {
  it('keeps the dispatch number as typed and calls a dispatch જાવક', () => {
    expect(t('dispatch.review.confirmCreateTitle', { number: 'DD0006' }, 'gu')).toBe('જાવક DD0006 બનાવવી છે?');
    expect(t('dispatch.review.savedTitle', { number: 'DD0006' }, 'gu')).toBe('જાવક DD0006 સચવાઈ ગઈ');
    expect(t('dispatch.review.createDispatch', undefined, 'gu')).toBe('જાવક બનાવો');
  });

  it('formats a count in Gujarati digits and does not change the noun', () => {
    expect(t('dispatch.wizard.discardItemsMessage', { count: 1 }, 'gu')).toBe('તમે ઉમેરેલી ૧ આઇટમ જતી રહેશે.');
    expect(t('dispatch.wizard.discardItemsMessage', { count: 1200 }, 'gu')).toBe('તમે ઉમેરેલી ૧,૨૦૦ આઇટમ જતી રહેશે.');
    expect(t('dispatch.wizard.discardItemsMessage', { count: 1200 })).toBe('The 1,200 items you added will be lost.');
  });

  it('builds the lot count as one sentence', () => {
    const lots = t('dispatch.count.lots', { count: 3 }, 'gu');
    expect(lots).toBe('૩ લોટ');
    expect(t('dispatch.lotSheet.countInStockWithOut', { lots, out: 2 }, 'gu')).toBe('સ્ટોકમાં ૩ લોટ (૨માં સ્ટોક નથી)');
    expect(t('dispatch.items.maxBagsAvailable', { count: 50 }, 'gu')).toBe('૫૦ કે તેથી ઓછી બોરી લખો. સ્ટોકમાં એટલી જ છે.');
  });
});

describe('dispatch validation follows the language', () => {
  it('is English by default', async () => {
    const result = await validateStep1({ ...header, registration: 'gj 01' });
    expect(result.errors.registration).toBe('Registration must contain only uppercase letters, numbers, and spaces');
  });

  it('asks for English letters and digits in Gujarati', async () => {
    setLanguage('gu');
    const result = await validateStep1({ ...header, disp_no: 'જાવક૧૨', registration: 'ગજ ૦૧' });
    expect(result.isValid).toBe(false);
    expect(result.errors.disp_no).toBe('જાવક નંબરમાં અંગ્રેજી કેપિટલ અક્ષરો અને આંકડા વાપરો');
    expect(result.errors.registration).toBe('વાહન નંબરમાં ફક્ત અંગ્રેજી કેપિટલ અક્ષરો, આંકડા અને ખાલી જગ્યા વાપરો');
  });

  it('names the receipt and writes the dates in Gujarati', () => {
    setLanguage('gu');
    const result = validateDispatchDateVsGRNDates('2026-01-01', [{ grns_gr_no: 'G0042', grns_date: '2026-01-05' }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('આવક પાવતી G0042નો માલ');
    expect(result.error).toContain('જાન્યુ');
    expect(result.error).not.toMatch(/2026|GRN/);
  });
});
