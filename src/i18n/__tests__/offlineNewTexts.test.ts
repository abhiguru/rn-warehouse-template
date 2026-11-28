/**
 * WH-161 (S1, S7), Design offline-capture.md 10.5, 10.6 DQ2 and DQ4, 10.7 (PQ1, PQ3, PQ5) and 10.8 (DQ7, DQ8), word for word in
 * English and in Gujarati. Numbers (GRN, dispatch) stay 0-9; counts take Gujarati digits.
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - The contract (section 13) puts the keys under `offline.offlineNew.*`; the design names `numberPending`, `numberPendingHelpGrn`, ...
 *    `savedGrnTypedQueued` and the keys of section 13 (`onceSent`, `beingSent`, `ratesCheckedWhenSent`, `includesUnsent`, `orderChangesLater`).
 *  - The three refusal sentences of 10.8 DQ7 are named by the code in this order: `offline.offlineNew.refusal.<CODE>` with `{{document}}`
 *    and, for NUMBER_NOT_EXPECTED, `{{number}}`. The design gives the sentences, not the keys.
 *  - `includesUnsent` is a plain `{{count}}` text (no plural forms), as 10.7 words it.
 * ============================================
 */
import { t, setLanguage } from '..';

afterEach(() => setLanguage('en'));

type Lang = 'en' | 'gu';
const text = (key: string, options: Record<string, unknown>, language: Lang) =>
  (t as (k: string, o?: Record<string, unknown>, l?: string) => string)(`offline.offlineNew.${key}`, options, language);

const rows: [string, Record<string, unknown>, string, string][] = [
  ['numberPending', {}, 'Given when sent', 'મોકલતી વખતે મળશે'],
  ['numberPendingHelpGrn', {}, 'No connection. The GRN number is given when this GRN is sent.', 'કનેક્શન નથી. આ આવક પાવતી મોકલાશે ત્યારે તેનો નંબર મળશે.'],
  ['typedNumberHelp', {}, 'Checked when sent. If it is already used, this waits for a supervisor.', 'મોકલતી વખતે તપાસાશે. નંબર વપરાયેલો હશે તો તે સુપરવાઇઝરના નિર્ણય માટે રોકાશે.'],
  ['savedTitle', {}, 'Saved on this phone', 'આ ફોનમાં સાચવ્યું'],
  ['savedGrn', { customer: 'Asha Traders' }, 'The GRN for Asha Traders will be sent when you reconnect and gets its number then. You can print and share it once it is sent.', 'Asha Traders ની આવક પાવતી ફરી જોડાશો ત્યારે મોકલાશે અને ત્યારે તેનો નંબર મળશે. મોકલાયા પછી પ્રિન્ટ અને શેર કરી શકશો.'],
  ['savedGrnTyped', { customer: 'Asha Traders', number: 'G-501' }, 'GRN G-501 for Asha Traders will be sent when you reconnect. You can print and share it once it is sent.', 'Asha Traders ની આવક પાવતી G-501 ફરી જોડાશો ત્યારે મોકલાશે. મોકલાયા પછી પ્રિન્ટ અને શેર કરી શકશો.'],
  ['heroNumberPending', {}, 'Number when sent', 'મોકલતી વખતે નંબર'],
  ['docNotSent', {}, 'Not sent yet. It gets its number when sent.', 'હજુ મોકલાયું નથી. મોકલાશે ત્યારે નંબર મળશે.'],
  // 10.6 DQ2, DQ4
  ['onceSent', {}, 'Available once this is sent', 'મોકલાયા પછી થઈ શકશે'],
  ['beingSent', {}, 'Being sent. Try again in a moment.', 'મોકલાઈ રહ્યું છે. થોડી વારમાં ફરી પ્રયાસ કરો.'],
  // 10.7 (PQ1)
  ['ratesCheckedWhenSent', {}, 'No connection. Rates are checked when this GRN is sent.', 'કનેક્શન નથી. આ આવક પાવતી મોકલાશે ત્યારે દર તપાસાશે.'],
  // 10.8 DQ8: reachable, but an older entry is still unsent
  ['numberPendingQueuedGrn', {}, 'Your earlier entries are still being sent. The GRN number is given when this GRN is sent.', 'તમારી પહેલાંની એન્ટ્રી હજુ મોકલાઈ રહી છે. આ આવક પાવતી મોકલાશે ત્યારે તેનો નંબર મળશે.'],
  ['savedGrnQueued', { customer: 'Asha Traders' }, 'The GRN for Asha Traders will be sent after your earlier entries and gets its number then. You can print and share it once it is sent.', 'Asha Traders ની આવક પાવતી તમારી પહેલાંની એન્ટ્રી પછી મોકલાશે અને ત્યારે તેનો નંબર મળશે. મોકલાયા પછી પ્રિન્ટ અને શેર કરી શકશો.'],
  ['savedGrnTypedQueued', { customer: 'Asha Traders', number: 'G-501' }, 'GRN G-501 for Asha Traders will be sent after your earlier entries. You can print and share it once it is sent.', 'Asha Traders ની આવક પાવતી G-501 તમારી પહેલાંની એન્ટ્રી પછી મોકલાશે. મોકલાયા પછી પ્રિન્ટ અને શેર કરી શકશો.'],
];

describe('S7: the screen texts of 10.5, 10.6, 10.7 and 10.8', () => {
  it.each(rows)('%s in English', (key, options, english) => {
    expect(text(key, options, 'en')).toBe(english);
  });
  it.each(rows)('%s in Gujarati', (key, options, _english, gujarati) => {
    expect(text(key, options, 'gu')).toBe(gujarati);
  });
});

describe('PQ3: the line under a total that counts unsent bags', () => {
  it('English, and Gujarati with Gujarati digits', () => {
    expect(text('includesUnsent', { count: 40 }, 'en')).toBe('Includes 40 in GRNs not sent yet');
    expect(text('includesUnsent', { count: 40 }, 'gu')).toBe('મોકલવાની બાકી આવક પાવતીના ૪૦ નંગ સહિત');
  });
});

describe('DQ7 (10.8): a refusal during the Save wait that has no words on the form today', () => {
  it('SERIES_FULL, NUMBER_NOT_EXPECTED and REQUEST_KEY_REUSED in Gujarati', () => {
    expect(text('refusal.SERIES_FULL', { document: 'આવક પાવતી' }, 'gu')).toBe('આવક પાવતી ની નંબર શ્રેણીમાં કોઈ નંબર બાકી નથી.');
    expect(text('refusal.NUMBER_NOT_EXPECTED', { document: 'આવક પાવતી', number: 'G-501' }, 'gu')).toBe(
      'આ કોલ્ડ સ્ટોરેજમાં આવક પાવતી નંબર આપમેળે મળે છે, પણ આમાં G-501 લખેલો છે.'
    );
    expect(text('refusal.REQUEST_KEY_REUSED', {}, 'gu')).toBe('સર્વર આ એન્ટ્રીને પહેલાંની એન્ટ્રીથી અલગ ઓળખી શક્યું નથી.');
  });

  it('and in English (10.6 DQ5 sentences)', () => {
    expect(text('refusal.SERIES_FULL', { document: 'GRN' }, 'en')).toBe('The number series for GRN has no numbers left.');
    expect(text('refusal.NUMBER_NOT_EXPECTED', { document: 'GRN', number: 'G-501' }, 'en')).toBe(
      "This store's GRN numbers are given automatically, and this one came with G-501."
    );
    expect(text('refusal.REQUEST_KEY_REUSED', {}, 'en')).toBe('The server could not tell this entry apart from an earlier one.');
  });
});
