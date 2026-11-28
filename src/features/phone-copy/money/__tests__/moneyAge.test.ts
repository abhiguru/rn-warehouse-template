/**
 * WH-305, contract product/tech/app-offline-dues-statement.md 5.1 and T11: which age line a kept answer gets.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract names the function and its inputs, not the file's exports) =====
 *  - `moneyAge` is a named export of `@/features/phone-copy/money/moneyAge`, taking `{ asOf, today, phoneDay, hasStock }`
 *    where `asOf` is the answer's ISO time, `today` its business day and `phoneDay` the phone's business day.
 * ==========================================================================================================
 */
import { businessDate } from '@/features/phone-copy/pgCompat';

type Age = 'today' | 'earlier' | 'earlierNoStock';
// The module is the build's (contract first); loaded at run time so the type check does not need it yet.
const moneyAge = (input: { asOf: string; today: string; phoneDay: string; hasStock: boolean }): Age =>
  (require('@/features/phone-copy/money/moneyAge') as { moneyAge: (i: typeof input) => Age }).moneyAge(input);

const MORNING = '2026-11-27T03:35:00.000Z';

describe('moneyAge (T11)', () => {
  it('the answer was computed on the phone\'s day: today', () => {
    expect(moneyAge({ asOf: MORNING, today: '2026-11-27', phoneDay: '2026-11-27', hasStock: true })).toBe('today');
  });

  it('today stays today whether or not goods are in store', () => {
    expect(moneyAge({ asOf: MORNING, today: '2026-11-27', phoneDay: '2026-11-27', hasStock: false })).toBe('today');
  });

  it('an earlier day with goods in store: earlier (the rent sentence)', () => {
    expect(moneyAge({ asOf: '2026-11-26T09:05:00.000Z', today: '2026-11-26', phoneDay: '2026-11-27', hasStock: true })).toBe('earlier');
  });

  it('an earlier day and no goods in store (empty in_store and no copy stock): earlierNoStock', () => {
    expect(moneyAge({ asOf: '2026-11-26T09:05:00.000Z', today: '2026-11-26', phoneDay: '2026-11-27', hasStock: false })).toBe('earlierNoStock');
  });

  it('the day boundary is the India business date, not the UTC date', () => {
    // 18:29 UTC on 26 Nov is 11:59 pm in India (26 Nov); 18:30 UTC is 00:00 on 27 Nov.
    const before = Date.parse('2026-11-26T18:29:00.000Z');
    const after = Date.parse('2026-11-26T18:30:00.000Z');
    expect(businessDate(before)).toBe('2026-11-26');
    expect(businessDate(after)).toBe('2026-11-27');
    const answer = { asOf: '2026-11-26T18:29:00.000Z', today: '2026-11-26', hasStock: true };
    expect(moneyAge({ ...answer, phoneDay: businessDate(before) })).toBe('today');
    expect(moneyAge({ ...answer, phoneDay: businessDate(after) })).toBe('earlier');
  });
});
