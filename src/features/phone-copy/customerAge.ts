/**
 * How old what a customer account sees is (WH-306, Design offline-capture.md 9.2 and 9.7, contract
 * product/tech/app-offline-customer-accounts.md 7.1). Pure: no React, no clock.
 */
import { businessDate } from './pgCompat';

export type CustomerAge = 'current' | 'today' | 'earlier';

/**
 * `current`: a full sync within the last minute with the server reachable. Else `today` when the copy's time is the
 * facility's day of `phoneDay`, and `earlier` for any other day, also when the phone's day is before the copy's (a clock
 * set back). `phoneDay` is India's `YYYY-MM-DD` of now (`businessDate(Date.now())`).
 */
export function customerAge(input: { asOf: string; current: boolean; phoneDay: string }): CustomerAge {
  if (input.current) return 'current';
  return businessDate(input.asOf) === input.phoneDay ? 'today' : 'earlier';
}
