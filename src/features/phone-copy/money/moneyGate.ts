/**
 * Whether the kept answers are in use (WH-305, contract 4): `moneyOn()` for Customer dues and Statement (administrator or
 * supervisor), `activityMoneyOn()` for Customer activity (staff too). Both need a facility with the feature, a copy that is
 * not of an older format than `MONEY_FORMAT`; otherwise every screen is as before (contract 8).
 */
import { useSyncExternalStore } from 'react';
import { MONEY_FORMAT } from '../copySchema';
import { copyEligible } from '../readRoute';
import { getSyncSnapshot, subscribeSync } from '../syncStore';

function signedInRole(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- loaded when first asked, as readRoute does
  const { store } = require('@/store') as typeof import('@/store');
  return store.getState().auth.userProfile?.role;
}

const formatOk = (): boolean => (getSyncSnapshot().format ?? 0) >= MONEY_FORMAT;

/** Customer activity's kept answers: administrator, supervisor and staff. */
export const activityMoneyOn = (): boolean => copyEligible() && formatOk();

/** Customer dues and Statement's kept answers: administrator and supervisor only. */
export function moneyOn(): boolean {
  if (!activityMoneyOn()) return false;
  const role = signedInRole();
  return role === 'admin' || role === 'supervisor';
}

export const useMoneyOn = (): boolean => useSyncExternalStore(subscribeSync, moneyOn, moneyOn);
