/**
 * What this account last chose on the report screens, for the facility it is
 * signed in to (src/store/slices/reportPrefsSlice.ts).
 */
import { useCallback, useMemo } from 'react';
import { getActiveOperatorServer } from '@/config/operatorServer';
import type { DateRangeValue, SortState } from '@/features/filters/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  noteReportOpened,
  selectReportPrefs,
  setReportCustomer,
  setReportPeriod,
  setReportSort,
  toggleReportPin,
  type ReportCustomerRef,
} from '@/store/slices/reportPrefsSlice';

/**
 * The scope the choices are kept under: the facility, its instance and the
 * account, the same three that scope the session's caches. Null when there is
 * no facility or no account: nothing is read and nothing is remembered.
 */
export function reportPrefsScope(accountId: string | null | undefined): string | null {
  const server = getActiveOperatorServer();
  return server && accountId ? JSON.stringify([server.origin, server.instanceId, accountId]) : null;
}

export function useReportPrefs() {
  const dispatch = useAppDispatch();
  const accountId = useAppSelector(state => state.auth.userProfile?.id);
  const scope = reportPrefsScope(accountId);
  const prefs = useAppSelector(state => selectReportPrefs(state, scope));

  const setPeriod = useCallback(
    (period: DateRangeValue) => {
      if (scope) dispatch(setReportPeriod({ scope, period }));
    },
    [dispatch, scope]
  );
  const setSort = useCallback(
    (listKey: string, sort: SortState) => {
      if (scope) dispatch(setReportSort({ scope, listKey, sort }));
    },
    [dispatch, scope]
  );
  const togglePin = useCallback(
    (reportId: string) => {
      if (scope) dispatch(toggleReportPin({ scope, reportId }));
    },
    [dispatch, scope]
  );
  const noteOpened = useCallback(
    (reportId: string) => {
      if (scope) dispatch(noteReportOpened({ scope, reportId }));
    },
    [dispatch, scope]
  );
  const setCustomer = useCallback(
    (reportId: string, customer?: ReportCustomerRef) => {
      if (scope) dispatch(setReportCustomer({ scope, reportId, customer }));
    },
    [dispatch, scope]
  );

  return useMemo(
    () => ({ scope, prefs, setPeriod, setSort, togglePin, noteOpened, setCustomer }),
    [scope, prefs, setPeriod, setSort, togglePin, noteOpened, setCustomer]
  );
}
