/**
 * ReportCustomerScope - decides whose data a report screen shows.
 *
 * - admin, supervisor, staff: the all-customers list (the report's own list view)
 * - a customer account with one customer: that customer
 * - a customer account with several customers: a picker first, then that customer.
 *   The server refuses a customer account every all-customers RPC, so each view names
 *   one assigned customer (backend docs/STAFF_GRN_POLICY.md, 11 October 2026).
 * - a route that names a customer (`?customerId=`) is left to the report screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoleBasedAccess, type AssignedCustomerRef } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { Avatar } from '@/components/ui';
import { t as tr } from '@/i18n';
import { ReportHeader } from './ReportHeader';

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

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background.base },
    scrollContent: { paddingBottom: space.xxxl },
    section: { marginTop: space.lg, paddingHorizontal: layout.marginCompact },
    card: { backgroundColor: t.surface.card, borderRadius: radius.card, ...t.shadow[2] },
    cardClip: { borderRadius: radius.card, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.objectCellMinHeight,
      paddingVertical: space.md,
      paddingLeft: layout.marginCompact,
      paddingRight: space.sm,
      gap: space.md,
      backgroundColor: t.surface.card,
    },
    rowPressed: { backgroundColor: t.surface.cardPressed },
    name: { ...typography.headline, color: t.text.primary, flex: 1 },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },
  });

export const ReportCustomerScope: React.FC<ReportCustomerScopeProps> = ({ title, children }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { isWarehouseUser, reportScope, singleAssignedCustomerId, assignedCustomers, assignedCustomerIds } =
    useRoleBasedAccess();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const [picked, setPicked] = useState<AssignedCustomerRef | null>(null);

  const mustChoose = reportScope === 'choose-customer' && !params?.customerId;
  const clearPicked = useCallback(() => setPicked(null), []);

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

  // Names come with the profile; an id without a name still gets a row.
  const customers: AssignedCustomerRef[] = assignedCustomerIds.map(
    (id) => assignedCustomers.find((customer) => customer.id === id) ?? { id, name: '' }
  );

  return (
    <View style={styles.container}>
      <ReportHeader title={title} subtitle={tr('reports.shared.chooseCustomer')} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.cardClip}>
              {customers.map((customer, index) => {
                const name = customer.name || tr('reports.shared.unnamedCustomer');
                return (
                  <React.Fragment key={customer.id}>
                    <Pressable
                      testID={`report-customer-${customer.id}`}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      onPress={() => setPicked({ id: customer.id, name })}
                      accessibilityRole="button"
                      accessibilityLabel={name}
                      accessibilityHint={tr('reports.shared.chooseCustomerHint')}
                    >
                      <Avatar name={name} id={customer.id} />
                      <Text style={styles.name} numberOfLines={2}>
                        {name}
                      </Text>
                      <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                    </Pressable>
                    {index < customers.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ReportCustomerScope;
