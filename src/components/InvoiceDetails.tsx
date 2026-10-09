/**
 * InvoiceDetails: a self-contained invoice view (header, amounts and line items).
 *
 * The routed object page lives in app/invoice-details/[id].tsx; this component
 * is kept for embedding. Styles follow docs/STYLE_GUIDE.md (§13.6 cells, §13.11
 * calculation summary).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Portal, Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { fontWeight, iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import {
  getInvoiceDetails,
  getInvoiceItemsDetailed,
  InvoiceDetail,
  InvoiceItem,
  InvoiceItemDetailed,
  InvoiceItemsSummary
} from '@/services/invoice-service';
import { isAbortError } from '@/hooks/useAbortableFetch';
import { formatInvoiceAmount, formatInvoiceDeduction } from '@/utils/invoiceCalculations';
import { formatCount, formatDate, toDate, formatNumber } from '@/utils/formatters';

interface InvoiceDetailsProps {
  invoiceId: string;
  onBack?: () => void;
}

const formatDisplayDate = (value?: string) => (toDate(value) ? formatDate(value) : '');


const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  content: { padding: space.lg, gap: space.lg },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
    gap: space.lg,
  },
  loadingText: { ...typography.body, color: t.text.secondary },
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  pageTitle: { ...typography.title2, color: t.text.primary, flex: 1 },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },
  docType: { ...typography.footnote, color: t.text.secondary },
  docNumber: { ...typography.title2, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  docDate: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  infoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
  },
  infoTextContainer: { flex: 1, gap: space.xxs },
  infoLabel: { ...typography.subhead, color: t.text.secondary },
  infoValue: { ...typography.body, color: t.text.primary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border.divider },
  amountRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  amountLabel: { ...typography.body, color: t.text.secondary, flexShrink: 1 },
  amountValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  discountValue: { color: t.status.positive.text },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalLabel: { ...typography.headline, color: t.text.primary },
  totalValue: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  sectionHeader: {
    ...typography.footnote,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: space.sm,
  },
  summaryLine: { ...typography.subhead, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
  itemHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },
  itemName: { ...typography.headline, color: t.text.primary, flex: 1 },
  itemCharge: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  itemSubtitle: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  detailsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  detailItem: { flexGrow: 1, flexBasis: '45%' as const, gap: space.xxs },
  detailLabel: { ...typography.footnote, color: t.text.secondary },
  detailValue: { ...typography.subhead, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  emptySection: { paddingVertical: space.max, alignItems: 'center' as const, gap: space.md },
  emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptyText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  snackbar: { backgroundColor: t.surface.inverse, borderRadius: radius.button },
  emphasis: { fontWeight: fontWeight.semibold },
});

const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({ invoiceId, onBack }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceDetail | null>(null);
  const [, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [detailedItems, setDetailedItems] = useState<InvoiceItemDetailed[]>([]);
  const [itemsSummary, setItemsSummary] = useState<InvoiceItemsSummary | null>(null);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // P3: AbortController for cancelling requests on unmount/re-fetch
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchInvoiceData = useCallback(async () => {
    // Cancel any pending request before starting new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);

      // Fetch both in parallel for better performance (P4 optimization)
      const [headerResult, itemsResult] = await Promise.all([
        getInvoiceDetails(invoiceId),
        getInvoiceItemsDetailed(invoiceId),
      ]);

      // Check if request was aborted before updating state
      if (controller.signal.aborted) {
        if (__DEV__) console.log('[InvoiceDetails] Request was aborted, skipping state update');
        return;
      }

      if (__DEV__) console.log('[InvoiceDetails] Header result:', headerResult);
      if (__DEV__) console.log('[InvoiceDetails] Detailed items result:', itemsResult);

      // Process header result
      if (headerResult.success && headerResult.data) {
        setInvoiceHeader(headerResult.data.header);
        setInvoiceItems(headerResult.data.items || []);
      } else {
        setErrorMessage("Couldn't load the invoice. Check your connection and try again.");
        setErrorVisible(true);
        return;
      }

      // Process detailed items result
      if (itemsResult.success && itemsResult.data) {
        setDetailedItems(itemsResult.data.items || []);
        setItemsSummary(itemsResult.data.summary || null);
      } else {
        console.warn('[InvoiceDetails] Failed to load detailed items:', itemsResult.message);
        // Don't show error for detailed items, fallback to basic items
      }

    } catch (error) {
      // Ignore abort errors - they're expected when navigating away
      if (isAbortError(error)) {
        if (__DEV__) console.log('[InvoiceDetails] Request was aborted');
        return;
      }
      console.error('[InvoiceDetails] Error fetching data:', error);
      setErrorMessage("Couldn't load the invoice. Check your connection and try again.");
      setErrorVisible(true);
    } finally {
      // Only update loading state if not aborted
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [invoiceId]);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceData();
    }

    // Cleanup: abort any pending request on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [invoiceId, fetchInvoiceData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInvoiceData();
  };

  const renderInfoRow = (icon: string, label: string, value?: string | null) => (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}, ${value || 'not set'}`}>
      <Icon name={icon} size={iconSize.md} color={t.icon.secondary} />
      <View style={styles.infoTextContainer}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );

  const renderAmountRow = (label: string, value: string, isDiscount = false) => (
    <View style={styles.amountRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, isDiscount && styles.discountValue]}>{value}</Text>
    </View>
  );

  const renderInvoiceHeader = () => {
    if (!invoiceHeader) return null;

    return (
      <>
        <View style={styles.topBar}>
          {onBack && (
            <HeaderBackButton onPress={onBack} />
          )}
          <Text style={styles.pageTitle} accessibilityRole="header">Invoice details</Text>
        </View>

        {/* Object header */}
        <View style={styles.card}>
          <Text style={styles.docType}>Invoice</Text>
          <Text style={styles.docNumber}>{invoiceHeader.invoice_number}</Text>
          <Text style={styles.docDate}>{formatDisplayDate(invoiceHeader.invoice_date)}</Text>
        </View>

        {/* Customer and GRN */}
        <View style={styles.card}>
          {renderInfoRow('account-outline', 'Customer', invoiceHeader.customer?.name || invoiceHeader.invoice_customer_name)}
          <View style={styles.divider} />
          {renderInfoRow('package-down', 'GRN', invoiceHeader.grn?.number || invoiceHeader.gr_no)}
          <View style={styles.divider} />
          {renderInfoRow('calendar-range', 'Financial year', invoiceHeader.financial_year)}
        </View>

        {/* Amounts */}
        <View style={styles.card}>
          {renderAmountRow('Labour', formatInvoiceAmount(invoiceHeader.labour))}
          {renderAmountRow('Discount', formatInvoiceDeduction(invoiceHeader.discount), true)}
          {renderAmountRow('Tax', formatInvoiceAmount(invoiceHeader.tax_amount))}
          <View
            style={styles.totalRow}
            accessible
            accessibilityLabel={`Total amount, ${formatInvoiceAmount(invoiceHeader.total)}`}
          >
            <Text style={styles.totalLabel}>Total amount</Text>
            <Text style={styles.totalValue}>{formatInvoiceAmount(invoiceHeader.total)}</Text>
          </View>
        </View>
      </>
    );
  };

  const renderDetailedItems = () => {
    const itemsToShow = detailedItems.length > 0 ? detailedItems : [];

    if (itemsToShow.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="cube-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle}>No line items</Text>
          <Text style={styles.emptyText}>Items billed on this invoice appear here.</Text>
        </View>
      );
    }

    return (
      <>
        <Text style={styles.sectionHeader} accessibilityRole="header">Line items</Text>
        {itemsSummary && (
          <Text style={styles.summaryLine}>
            {`${formatCount(itemsSummary.totalItems, 'item')} · ${formatInvoiceAmount(itemsSummary.totalAmount)}`}
          </Text>
        )}

        {itemsToShow.map((item, index) => (
          <View
            key={`${item.id}-${index}`}
            style={styles.card}
            accessible
            accessibilityLabel={`${item.itemName}, ${formatInvoiceAmount(item.charge)}, ${item.duration}`}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemName} numberOfLines={2}>{item.itemName}</Text>
              <Text style={styles.itemCharge}>{formatInvoiceAmount(item.charge)}</Text>
            </View>
            <Text style={styles.itemSubtitle}>
              {`${item.duration} (${formatCount(item.noOfDays, 'day')})`}
            </Text>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>GRN</Text>
                <Text style={styles.detailValue}>{item.grNo || '—'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Dispatch</Text>
                <Text style={styles.detailValue}>{item.dispatchNo ?? '—'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Package mark</Text>
                <Text style={styles.detailValue}>{item.packageMark || '—'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Rack</Text>
                <Text style={styles.detailValue}>{item.rack || '—'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Dispatch qty</Text>
                <Text style={styles.detailValue}>{formatNumber(item.dispatchQty)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>GRN qty</Text>
                <Text style={styles.detailValue}>{formatNumber(item.grnQuantity)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Tax</Text>
                <Text style={styles.detailValue}>{formatInvoiceAmount(item.tax)}</Text>
              </View>
            </View>
          </View>
        ))}

        {itemsSummary && (
          <View style={styles.card}>
            <Text style={[styles.infoValue, styles.emphasis]} accessibilityRole="header">Items summary</Text>
            {renderAmountRow('Total items', formatNumber(itemsSummary.totalItems))}
            {renderAmountRow('Total dispatch qty', formatNumber(itemsSummary.totalDispatchQty))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total amount</Text>
              <Text style={styles.totalValue}>{formatInvoiceAmount(itemsSummary.totalAmount)}</Text>
            </View>
          </View>
        )}
      </>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading invoice…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.brand.tint}
            colors={[t.brand.tint]}
            progressBackgroundColor={t.surface.card}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderInvoiceHeader()}
        {renderDetailedItems()}
      </ScrollView>

      {/* Error snackbar */}
      <Portal>
        <Snackbar
          visible={errorVisible}
          onDismiss={() => setErrorVisible(false)}
          duration={4000}
          style={styles.snackbar}
          theme={{ colors: { inverseOnSurface: t.text.inverse, inversePrimary: t.text.inverse } }}
          action={{
            label: 'Try again',
            textColor: t.text.inverse,
            onPress: () => fetchInvoiceData(),
          }}
        >
          {errorMessage}
        </Snackbar>
      </Portal>
    </>
  );
};

export default InvoiceDetails;
