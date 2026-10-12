/**
 * ReportCustomerPicker - a customer account with several customers chooses one.
 *
 * The server refuses a customer account every all-customers RPC, so each report
 * names one assigned customer (backend docs/STAFF_GRN_POLICY.md, 11 October 2026).
 * The picker lists the account's own customers and nothing else.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoleBasedAccess, type AssignedCustomerRef } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { Avatar } from '@/components/ui';
import { t as tr } from '@/i18n';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { ReportEmptyState } from './ReportEmptyState';
import { ReportHeader } from './ReportHeader';

type NameLoad =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'loaded'; names: Record<string, string> };

/**
 * Names of the account's own customers. The profile a sign-in stores carries
 * the assigned ids only, so the names are read from `customers`; row-level
 * security gives a customer account its own rows and no others.
 */
async function readCustomerNames(ids: string[]): Promise<Record<string, string>> {
  const client = await getAuthenticatedClient();
  const { data, error } = await client.from('customers').select('id, name').in('id', ids);
  if (error) throw error;
  const names: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; name: string | null }[]) names[row.id] = row.name ?? '';
  return names;
}

export interface ReportCustomerPickerProps {
  /** The report's title, shown above the picker */
  title: string;
  /** The customer that was chosen. Its name is empty when the server gave none. */
  onPick: (customer: AssignedCustomerRef) => void;
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
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: layout.marginCompact + layout.avatar.md + space.md,
      backgroundColor: t.border.divider,
    },
  });

export const ReportCustomerPicker: React.FC<ReportCustomerPickerProps> = ({ title, onPick }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { assignedCustomers, assignedCustomerIds } = useRoleBasedAccess();

  // Ids the profile gives no name for. Empty for a profile that carries names.
  const unnamedKey = assignedCustomerIds
    .filter((id) => !assignedCustomers.find((customer) => customer.id === id)?.name)
    .join(',');
  const [nameLoad, setNameLoad] = useState<NameLoad>({ state: 'loading' });
  const [nameAttempt, setNameAttempt] = useState(0);
  useEffect(() => {
    if (!unnamedKey) return undefined;
    let current = true;
    setNameLoad({ state: 'loading' });
    readCustomerNames(unnamedKey.split(',')).then(
      (names) => current && setNameLoad({ state: 'loaded', names }),
      () => current && setNameLoad({ state: 'failed' })
    );
    return () => {
      current = false;
    };
  }, [unnamedKey, nameAttempt]);

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
            onAction={() => setNameAttempt((attempt) => attempt + 1)}
          />
        )}
      </View>
    );
  }

  // Names come with the profile or from the read above; a customer the server
  // returned without a name still gets a row.
  const loadedNames = nameLoad.state === 'loaded' ? nameLoad.names : {};
  const customers: AssignedCustomerRef[] = assignedCustomerIds.map((id) => ({
    id,
    name: assignedCustomers.find((customer) => customer.id === id)?.name || loadedNames[id] || '',
  }));

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
                      onPress={() => onPick(customer)}
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

export default ReportCustomerPicker;
