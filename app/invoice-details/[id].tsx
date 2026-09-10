/**
 * Invoice Details Screen - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * @see design/sap-fiori-specs/
 *
 * Features:
 * - Fiori Object Header pattern
 * - Tab Bar navigation (Fiori spec)
 * - Card-based content layout
 * - Semantic colors and typography
 * - Platform-specific shadows
 * - 44pt minimum touch targets
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, Text, Pressable, Platform } from 'react-native';
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
import { useFioriColors } from '@/theme/fioriColors';

// ============================================================================
// FIORI DESIGN TOKENS - Static values (typography, spacing, dimensions)
// Colors are now dynamic via useFioriColors hook
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  typography: {
    largeTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: 0.35,
    },
    headline: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    badge: {
      fontSize: 10,
      fontWeight: '700' as const,
      letterSpacing: 0.5,
    },
  },
  dimensions: {
    cardRadius: 12,
    buttonHeight: 44,
    buttonRadius: 8,
    touchTarget: 44,
    avatarSize: 40,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
} as const;

function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const { canUpdate, canDelete, isCustomer } = usePermissions();
  const insets = useSafeAreaInsets();
  const FIORI = useFioriColors();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  }, [user, session]);

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
        Alert.alert('Error', parseErrorToFriendly(result.error || result.message, 'Invoice'));
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
      Alert.alert('Error', getUserFriendlyError('invoice', 'load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInvoiceDetails();
  }, [id]);

  // Handle GRN navigation
  const handleViewGRN = (grnId: string) => {
    router.push(`/grn-details/${grnId}`);
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

    Alert.alert(
      'Delete Invoice',
      `Are you sure you want to delete Invoice #${invoiceNumber} for ${customerName}?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const result = await deleteInvoice(invoiceId);

              if (result.success) {
                Alert.alert(
                  'Invoice Deleted',
                  result.message || 'Invoice deleted successfully',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        router.back();
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', parseErrorToFriendly(result.error, 'Invoice'));
              }
            } catch (error) {
              console.error('[InvoiceDetailScreen] Delete error:', error);
              Alert.alert('Error', getUserFriendlyError('invoice', 'delete'));
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

    if (!invoiceNo || !finYear) {
      Alert.alert('Error', 'Invalid invoice data');
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
        Alert.alert('Error', pdfResult.error || 'Failed to generate PDF');
        return;
      }

      if (__DEV__) console.log('[InvoiceDetailScreen] PDF generated, downloading and sharing...');

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Invoice_${invoiceNo}_FY${finYear}.pdf`
      );

      if (!shareResult.success) {
        Alert.alert('Error', shareResult.error || 'Failed to share PDF');
      }
    } catch (error) {
      console.error('[InvoiceDetailScreen] Share PDF error:', error);
      Alert.alert('Error', 'Failed to share PDF');
    } finally {
      setIsShareLoading(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  // ============================================================================
  // Dynamic styles based on theme
  // ============================================================================
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: FIORI.colors.backgroundGrouped,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: FIORI.colors.backgroundGrouped,
    },
    tabContent: {
      flex: 1,
    },
    errorContainer: {
      alignItems: 'center',
      padding: FIORI_STATIC.spacing.xl,
      maxWidth: 300,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: FIORI.colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: FIORI_STATIC.spacing.lg,
    },
    errorTitle: {
      ...FIORI_STATIC.typography.headline,
      color: FIORI.colors.textPrimary,
      marginBottom: FIORI_STATIC.spacing.sm,
    },
    errorMessage: {
      ...FIORI_STATIC.typography.body,
      color: FIORI.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: FIORI_STATIC.spacing.lg,
    },
    tertiaryButton: {
      height: FIORI_STATIC.dimensions.buttonHeight,
      paddingHorizontal: FIORI_STATIC.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: FIORI_STATIC.dimensions.buttonRadius,
    },
    tertiaryButtonPressed: {
      backgroundColor: FIORI.colors.tintLight,
    },
    tertiaryButtonText: {
      ...FIORI_STATIC.typography.headline,
      color: FIORI.colors.tint,
      fontWeight: '400',
    },
  }), [FIORI]);

  const dynamicHeaderStyles = useMemo(() => StyleSheet.create({
    navBar: {
      backgroundColor: FIORI.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: FIORI.colors.divider,
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingRight: 8,
      marginLeft: -4,
    },
    backIcon: {
      height: 24,
      width: 24,
    },
    backButtonText: {
      fontSize: 17,
      fontWeight: '400',
      color: FIORI.colors.tint,
      lineHeight: 24,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: FIORI.colors.textPrimary,
      letterSpacing: -0.41,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 12,
      fontWeight: '400',
      color: FIORI.colors.textSecondary,
      textAlign: 'center',
      marginTop: 2,
      maxWidth: 220,
    },
    date: {
      fontSize: 11,
      fontWeight: '500',
      color: FIORI.colors.textTertiary,
      textAlign: 'center',
      marginTop: 1,
    },
  }), [FIORI]);

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================
  if (!data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: loading ? 'Loading...' : 'Invoice Not Found',
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={dynamicStyles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={3} cardCount={3} />
          ) : (
            <View style={dynamicStyles.errorContainer}>
              <View style={dynamicStyles.emptyIconContainer}>
                <Icon
                  name="file-document-outline"
                  size={48}
                  color={FIORI.colors.textTertiary}
                />
              </View>
              <Text style={dynamicStyles.errorTitle}>Invoice Not Found</Text>
              <Text style={dynamicStyles.errorMessage}>
                The requested invoice could not be found.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  dynamicStyles.tertiaryButton,
                  pressed && dynamicStyles.tertiaryButtonPressed,
                ]}
                onPress={() => router.back()}
              >
                <Text style={dynamicStyles.tertiaryButtonText}>Go Back</Text>
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
          item_name: catalog.name || grnItem.name || 'Unknown Item',
          duration: (item.duration || 1).toString(),
          no_of_days: item.no_of_days || 0,
          charge: item.charge || 0,
          tax: item.tax || 0,
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
        item_name: item.itemName || 'Unknown Item',
        duration: item.duration,
        no_of_days: item.noOfDays,
        charge: item.charge || 0,
        tax: item.tax || 0,
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
      ? [{ id: invoice.grn.id, number: invoice.grn.number, type: 'grn' as const }]
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

  // Items summary
  const summary = itemsSummary || invoice.summary;

  // Format date for display - Fiori spec: keep it concise
  const formattedDate = new Date(invoice.invoice_date || new Date()).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: dynamicHeaderStyles.navBar,
          headerTintColor: FIORI.colors.tint,
          headerTitleAlign: 'center',
          // Custom back button to ensure it always works
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={dynamicHeaderStyles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={24} color={FIORI.colors.tint} style={dynamicHeaderStyles.backIcon} />
              <Text style={dynamicHeaderStyles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={dynamicHeaderStyles.container}>
              {/* Title - Invoice Number (Fiori: mandatory, max 24 chars with subtitle) */}
              <Text style={dynamicHeaderStyles.title} numberOfLines={1}>
                INV-{invoice.invoice_number}
              </Text>

              {/* Subtitle - Customer (Fiori: optional) */}
              {(invoice.customer?.name || invoice.invoice_customer_name) && (
                <Text style={dynamicHeaderStyles.subtitle} numberOfLines={1}>
                  {invoice.customer?.name || invoice.invoice_customer_name}
                </Text>
              )}
              <Text style={dynamicHeaderStyles.date}>
                {formattedDate}
                {(invoice.gr_no || invoice.grn?.number) && ` • GRN ${invoice.gr_no || invoice.grn?.number}`}
              </Text>
            </View>
          ),
        }}
      />

      <View style={[dynamicStyles.container, { paddingBottom: insets.bottom }]}>
        {/* Hero Header - Quick Stats Only */}
        <InvoiceHeroHeader
          invoice_number={invoice.invoice_number || 0}
          date={invoice.invoice_date || new Date().toISOString()}
          total_items={summary?.total_items || 0}
          total_amount={total}
          tax_amount={tax_amount}
          customer_name={invoice.customer?.name || invoice.invoice_customer_name}
        />

        {/* Tab Navigator */}
        <InvoiceTabNavigator
          active_tab={activeTab}
          on_tab_change={setActiveTab}
          item_count={lineItems.length}
        />

        {/* Tab Content */}
        <View style={dynamicStyles.tabContent}>
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
              total_items={summary?.total_items}
              total_dispatch_qty={itemsSummary?.totalDispatchQty}
              total_amount={itemsSummary?.totalAmount || invoice.total}
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
              `Print job submitted${result.print_job?.cups_job_id ? ` (Job #${result.print_job.cups_job_id})` : ''}`
            );
          } else {
            setSnackbarMessage(result.error || 'Failed to submit print job');
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
        }}
        title="Print Invoice"
        defaultNumber={String(invoice.invoice_number) || ''}
        label="Invoice Number"
        placeholder="e.g., 2555"
      />

      {/* Snackbar for print feedback */}
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={3000}
          style={{ backgroundColor: '#323232' }}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
    </>
  );
}

export default InvoiceDetailScreen;
