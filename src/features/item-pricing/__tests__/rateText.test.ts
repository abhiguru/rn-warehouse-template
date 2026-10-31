import { addDays, bandText, dateText, money, rangeText, labourText, rentRange, todayDay, unitText } from '../rateText';

describe('rateText', () => {
  it('writes money with two decimals', () => {
    expect(money(11)).toBe('₹11.00');
    expect(money(9.5)).toBe('₹9.50');
  });

  it('writes a date with its year and a range from two days', () => {
    expect(dateText('2027-01-01')).toBe('1 Jan 2027');
    expect(rangeText('2025-01-01', '2026-03-31')).toBe('1 Jan 2025 – 31 Mar 2026');
    expect(rangeText('2026-04-01', null)).toBe('1 Apr 2026');
  });

  it('writes units and bands in words', () => {
    expect(unitText('monthly')).toBe('per bag, per month');
    expect(unitText('one_time')).toBe('per bag, once');
    expect(bandText(0, 40)).toBe('0–40 kg');
  });

  it('says box or crate for a Box or Crate item, and bag for other packaging', () => {
    expect(unitText('monthly', 'Box')).toBe('per box, per month');
    expect(unitText('one_time', 'Crate')).toBe('per crate, once');
    expect(unitText('monthly', 'Tin')).toBe('per bag, per month');
    expect(labourText('₹2.00', 'Box')).toBe('₹2.00 per box, charged once at dispatch');
    expect(labourText('₹2.00')).toBe('₹2.00 per bag, charged once at dispatch');
  });

  it('adds days across month and year ends and back', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-14', 0)).toBe('2026-10-14');
  });

  it('takes today from the local calendar, not UTC', () => {
    jest.useFakeTimers();
    try {
      // 23:30 local on 14 Oct: a UTC day extraction would differ in any zone ahead of UTC.
      jest.setSystemTime(new Date(2026, 9, 14, 23, 30));
      expect(todayDay()).toBe('2026-10-14');
      jest.setSystemTime(new Date(2026, 9, 14, 0, 15));
      expect(todayDay()).toBe('2026-10-14');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('rentRange', () => {
  it('writes one amount, or the lowest and highest with an en dash', () => {
    expect(rentRange(10, 10)).toBe('₹10.00');
    expect(rentRange(6, 9.5)).toBe('₹6.00–₹9.50');
  });
});
