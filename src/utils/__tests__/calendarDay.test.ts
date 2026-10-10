/**
 * A calendar day goes to the server as 'YYYY-MM-DD' from the phone's own
 * calendar, never as an instant: toISOString() of a local midnight in India is
 * 18:30 UTC of the day before, and the server reads the day out of the text.
 */
import { toCalendarDay, startOfDayIST, endOfDayIST, toLocalISODate } from '../formatters';
import { createEmptyDispatchHeader } from '@/types/dispatch.types';

describe('toCalendarDay', () => {
  it('keeps a plain day as it is', () => {
    expect(toCalendarDay('2026-10-11')).toBe('2026-10-11');
  });

  it('reads the local day of a Date', () => {
    expect(toCalendarDay(new Date(2026, 9, 11))).toBe('2026-10-11');
    expect(toCalendarDay(new Date(2026, 9, 11, 23, 59, 59))).toBe('2026-10-11');
  });

  it('reads the local day of the instant a date picker gives (local midnight)', () => {
    const picked = new Date(2026, 9, 11).toISOString();
    expect(toCalendarDay(picked)).toBe('2026-10-11');
  });

  it('reads the local day of a timestamp the server sent back', () => {
    const stored = new Date(2026, 9, 11, 5, 30).toISOString();
    expect(toCalendarDay(stored)).toBe('2026-10-11');
  });

  it('leaves text that is not a date for the server to refuse', () => {
    expect(toCalendarDay('not a date')).toBe('not a date');
    expect(toCalendarDay('')).toBe('');
  });
});

describe('a day as a range the server reads as moments', () => {
  it('names the start and the end of the day in India', () => {
    expect(startOfDayIST('2026-10-11')).toBe('2026-10-11T00:00:00+05:30');
    expect(endOfDayIST('2026-10-11')).toBe('2026-10-11T23:59:59.999+05:30');
  });

  it('covers a document stored on that day at UTC midnight and one stored at Indian midnight', () => {
    const from = Date.parse(startOfDayIST('2026-10-11'));
    const to = Date.parse(endOfDayIST('2026-10-11'));
    for (const stored of ['2026-10-11T00:00:00Z', '2026-10-10T18:30:00Z']) {
      expect(Date.parse(stored)).toBeGreaterThanOrEqual(from);
      expect(Date.parse(stored)).toBeLessThanOrEqual(to);
    }
    for (const other of ['2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z', '2026-10-11T18:30:00Z']) {
      expect(Date.parse(other) >= from && Date.parse(other) <= to).toBe(false);
    }
  });
});

describe('a new dispatch', () => {
  it('is dated with today as a plain day, like a date chosen in the picker', () => {
    expect(createEmptyDispatchHeader().disp_date).toBe(toLocalISODate(new Date()));
  });
});

describe('dispatch date against the GRN date', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateDispatchDateVsGRNDates } = require('@/features/dispatch/schemas/dispatchValidation');
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts a dispatch on the day of the GRN, however the GRN day was stored', () => {
    const sameDayLater = new Date(2026, 9, 11, 16, 0).toISOString();
    for (const grnDate of ['2026-10-11', '2026-10-11T00:00:00+00:00', new Date(2026, 9, 11).toISOString(), sameDayLater]) {
      expect(validateDispatchDateVsGRNDates('2026-10-11', [{ grns_date: grnDate, grns_gr_no: 'A0010' }]).isValid).toBe(true);
    }
  });

  it('refuses a dispatch dated before the GRN', () => {
    expect(validateDispatchDateVsGRNDates('2026-10-10', [{ grns_date: '2026-10-11', grns_gr_no: 'A0010' }]).isValid).toBe(false);
  });
});
