import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Card,
  Surface,
  ActivityIndicator,
  Divider,
  Chip,
  Portal,
  Snackbar,
  IconButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import {
  getInvoiceDetails,
  getInvoiceItemsDetailed,
  InvoiceDetail,
  InvoiceItem,
  InvoiceItemDetailed,
  InvoiceItemsSummary
} from '@/services/invoice-service';
import { isAbortError } from '@/hooks/useAbortableFetch';

interface InvoiceDetailsProps {
  invoiceId: string;
  onBack?: () => void;
}

const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({ invoiceId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceHeader, setInvoiceHeader] = useState<InvoiceDetail | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
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
        setErrorMessage(headerResult.message || 'Failed to load invoice details');
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
      setErrorMessage('Failed to load invoice data');
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

  const renderInvoiceHeader = () => {
    if (!invoiceHeader) return null;

    return (
      <View style={styles.headerSection}>
        {/* Header with back button */}
        <Surface style={styles.topBar} elevation={0}>
          <Text variant="headlineSmall" style={styles.pageTitle}>
            Invoice Details
          </Text>
          {onBack && (
            <IconButton
              icon="arrow-left"
              size={24}
              onPress={onBack}
              iconColor={theme.colors.gray[700]}
            />
          )}
        </Surface>

        {/* Invoice Number Badge */}
        <Surface style={styles.invoiceBadge} elevation={2}>
          <Icon name="file-document" size={32} color={theme.colors.white} />
          <View style={styles.badgeContent}>
            <Text variant="labelSmall" style={styles.badgeLabel}>
              INVOICE
            </Text>
            <Text variant="headlineSmall" style={styles.invoiceNumber}>
              #{invoiceHeader.invoice_number}
            </Text>
          </View>
          <Chip
            mode="flat"
            style={styles.dateChip}
            textStyle={styles.dateChipText}
            icon="calendar"
          >
            {new Date(invoiceHeader.invoice_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </Chip>
        </Surface>

        {/* Customer & GRN Info */}
        <Card style={styles.infoCard} mode="contained">
          <Card.Content style={styles.infoContent}>
            <View style={styles.infoRow}>
              <Icon name="account" size={20} color={theme.colors.gray[600]} />
              <View style={styles.infoTextContainer}>
                <Text variant="labelSmall" style={styles.infoLabel}>
                  Customer
                </Text>
                <Text variant="bodyMedium" style={styles.infoValue}>
                  {invoiceHeader.customer?.name || invoiceHeader.invoice_customer_name}
                </Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.infoRow}>
              <Icon name="package-variant" size={20} color={theme.colors.gray[600]} />
              <View style={styles.infoTextContainer}>
                <Text variant="labelSmall" style={styles.infoLabel}>
                  GRN Number
                </Text>
                <Text variant="bodyMedium" style={styles.infoValue}>
                  {invoiceHeader.grn?.number || invoiceHeader.gr_no}
                </Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.infoRow}>
              <Icon name="calendar-range" size={20} color={theme.colors.gray[600]} />
              <View style={styles.infoTextContainer}>
                <Text variant="labelSmall" style={styles.infoLabel}>
                  Financial Year
                </Text>
                <Text variant="bodyMedium" style={styles.infoValue}>
                  {invoiceHeader.financial_year}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Amount Breakdown */}
        <Card style={styles.amountCard} mode="elevated">
          <Card.Content>
            <View style={styles.amountRow}>
              <Text variant="bodyMedium" style={styles.amountLabel}>
                Labour
              </Text>
              <Text variant="bodyMedium" style={styles.amountValue}>
                ₹{invoiceHeader.labour.toLocaleString()}
              </Text>
            </View>

            <View style={styles.amountRow}>
              <Text variant="bodyMedium" style={styles.amountLabel}>
                Discount
              </Text>
              <Text variant="bodyMedium" style={styles.amountValue}>
                -₹{invoiceHeader.discount.toLocaleString()}
              </Text>
            </View>

            <View style={styles.amountRow}>
              <Text variant="bodyMedium" style={styles.amountLabel}>
                Tax
              </Text>
              <Text variant="bodyMedium" style={styles.amountValue}>
                ₹{invoiceHeader.tax_amount.toLocaleString()}
              </Text>
            </View>

            <Divider style={styles.totalDivider} />

            <View style={styles.totalRow}>
              <Text variant="titleMedium" style={styles.totalLabel}>
                Total Amount
              </Text>
              <Text variant="titleLarge" style={styles.totalValue}>
                ₹{invoiceHeader.total.toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </View>
    );
  };

  const renderDetailedItems = () => {
    const itemsToShow = detailedItems.length > 0 ? detailedItems : [];

    if (itemsToShow.length === 0) {
      return (
        <View style={styles.emptySection}>
          <Icon name="package-variant-closed" size={64} color={theme.colors.gray[300]} />
          <Text variant="titleMedium" style={styles.emptyText}>
            No line items available
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.itemsSection}>
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Line Items
          </Text>
          {itemsSummary && (
            <View style={styles.summaryChips}>
              <Chip icon="package-variant" mode="outlined" compact style={styles.chip}>
                {itemsSummary.totalItems} items
              </Chip>
              <Chip icon="currency-inr" mode="outlined" compact style={styles.chip}>
                ₹{itemsSummary.totalAmount.toLocaleString()}
              </Chip>
            </View>
          )}
        </View>

        {/* Line Items */}
        {itemsToShow.map((item, index) => (
          <Card key={`${item.id}-${index}`} style={styles.itemCard} mode="elevated">
            <Card.Content>
              {/* Item Header */}
              <View style={styles.itemHeader}>
                <Text variant="titleMedium" style={styles.itemName} numberOfLines={2}>
                  {item.itemName}
                </Text>
                <Surface style={styles.chargeChip} elevation={0}>
                  <Text variant="titleMedium" style={styles.chargeText}>
                    ₹{item.charge.toLocaleString()}
                  </Text>
                </Surface>
              </View>

              {/* Duration Badge */}
              <Chip
                icon="clock-outline"
                mode="flat"
                compact
                style={styles.durationChip}
                textStyle={styles.durationText}
              >
                {item.duration} ({item.noOfDays} days)
              </Chip>

              <Divider style={styles.itemDivider} />

              {/* Item Details Grid */}
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text variant="labelSmall" style={styles.detailLabel}>
                    GRN
                  </Text>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {item.grNo}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text variant="labelSmall" style={styles.detailLabel}>
                    Dispatch
                  </Text>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {item.dispatchNo}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text variant="labelSmall" style={styles.detailLabel}>
                    Package Mark
                  </Text>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {item.packageMark}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Text variant="labelSmall" style={styles.detailLabel}>
                    Rack
                  </Text>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {item.rack}
                  </Text>
                </View>
              </View>

              <Divider style={styles.itemDivider} />

              {/* Quantity Metrics */}
              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Icon name="package-up" size={16} color={theme.colors.gray[600]} />
                  <Text variant="labelSmall" style={styles.metricLabel}>
                    Dispatch Qty
                  </Text>
                  <Text variant="titleSmall" style={styles.metricValue}>
                    {item.dispatchQty}
                  </Text>
                </View>

                <View style={styles.metricItem}>
                  <Icon name="package-down" size={16} color={theme.colors.gray[600]} />
                  <Text variant="labelSmall" style={styles.metricLabel}>
                    GRN Qty
                  </Text>
                  <Text variant="titleSmall" style={styles.metricValue}>
                    {item.grnQuantity}
                  </Text>
                </View>

                <View style={styles.metricItem}>
                  <Icon name="receipt" size={16} color={theme.colors.gray[600]} />
                  <Text variant="labelSmall" style={styles.metricLabel}>
                    Tax
                  </Text>
                  <Text variant="titleSmall" style={styles.metricValue}>
                    ₹{item.tax.toLocaleString()}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        ))}

        {/* Items Summary Card */}
        {itemsSummary && (
          <Surface style={styles.summarySurface} elevation={1}>
            <Text variant="titleMedium" style={styles.summaryTitle}>
              Items Summary
            </Text>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Total Items
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {itemsSummary.totalItems}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Total Dispatch Qty
              </Text>
              <Text variant="bodyMedium" style={styles.summaryValue}>
                {itemsSummary.totalDispatchQty}
              </Text>
            </View>

            <Divider style={styles.summaryDivider} />

            <View style={styles.summaryTotalRow}>
              <Text variant="titleMedium" style={styles.summaryTotalLabel}>
                Total Amount
              </Text>
              <Text variant="titleLarge" style={styles.summaryTotalValue}>
                ₹{itemsSummary.totalAmount.toLocaleString()}
              </Text>
            </View>
          </Surface>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Loading invoice details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderInvoiceHeader()}
        {renderDetailedItems()}
      </ScrollView>

      {/* Error Snackbar */}
      <Portal>
        <Snackbar
          visible={errorVisible}
          onDismiss={() => setErrorVisible(false)}
          duration={4000}
          action={{
            label: 'Retry',
            onPress: () => fetchInvoiceData(),
          }}
        >
          {errorMessage}
        </Snackbar>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.gray[50],
    gap: 16,
  },
  loadingText: {
    color: theme.colors.gray[600],
  },
  headerSection: {
    padding: 16,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  pageTitle: {
    color: theme.colors.gray[900],
    fontWeight: '700',
  },
  invoiceBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badgeContent: {
    flex: 1,
  },
  badgeLabel: {
    color: theme.colors.white,
    opacity: 0.9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  invoiceNumber: {
    color: theme.colors.white,
    fontWeight: '700',
  },
  dateChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dateChipText: {
    color: theme.colors.white,
    fontSize: 11,
  },
  infoCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
  },
  infoContent: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    color: theme.colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    color: theme.colors.gray[900],
    fontWeight: '600',
  },
  divider: {
    backgroundColor: theme.colors.gray[200],
  },
  amountCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  amountLabel: {
    color: theme.colors.gray[600],
  },
  amountValue: {
    color: theme.colors.gray[900],
    fontWeight: '600',
  },
  totalDivider: {
    backgroundColor: theme.colors.gray[300],
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: theme.colors.gray[900],
    fontWeight: '700',
  },
  totalValue: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  itemsSection: {
    padding: 16,
    paddingTop: 0,
    gap: 16,
  },
  sectionHeader: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.gray[900],
    fontWeight: '700',
  },
  summaryChips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: theme.colors.gray[100],
  },
  itemCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  itemName: {
    flex: 1,
    color: theme.colors.gray[900],
    fontWeight: '600',
  },
  chargeChip: {
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chargeText: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  durationChip: {
    backgroundColor: theme.colors.gray[100],
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  durationText: {
    fontSize: 11,
  },
  itemDivider: {
    backgroundColor: theme.colors.gray[200],
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    flex: 1,
    minWidth: '45%',
    gap: 4,
  },
  detailLabel: {
    color: theme.colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: theme.colors.gray[900],
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    color: theme.colors.gray[500],
    textAlign: 'center',
  },
  metricValue: {
    color: theme.colors.gray[900],
    fontWeight: '700',
  },
  summarySurface: {
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  summaryTitle: {
    color: theme.colors.gray[900],
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    color: theme.colors.gray[600],
  },
  summaryValue: {
    color: theme.colors.gray[900],
    fontWeight: '600',
  },
  summaryDivider: {
    backgroundColor: theme.colors.primary + '40',
    marginVertical: 12,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTotalLabel: {
    color: theme.colors.gray[900],
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  emptySection: {
    padding: 64,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: theme.colors.gray[500],
    textAlign: 'center',
  },
});

export default InvoiceDetails;