/**
 * Invoice details screen (style guide §14.2 object page).
 *
 * Hero header with the key facts, detail tabs (overview, line items,
 * breakdown), share and print actions, and loading and not-found states.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  getInvoiceDetails,
  getInvoiceItemsDetailed,
  InvoiceDetailsResponse,
  InvoiceItem,
  InvoiceItemDetailed,
  InvoiceItemsSummary,
  deleteInvoice,
} from '@/services/invoice-service';
import { getUserFriendlyError, parseErrorToFriendly } from '@/utils/errorHandler';
import { generateInvoicePDF } from '@/services/pdf-service';
import { printInvoiceRange } from '@/services/print-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { Portal, Snackbar } from 'react-native-paper';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import {
  InvoiceHeroHeader,
  InvoiceTabNavigator,
  InvoiceOverviewTab,
  InvoiceLineItemsTab,
  InvoiceBreakdownTab,
  TabKey,
  InvoiceLineItem,
} from '@/components/invoice-details';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { formatDate } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  centerContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  tabContent: { flex: 1 },
  errorContainer: {
    alignItems: 'center' as const,
    padding: space.xl,
    maxWidth: layout.maxFormWidth,
    gap: space.sm,
  },
  errorTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const, marginTop: space.lg },
  errorMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const, marginBottom: space.lg },
  secondaryButton: {
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: { backgroundColor: t.brand.subtle },
  secondaryButtonText: { ...typography.callout, color: t.brand.tint },
  navBar: { backgroundColor: t.surface.header },
  headerTitleContainer: { alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { ...typography.headline, color: t.text.primary, textAlign: 'center' as const },
  headerSubtitle: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'center' as const,
    maxWidth: 220,
  },
  snackbar: { backgroundColor: t.surface.inverse, borderRadius: radius.button },
});

function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const { canUpdate, canDelete, isCustomer } = usePermissions();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [data, setData] = useState<InvoiceDetailsResponse['data'] | null>(null);
  const [detailedItems, setDetailedItems] = useState<InvoiceItemDetailed[]>([]);
  const [itemsSummary, setItemsSummary] = useState<InvoiceItemsSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Auth check
  useEffect(() => {
    if (!userProfile && (!user || !session)) {
      router.replace('/login');
    }
  }, [user, session, userProfile]);

  // Fetch invoice details
  const fetchInvoiceDetails = async () => {
    if (!id) return;

    // Handle case where id might be an array (from expo-router)
    const invoiceId = Array.isArray(id) ? id[0] : id;

    try {
      // Fetch basic invoice details
      const result = await getInvoiceDetails(invoiceId);

      if (result.success && result.data) {
        setData(result.data);
      } else {
        showAlert(tr('invoice.details.loadFailedTitle'), parseErrorToFriendly(result.error || result.message, 'Invoice'));
        return;
      }

      // Fetch detailed line items (optional)
      try {
        const detailedResult = await getInvoiceItemsDetailed(invoiceId);

        if (detailedResult.success && detailedResult.data) {
          setDetailedItems(detailedResult.data.items || []);
          setItemsSummary(detailedResult.data.summary || null);
        }
      } catch (detailedError) {
        console.warn('[InvoiceDetailScreen] Failed to fetch detailed items:', detailedError);
        // Continue without detailed items
      }
    } catch (error) {
      console.error('[InvoiceDetailScreen] Exception:', error);
      showAlert(tr('invoice.details.loadFailedTitle'), getUserFriendlyError('invoice', 'load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userProfile || (user && session)) {
      fetchInvoiceDetails();
    }
  }, [id, user, session, userProfile]);

  // Handle GRN navigation
  const handleViewGRN = (grnId: string) => {
    router.push(`/grn-details/${grnId}?tab=overview`);
  };

  // Handle Dispatch navigation
  const handleViewDispatch = (dispatchNo: string) => {
    // Find dispatch by number and navigate to its ID
    // For now, we'll use the dispatch number as the route
    // This may need adjustment based on your routing structure
    router.push(`/dispatch-details/${dispatchNo}`);
  };

  // Handle Edit Invoice
  const handleEditInvoice = () => {
    if (!id) return;
    const invoiceId = Array.isArray(id) ? id[0] : id;
    router.push(`/invoice-edit/${invoiceId}`);
  };

  // Handle Delete Invoice
  const handleDeleteInvoice = async () => {
    if (!id || !data?.header) return;

    const invoiceId = Array.isArray(id) ? id[0] : id;
    const invoiceNumber = data.header.invoice_number;
    const customerName = data.header.customer?.name || data.header.invoice_customer_name;

    showAlert(
      tr('invoice.details.deleteTitle', { number: formatIdentifier(invoiceNumber) }),
      customerName
        ? tr('invoice.details.deleteMessageFor', { number: formatIdentifier(invoiceNumber), customer: customerName })
        : tr('invoice.details.deleteMessage', { number: formatIdentifier(invoiceNumber) }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('invoice.details.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const result = await deleteInvoice(invoiceId);

              if (result.success) {
                showAlert(
                  tr('invoice.details.deletedTitle', { number: formatIdentifier(invoiceNumber) }),
                  undefined,
                  [
                    {
                      text: tr('common.done'),
                      onPress: () => {
                        router.back();
                      },
                    },
                  ]
                );
              } else {
                showAlert(tr('invoice.details.deleteFailedTitle'), parseErrorToFriendly(result.error, 'Invoice'));
              }
            } catch (error) {
              console.error('[InvoiceDetailScreen] Delete error:', error);
              showAlert(tr('invoice.details.deleteFailedTitle'), getUserFriendlyError('invoice', 'delete'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Handle Share PDF
  const handleSharePDF = async () => {
    if (!data?.header) return;

    const invoiceNo = data.header.invoice_number;
    const finYear = data.header.financial_year;
    const shareError = tr('invoice.details.shareFailedMessage');

    if (!invoiceNo || !finYear) {
      showAlert(tr('invoice.details.shareFailedTitle'), tr('invoice.details.shareMissingData'));
      return;
    }

    setIsShareLoading(true);
    try {
      if (__DEV__) console.log('[InvoiceDetailScreen] Generating PDF for Invoice:', invoiceNo, 'FY:', finYear);

      // Extract year from fin_year string (e.g., '2025-26' -> 2025)
      const finYearNum = typeof finYear === 'string'
        ? parseInt(finYear.split('-')[0], 10)
        : finYear;

      // Generate PDF
      const pdfResult = await generateInvoicePDF(invoiceNo, finYearNum);

      if (!pdfResult.success || !pdfResult.pdfUrl) {
        showAlert(tr('invoice.details.shareFailedTitle'), shareError);
        return;
      }

      if (__DEV__) console.log('[InvoiceDetailScreen] PDF generated, downloading and sharing...');

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${invoiceNo}_FY${finYear}.pdf`
      );

      if (!shareResult.success) {
        showAlert(tr('invoice.details.shareFailedTitle'), shareError);
      }
    } catch (error) {
      console.error('[InvoiceDetailScreen] Share PDF error:', error);
      showAlert(tr('invoice.details.shareFailedTitle'), shareError);
    } finally {
      setIsShareLoading(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================
  if (!data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: loading ? tr('common.invoice') : tr('invoice.details.notFoundTitle'),
            headerBackTitle: tr('common.back'),
            headerShown: true,
            headerStyle: styles.navBar,
            headerTintColor: t.brand.tint,
          }}
        />
        <View style={styles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={3} cardCount={3} />
          ) : (
            <View style={styles.errorContainer}>
              <Icon
                name="file-document-outline"
                size={iconSize.hero}
                color={t.icon.secondary}
              />
              <Text style={styles.errorTitle} accessibilityRole="header">{tr('invoice.details.notFoundTitle')}</Text>
              <Text style={styles.errorMessage}>
                {tr('invoice.details.notFoundMessage')}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel={tr('common.goBack')}
              >
                <Text style={styles.secondaryButtonText}>{tr('common.goBack')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </>
    );
  }


  const { header: invoice, items: invoiceItems } = data;

  // Prepare line items for tab - use items from get_invoice_data RPC
  // Items have nested structure: catalog, grn_item, dispatch (with disp_no, disp_date)
  // Items are grouped by GRN item in InvoiceLineItemsTab
  const lineItems: InvoiceLineItem[] = (invoiceItems && invoiceItems.length > 0)
    ? invoiceItems.map((item: InvoiceItem) => {
        const catalog = item.catalog || {};
        const grnItem = item.grn_item || {};
        const dispatch = item.dispatch || {};

        return {
          id: item.item_id,
          item_name: catalog.name || grnItem.name || tr('invoice.details.unknownItem'),
          duration: (item.duration || 1).toString(),
          no_of_days: item.no_of_days || 0,
          charge: item.charge || 0,
          tax: item.tax || 0,
          // Some deployed get_invoice_data variants omit grn.id, but every
          // invoice line carries the authoritative GRN UUID on its dispatch.
          grn_id: invoice.grn?.id || dispatch.gr_id || grnItem.gr_id || '',
          gr_no: invoice.gr_no || invoice.grn?.number || '',
          // GRN Item ID for grouping
          grn_item_id: grnItem.id || '',
          // Dispatch details - now directly on dispatch object from updated RPC
          dispatch_id: dispatch.disp_id || '',
          dispatch_no: dispatch.disp_no || undefined,  // e.g., "I2660"
          dispatch_date: dispatch.disp_date,
          dispatch_qty: dispatch.quantity || 0,
          // Storage details
          package_mark: grnItem.package_mark || '',
          rack: grnItem.rack || '',
          grn_quantity: grnItem.original_quantity || 0,
          grn_date: invoice.grn?.date || '',
          weight: grnItem.weight || 0,
          packaging: catalog.packaging || grnItem.packaging || '',
          // Rates for grouping calculations
          labour_rate: item.labour_rate || 0,
          charge_per_unit: item.charge || 0,
        };
      })
    : detailedItems.map((item) => ({
        id: item.id,
        item_name: item.itemName || tr('invoice.details.unknownItem'),
        duration: item.duration,
        no_of_days: item.noOfDays,
        charge: item.charge || 0,
        tax: item.tax || 0,
        grn_id: invoice.grn?.id || '',
        gr_no: item.grNo,
        // GRN Item ID for grouping (use dispatchId as fallback for unique grouping)
        grn_item_id: item.dispatchId || item.id,
        // Dispatch details
        dispatch_id: item.dispatchId,
        dispatch_no: item.dispatchNo !== undefined ? String(item.dispatchNo) : undefined,
        dispatch_date: item.dispatchDate,
        dispatch_qty: item.dispatchQty,
        // Storage details
        package_mark: item.packageMark,
        rack: item.rack,
        grn_quantity: item.grnQuantity,
        grn_date: undefined,
        weight: item.weight,
        packaging: item.packaging,
        // Rates
        labour_rate: item.labourRate || 0,
        charge_per_unit: item.charge || 0,
      }));

  // Calculate financial summary
  const total = invoice.total || 0;
  const tax_amount = invoice.tax_amount || 0;
  const subtotal = total - tax_amount;
  const financialSummary = {
    subtotal,
    discount: invoice.discount || 0,
    labour: invoice.labour || 0,
    tax_amount,
    total,
  };

  // Prepare related documents for breakdown tab
  const relatedDocuments = [
    ...(invoice.grn?.id
      ? [{ id: invoice.grn.id, number: invoice.grn.number || invoice.gr_no || '', type: 'grn' as const }]
      : []),
    // Add dispatch documents from line items
    ...Array.from(
      new Set(
        detailedItems
          .filter((item) => item.dispatchNo)
          .map((item) => item.dispatchNo)
      )
    ).map((dispatchNo) => ({
      id: String(dispatchNo!),
      number: String(dispatchNo!),
      type: 'dispatch' as const,
    })),
  ];

  // Normalize the two supported summary shapes. The detailed-items service uses
  // camelCase while get_invoice_data returns snake_case.
  const totalItems =
    itemsSummary?.totalItems ??
    itemsSummary?.total_items ??
    invoice.summary?.total_items ??
    lineItems.length;
  const totalDispatchQty =
    itemsSummary?.totalDispatchQty ??
    itemsSummary?.total_quantity ??
    invoice.summary?.total_quantity;
  const lineItemsTotal =
    itemsSummary?.totalAmount ??
    itemsSummary?.total_amount ??
    invoice.total;

  // Date per style guide §12.3, e.g. "9 Oct 2026"
  const formattedDate = formatDate(invoice.invoice_date || new Date());


  const grnNumber = invoice.gr_no || invoice.grn?.number;
  const customerName = invoice.customer?.name || invoice.invoice_customer_name;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: styles.navBar,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          // Custom back button to ensure it always works
          headerLeft: () => (
            <HeaderBackButton />
          ),
          headerTitle: () => (
            <View
              style={styles.headerTitleContainer}
              accessible
              accessibilityRole="header"
              accessibilityLabel={tr('invoice.details.titleNumber', { number: formatIdentifier(invoice.invoice_number) })}
            >
              <Text style={styles.headerTitle} numberOfLines={1}>
                {tr('invoice.details.titleNumber', { number: formatIdentifier(invoice.invoice_number) })}
              </Text>
              {/* Two lines when the date and the GRN number do not fit on one: the number is never cut. */}
              <Text style={styles.headerSubtitle} numberOfLines={2}>
                {grnNumber ? tr('invoice.details.subtitleWithGrn', { date: formattedDate, number: formatIdentifier(grnNumber) }) : formattedDate}
              </Text>
            </View>
          ),
        }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Hero header */}
        <InvoiceHeroHeader
          invoice_number={invoice.invoice_number || 0}
          date={invoice.invoice_date || new Date().toISOString()}
          total_items={totalItems}
          total_amount={total}
          tax_amount={tax_amount}
          customer_name={customerName}
        />

        {/* Tab Navigator */}
        <InvoiceTabNavigator
          active_tab={activeTab}
          on_tab_change={setActiveTab}
          item_count={lineItems.length}
        />

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'overview' && (
            <InvoiceOverviewTab
              customer_details={invoice.customer}
              grn_details={invoice.grn ? {
                ...invoice.grn,
                number: invoice.grn.number || invoice.gr_no || '',
              } : undefined}
              financial_summary={financialSummary}
              financial_year={invoice.financial_year}
              notes={invoice.notes ?? undefined}
              invoice_number={String(invoice.invoice_number)}
              invoice_id={id}
              on_view_grn={handleViewGRN}
              on_edit_invoice={handleEditInvoice}
              on_delete_invoice={handleDeleteInvoice}
              can_edit={canUpdate}
              can_delete={canDelete}
              is_deleting={isDeleting}
              on_share_pdf={handleSharePDF}
              is_share_loading={isShareLoading}
              on_print={!isCustomer ? handlePrint : undefined}
            />
          )}

          {activeTab === 'items' && (
            <InvoiceLineItemsTab
              items={lineItems}
              loading={loading}
              total_items={totalItems}
              total_dispatch_qty={totalDispatchQty}
              total_amount={lineItemsTotal}
              on_view_grn={handleViewGRN}
              on_view_dispatch={handleViewDispatch}
            />
          )}

          {activeTab === 'breakdown' && (
            <InvoiceBreakdownTab
              breakdown={financialSummary}
              related_documents={relatedDocuments}
              on_view_grn={handleViewGRN}
              on_view_dispatch={handleViewDispatch}
            />
          )}
        </View>
      </View>

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={async (start, end) => {
          // Extract year from fin_year string (e.g., '2025-26' -> 2025)
          const finYear = invoice.financial_year;
          const finYearNum = typeof finYear === 'string'
            ? parseInt(finYear.split('-')[0], 10)
            : finYear;

          const result = await printInvoiceRange(start, end, finYearNum);
          if (result.success) {
            setSnackbarMessage(
              result.print_job?.cups_job_id
                ? tr('invoice.print.sentWithJob', { job: String(result.print_job.cups_job_id) })
                : tr('invoice.print.sent')
            );
          } else {
            setSnackbarMessage(tr('invoice.print.failed'));
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
        }}
        title={tr('invoice.print.titleRange')}
        defaultNumber={String(invoice.invoice_number) || ''}
        entity="invoice"
        placeholder={tr('invoice.print.exampleShort', { example: '2555' })}
      />

      {/* Snackbar for print feedback */}
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={4000}
          style={styles.snackbar}
          theme={{ colors: { inverseOnSurface: t.text.inverse } }}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
    </>
  );
}

export default InvoiceDetailScreen;
