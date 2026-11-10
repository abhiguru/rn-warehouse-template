/**
 * Customer dues (WH-155): what each customer owes, for administrators and supervisors (the route guard and the server
 * refuse staff and customer accounts).
 *
 * At the top the facility's three figures; below, one row per customer with any of the three above zero, in the server's
 * order (due on invoices plus goods that have left, then goods in store, then the name). A row opens that customer's
 * Statement. Every figure is the server's, read when the screen opens and on pull-down; nothing is kept from an earlier
 * visit (useLiveReport).
 */
import React, { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { ReportScaffold } from '@/components/reports';
import { StatusTag } from '@/components/ui';
import { trustCustomerName } from '@/features/reports/customerNames';
import { DuesFigures, invoicesLabel, rupees } from '@/features/reports/DuesFigures';
import { useLiveReport } from '@/features/reports/useLiveReport';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { getCustomerDues, type CustomerDuesRow, type InvoicesBasis } from '@/services/reporting/statement-service';
import { iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    borderRadius: radius.card,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  content: { flex: 1, gap: space.xs, alignItems: 'flex-start' as const },
  name: { ...typography.headline, color: t.text.primary },
  figure: { alignSelf: 'stretch' as const },
  figureLabel: { ...typography.footnote, color: t.text.secondary },
  figureValue: { ...typography.subhead, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
});

const customerKey = (row: CustomerDuesRow) => row.customer_id;

export default function CustomerDuesScreen() {
  const query = useLiveReport('customer-dues', getCustomerDues, tr('reports.dues.loadError'));
  const { data } = query;
  const router = useRouter();
  const openStatement = useCallback(
    (row: CustomerDuesRow) => {
      trustCustomerName(row.customer_id, row.name);
      router.push({ pathname: '/reports/statement', params: { customerId: row.customer_id, customerName: row.name } } as never);
    },
    [router]
  );
  const basis = data?.invoices_basis ?? 'invoiced';
  const renderRow = useCallback((row: CustomerDuesRow) => <DuesRow row={row} basis={basis} onOpen={openStatement} />, [basis, openStatement]);

  return (
    <ReportScaffold
      title={tr('reports.titles.customerDues')}
      subtitle={tr('reports.shared.allCustomers')}
      query={query}
      kpiPlaceholders={0}
      rows={data?.customers ?? []}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={basis}
      empty={{ icon: 'cash-check', title: tr('reports.dues.duesEmpty') }}
      errorTitle={tr('reports.dues.errorTitle')}
    >
      {data ? <DuesFigures figures={data.totals} basis={data.invoices_basis} asOf={data.as_of} lotsWithoutRate={data.lots_without_rate} /> : null}
    </ReportScaffold>
  );
}

interface DuesRowProps {
  row: CustomerDuesRow;
  basis: InvoicesBasis;
  onOpen: (row: CustomerDuesRow) => void;
}

const DuesRow = memo(function DuesRow({ row, basis, onOpen }: DuesRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const figures: [string, number][] = [
    [invoicesLabel(basis), row.invoices_amount],
    [tr('reports.statement.notInvoicedLeft'), row.not_invoiced_left],
    [tr('reports.statement.notInvoicedInStore'), row.not_invoiced_in_store],
  ];
  const deactivated = row.active ? null : tr('customers.list.statusDeactivated');
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => onOpen(row)}
        accessibilityRole="button"
        accessibilityLabel={[
          row.name,
          deactivated,
          ...figures.map(([label, amount]) => tr('reports.shared.labelValue', { label, value: rupees(amount) })),
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={tr('reports.dues.opensStatementHint')}
      >
        <View style={styles.content}>
          <Text style={styles.name}>{row.name}</Text>
          {deactivated ? <StatusTag status="neutral" label={deactivated} /> : null}
          {figures.map(([label, amount]) => (
            <View key={label} style={styles.figure}>
              <Text style={styles.figureLabel}>{label}</Text>
              <Text style={styles.figureValue}>{rupees(amount)}</Text>
            </View>
          ))}
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    </View>
  );
});
