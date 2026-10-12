/**
 * Whose data a report screen shows, and at which level (docs/STYLE_GUIDE.md §14.10).
 *
 *   customers  admin, supervisor, staff: every customer, each row opening one
 *   customer   one customer: named by the route, the account's only customer,
 *              or the one a customer account with several chose
 *   choose     a customer account with several customers and none chosen yet
 *   none       no customer is linked, or the route names one this account may not see
 *
 * A warehouse role opens a customer by pushing the same route with
 * `?customerId=`, so the phone's back button, the header's back button and a
 * link from another report all work the same way, and the customers list keeps
 * its scroll position and search underneath. The server decides again on every
 * request; a customer account is checked here first so that a route naming
 * somebody else's customer asks the server nothing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { useReportPrefs } from './useReportPrefs';

export type ReportLevel =
  | { kind: 'customers' }
  | { kind: 'customer'; customerId: string; customerName: string }
  | { kind: 'choose' }
  | { kind: 'none' };

export interface ReportScope {
  level: ReportLevel;
  /** admin, supervisor or staff */
  isWarehouseUser: boolean;
  /** Open one customer from the customers list. */
  openCustomer: (customer: ReportCustomerRef) => void;
  /** The customer this account opened last in this report, for a shortcut on the customers list. */
  lastCustomer?: ReportCustomerRef;
  /** A customer account with several customers: take one of them (from the picker). */
  chooseCustomer: (customer: ReportCustomerRef) => void;
  /** Back to the picker. Set only while such an account is looking at one of its customers. */
  changeCustomer?: () => void;
}

const param = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

export function useReportScope(reportId: string): ReportScope {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const { isWarehouseUser, reportScope, assignedCustomerIds, assignedCustomers, singleAssignedCustomerId } = useRoleBasedAccess();
  const { prefs, setCustomer, noteOpened } = useReportPrefs();

  // The hub lists the reports opened last.
  useEffect(() => {
    noteOpened(reportId);
  }, [noteOpened, reportId]);

  const routeCustomerId = param(params?.customerId);
  const routeCustomerName = param(params?.customerName);
  const remembered = prefs.lastCustomer[reportId];
  // What a customer account with several customers chose on this visit: undefined until it
  // chooses (the remembered one applies), null once it asked for the picker again.
  const [chosen, setChosen] = useState<ReportCustomerRef | null | undefined>(undefined);

  const assignedName = useCallback(
    (id: string) => assignedCustomers.find(customer => customer.id === id)?.name ?? '',
    [assignedCustomers]
  );

  const level = useMemo<ReportLevel>(() => {
    if (routeCustomerId) {
      if (isWarehouseUser) return { kind: 'customer', customerId: routeCustomerId, customerName: routeCustomerName };
      // The name in a route is only text; the id is what decides.
      return assignedCustomerIds.includes(routeCustomerId)
        ? { kind: 'customer', customerId: routeCustomerId, customerName: routeCustomerName || assignedName(routeCustomerId) }
        : { kind: 'none' };
    }
    switch (reportScope) {
      case 'all-customers':
        return { kind: 'customers' };
      case 'one-customer':
        return singleAssignedCustomerId
          ? { kind: 'customer', customerId: singleAssignedCustomerId, customerName: assignedName(singleAssignedCustomerId) }
          : { kind: 'none' };
      case 'choose-customer': {
        const current = chosen === undefined ? remembered : chosen;
        // A customer that was taken from the account since it was remembered is not offered.
        return current && assignedCustomerIds.includes(current.id)
          ? { kind: 'customer', customerId: current.id, customerName: current.name || assignedName(current.id) }
          : { kind: 'choose' };
      }
      default:
        return { kind: 'none' };
    }
  }, [routeCustomerId, routeCustomerName, isWarehouseUser, assignedCustomerIds, assignedName, reportScope, singleAssignedCustomerId, chosen, remembered]);

  const openCustomer = useCallback(
    (customer: ReportCustomerRef) => {
      setCustomer(reportId, customer);
      router.push({ pathname: `/reports/${reportId}`, params: { customerId: customer.id, customerName: customer.name } } as never);
    },
    [router, reportId, setCustomer]
  );
  const chooseCustomer = useCallback(
    (customer: ReportCustomerRef) => {
      setChosen(customer);
      setCustomer(reportId, customer);
    },
    [reportId, setCustomer]
  );
  const showPicker = useCallback(() => setChosen(null), []);

  return {
    level,
    isWarehouseUser,
    openCustomer,
    lastCustomer: level.kind === 'customers' ? remembered : undefined,
    chooseCustomer,
    changeCustomer: reportScope === 'choose-customer' && !routeCustomerId && level.kind === 'customer' ? showPicker : undefined,
  };
}
