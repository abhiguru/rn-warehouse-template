/**
 * Which age line a kept answer gets (WH-305, Design offline-capture.md 8.1). Pure.
 * `today` is the answer's business day, `phoneDay` the phone's (India's day, `businessDate`).
 */
export type MoneyAge = 'today' | 'earlier' | 'earlierNoStock';

export interface MoneyAgeInput {
  asOf: string;
  today: string;
  phoneDay: string;
  hasStock: boolean;
}

export function moneyAge({ today, phoneDay, hasStock }: MoneyAgeInput): MoneyAge {
  if (today === phoneDay) return 'today';
  return hasStock ? 'earlier' : 'earlierNoStock';
}
