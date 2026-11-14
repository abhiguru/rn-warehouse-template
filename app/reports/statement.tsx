/**
 * Customer statement (WH-155): what a customer has in store and what it owes, as the store sees it.
 *
 * Who: a customer account (Reports → Statement; one with several customers chooses first, as in Stock aging), and an
 * administrator or supervisor from Customer dues or Customer activity's Quick access, which push this route with
 * `?customerId=`. Staff are not offered it (route guard) and the server refuses them. An administrator or supervisor who
 * reaches the route without a customer is sent to Customer dues.
 *
 * Top to bottom: the customer and "As of", the three figures, the goods that have left and are not invoiced (one row per
 * GRN), the stock in store (one row per GRN, opening to its lots), the invoices. Every figure is the server's, read when
 * the screen opens and on pull-down; nothing is kept from an earlier visit (useLiveReport). Share PDF makes the English PDF
 * of the same read on the server (generate-statement-pdf).
 */
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ReportCustomerPicker,
  ReportNoCustomer,
  ReportScaffold,
  animateExpand,
  type ReportHeaderAction,
} from '@/components/reports';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { PaymentStatusTag } from '@/features/payments/PaymentStatusTag';
import { DuesFigures, rupees } from '@/features/reports/DuesFigures';
import { useLiveReport } from '@/features/reports/useLiveReport';
import { useReportScope } from '@/features/reports/useReportScope';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier, type TranslationKey } from '@/i18n';
import { generateStatementPDF } from '@/services/pdf-service';
import {
  getCustomerStatement,
  type CustomerStatement,
  type StatementInvoice,
  type StatementLeftRow,
  type StatementStoreRow,
} from '@/services/reporting/statement-service';
import { fontWeight, iconSize, layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { formatIndiaDate, formatIndiaSpokenDate, formatNumber } from '@/utils/formatters';
import { itemWithPackaging } from '@/utils/packagingWord';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { nameFileNamePart } from '@/utils/invoiceLabel';

const REPORT_ID = 'statement';

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  content: { flex: 1, gap: space.xxs, alignItems: 'flex-start' as const },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  right: { alignItems: 'flex-end' as const, flexShrink: 0, gap: space.xxs },
  amount: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  lots: { paddingBottom: space.md },
  lot: {
    flexDirection: 'row' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
  },
  lotName: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
  lotAmount: { ...typography.subhead, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
  noRate: { ...typography.subhead, color: t.status.critical.text, textAlign: 'right' as const },
  viewGrn: { marginTop: space.sm, paddingHorizontal: space.lg },
});

type StatementRow =
  | { kind: 'heading'; key: string; title: TranslationKey }
  | { kind: 'left'; key: string; row: StatementLeftRow }
  | { kind: 'store'; key: string; row: StatementStoreRow }
  | { kind: 'invoice'; key: string; row: StatementInvoice };

const rowKey = (row: StatementRow) => row.key;
const rowType = (row: StatementRow) => row.kind;

/** The sections of step 6, in order; a section with nothing in it is left out. */
function statementRows(data: CustomerStatement): StatementRow[] {
  const rows: StatementRow[] = [];
  if (data.left.length > 0) {
    rows.push({ kind: 'heading', key: 'h-left', title: 'reports.statement.notInvoicedLeft' });
    for (const row of data.left) rows.push({ kind: 'left', key: `left-${row.gr_id}`, row });
  }
  if (data.in_store.length > 0) {
    rows.push({ kind: 'heading', key: 'h-store', title: 'reports.statement.stockInStore' });
    for (const row of data.in_store) rows.push({ kind: 'store', key: `store-${row.gr_id}`, row });
  }
  if (data.invoices.length > 0) {
    rows.push({ kind: 'heading', key: 'h-invoices', title: 'reports.statement.invoices' });
    for (const row of data.invoices) rows.push({ kind: 'invoice', key: `invoice-${row.id}`, row });
  }
  return rows;
}

const units = (count: number) => tr('reports.shared.unitsValue', { count, value: formatNumber(count) });
const grnTitle = (grNo: string) => tr('reports.shared.grnNumber', { number: formatIdentifier(grNo) });
const openGrn = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}` as never);
};
const openInvoice = (invoiceId: string) => {
  if (invoiceId) router.push(`/invoice-details/${invoiceId}` as never);
};

export default function StatementScreen() {
  const scope = useReportScope(REPORT_ID);
  const { isManager: manager } = useRoleBasedAccess();
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.statement')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.statement')} onPick={scope.chooseCustomer} />;
    case 'customers':
      // An administrator or supervisor picks the customer on Customer dues.
      return manager ? <Redirect href={'/reports/customer-dues' as never} /> : <ReportNoCustomer title={tr('reports.titles.statement')} />;
    case 'customer':
      return (
        <CustomerStatementView
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          canOpenLeft={manager}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

interface CustomerStatementViewProps {
  customerId: string;
  customerName: string;
  /** Administrators and supervisors: a row of goods that have left opens GRN details, where Create invoice is (WH-162). */
  canOpenLeft: boolean;
  onChangeCustomer?: () => void;
}

function CustomerStatementView({ customerId, customerName, canOpenLeft, onChangeCustomer }: CustomerStatementViewProps) {
  const fetch = useCallback(() => getCustomerStatement(customerId), [customerId]);
  const query = useLiveReport(`statement:${customerId}`, fetch, tr('reports.statement.loadError'));
  const { data } = query;
  const name = data?.customer.name || customerName;
  const rows = useMemo(() => (data ? statementRows(data) : []), [data]);

  // Share PDF: the server makes it from its own read; a second tap while it is being made is ignored.
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const sharePdf = useCallback(async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    try {
      const made = await generateStatementPDF(customerId);
      if (!made.success || !made.pdfUrl) {
        showAlert(tr('reports.export.failedTitle'), made.error || tr('errors.pdf.generateFailed'));
        return;
      }
      const shared = await downloadAndSharePDF(made.pdfUrl, `Statement ${nameFileNamePart(name)}`.trim() + '.pdf');
      if (!shared.success) showAlert(tr('reports.export.shareFailedTitle'), shared.error || tr('errors.pdf.shareFailed'));
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }, [customerId, name]);

  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline' as const, label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      // Only once the figures are on screen: the PDF is of the same read.
      ...(data ? [{ icon: 'share-variant' as const, label: tr('components.sharePdf'), onPress: () => { void sharePdf(); }, busy: sharing }] : []),
    ],
    [onChangeCustomer, data, sharePdf, sharing]
  );

  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (grId: string) => {
      animateExpand(reduceMotion);
      setOpen(previous => {
        const next = new Set(previous);
        if (next.has(grId)) next.delete(grId);
        else next.add(grId);
        return next;
      });
    },
    [reduceMotion]
  );

  const renderRow = useCallback(
    (row: StatementRow) => {
      switch (row.kind) {
        case 'heading':
          return <SectionHeader title={tr(row.title)} />;
        case 'left':
          return <LeftRow row={row.row} canOpen={canOpenLeft} />;
        case 'store':
          return <StoreRow row={row.row} expanded={open.has(row.row.gr_id)} onToggle={toggle} />;
        case 'invoice':
          return <InvoiceRow row={row.row} payments={data?.record_payments === true} />;
      }
    },
    [canOpenLeft, open, toggle, data]
  );
  const extraData = useMemo(() => ({ open, payments: data?.record_payments }), [open, data]);

  return (
    <ReportScaffold
      title={tr('reports.titles.statement')}
      subtitle={name || undefined}
      actions={actions}
      query={query}
      kpiPlaceholders={0}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={rowKey}
      getRowType={rowType}
      extraData={extraData}
      empty={{ icon: 'file-account-outline', title: tr('reports.statement.statementEmpty') }}
      errorTitle={tr('reports.statement.errorTitle')}
    >
      {data ? <DuesFigures figures={data.figures} basis={data.invoices_basis} asOf={data.as_of} lotsWithoutRate={data.lots_without_rate} unlinkedPaid={data.unlinked_paid_amount} /> : null}
    </ReportScaffold>
  );
}

const LeftRow = memo(function LeftRow({ row, canOpen }: { row: StatementLeftRow; canOpen: boolean }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const label = [grnTitle(row.gr_no), units(row.bags), rupees(row.amount)].join(', ');
  const content = (
    <>
      <View style={styles.content}>
        {/* A document number is never cut short (§4). */}
        <Text style={styles.title}>{grnTitle(row.gr_no)}</Text>
        <Text style={styles.subtitle}>{units(row.bags)}</Text>
      </View>
      <Text style={styles.amount}>{rupees(row.amount)}</Text>
      {canOpen ? <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} /> : null}
    </>
  );
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        {canOpen ? (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => openGrn(row.gr_id)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={tr('reports.shared.opensGrnHint')}
          >
            {content}
          </Pressable>
        ) : (
          <View style={styles.row} accessible accessibilityLabel={label}>
            {content}
          </View>
        )}
      </View>
    </View>
  );
});

interface StoreRowProps {
  row: StatementStoreRow;
  expanded: boolean;
  onToggle: (grId: string) => void;
}

const StoreRow = memo(function StoreRow({ row, expanded, onToggle }: StoreRowProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const received = tr('reports.shared.receivedOn', { date: formatIndiaDate(row.grn_date) });
  const age = tr('reports.statement.daysInStore', { days: formatNumber(row.days_in_store) });
  const estimate = tr('reports.shared.labelValue', { label: tr('reports.statement.notInvoicedInStore'), value: rupees(row.amount) });
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => onToggle(row.gr_id)}
          accessibilityRole="button"
          accessibilityLabel={[
            grnTitle(row.gr_no),
            tr('reports.shared.receivedOn', { date: formatIndiaSpokenDate(row.grn_date) }),
            age,
            units(row.bags),
            estimate,
          ].join(', ')}
          accessibilityHint={tr(expanded ? 'reports.statement.hideLots' : 'reports.statement.showLots')}
          accessibilityState={{ expanded }}
        >
          <View style={styles.content}>
            <Text style={styles.title}>{grnTitle(row.gr_no)}</Text>
            <Text style={styles.subtitle}>{received}</Text>
            <Text style={styles.subtitle}>{age}</Text>
            <Text style={styles.subtitle}>{units(row.bags)}</Text>
          </View>
          <Text style={styles.amount}>{rupees(row.amount)}</Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
        {expanded ? (
          <View style={styles.lots}>
            {row.lots.map(lot => {
              const lotName = itemWithPackaging(lot.item_name, lot.packaging ?? undefined);
              const value = lot.has_rate ? rupees(lot.amount) : tr('reports.statement.noRateYet');
              return (
                <View key={lot.grn_item_id} style={styles.lot} accessible accessibilityLabel={[lotName, units(lot.bags), value].join(', ')}>
                  <View style={styles.content}>
                    <Text style={styles.lotName}>{lotName}</Text>
                    <Text style={styles.subtitle}>{units(lot.bags)}</Text>
                  </View>
                  <Text style={lot.has_rate ? styles.lotAmount : styles.noRate}>{value}</Text>
                </View>
              );
            })}
            <View style={styles.viewGrn}>
              <Button type="secondary" size="fullWidth" onPress={() => openGrn(row.gr_id)}>
                {tr('reports.stockAging.viewGrn', { number: formatIdentifier(row.gr_no) })}
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const InvoiceRow = memo(function InvoiceRow({ row, payments }: { row: StatementInvoice; payments: boolean }) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const title = tr('reports.customerActivity.invoiceNumber', { number: formatIdentifier(row.invoice_label) });
  const due = payments && row.due_amount !== null && row.due_amount > 0 ? tr('reports.statement.dueAmount', { amount: rupees(row.due_amount) }) : null;
  const status = payments && row.payment_status
    ? tr(row.payment_status === 'paid' ? 'payments.status.paid' : row.payment_status === 'part_paid' ? 'payments.status.partPaid' : 'payments.status.due')
    : null;
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => openInvoice(row.id)}
          accessibilityRole="button"
          accessibilityLabel={[title, formatIndiaSpokenDate(row.inv_date), rupees(row.total), status, due].filter(Boolean).join(', ')}
          accessibilityHint={tr('reports.invoiceHistory.openHint')}
        >
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{formatIndiaDate(row.inv_date)}</Text>
            {payments ? <PaymentStatusTag status={row.payment_status} /> : null}
          </View>
          <View style={styles.right}>
            <Text style={styles.amount}>{rupees(row.total)}</Text>
            {due ? <Text style={styles.subtitle}>{due}</Text> : null}
          </View>
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
      </View>
    </View>
  );
});
