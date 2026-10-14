/**
 * ReportCustomerPicker - a customer account with several customers chooses one.
 *
 * The server refuses a customer account every all-customers RPC, so each report
 * names one assigned customer (backend docs/STAFF_GRN_POLICY.md, 11 October 2026).
 * The picker lists the account's own customers and nothing else.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLoadWithRetry } from '@/hooks/useLoadWithRetry';
import { useRoleBasedAccess, type AssignedCustomerRef } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import { CustomerChoiceRows } from '@/components/common/CustomerChoiceRows';
import { t as tr } from '@/i18n';
import { readCustomerNames } from '@/features/reports/customerNames';
import { ReportEmptyState } from './ReportEmptyState';
import { ReportHeader } from './ReportHeader';

export interface ReportCustomerPickerProps {
  /** The report's title, shown above the picker */
  title: string;
  /** The customer that was chosen. Its name is empty when the server gave none. */
  onPick: (customer: AssignedCustomerRef) => void;
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    section: { marginTop: space.lg, paddingHorizontal: layout.marginCompact },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });

export const ReportCustomerPicker: React.FC<ReportCustomerPickerProps> = ({ title, onPick }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { assignedCustomers, assignedCustomerIds } = useRoleBasedAccess();

  // Ids the profile gives no name for. Empty for a profile that carries names. The profile a
  // sign-in stores carries the assigned ids only, so their names are read from the facility.
  const unnamedKey = assignedCustomerIds
    .filter((id) => !assignedCustomers.find((customer) => customer.id === id)?.name)
    .join(',');
  const nameLoad = useLoadWithRetry(unnamedKey || null, () => readCustomerNames(unnamedKey.split(',')));

  // A row that only says "Customer" cannot be told from the next one, so the
  // picker waits for the names and says so when they cannot be read.
  if (unnamedKey && nameLoad.state !== 'loaded') {
    return (
      <View style={styles.container}>
        <ReportHeader title={title} subtitle={tr('reports.shared.chooseCustomer')} />
        {nameLoad.state === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator testID="report-customer-names-loading" size="large" color={t.brand.tint} />
          </View>
        ) : (
          <ReportEmptyState
            icon="alert-circle-outline"
            tone="error"
            message={tr('reports.shared.customerNamesFailed')}
            description={tr('reports.shared.customerNamesFailedDescription')}
            actionLabel={tr('common.retry')}
            onAction={nameLoad.retry}
          />
        )}
      </View>
    );
  }

  // Names come with the profile or from the read above; a customer the server
  // returned without a name still gets a row.
  const loadedNames = nameLoad.state === 'loaded' ? nameLoad.data : {};
  const customers: AssignedCustomerRef[] = assignedCustomerIds.map((id) => ({
    id,
    name: assignedCustomers.find((customer) => customer.id === id)?.name || loadedNames[id] || '',
  }));

  return (
    <View style={styles.container}>
      <ReportHeader title={title} subtitle={tr('reports.shared.chooseCustomer')} />
      {/* The last row clears the system navigation bar. */}
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <CustomerChoiceRows
            customers={customers}
            onPick={onPick}
            hint={tr('reports.shared.chooseCustomerHint')}
            testIDPrefix="report-customer-"
            unnamedLabel={tr('reports.shared.unnamedCustomer')}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default ReportCustomerPicker;
