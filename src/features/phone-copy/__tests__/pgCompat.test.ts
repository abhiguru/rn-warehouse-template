/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md sections 2.1, 7.3 and 8 (PR4): the server's rules in
 * JavaScript. `pgSearchTerms` is tested with the GRN search in grnListParity.test.ts; `likeUnescaped` comes with the
 * pickers that use it.
 */
type PgCompat = {
  containsLiteral: (haystackLc: string | null, termLc: string) => boolean;
  pgRound: (value: number, digits?: number) => number;
  businessDate: (isoOrMs: string | number) => string;
  businessDayStart: (day: string) => number;
  parseTimestampUs: (iso: string | null | undefined) => number | null;
  mobileDigits: (mobile: string | null | undefined) => string;
  mobileKey: (mobile: string | null | undefined) => string;
  enCompare: (a: string | null, b: string | null) => number;
  copyToday: (asOf: string, nowMs?: number) => string;
};
const pg = () => require('@/features/phone-copy/pgCompat') as PgCompat;

describe('containsLiteral', () => {
  it.each<[string | null, string, boolean]>([
    ['50%_off', '%', true], ['50%_off', '0%_', true], ['abc', 'a%c', false], ['abc', 'a_c', false], ['abc', 'b', true], [null, 'a', false],
  ])('%j contains %j: %s', (haystack, term, expected) => {
    expect(pg().containsLiteral(haystack, term)).toBe(expected);
  });
});

describe('pgRound: half away from zero, as numeric ROUND', () => {
  it.each<[number, number | undefined, number]>([
    [2.5, undefined, 3], [-2.5, undefined, -3], [2.4, undefined, 2], [-2.4, undefined, -2], [0.5, 0, 1],
    [1.005, 2, 1.01], [-1.005, 2, -1.01], [12.344, 2, 12.34],
  ])('%d to %s places is %d', (value, digits, expected) => {
    expect(pg().pgRound(value, digits)).toBe(expected);
  });
});

describe('Indian business days (fixed +05:30)', () => {
  it('turns a moment into its date in India', () => {
    expect(pg().businessDate('2026-11-25T18:29:59.999Z')).toBe('2026-11-25');
    expect(pg().businessDate('2026-11-25T18:30:00Z')).toBe('2026-11-26');
    expect(pg().businessDate(Date.parse('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
  it('gives the moment a day starts', () => {
    expect(pg().businessDayStart('2026-11-26')).toBe(Date.parse('2026-11-25T18:30:00Z'));
  });
});

describe('copyToday (PR4): the phone\'s Indian date, never before the day the copy was confirmed', () => {
  const asOf = '2026-11-25T05:12:00.000+00:00';
  it.each([
    ['a phone clock set a day back', '2026-11-24T05:00:00Z', '2026-11-25'],
    ['the same day', '2026-11-25T10:00:00Z', '2026-11-25'],
    ['a later day, already the next one in India', '2026-11-26T19:00:00Z', '2026-11-27'],
  ])('%s', (_name, now, expected) => {
    expect(pg().copyToday(asOf, Date.parse(now))).toBe(expected);
  });
  it('reads the confirmed day in India too', () => {
    expect(pg().copyToday('2026-11-25T19:00:00Z', Date.parse('2026-11-25T01:00:00Z'))).toBe('2026-11-26');
  });
});

describe('parseTimestampUs', () => {
  const base = Date.parse('2026-11-25T05:00:00Z') * 1000;
  it.each<[string, number]>([
    ['2026-11-25T05:00:00+00:00', base],
    ['2026-11-25T05:00:00.000001+00:00', base + 1],
    ['2026-11-25T05:00:00.12+00:00', base + 120000],
    ['2026-11-25T10:30:00.123456+05:30', base + 123456],
    ['2026-11-25T05:00:00Z', base],
  ])('%s', (text, expected) => {
    expect(pg().parseTimestampUs(text)).toBe(expected);
  });
  it('answers null for no time', () => {
    expect(pg().parseTimestampUs(null)).toBeNull();
    expect(pg().parseTimestampUs(undefined)).toBeNull();
  });
});

describe('mobile numbers (utils.mobile_key)', () => {
  it.each<[string | null, string, string]>([
    ['+91 90000-00001', '919000000001', '9000000001'],
    ['09000000002', '09000000002', '9000000002'],
    ['9000000003', '9000000003', '9000000003'],
    ['9100000004', '9100000004', '9100000004'],       // ten digits starting 91: nothing dropped
    ['(079) 2000 0005', '07920000005', '7920000005'],
    ['', '', ''],
    [null, '', ''],
  ])('%j', (mobile, digits, key) => {
    expect(pg().mobileDigits(mobile)).toBe(digits);
    expect(pg().mobileKey(mobile)).toBe(key);
  });
});

describe('enCompare: the server\'s en_US order', () => {
  const sorted = (words: string[]) => [...words].sort(pg().enCompare);
  it('orders by letters whatever their case, digits first', () => {
    expect(sorted(['Bhavin', 'asha', '5', 'Chirag'])).toEqual(['5', 'asha', 'Bhavin', 'Chirag']);
  });
  it('ignores punctuation and spaces', () => {
    expect(sorted(['a-c', 'ab', 'a d'])).toEqual(['ab', 'a-c', 'a d']);
  });
  it('orders names that differ only in punctuation the same way every time', () => {
    expect(sorted(['ab', 'a-b'])).toEqual(['a-b', 'ab']);
    expect(sorted(['a-b', 'ab'])).toEqual(['a-b', 'ab']);
    expect(pg().enCompare('ab', 'ab')).toBe(0);
  });
});
