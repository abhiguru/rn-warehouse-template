/**
 * ReportCustomerScope - decides whose data a report screen shows.
 *
 * - admin, supervisor, staff: the all-customers list (the report's own list view)
 * - a customer account with one customer: that customer
 * - a customer account with several customers: a picker first (ReportCustomerPicker),
 *   then that customer.
 * - a route that names a customer (`?customerId=`) is left to the report screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useRoleBasedAccess, type AssignedCustomerRef } from '@/hooks/useRoleBasedAccess';
import { t as tr } from '@/i18n';
import { ReportCustomerPicker } from './ReportCustomerPicker';

export interface ReportScope {
  /** admin, supervisor or staff: the subtitle says "All customers" */
  isWarehouseUser: boolean;
  /** Load the all-customers list first */
  shouldShowListView: boolean;
  /** The one customer this view is for (the account's only customer, or the one picked) */
  singleAssignedCustomerId: string | null;
  /** Name of the picked customer, for the header */
  customerName?: string;
  /** Back to the picker; set only for an account that picked one of several customers */
  onChangeCustomer?: () => void;
}

export interface ReportCustomerScopeProps {
  /** The report's title, shown above the picker */
  title: string;
  children: (scope: ReportScope) => React.ReactElement;
}

export const ReportCustomerScope: React.FC<ReportCustomerScopeProps> = ({ title, children }) => {
  const { isWarehouseUser, reportScope, singleAssignedCustomerId } = useRoleBasedAccess();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const [picked, setPicked] = useState<AssignedCustomerRef | null>(null);

  const mustChoose = reportScope === 'choose-customer' && !params?.customerId;
  const clearPicked = useCallback(() => setPicked(null), []);
  // A customer the server returned without a name is still headed "Customer".
  const pick = useCallback(
    (customer: AssignedCustomerRef) => setPicked({ id: customer.id, name: customer.name || tr('reports.shared.unnamedCustomer') }),
    []
  );

  // The device's back button returns to the picker, like the header's back button.
  useEffect(() => {
    if (!mustChoose || !picked) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked(null);
      return true;
    });
    return () => subscription.remove();
  }, [mustChoose, picked]);

  if (!mustChoose) {
    return children({
      isWarehouseUser,
      shouldShowListView: reportScope === 'all-customers',
      singleAssignedCustomerId,
    });
  }

  if (picked) {
    return (
      <React.Fragment key={picked.id}>
        {children({
          isWarehouseUser: false,
          shouldShowListView: false,
          singleAssignedCustomerId: picked.id,
          customerName: picked.name,
          onChangeCustomer: clearPicked,
        })}
      </React.Fragment>
    );
  }

  return <ReportCustomerPicker title={title} onPick={pick} />;
};

export default ReportCustomerScope;
