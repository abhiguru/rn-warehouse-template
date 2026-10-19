import {
  formatCount,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatIndiaDate,
  formatIndiaSectionDate,
  formatMonth,
  formatMobile,
  formatRelativeTime,
  formatSectionDate,
  formatTemperature,
  formatTime,
  formatWeight,
  formatWeightEach,
  indiaDay,
} from '../formatters';
import { setLanguage } from '@/i18n/language';
import { avatarColors, avatarIndex, avatarInitials } from '../avatar';
import { AA, BRANDS, contrastRatio, getTokens } from '@/theme/tokens';
import { watchPhoneZone } from '@/tests/helpers/phoneZone';

// The year a short date leaves out is India's.
const thisYear = Number(indiaDay(new Date()).slice(0, 4));

/**
 * Runs `run` while every local reader of a Date throws. The suite runs in Asia/Kolkata and the
 * zone cannot be changed under a running test, so the proof that an answer is the same in every
 * zone is that it was reached without one of these: another zone could not have changed it.
 */
function withoutPhoneZone(run: () => void): void {
  const local = ['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getTimezoneOffset', 'toDateString'] as const;
  const spies = local.map(name =>
    jest.spyOn(Date.prototype, name).mockImplementation(() => {
      throw new Error(`the phone's zone was read with ${name}`);
    })
  );
  try {
    run();
  } finally {
    spies.forEach(spy => spy.mockRestore());
  }
}

describe('style guide §12.3 formats', () => {
  it('formats dates with fixed month names', () => {
    expect(formatDate('2026-09-22')).toBe('22 Sep 2026');
    expect(formatDate('2026-10-09', 'long')).toBe('9 October 2026');
    expect(formatDate(`${thisYear}-10-06`, 'short')).toBe('6 Oct');
    expect(formatDate('2019-10-06', 'short')).toBe('6 Oct 2019');
    expect(formatDate(null)).toBe('—');
    expect(formatMonth('2026-10-09')).toBe('October 2026');
    expect(formatMonth('2026-10-09', 'short')).toBe('Oct 2026');
    expect(formatMonth('2026-10-09', 'narrow')).toBe('Oct');
    expect(formatDate('not a date')).toBe('—');
  });

  it('formats times and date-times in 12-hour form', () => {
    const d = new Date(2026, 9, 9, 16, 5);
    expect(formatTime(d)).toBe('4:05 pm');
    expect(formatTime(new Date(2026, 9, 9, 0, 30))).toBe('12:30 am');
    expect(formatDateTime(d)).toBe('9 Oct 2026, 4:05 pm');
  });

  it('formats section headers', () => {
    const today = new Date();
    expect(formatSectionDate(today.toISOString())).toBe('Today');
    expect(formatSectionDate('2019-10-08')).toBe('Tue, 8 Oct 2019');
  });

  it('formats relative times under a day, then the date', () => {
    const fiveMin = new Date(Date.now() - 5 * 60000).toISOString();
    const threeH = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeTime(fiveMin)).toBe('5 min ago');
    expect(formatRelativeTime(threeH)).toBe('3 h ago');
    // By default the date is the phone's own: 10 am on the 8th by its clock, whatever its zone.
    expect(formatRelativeTime(new Date(2019, 9, 8, 10, 0).toISOString())).toBe('8 Oct 2019');
  });

  it('formats mobiles, counts, weights and temperatures', () => {
    expect(formatMobile('9876543210')).toBe('+91 98765 43210');
    expect(formatMobile('+91 98765-43210')).toBe('+91 98765 43210');
    expect(formatMobile('12345')).toBe('12345');
    expect(formatCount(1, 'item')).toBe('1 item');
    expect(formatCount(1200, 'bag')).toBe('1,200 bags');
    expect(formatCount(2, 'dispatch', 'dispatches')).toBe('2 dispatches');
    expect(formatWeight(1250.5)).toBe('1,250.5 kg');
    expect(formatWeight(40)).toBe('40 kg');
    expect(formatTemperature(-18.5)).toBe('−18.5°C');
    expect(formatTemperature(4)).toBe('4.0°C');
    expect(formatTemperature(-0.01)).toBe('0.0°C');
  });

  it('words the weight of one package "each", and shows nothing when there is no weight', () => {
    expect(formatWeightEach(50)).toBe('50 kg each');
    expect(formatWeightEach(1250.5)).toBe('1,250.5 kg each');
    // Grouping, decimals and the unit are formatWeight's.
    expect(formatWeightEach(12.345)).toBe(`${formatWeight(12.345)} each`);
    expect(formatWeightEach(12.345, 0)).toBe('12 kg each');
    for (const none of [0, null, undefined, NaN, -5]) {
      expect(formatWeightEach(none)).toBeNull();
    }
  });

  // Review 2026-10-14, finding 4: the zero check ran before the rounding, so 0.004 was
  // written "0 kg each", and a number that is not finite "∞ kg each".
  it.each<[number, number | undefined]>([
    [0.004, undefined],
    [0.4, 0],
    [Infinity, undefined],
    [-0.004, undefined],
    [-Infinity, undefined],
  ])('%p (decimals: %p) would be written as 0 or is not a finite number: it is no weight', (weight, decimals) => {
    expect(formatWeightEach(weight, decimals)).toBeNull();
  });

  it('the smallest weights that are written, and an ordinary one, are still worded "each"', () => {
    expect(formatWeightEach(0.5)).toBe('0.5 kg each');
    expect(formatWeightEach(0.01)).toBe('0.01 kg each');
    expect(formatWeightEach(0.6, 0)).toBe('1 kg each');
    expect(formatWeightEach(50)).toBe('50 kg each');
  });

  // Some server answers carry a number as text, and several callers hand the helper what
  // they were sent. The check for a finite number must not drop a weight that was shown before.
  it('a weight that arrives as text is read as its number, as before', () => {
    expect(formatWeightEach('50' as unknown as number)).toBe('50 kg each');
    expect(formatWeightEach('12.5' as unknown as number)).toBe('12.5 kg each');
    for (const none of ['', '0', 'heavy']) {
      expect(formatWeightEach(none as unknown as number)).toBeNull();
    }
  });
});

describe('avatars', () => {
  it('takes initials from the first two words', () => {
    expect(avatarInitials('Sunrise Agro Foods')).toBe('SA');
    expect(avatarInitials('  dev ')).toBe('D');
    expect(avatarInitials('')).toBe('?');
  });

  it('picks a stable colour that keeps initials readable in every theme', () => {
    expect(avatarIndex('abc', 9)).toBe(avatarIndex('abc', 9));
    for (const brand of BRANDS) {
      for (const mode of ['light', 'dark'] as const) {
        const t = getTokens(brand, mode);
        for (let i = 0; i < 40; i++) {
          const { background, text } = avatarColors(`customer-${i}`, t);
          expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(AA.text);
        }
      }
    }
  });
});

describe('indiaDay, the calendar day in India', () => {
  it('moves an instant to India time (+05:30) before it takes the day', () => {
    // 23:59:59 on 30 Sep in India is 18:29:59 UTC; half a minute later it is 1 Oct.
    expect(indiaDay('2026-09-30T18:29:59Z')).toBe('2026-09-30');
    expect(indiaDay('2026-09-30T18:30:00Z')).toBe('2026-10-01');
    expect(indiaDay('2026-09-30T20:00:00+00:00')).toBe('2026-10-01');
    expect(indiaDay('2026-10-11T20:00:00+00:00')).toBe('2026-10-12');
    expect(indiaDay('2026-12-31T20:00:00.000Z')).toBe('2027-01-01');
    expect(indiaDay('2026-10-12T00:00:00Z')).toBe('2026-10-12');
  });

  it('takes the day of a time written with India\'s own offset, or any other offset, as it falls in India', () => {
    expect(indiaDay('2026-10-01T01:30:00+05:30')).toBe('2026-10-01');
    expect(indiaDay('2026-10-01T00:00:00+05:30')).toBe('2026-10-01');
    expect(indiaDay('2026-09-30T23:59:59+05:30')).toBe('2026-09-30');
    // 9 pm on 30 Sep in New York (-04:00) is 06:30 on 1 Oct in India.
    expect(indiaDay('2026-09-30T21:00:00-04:00')).toBe('2026-10-01');
  });

  it('returns a plain day as it is, with no zone applied', () => {
    expect(indiaDay('2026-10-12')).toBe('2026-10-12');
    expect(indiaDay('2026-01-01')).toBe('2026-01-01');
  });

  it('takes a Date as the instant it is', () => {
    expect(indiaDay(new Date(Date.UTC(2026, 8, 30, 18, 30)))).toBe('2026-10-01');
    expect(indiaDay(new Date(Date.UTC(2026, 8, 30, 18, 29, 59)))).toBe('2026-09-30');
  });

  it('is empty for nothing and for what cannot be read', () => {
    expect(indiaDay('')).toBe('');
    expect(indiaDay(null)).toBe('');
    expect(indiaDay(undefined)).toBe('');
    expect(indiaDay('garbage')).toBe('');
    expect(indiaDay(new Date(Number.NaN))).toBe('');
  });

  it('does not depend on the zone of the phone: it reads no local year, month, day or hour', () => {
    // The suite runs in Asia/Kolkata and the zone cannot be changed under a running test, so the proof
    // is that no local getter is used: another zone could not change the answer.
    const local = ['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getTimezoneOffset'] as const;
    const spies = local.map(name =>
      jest.spyOn(Date.prototype, name).mockImplementation(() => {
        throw new Error(`indiaDay read the phone's zone with ${name}`);
      })
    );
    try {
      expect(indiaDay('2026-09-30T18:29:59Z')).toBe('2026-09-30');
      expect(indiaDay('2026-09-30T18:30:00Z')).toBe('2026-10-01');
      expect(indiaDay('2026-10-11T20:00:00+00:00')).toBe('2026-10-12');
      expect(indiaDay('2026-10-01T01:30:00+05:30')).toBe('2026-10-01');
      expect(indiaDay(new Date(Date.UTC(2026, 8, 30, 18, 30)))).toBe('2026-10-01');
      expect(indiaDay('2026-10-12')).toBe('2026-10-12');
    } finally {
      spies.forEach(spy => spy.mockRestore());
    }
  });
});

// Two moments a minute to either side of midnight in India (18:30 UTC), which is the middle of the
// afternoon in New York and the morning of the next day in Kiritimati. Neither is on a quarter of an
// hour, so neither is midnight in any zone.
const BEFORE_MIDNIGHT = new Date('2026-10-11T18:29:07Z'); // Sunday 11 October, 23:59 in India
const AFTER_MIDNIGHT = new Date('2026-10-11T18:31:07Z'); // Monday 12 October, 00:01 in India
const BEFORE_NEW_YEAR = new Date('2026-12-31T18:29:07Z'); // Thursday 31 December 2026, 23:59 in India
const AFTER_NEW_YEAR = new Date('2026-12-31T18:31:07Z'); // Friday 1 January 2027, 00:01 in India

describe('formatIndiaDate, a date of a report', () => {
  it('writes an instant as the day it fell on in India', () => {
    expect(formatIndiaDate('2026-09-30T18:29:59Z')).toBe('30 Sep 2026');
    expect(formatIndiaDate('2026-09-30T18:30:00Z')).toBe('1 Oct 2026');
    expect(formatIndiaDate('2026-09-30T20:00:00+00:00', 'long')).toBe('1 October 2026');
    expect(formatIndiaDate('2026-10-01T01:30:00+05:30')).toBe('1 Oct 2026');
    expect(formatIndiaDate(new Date(Date.UTC(2026, 8, 30, 18, 30)))).toBe('1 Oct 2026');
  });

  it('writes a plain day as it is', () => {
    expect(formatIndiaDate('2026-10-12')).toBe('12 Oct 2026');
    expect(formatIndiaDate('2026-01-01', 'long')).toBe('1 January 2026');
  });

  it('leaves the year out of a short date when it is the year in India', () => {
    expect(formatIndiaDate('2026-10-11T20:00:00+00:00', 'short', AFTER_MIDNIGHT)).toBe('12 Oct');
    expect(formatIndiaDate('2019-10-08', 'short', AFTER_MIDNIGHT)).toBe('8 Oct 2019');
    // 20:00 UTC on 31 December is 1 January in India. A minute before midnight there it is next year's day.
    expect(formatIndiaDate('2026-12-31T20:00:00Z', 'short', BEFORE_NEW_YEAR)).toBe('1 Jan 2027');
    expect(formatIndiaDate('2026-12-31', 'short', BEFORE_NEW_YEAR)).toBe('31 Dec');
    expect(formatIndiaDate('2026-12-31T20:00:00Z', 'short', AFTER_NEW_YEAR)).toBe('1 Jan');
    expect(formatIndiaDate('2026-12-31', 'short', AFTER_NEW_YEAR)).toBe('31 Dec 2026');
  });

  it('is a dash for nothing and for what cannot be read', () => {
    expect(formatIndiaDate(null)).toBe('—');
    expect(formatIndiaDate(undefined)).toBe('—');
    expect(formatIndiaDate('')).toBe('—');
    expect(formatIndiaDate('garbage')).toBe('—');
  });

  it('does not depend on the zone of the phone', () => {
    withoutPhoneZone(() => {
      expect(formatIndiaDate('2026-09-30T18:29:59Z')).toBe('30 Sep 2026');
      expect(formatIndiaDate('2026-09-30T18:30:00Z')).toBe('1 Oct 2026');
      expect(formatIndiaDate('2026-10-12', 'long')).toBe('12 October 2026');
      expect(formatIndiaDate('2026-12-31T20:00:00Z', 'short', BEFORE_NEW_YEAR)).toBe('1 Jan 2027');
      expect(formatIndiaDate('2026-12-31T20:00:00Z', 'short', AFTER_NEW_YEAR)).toBe('1 Jan');
      // The current year, read from the clock.
      expect(formatIndiaDate('2019-10-08T20:00:00Z', 'short')).toBe('9 Oct 2019');
    });
  });
});

describe('formatIndiaSectionDate, the heading over a day of a report', () => {
  it('calls the day it is in India today, and the day before it yesterday', () => {
    expect(formatIndiaSectionDate('2026-10-12', AFTER_MIDNIGHT)).toBe('Today');
    expect(formatIndiaSectionDate('2026-10-11', AFTER_MIDNIGHT)).toBe('Yesterday');
    expect(formatIndiaSectionDate('2026-10-10', AFTER_MIDNIGHT)).toBe('Sat, 10 Oct');
    // Two minutes earlier it is still the 11th in India.
    expect(formatIndiaSectionDate('2026-10-11', BEFORE_MIDNIGHT)).toBe('Today');
    expect(formatIndiaSectionDate('2026-10-10', BEFORE_MIDNIGHT)).toBe('Yesterday');
    // A day that has not begun in India is not today.
    expect(formatIndiaSectionDate('2026-10-12', BEFORE_MIDNIGHT)).toBe('Mon, 12 Oct');
    expect(formatIndiaSectionDate('2026-10-13', AFTER_MIDNIGHT)).toBe('Tue, 13 Oct');
  });

  it('reads an instant as the day it fell on in India', () => {
    expect(formatIndiaSectionDate('2026-10-11T18:30:00Z', AFTER_MIDNIGHT)).toBe('Today');
    expect(formatIndiaSectionDate('2026-10-11T18:29:59Z', AFTER_MIDNIGHT)).toBe('Yesterday');
    expect(formatIndiaSectionDate('2026-10-09T20:00:00+00:00', AFTER_MIDNIGHT)).toBe('Sat, 10 Oct');
  });

  it('names the weekday of the day, and the year when it is not the year in India', () => {
    expect(formatIndiaSectionDate('2019-10-08', AFTER_MIDNIGHT)).toBe('Tue, 8 Oct 2019');
    expect(formatIndiaSectionDate('2026-12-29', BEFORE_NEW_YEAR)).toBe('Tue, 29 Dec');
    expect(formatIndiaSectionDate('2026-12-30', BEFORE_NEW_YEAR)).toBe('Yesterday');
    expect(formatIndiaSectionDate('2026-12-30', AFTER_NEW_YEAR)).toBe('Wed, 30 Dec 2026');
    expect(formatIndiaSectionDate('2026-12-31', AFTER_NEW_YEAR)).toBe('Yesterday');
    expect(formatIndiaSectionDate('2027-01-01', AFTER_NEW_YEAR)).toBe('Today');
  });

  it('is a dash for nothing and for what cannot be read', () => {
    expect(formatIndiaSectionDate('', AFTER_MIDNIGHT)).toBe('—');
    expect(formatIndiaSectionDate(null, AFTER_MIDNIGHT)).toBe('—');
    expect(formatIndiaSectionDate('garbage', AFTER_MIDNIGHT)).toBe('—');
  });

  it('does not depend on the zone of the phone, for the day or for today', () => {
    withoutPhoneZone(() => {
      expect(formatIndiaSectionDate('2026-10-12', AFTER_MIDNIGHT)).toBe('Today');
      expect(formatIndiaSectionDate('2026-10-11', AFTER_MIDNIGHT)).toBe('Yesterday');
      expect(formatIndiaSectionDate('2026-10-11', BEFORE_MIDNIGHT)).toBe('Today');
      expect(formatIndiaSectionDate('2026-10-11T18:30:00Z', AFTER_MIDNIGHT)).toBe('Today');
      expect(formatIndiaSectionDate('2026-10-11T18:29:59Z', AFTER_MIDNIGHT)).toBe('Yesterday');
      expect(formatIndiaSectionDate('2026-10-10', AFTER_MIDNIGHT)).toBe('Sat, 10 Oct');
      expect(formatIndiaSectionDate('2026-12-30', AFTER_NEW_YEAR)).toBe('Wed, 30 Dec 2026');
      // Today, read from the clock.
      expect(formatIndiaSectionDate('2019-10-08')).toBe('Tue, 8 Oct 2019');
    });
  });
});

describe('the year a short date leaves out', () => {
  afterEach(() => jest.useRealTimers());

  it('is the year in India: it turns over at midnight there, and the clock is not read in the phone\'s zone', () => {
    jest.useFakeTimers({ now: BEFORE_NEW_YEAR });
    const watch = watchPhoneZone([BEFORE_NEW_YEAR, AFTER_NEW_YEAR]);
    try {
      expect(formatDate('2026-12-31', 'short')).toBe('31 Dec');
      expect(formatDate('2027-01-01', 'short')).toBe('1 Jan 2027');
      jest.setSystemTime(AFTER_NEW_YEAR);
      expect(formatDate('2026-12-31', 'short')).toBe('31 Dec 2026');
      expect(formatDate('2027-01-01', 'short')).toBe('1 Jan');
      // The year is always written in the other forms.
      expect(formatDate('2027-01-01')).toBe('1 Jan 2027');
      expect(watch.reads).toEqual([]);
    } finally {
      watch.restore();
    }
  });
});

describe('formatRelativeTime, a day or more ago', () => {
  it('is written as the caller asks: a report asks for the day in India', () => {
    const indiaShort = (time: Date) => formatIndiaDate(time, 'short');
    // 20:00 UTC on the 8th is the 9th in India.
    expect(formatRelativeTime('2019-10-08T20:00:00Z', indiaShort)).toBe('9 Oct 2019');
    withoutPhoneZone(() => expect(formatRelativeTime('2019-10-08T20:00:00Z', indiaShort)).toBe('9 Oct 2019'));
  });

  it('is still how long ago under a day', () => {
    const threeHours = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeTime(threeHours, time => formatIndiaDate(time, 'short'))).toBe('3 h ago');
  });
});

describe('formatDateShort, the DD/MM/YY of the dispatch tables', () => {
  afterEach(() => setLanguage('en'));

  it('writes two digits for the day, the month and the year', () => {
    expect(formatDateShort('2026-06-01')).toBe('01/06/26');
    expect(formatDateShort('2026-10-19')).toBe('19/10/26');
    expect(formatDateShort('2030-12-31')).toBe('31/12/30');
    expect(formatDateShort('2100-01-05')).toBe('05/01/00');
  });

  it('reads a date or a stored timestamp, and never moves the day', () => {
    expect(formatDateShort(new Date(2026, 2, 9))).toBe('09/03/26');
    expect(formatDateShort('2026-03-09T00:00:00')).toBe('09/03/26');
  });

  it('is a dash for a missing or invalid date', () => {
    expect(formatDateShort(null)).toBe('—');
    expect(formatDateShort(undefined)).toBe('—');
    expect(formatDateShort('')).toBe('—');
    expect(formatDateShort('not a date')).toBe('—');
  });

  it('uses the digits of the language: Gujarati digits in Gujarati', () => {
    setLanguage('gu');
    expect(formatDateShort('2026-06-01')).toBe('૦૧/૦૬/૨૬');
  });
});
