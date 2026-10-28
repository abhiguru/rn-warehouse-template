import { setLanguage } from '@/i18n';
import { refusalOf } from '../serverRefusal';
import { isNumberFormatRefusal, numberFormatText } from '../numberFormatRefusal';

afterEach(() => setLanguage('en'));

const body = (pattern: string | null, message: string) => ({
  success: false, error_code: 'WH409', reason: 'NUMBER_FORMAT', number: 'Q-1', document_type: 'grn', pattern, error: message, message,
});

it('names the format of the rule', () => {
  const refusal = refusalOf(body('A####', 'x'))!;
  expect(isNumberFormatRefusal(refusal)).toBe(true);
  expect(numberFormatText(refusal)).toBe("This number does not follow this facility's numbering (A####).");
});

it('keeps a pattern with digits and symbols exactly as written, in Gujarati too', () => {
  setLanguage('gu');
  expect(numberFormatText(refusalOf(body('GRN/26-27/####', 'x'))!)).toContain('(GRN/26-27/####)');
});

it('shows the backend message when the pattern is null (the number was only too long)', () => {
  expect(numberFormatText(refusalOf(body(null, 'This number can have at most 20 characters'))!)).toBe('This number can have at most 20 characters');
});

it('is no number-format refusal for another reason or none', () => {
  expect(isNumberFormatRefusal(refusalOf({ success: false, reason: 'NUMBER_TAKEN' }))).toBe(false);
  expect(isNumberFormatRefusal(undefined)).toBe(false);
});
