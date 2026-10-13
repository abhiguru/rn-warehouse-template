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
 *
 * The id in a route decides whose data is shown. A name in a route decides
 * nothing and is never shown: a link can pair any name with an id. The name a
 * report shows is the facility's own (./customerNames.ts): the row that was
 * tapped, the customer picker's list, the account's assigned customers when
 * the profile names them, or else one lookup by id. Until that lookup answers,
 * and when it answers nothing, the name is empty.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useAppDispatch } from '@/store/hooks';
import { clearListFilterScope } from '@/store/slices/listFilterSlice';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { lookUpCustomerName, subscribeCustomerNames, trustCustomerName, trustedCustomerName } from './customerNames';
import { reportCustomerListKey } from './reportCustomerListKeys';
import { useReportPrefs } from './useReportPrefs';

export type ReportLevel =
  | { kind: 'customers' }
  /** `customerName` is the facility's name for the customer, or '' while the app holds none. */
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

/**
 * Before a customer's report is opened: forget the search typed there for that customer on
 * an earlier visit, so the report opens on all of the customer's records (review 2026-10-13,
 * SR-06). With `choices`, the report's other choices (invoicing, payment, age bucket) go too:
 * for a link that promises everything ("View all"). Without, they stay, as they do for every
 * customer of the report. Another customer's search, the sort and the period are untouched;
 * a report still on the stack underneath keeps its own customer's search.
 */
export function clearDestinationFilters(
  dispatch: (action: ReturnType<typeof clearListFilterScope>) => unknown,
  reportId: string,
  customerId: string,
  { choices = false }: { choices?: boolean } = {}
): void {
  const key = reportCustomerListKey(reportId);
  if (!key || !customerId) return;
  dispatch(clearListFilterScope({ key, scope: customerId, choices }));
}

/** A second push within this long of the first is a double tap, and is ignored. */
export const PUSH_GUARD_MS = 600;

/** Whose data, by ids alone. */
type Shown = { kind: 'customers' } | { kind: 'customer'; customerId: string } | { kind: 'choose' } | { kind: 'none' };

/**
 * The facility's name for the customer shown: the one kept in this run, else
 * the one the account's profile carries. With neither, the facility is asked
 * once and '' is returned until it has answered.
 */
function useCustomerName(customerId: string, profileName: string): string {
  const kept = useSyncExternalStore(subscribeCustomerNames, () => trustedCustomerName(customerId));
  const name = kept || profileName;
  useEffect(() => {
    if (customerId && !name) lookUpCustomerName(customerId);
  }, [customerId, name]);
  return name;
}

export function useReportScope(reportId: string): ReportScope {
  const router = useRouter();
  // The route may carry a `customerName` too. It is not read: see the top of this file.
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { isWarehouseUser, reportScope, assignedCustomerIds, assignedCustomers, singleAssignedCustomerId } = useRoleBasedAccess();
  const { prefs, setCustomer, noteOpened } = useReportPrefs();
  const dispatch = useAppDispatch();

  // The hub lists the reports opened last.
  useEffect(() => {
    noteOpened(reportId);
  }, [noteOpened, reportId]);

  const routeCustomerId = param(params?.customerId);
  const remembered = prefs.lastCustomer[reportId];
  // What a customer account with several customers chose on this visit: undefined until it
  // chooses (the remembered one applies), null once it asked for the picker again.
  const [chosen, setChosen] = useState<ReportCustomerRef | null | undefined>(undefined);

  const shown = useMemo<Shown>(() => {
    if (routeCustomerId) {
      return isWarehouseUser || assignedCustomerIds.includes(routeCustomerId)
        ? { kind: 'customer', customerId: routeCustomerId }
        : { kind: 'none' };
    }
    switch (reportScope) {
      case 'all-customers':
        return { kind: 'customers' };
      case 'one-customer':
        return singleAssignedCustomerId ? { kind: 'customer', customerId: singleAssignedCustomerId } : { kind: 'none' };
      case 'choose-customer': {
        // The remembered customer is taken by its id. Its name was kept on the phone, not given by the facility in this run.
        const current = chosen === undefined ? remembered : chosen;
        // A customer that was taken from the account since it was remembered is not offered.
        return current && assignedCustomerIds.includes(current.id) ? { kind: 'customer', customerId: current.id } : { kind: 'choose' };
      }
      default:
        return { kind: 'none' };
    }
  }, [routeCustomerId, isWarehouseUser, assignedCustomerIds, reportScope, singleAssignedCustomerId, chosen, remembered]);

  const customerId = shown.kind === 'customer' ? shown.customerId : '';
  const profileName = useMemo(
    () => (customerId && assignedCustomers.find(customer => customer.id === customerId)?.name) || '',
    [assignedCustomers, customerId]
  );
  const customerName = useCustomerName(customerId, profileName);
  const level = useMemo<ReportLevel>(
    () => (shown.kind === 'customer' ? { kind: 'customer', customerId: shown.customerId, customerName } : shown),
    [shown, customerName]
  );

  // "Last opened" names this customer from what the phone kept. Once the facility's name is
  // known, that is the one kept: a name stored by an earlier version may have come from a link.
  useEffect(() => {
    if (remembered && remembered.id === customerId && customerName && remembered.name !== customerName) {
      setCustomer(reportId, { id: customerId, name: customerName });
    }
  }, [remembered, customerId, customerName, reportId, setCustomer]);

  // A double tap on a row would push the customer twice, and back would then show it again.
  const lastPushAt = useRef(0);
  // Read at the tap, so a row's handler stays the same function when the remembered customer changes.
  const rememberedAtTap = useRef(remembered);
  rememberedAtTap.current = remembered;
  const openCustomer = useCallback(
    (customer: ReportCustomerRef) => {
      const now = Date.now();
      if (now - lastPushAt.current < PUSH_GUARD_MS) return;
      lastPushAt.current = now;
      // A row of the customers list carries the facility's own name, so the report it opens shows
      // the name at once. The "Last opened" row hands back what the phone kept (the remembered
      // customer itself): that is neither taken as the facility's name nor stored again, and the
      // report it opens asks for the name.
      if (customer !== rememberedAtTap.current) {
        trustCustomerName(customer.id, customer.name);
        setCustomer(reportId, customer);
      }
      // The customer's report opens on all its records: a search typed there on an earlier visit
      // is forgotten. Its other choices stay, as they do for every customer of this report.
      clearDestinationFilters(dispatch, reportId, customer.id, { choices: false });
      // The name still travels in the route, as it always has; the report that opens does not read it.
      router.push({ pathname: `/reports/${reportId}`, params: { customerId: customer.id, customerName: customer.name } } as never);
    },
    [router, reportId, setCustomer, dispatch]
  );
  const chooseCustomer = useCallback(
    (customer: ReportCustomerRef) => {
      setChosen(customer);
      // The picker lists the account's customers under the names the facility gave.
      trustCustomerName(customer.id, customer.name);
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
