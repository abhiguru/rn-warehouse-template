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
import React, { memo, useCallback, useMemo, useState } from 'react';
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
import { changeCustomerAction, exportHeaderActions } from '@/features/reports/reportActions';
import { MoneyAgeLine } from '@/features/phone-copy/money/MoneyAgeLine';
import { fetchStatement } from '@/features/phone-copy/money/moneyFetch';
import { useMoneyOn } from '@/features/phone-copy/money/moneyGate';
import { useMoneyReport, type MoneyReport } from '@/features/phone-copy/money/useMoneyReport';
import { useLiveReport, type LiveReport } from '@/features/reports/useLiveReport';
import { useReportScope } from '@/features/reports/useReportScope';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier, type TranslationKey } from '@/i18n';
import { generateStatementPDF } from '@/services/pdf-service';
import {
  getCustomerStatement,
  mapKeptStatement,
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

/** The text when there is one, else the fallback (an empty string is none). */
const textOr = (value: string | undefined, fallback: string): string => (value !== undefined && value !== '' ? value : fallback);

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
      return manager ? <Redirect href={'/reports/customer-dues'} /> : <ReportNoCustomer title={tr('reports.titles.statement')} />;
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

/** Kept answers (WH-305) for an administrator or supervisor when the feature is on; today's live read otherwise. */
function CustomerStatementView(props: CustomerStatementViewProps) {
  return useMoneyOn() ? <KeptStatement {...props} /> : <LiveStatement {...props} />;
}

function LiveStatement(props: CustomerStatementViewProps) {
  const { customerId } = props;
  const fetch = useCallback(() => getCustomerStatement(customerId), [customerId]);
  const query = useLiveReport(`statement:${customerId}`, fetch, tr('reports.statement.loadError'));
  return <StatementBody {...props} query={query} />;
}

function KeptStatement(props: CustomerStatementViewProps) {
  const { customerId } = props;
  const load = useCallback(() => fetchStatement(customerId), [customerId]);
  const query = useMoneyReport<CustomerStatement>({
    kind: 'statement',
    id: customerId,
    load,
    map: mapKeptStatement,
    answerHasStock: data => data.in_store.length > 0,
    stockOf: customerId,
    fallbackError: tr('reports.statement.loadError'),
  });
  return <StatementBody {...props} query={query} kept={query} />;
}

interface StatementBodyProps extends CustomerStatementViewProps {
  query: LiveReport<CustomerStatement> | MoneyReport<CustomerStatement>;
  /** Set when the answer is a kept one: the age line, and "not on this phone yet". */
  kept?: MoneyReport<CustomerStatement>;
}

function StatementBody({ customerId, customerName, canOpenLeft, onChangeCustomer, query, kept }: StatementBodyProps) {
  const { data } = query;
  const name = textOr(data?.customer.name, customerName);
  const rows = useMemo(() => (data ? statementRows(data) : []), [data]);

  // Share PDF: the server makes it from its own read; a second tap while it is being made is ignored.
  const [sharing, setSharing] = useState(false);
  const sharePdf = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const made = await generateStatementPDF(customerId);
      if (!made.success || !made.pdfUrl) {
        showAlert(tr('reports.export.failedTitle'), textOr(made.error, tr('errors.pdf.generateFailed')));
        return;
      }
      const shared = await downloadAndSharePDF(made.pdfUrl, `Statement ${nameFileNamePart(name)}`.trim() + '.pdf');
      if (!shared.success) showAlert(tr('reports.export.shareFailedTitle'), textOr(shared.error, tr('errors.pdf.shareFailed')));
    } finally {
      setSharing(false);
    }
  }, [customerId, name, sharing]);

  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...changeCustomerAction(onChangeCustomer),
      // Only once the figures are on screen: the PDF is of the same read.
      ...exportHeaderActions({ exportPdf: sharePdf, busy: sharing, available: !!data }),
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
      reportId={REPORT_ID}
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
      ageLine={kept?.age ? <MoneyAgeLine {...kept.age} refreshFailed={kept.refreshFailed} onRetry={kept.retry} /> : undefined}
      notHere={kept?.notHere ? { testID: 'statement-not-here', title: tr('money.statementNotHereTitle'), text: tr('money.statementNotHereText') } : undefined}
      // Statement is a money screen: its own kept-answer age (WH-305, Design 9.7 DQ2), never CustomerAgeStrip.
      hideCustomerAgeStrip
    >
      {data ? (
        <DuesFigures
          figures={data.figures}
          basis={data.invoices_basis}
          asOf={data.as_of}
          lotsWithoutRate={data.lots_without_rate}
          unlinkedPaid={data.unlinked_paid_amount}
          showAsOf={!kept}
        />
      ) : null}
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
