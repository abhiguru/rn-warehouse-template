/**
 * Invoice details screen (style guide §14.2 object page).
 *
 * Hero header with the key facts, detail tabs (overview, line items,
 * breakdown), share and print actions, and loading and not-found states.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, Platform, BackHandler } from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  getInvoiceDetails,
  getInvoiceItemsDetailed,
  getInvoiceReasons,
  InvoiceDetailsResponse,
  InvoiceItemDetailed,
  InvoiceItemsSummary,
  InvoiceReasons,
  cancelInvoice,
  deleteInvoice,
} from '@/services/invoice-service';
import { resolveLostInvoiceDelete } from '@/features/invoice/services/invoiceDeleteCheck';
import { LostAnswerNotice } from '@/features/invoice/components/LostAnswerNotice';
import { CancelInvoiceDialog } from '@/features/invoice/components/CancelInvoiceDialog';
import { REFUSAL } from '@/utils/serverRefusal';
import { getUserFriendlyError, parseErrorToFriendly } from '@/utils/errorHandler';
import { generateInvoicePDF } from '@/services/pdf-service';
import { printInvoiceRange, printFailureMessage } from '@/services/print-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { Portal, Snackbar } from 'react-native-paper';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { useCanPrint } from '@/hooks/useCanPrint';
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
import { buildInvoiceLineItems, relatedDispatchDocuments } from '@/features/invoice/utils/invoiceLineItems';
import { t as tr, formatIdentifier } from '@/i18n';
// ============================================================================
// STYLES
// ============================================================================

/** "29 Sep 2026 · GRN WMWM8881" breaks only after "·": a date or "GRN <number>" never splits. */
const keepParts = (text: string): string =>
  text
    .split(' · ')
    .map((part) => part.replace(/ /g, '\u00A0'))
    .join('\u00A0· ');
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
  const canPrint = useCanPrint();
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
  const [isCancelling, setIsCancelling] = useState(false);
  // The cancel question is open or its request is on its way, from the first press to its result. A ref, set before
  // the next render, so a double tap cannot queue a second question, and Edit cannot open over the cancel.
  const cancelLock = useRef(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // A delete is on its way, from the first Delete press to its result. A ref, set before the next render, so a double
  // tap on Delete cannot queue a second question, and Edit or Cancel cannot open over the delete.
  const deleteLock = useRef(false);
  // The delete's answer was lost (rule W22): the page is locked while the server is asked whether the invoice is gone.
  // The controller ends the asking when the person leaves, so a delete is never sent from a page that is gone.
  const [lostDelete, setLostDelete] = useState(false);
  const deleteAbort = useRef<AbortController | null>(null);
  useEffect(() => () => deleteAbort.current?.abort(), []);
  // The one way off the page while the answer is lost: the header's Back and the Android Back key ask first, with the
  // warning that the invoice may have been deleted. Leaving stops the asking, and no delete is sent after that.
  const askLeaveLostDelete = useCallback(() => {
    showAlert(tr('invoice.steps.lostLeaveTitle'), tr('errors.lostAnswer.leaveWarningDelete'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('common.goBack'),
        style: 'destructive',
        onPress: () => {
          deleteAbort.current?.abort();
          router.back();
        },
      },
    ]);
  }, []);
  useEffect(() => {
    if (!lostDelete || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      askLeaveLostDelete();
      return true;
    });
    return () => subscription.remove();
  }, [lostDelete, askLeaveLostDelete]);
  // The server says the invoice is not there any more: it was deleted (J5).
  const [gone, setGone] = useState(false);
  // The invoice was on this page before. A first load that finds nothing is "not found", not "deleted" (J5).
  const hadData = useRef(false);
  // The first load failed for a reason other than "not there" (a lost connection, a 502): an error page with Try again.
  const [loadFailed, setLoadFailed] = useState(false);
  // Why the discount or zero charge was given, and by whom (staff and up).
  const [reasons, setReasons] = useState<InvoiceReasons | null>(null);
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
        hadData.current = true;
        setData(result.data);
        setGone(false);
        setLoadFailed(false);
      } else if (hadData.current && (result.notFound || (isCustomer && result.accessDenied))) {
        // The invoice was here and now is not: deleted since this page was loaded (on another phone, or just now), or,
        // for a customer, no longer theirs. The old figures must not stay on screen with Edit, Delete and Share: the
        // page says it was deleted instead (J5).
        setGone(true);
        setData(null);
        setDetailedItems([]);
        setItemsSummary(null);
        return;
      } else if (!hadData.current && !(result.notFound || result.accessDenied)) {
        // A first load that failed: the page says so and offers Try again. "Invoice not found" is for the server saying so.
        setLoadFailed(true);
        return;
      } else if (hadData.current) {
        // A refresh of a loaded invoice failed: the figures stay, as before.
        showAlert(tr('invoice.details.loadFailedTitle'), parseErrorToFriendly(result.error || result.message, 'Invoice'));
        return;
      } else {
        // The server says there is no such invoice (or it is not theirs): the not-found page, without an alert.
        setLoadFailed(false);
        return;
      }

      // The reasons of the discount and zero charge (staff and up; optional)
      if (!isCustomer) {
        void getInvoiceReasons(invoiceId).then((found) => setReasons(found));
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
      if (hadData.current) showAlert(tr('invoice.details.loadFailedTitle'), getUserFriendlyError('invoice', 'load'));
      else setLoadFailed(true);
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

  // Load again when the screen comes back into view (after an edit this screen is still
  // on the stack under the list, and Back would show the amounts from before the edit).
  // The first focus is the mount, which the effect above already loads.
  const focusCountRef = useRef(0);
  // Whether this screen is the one in front: a result that arrives after the person left must not navigate (I7).
  const focusedRef = useRef(true);
  const fetchInvoiceDetailsRef = useRef(fetchInvoiceDetails);
  fetchInvoiceDetailsRef.current = fetchInvoiceDetails;
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      focusCountRef.current += 1;
      if (focusCountRef.current > 1) void fetchInvoiceDetailsRef.current();
      return () => {
        focusedRef.current = false;
      };
    }, [])
  );

  // Handle GRN navigation
  const handleViewGRN = (grnId: string) => {
    router.push(`/grn-details/${grnId}?tab=overview`);
  };

  // Handle Dispatch navigation. The dispatch screen is opened by dispatch id (uuid).
  const handleViewDispatch = useCallback((dispatchId: string) => {
    router.push(`/dispatch-details/${dispatchId}`);
  }, []);

  // Handle Edit Invoice
  const handleEditInvoice = () => {
    if (!id || cancelLock.current || deleteLock.current) return;
    const invoiceId = Array.isArray(id) ? id[0] : id;
    router.push(`/invoice-edit/${invoiceId}/step1`);
  };

  // Handle Cancel Invoice: the sheet asks for the reason, then cancel_invoice is sent with the version this page read.
  const handleCancelInvoice = () => {
    if (!id || !data?.header || cancelLock.current || deleteLock.current) return;
    cancelLock.current = true;
    setCancelOpen(true);
  };

  const closeCancel = () => {
    setCancelOpen(false);
    cancelLock.current = false;
  };

  const runCancel = async (reason: string) => {
    if (!id || !data?.header || isCancelling) return;
    const invoiceId = Array.isArray(id) ? id[0] : id;
    const invoiceNumber = data.header.invoice_number;
    setIsCancelling(true);
    try {
      const result = await cancelInvoice(invoiceId, reason, data.header.updated_at);
      if (result.success) {
        closeCancel();
        await fetchInvoiceDetails();
        showAlert(tr('invoice.cancel.done', { number: formatIdentifier(invoiceNumber) }));
        return;
      }
      if (result.lostAnswer) {
        // No answer: the invoice may be cancelled. It is read again and the page shows which it is; the cancel is not
        // sent a second time (it would only be refused as already cancelled).
        closeCancel();
        await fetchInvoiceDetails();
        showAlert(tr('invoice.cancel.unconfirmedTitle'), tr('invoice.cancel.unconfirmed'));
        return;
      }
      // Changed by someone else, already cancelled or gone: the page reads the invoice again and shows what it is now.
      if (result.reason === REFUSAL.STALE_RECORD || result.reason === REFUSAL.INVOICE_CANCELLED || result.reason === 'NOT_FOUND') {
        closeCancel();
        await fetchInvoiceDetails();
      } else if (result.reason === REFUSAL.INVOICE_HAS_PAYMENTS) {
        closeCancel();
      }
      showAlert(tr('invoice.cancel.failedTitle'), result.message || tr('invoice.cancel.failed'));
    } catch (error) {
      console.error('[InvoiceDetailScreen] Cancel error:', error);
      showAlert(tr('invoice.cancel.failedTitle'), tr('invoice.cancel.failed'));
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Delete Invoice: one question, then delete_invoice is sent with the version this page read.
  const handleDeleteInvoice = async () => {
    if (!id || !data?.header) return;
    // The page's Delete invoice button pressed twice calls this twice: the second call finds the first one's question.
    if (deleteLock.current || cancelLock.current) return;
    deleteLock.current = true;

    const invoiceId = Array.isArray(id) ? id[0] : id;
    const invoiceNumber = data.header.invoice_number;
    const expectedUpdatedAt = data.header.updated_at;
    const customerName = data.header.customer?.name || data.header.invoice_customer_name;

    // The invoice is gone: told once, and Done leaves for the list only if this screen is still the one in front.
    const reportDeleted = () => {
      showAlert(tr('invoice.details.deletedTitle', { number: formatIdentifier(invoiceNumber) }), undefined, [
        {
          text: tr('common.done'),
          onPress: () => {
            if (focusedRef.current) router.back();
          },
        },
      ]);
    };

    // The question's Delete pressed twice calls this twice: only the first one deletes.
    let started = false;
    const runDelete = async () => {
      if (started) return;
      started = true;
      setIsDeleting(true);
      const controller = new AbortController();
      deleteAbort.current = controller;
      try {
        let result = await deleteInvoice(invoiceId, expectedUpdatedAt);

        // No answer came, and the request may have reached the server (W22): the page is locked, the app waits for the
        // connection and for the server, and reads the invoice. Gone: it was deleted, as the person wanted. Still
        // there: the delete is sent once more, and its answer is handled as any answer (a lost one goes round again).
        while (result.lostAnswer) {
          setLostDelete(true);
          const state = await resolveLostInvoiceDelete(invoiceId, result.sentAt ?? Date.now(), controller.signal);
          if (state === 'left') return;
          if (state === 'gone') {
            reportDeleted();
            return;
          }
          result = await deleteInvoice(invoiceId, expectedUpdatedAt, { resend: true });
          if (controller.signal.aborted) return;
        }

        // Done, or the server says the invoice is not there: someone else deleted it, and the person is told it is gone.
        if (result.success || result.notFound) {
          reportDeleted();
          return;
        }
        // Changed by someone else: the page reads the invoice again and shows what it is now.
        if (result.reason === REFUSAL.STALE_RECORD) await fetchInvoiceDetails();
        // The worded message: a refusal in the app's words, or the connection failing before the request was sent.
        showAlert(tr('invoice.details.deleteFailedTitle'), result.message || getUserFriendlyError('invoice', 'delete'));
      } catch (error) {
        console.error('[InvoiceDetailScreen] Delete error:', error);
        showAlert(tr('invoice.details.deleteFailedTitle'), getUserFriendlyError('invoice', 'delete'));
      } finally {
        deleteAbort.current = null;
        setLostDelete(false);
        setIsDeleting(false);
        deleteLock.current = false;
      }
    };

    showAlert(
      tr('invoice.details.deleteTitle', { number: formatIdentifier(invoiceNumber) }),
      customerName
        ? tr('invoice.details.deleteMessageFor', { number: formatIdentifier(invoiceNumber), customer: customerName })
        : tr('invoice.details.deleteMessage', { number: formatIdentifier(invoiceNumber) }),
      [
        // Cancel, the Android Back key and a tap outside all end here: the next Delete may start again.
        { text: tr('common.cancel'), style: 'cancel', onPress: () => { deleteLock.current = false; } },
        { text: tr('invoice.details.deleteConfirm'), style: 'destructive', onPress: runDelete },
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

  // Lines for the tab: the lines of get_invoice_data with the amounts the
  // server computed for each of them (get_invoice_items_detailed).
  // Items are grouped by GRN item in InvoiceLineItemsTab. Built once per fetch, so opening a
  // lot or an unrelated re-render does not rebuild (and redraw) every row.
  const lineItems: InvoiceLineItem[] = useMemo(
    () => (data ? buildInvoiceLineItems(data.header, data.items, detailedItems) : []),
    [data, detailedItems]
  );

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================
  if (!data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: loading ? tr('common.invoice') : loadFailed ? tr('common.invoice') : gone ? tr('invoice.details.deletedGoneTitle') : tr('invoice.details.notFoundTitle'),
            headerBackTitle: tr('common.back'),
            headerShown: true,
            headerStyle: styles.navBar,
            headerTintColor: t.brand.tint,
          }}
        />
        <View style={styles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={3} cardCount={3} />
          ) : loadFailed ? (
            <View style={styles.errorContainer} accessibilityLiveRegion="polite">
              <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
              <Text style={styles.errorTitle} accessibilityRole="header">
                {tr('invoice.edit.loadFailedTitle')}
              </Text>
              <Text style={styles.errorMessage}>{tr('common.checkConnection')}</Text>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                onPress={() => {
                  setLoadFailed(false);
                  setLoading(true);
                  void fetchInvoiceDetails();
                }}
                accessibilityRole="button"
                accessibilityLabel={tr('common.retry')}
                testID="invoice-load-retry"
              >
                <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel={tr('common.goBack')}
              >
                <Text style={styles.secondaryButtonText}>{tr('common.goBack')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Icon
                name="file-document-outline"
                size={iconSize.hero}
                color={t.icon.secondary}
              />
              <Text style={styles.errorTitle} accessibilityRole="header">
                {tr(gone ? 'invoice.details.deletedGoneTitle' : 'invoice.details.notFoundTitle')}
              </Text>
              <Text style={styles.errorMessage}>
                {tr(gone ? 'invoice.details.deletedGoneMessage' : 'invoice.details.notFoundMessage')}
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
    // The dispatches billed, opened by dispatch id (the number is only their label)
    ...relatedDispatchDocuments(lineItems),
  ];

  // Normalize the two supported summary shapes. The detailed-items service uses
  // camelCase while get_invoice_data returns snake_case.
  const totalItems =
    itemsSummary?.totalItems ??
    itemsSummary?.total_items ??
    invoice.summary?.total_items ??
    lineItems.length;

  // Date per style guide §12.3, e.g. "09/10/26"
  const formattedDate = formatDate(invoice.invoice_date || new Date());


  const grnNumber = invoice.gr_no || invoice.grn?.number;
  const customerName = invoice.customer?.name || invoice.invoice_customer_name;
  const isCancelled = !!invoice.cancelled_at;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: styles.navBar,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          // No swipe back while the answer of a delete is lost (W22): Back asks first.
          gestureEnabled: !lostDelete,
          // Custom back button to ensure it always works
          headerLeft: () => <HeaderBackButton onPress={lostDelete ? askLeaveLostDelete : undefined} />,
          headerTitle: () => (
            <View
              style={styles.headerTitleContainer}
              accessible
              accessibilityRole="header"
              accessibilityLabel={tr('invoice.details.titleNumber', { number: formatIdentifier(invoice.invoice_number) })}
            >
              <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.5}>
                {tr('invoice.details.titleNumber', { number: formatIdentifier(invoice.invoice_number) })}
              </Text>
              {/* Two lines when the date and the GRN number do not fit on one: the number is never cut. */}
              <Text style={styles.headerSubtitle} numberOfLines={2} maxFontSizeMultiplier={1.5}>
                {keepParts(grnNumber ? tr('invoice.details.subtitleWithGrn', { date: formattedDate, number: formatIdentifier(grnNumber) }) : formattedDate)}
              </Text>
            </View>
          ),
        }}
      />

      {/* The answer of a delete is lost (W22): what is being done, and nothing on the page can be pressed meanwhile. */}
      {lostDelete && <LostAnswerNotice deleting />}
      <View
        style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}
        pointerEvents={isCancelling || lostDelete ? 'none' : 'auto'}
      >
        {/* Hero header */}
        <InvoiceHeroHeader
          invoice_number={invoice.invoice_number || 0}
          date={invoice.invoice_date || new Date().toISOString()}
          total_items={totalItems}
          total_amount={total}
          tax_amount={tax_amount}
          customer_name={customerName}
          cancelled={isCancelled}
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
              reasons={!isCustomer ? reasons ?? undefined : undefined}
              notes={invoice.notes ?? undefined}
              invoice_number={String(invoice.invoice_number)}
              invoice_id={id}
              on_view_grn={handleViewGRN}
              on_edit_invoice={handleEditInvoice}
              on_cancel_invoice={handleCancelInvoice}
              can_edit={canUpdate && !isCancelled}
              can_cancel={canDelete && !isCancelled}
              is_cancelling={isCancelling}
              on_delete_invoice={handleDeleteInvoice}
              can_delete={canDelete}
              is_deleting={isDeleting}
              cancelled_at={invoice.cancelled_at}
              cancel_reason={invoice.cancel_reason}
              cancelled_by_name={!isCustomer ? invoice.cancelled_by_name : undefined}
              on_share_pdf={handleSharePDF}
              is_share_loading={isShareLoading}
              on_print={canPrint && !isCancelled ? handlePrint : undefined}
            />
          )}

          {activeTab === 'items' && (
            <InvoiceLineItemsTab
              items={lineItems}
              loading={loading}
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

      <CancelInvoiceDialog
        visible={cancelOpen}
        invoiceNumber={invoice.invoice_number}
        customerName={customerName}
        busy={isCancelling}
        onConfirm={(reason) => void runCancel(reason)}
        onCancel={closeCancel}
      />

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={async (start, end) => {
          // Extract year from fin_year string (e.g., '2025-26' -> 2025)
          const finYear = invoice.financial_year;
          const parsedYear = typeof finYear === 'string'
            ? parseInt(finYear.split('-')[0], 10)
            : finYear;
          // A year that is not a number is left out (the backend then uses the current year), never sent as null.
          const finYearNum = typeof parsedYear === 'number' && Number.isFinite(parsedYear) ? parsedYear : undefined;

          const result = await printInvoiceRange(start, end, finYearNum);
          if (result.success) {
            setSnackbarMessage(
              result.print_job?.cups_job_id
                ? tr('invoice.print.sentWithJob', { job: String(result.print_job.cups_job_id) })
                : tr('invoice.print.sent')
            );
          } else if (result.unconfirmed) {
            // The job may still print: an alert (as on the lists) and the dialog closes, so it is not sent again on a guess.
            showAlert(tr('grn.review.printUnconfirmedTitle'), printFailureMessage(result));
            setShowPrintDialog(false);
            return;
          } else {
            // Thrown, so the dialog stays open and shows the reason above its buttons.
            throw new Error(printFailureMessage(result));
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
