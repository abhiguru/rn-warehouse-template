/**
 * Whether the kept answers are in use (WH-305, contract 4): `moneyOn()` for Customer dues and Statement (administrator,
 * supervisor, and a customer account for its own statements, WH-306), `activityMoneyOn()` for Customer activity (staff too).
 * Both need a facility with the feature, a copy that is not of an older format than `MONEY_FORMAT` (for a customer account,
 * also not older than `CUSTOMER_COPY_FORMAT`); otherwise every screen is as before (contract 8).
 */
import { useSyncExternalStore } from 'react';
import { copyKindOf, signedInRole } from '../copyKind';
import { CUSTOMER_COPY_FORMAT, MONEY_FORMAT } from '../copySchema';
import { copyEligible } from '../readRoute';
import { getSyncSnapshot, subscribeSync } from '../syncStore';

function formatOk(): boolean {
  const oldest = copyKindOf(signedInRole()) === 'customer' ? Math.max(MONEY_FORMAT, CUSTOMER_COPY_FORMAT) : MONEY_FORMAT;
  return (getSyncSnapshot().format ?? 0) >= oldest;
}

/** Customer activity's kept answers: every role with a copy. */
export const activityMoneyOn = (): boolean => copyEligible() && formatOk();

/** Customer dues and Statement's kept answers: administrator, supervisor and a customer account (which has no dues screen). */
export function moneyOn(): boolean {
  if (!activityMoneyOn()) return false;
  const role = signedInRole();
  return role === 'admin' || role === 'supervisor' || role === 'customer';
}

export const useMoneyOn = (): boolean => useSyncExternalStore(subscribeSync, moneyOn, moneyOn);
