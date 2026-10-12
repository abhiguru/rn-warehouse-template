/**
 * Stock summary report (C1): today's stock, by customer and by item, with a
 * stock PDF to share.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportScope says
 * whose stock, useReportFilters holds the search and sort, useReportQuery the
 * data, and ReportScaffold draws every state. The report has no period: it is
 * the stock of today. A warehouse role sees every customer and opens one by
 * pushing this route with `?customerId=`, so the phone's back button and the
 * header's agree.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportEmptyState,
  ReportHeader,
  ReportLastCustomer,
  ReportScaffold,
  StockItemCard,
  animateExpand,
  type KPIItem,
  type ReportHeaderAction,
  type StockGRNRowData,
} from '@/components/reports';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import {
  STOCK_SUMMARY_CUSTOMER,
  STOCK_SUMMARY_CUSTOMERS,
  stockSummaryCustomersView,
  stockSummaryItemsView,
} from '@/features/filters/configs/reports/stockSummary';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier } from '@/i18n';
import { generateCustomerStockPDF } from '@/services/pdf-service';
import { getAllStockSummary, getCustomerStockSummary } from '@/services/reporting';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { AllStockSummaryData, CustomerStockRow, StockItemSummary, StockSummaryData } from '@/types/report.types';
import { showAlert } from '@/utils/alert';
import { formatCount, formatDate, formatNumber } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { downloadAndSharePDF } from '@/utils/shareDocument';

const REPORT_ID = 'stock-summary';
const logger = createLogger('StockSummary');

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },

  // A card per row, spaced by its own bottom margin.
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  // The item card sits inside the row's card (which also holds the match line): no second shadow.
  innerCard: { ...t.shadow[0], borderRadius: radius.card },
  matchLine: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },

  // The out-of-stock section under the items
  section: { marginTop: space.lg },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  sectionHeaderPressed: { backgroundColor: t.surface.cardPressed },
  sectionHeaderLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexShrink: 1 },
  sectionTitle: { ...typography.headline, color: t.text.primary },
  sectionHint: { ...typography.footnote, color: t.text.secondary },
  countBadge: {
    minWidth: 18,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  countBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    fontVariant: ['tabular-nums' as const],
  },
});

// ============================================================================
// Whose stock
// ============================================================================

export default function StockSummaryScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <NoCustomer />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.stockSummary')} onPick={scope.chooseCustomer} />;
    case 'customers':
      return <CustomersReport scope={scope} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's view is carried into another's.
      return (
        <CustomerReport
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

function NoCustomer() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.stockSummary')} />
      <ReportEmptyState
        icon="account-off-outline"
        message={tr('reports.shared.noCustomerLinked')}
        description={tr('reports.shared.noCustomer')}
      />
    </View>
  );
}

// ============================================================================
// The stock PDF
// ============================================================================

/**
 * "Stock_<name>.pdf". Letters (with their vowel signs) and digits of any script
 * are kept, so a Gujarati name stays a name; anything else becomes "_". A name
 * with nothing left gives the first 8 characters of the customer id instead.
 */
const stockPdfFilename = (customerName: string, customerId: string): string => {
  const name = (customerName ?? '').replace(/[^\p{L}\p{M}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `Stock_${name || customerId.slice(0, 8)}.pdf`;
};

/**
 * Shares a customer's stock PDF. Each customer has its own busy state: a second
 * tap for a customer whose PDF is on its way is ignored, and one export ending
 * does not clear another's. A failure is said in an alert, not only logged.
 */
function useStockPdf() {
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const mark = useCallback((customerId: string, on: boolean) => {
    if (on) inFlight.current.add(customerId);
    else inFlight.current.delete(customerId);
    setBusy(new Set(inFlight.current));
  }, []);

  const share = useCallback(
    async (customerId: string, customerName: string) => {
      if (!customerId || inFlight.current.has(customerId)) return;
      mark(customerId, true);
      try {
        const result = await generateCustomerStockPDF(customerId);
        if (!result.success || !result.pdfUrl) {
          logger.warn('Stock PDF was not created');
          showAlert(tr('reports.stockSummary.pdfErrorTitle'), tr('common.checkConnection'));
          return;
        }
        const shared = await downloadAndSharePDF(result.pdfUrl, stockPdfFilename(customerName, customerId));
        if (!shared.success) {
          logger.warn('Stock PDF was not shared');
          // The share helper's reasons are already in the app's language.
          showAlert(tr('reports.stockSummary.shareErrorTitle'), shared.error || tr('common.checkConnection'));
        }
      } catch (error) {
        logger.error('Stock PDF failed', error);
        showAlert(tr('reports.stockSummary.pdfErrorTitle'), tr('common.checkConnection'));
      } finally {
        mark(customerId, false);
      }
    },
    [mark]
  );

  return { busy, share };
}

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerStockRow) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(STOCK_SUMMARY_CUSTOMERS);
  const { view } = filters.request;
  const query = useReportQuery<AllStockSummaryData>({
    key: [REPORT_ID, 'customers'],
    fetch: () => getAllStockSummary(),
    fallbackError: tr('reports.stockSummary.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => stockSummaryCustomersView(data?.customers ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'cube-outline', value: data.summary.total_items, label: tr('common.items'), variant: 'primary' },
        { icon: 'warehouse', value: data.summary.total_quantity, label: tr('reports.stockSummary.unitsInStock'), variant: 'primary' },
      ],
    [data]
  );

  const pdf = useStockPdf();
  const { openCustomer, lastCustomer } = scope;
  const renderRow = useCallback(
    (customer: CustomerStockRow) => (
      <CustomerRow
        customer={customer}
        words={view.words}
        onOpen={openCustomer}
        onShare={pdf.share}
        isSharing={pdf.busy.has(customer.customer_id)}
      />
    ),
    [view.words, openCustomer, pdf.share, pdf.busy]
  );
  const extraData = useMemo(() => ({ words: view.words, busy: pdf.busy }), [view.words, pdf.busy]);

  return (
    <ReportScaffold
      title={tr('reports.titles.stockSummary')}
      subtitle={tr('reports.shared.allCustomers')}
      filters={{ config: STOCK_SUMMARY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ shown: rows.length, total: data?.customers.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={extraData}
      noun="customers"
      empty={{ icon: 'package-variant-closed', title: tr('reports.shared.noStockYet'), description: tr('reports.shared.noStockYetDescription') }}
      errorTitle={tr('reports.stockSummary.errorTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.stockSummary.opensCustomerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerStockRow;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
  onShare: (customerId: string, customerName: string) => void;
  isSharing: boolean;
}

const CustomerRow = memo(function CustomerRow({ customer, words, onOpen, onShare, isSharing }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={[formatCount(customer.item_count, 'item'), formatCount(customer.grn_count, 'GRN')]}
          value={customer.total_stock}
          valueLabel={tr('reports.shared.units')}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          onShare={() => onShare(customer.customer_id, customer.customer_name)}
          isSharing={isSharing}
          accessibilityHint={tr('reports.stockSummary.opensCustomerHint')}
        />
      </View>
    </View>
  );
});

// ============================================================================
// One customer's items
// ============================================================================

const itemKey = (item: StockItemSummary) => item.item_id;
const openGRN = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

/** Opens or closes one id in a set of open ids. */
const toggled = (ids: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  const filters = useReportFilters(STOCK_SUMMARY_CUSTOMER);
  const { view } = filters.request;
  const query = useReportQuery<StockSummaryData>({
    key: [REPORT_ID, 'customer', customerId],
    fetch: () => getCustomerStockSummary(customerId),
    fallbackError: tr('reports.stockSummary.loadError'),
  });
  const { data } = query;
  // The search and the sort apply to the items in stock and to those that ran out alike.
  const items = useMemo(() => stockSummaryItemsView(data?.items ?? [], view), [data, view]);
  const emptied = useMemo(() => stockSummaryItemsView(data?.out_of_stock_items ?? [], view), [data, view]);
  // The figures are today's whole stock, not what the search leaves. Nothing in stock: none (as before).
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && data.items.length > 0
        ? [
            { icon: 'warehouse', value: data.summary.total_quantity, label: tr('reports.stockSummary.unitsInStock'), variant: 'primary' },
            { icon: 'package-down', value: data.summary.grn_count, label: tr('reports.stockSummary.grnsWithStock'), variant: 'primary' },
          ]
        : undefined,
    [data]
  );

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleItem = useCallback((itemId: string) => setOpen(ids => toggled(ids, itemId)), []);

  const pdf = useStockPdf();
  const { share } = pdf;
  const sharing = pdf.busy.has(customerId);
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      { icon: 'file-pdf-box', label: tr('reports.stockSummary.sharePdf'), busy: sharing, onPress: () => share(customerId, customerName) },
    ],
    [onChangeCustomer, sharing, share, customerId, customerName]
  );
  const oldest = data?.summary.oldest_stock_date;
  const subtitle = customerName || (oldest ? tr('reports.stockSummary.oldestStock', { date: formatDate(oldest) }) : undefined);

  const renderRow = useCallback(
    (item: StockItemSummary) => <ItemRow item={item} words={view.words} isExpanded={open.has(item.item_id)} onToggle={toggleItem} />,
    [view.words, open, toggleItem]
  );
  const extraData = useMemo(() => ({ words: view.words, open }), [view.words, open]);

  return (
    <ReportScaffold
      title={tr('reports.titles.stockSummary')}
      subtitle={subtitle}
      actions={actions}
      filters={{ config: STOCK_SUMMARY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      status={{ shown: items.length, total: data?.items.length }}
      rows={items}
      renderRow={renderRow}
      keyExtractor={itemKey}
      extraData={extraData}
      // Reachable also when nothing is in stock: under the empty message.
      footer={emptied.length > 0 ? <OutOfStockSection items={emptied} words={view.words} /> : null}
      noun="items"
      empty={{
        icon: 'package-variant-closed',
        title: tr('reports.shared.noStockForCustomer'),
        description: tr('reports.shared.noStockForCustomerDescription'),
      }}
      errorTitle={tr('reports.stockSummary.errorTitle')}
    />
  );
}

/** The GRNs of an item as the shared card draws them. */
const grnRows = (item: StockItemSummary, outOfStock: boolean): StockGRNRowData[] =>
  item.grns.map((grn, index) => {
    const emptiedOn = outOfStock && grn.emptied_date ? grn.emptied_date : null;
    return {
      key: `${grn.gr_no}-${index}`,
      grnId: grn.grn_id || null,
      grNo: grn.gr_no,
      packageMark: grn.package_mark || null,
      receivedDate: grn.date,
      emptiedDate: emptiedOn,
      // An emptied GRN no longer holds a rack: its packaging and rack are not shown.
      packaging: emptiedOn ? null : grn.packaging,
      rack: emptiedOn ? null : grn.rack,
      weightEach: grn.item_weight,
      stock: grn.stock,
      total: grn.orig_qty,
    };
  });

/**
 * The GRNs a search found on an item whose card is closed (§14.6): the card
 * shows its name, not its GRN numbers. Only for words the name does not already show.
 */
function hiddenMatches(item: StockItemSummary, words: string[]): string[] {
  const name = item.item_name.toLowerCase();
  const unseen = words.filter(word => !name.includes(word));
  if (unseen.length === 0) return [];
  const found = new Set<string>();
  for (const grn of item.grns) {
    if (matchesAnyWord(String(grn.gr_no ?? ''), unseen)) found.add(tr('reports.shared.grnNumber', { number: formatIdentifier(grn.gr_no) }));
  }
  return [...found].slice(0, 3);
}

interface ItemRowProps {
  item: StockItemSummary;
  /** Lower-cased search words. */
  words: string[];
  isExpanded: boolean;
  onToggle: (itemId: string) => void;
  outOfStock?: boolean;
}

const ItemRow = memo(function ItemRow({ item, words, isExpanded, onToggle, outOfStock = false }: ItemRowProps) {
  const styles = useThemedStyles(makeStyles);
  const { item_id: itemId } = item;
  const handleToggle = useCallback(() => onToggle(itemId), [onToggle, itemId]);
  const grns = useMemo(() => ({ status: 'loaded' as const, rows: grnRows(item, outOfStock) }), [item, outOfStock]);
  const matched = isExpanded ? [] : hiddenMatches(item, words);
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <StockItemCard
          name={item.item_name}
          grnCount={item.grn_count}
          stock={item.total_stock}
          outOfStock={outOfStock}
          isExpanded={isExpanded}
          onToggle={handleToggle}
          grns={grns}
          onOpenGRN={openGRN}
          style={styles.innerCard}
        />
        {matched.length > 0 ? <HighlightedText style={styles.matchLine} numberOfLines={2} text={matched.join(' · ')} words={words} /> : null}
      </View>
    </View>
  );
});

interface OutOfStockSectionProps {
  /** Items that ran out in the last 360 days, after the search, in the chosen order. */
  items: StockItemSummary[];
  words: string[];
}

/** The items that ran out, folded away under one header. */
function OutOfStockSection({ items, words }: OutOfStockSectionProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSection = () => {
    animateExpand(reduceMotion);
    setShown(value => !value);
  };
  const toggleItem = useCallback((itemId: string) => setOpen(ids => toggled(ids, itemId)), []);

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.cardClip}>
          <Pressable
            style={({ pressed }) => [styles.sectionHeader, pressed && styles.sectionHeaderPressed]}
            onPress={toggleSection}
            accessibilityRole="button"
            accessibilityLabel={tr('reports.stockSummary.outOfStockA11y', { items: formatCount(items.length, 'item') })}
            accessibilityState={{ expanded: shown }}
          >
            <View style={styles.sectionHeaderLeft}>
              <Icon name={shown ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.sectionTitle}>{tr('common.outOfStock')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText} maxFontSizeMultiplier={1.6}>
                  {formatNumber(items.length)}
                </Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>{tr('reports.stockSummary.last360Days')}</Text>
          </Pressable>
        </View>
      </View>

      {shown
        ? items.map(item => (
            <ItemRow key={item.item_id} item={item} words={words} isExpanded={open.has(item.item_id)} onToggle={toggleItem} outOfStock />
          ))
        : null}
    </View>
  );
}
