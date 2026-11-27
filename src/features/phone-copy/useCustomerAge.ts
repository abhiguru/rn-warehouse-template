/**
 * What a customer account's screens say about how old their figures are (WH-306, contract
 * product/tech/app-offline-customer-accounts.md 7; Design offline-capture.md Part 9). A customer account has no status bar
 * line about time: the strip under the header is where it reads it, once.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { usePhoneCopyStatus } from '@/hooks/usePhoneCopyStatus';
import { useAppSelector } from '@/store/hooks';
import { customerAge, type CustomerAge } from './customerAge';
import { businessDate } from './pgCompat';
import { useCopyOffline } from './useCopyOffline';

const DAY_CHECK_MS = 60_000;
const noSubscribe = (): (() => void) => () => undefined;
const phoneDayNow = (): string => businessDate(Date.now());

export interface CustomerAgeView {
  age: CustomerAge;
  /** The copy's time (ms since 1970). */
  asOf: number;
}

/**
 * The strip's state, or null when there is no strip: not a customer account, the feature off, or the copy not usable yet
 * (the first load shows the status bar instead). Over the copy's second stage the strip waits for the connection to go,
 * as the copy is read only then (`copyRoute`).
 */
export function useCustomerAge(): CustomerAgeView | null {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const snapshot = usePhoneCopyStatus();
  const offline = useCopyOffline();
  // India's day on the phone's clock, looked at again every minute while a customer account's strip can show: one left
  // open overnight turns to "earlier". Other roles, and a customer with no copy, run no timer.
  const watching = role === 'customer' && snapshot.feature === 'on' && snapshot.asOf !== null;
  const subscribeDay = useCallback(
    (onChange: () => void): (() => void) => {
      const timer = setInterval(onChange, DAY_CHECK_MS);
      return () => clearInterval(timer);
    },
    [],
  );
  const phoneDay = useSyncExternalStore(watching ? subscribeDay : noSubscribe, phoneDayNow, phoneDayNow);
  if (role !== 'customer' || snapshot.feature !== 'on' || snapshot.asOf === null) return null;
  const readable = snapshot.phase === 'ready';
  if (!readable) return null;
  const asOf = Date.parse(snapshot.asOf);
  if (!Number.isFinite(asOf)) return null;
  return { age: customerAge({ asOf: snapshot.asOf, current: snapshot.current && !offline, phoneDay }), asOf };
}

/**
 * True when a list's own "Last updated" line stays out for a customer account: the strip carries the time, and while the
 * first load runs there is one time on screen, the bar's (DQ8).
 */
export function useHideListTime(): boolean {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const snapshot = usePhoneCopyStatus();
  const strip = useCustomerAge();
  if (role !== 'customer' || snapshot.feature !== 'on') return false;
  return strip !== null || (snapshot.running !== null && (snapshot.phase === 'empty' || snapshot.phase === 'stage1'));
}
