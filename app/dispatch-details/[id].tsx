/**
 * Dispatch Details Screen - 100% SAP Fiori Compliant
 *
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * Features:
 * - Fiori Object Header pattern
 * - Tab Bar navigation (Fiori spec)
 * - Card-based content layout
 * - Semantic colors and typography
 * - Platform-specific shadows
 * - 44pt minimum touch targets
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import { isAbortError } from '@/hooks/useAbortableFetch';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { getDispatchDetails, DispatchDetailsResponse } from '@/services/dispatch-detail-service';
import { deleteDispatch } from '@/services/dispatch-service';
import { generateDispatchPDF } from '@/services/pdf-service';
import { printDispatchRange } from '@/services/print-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { Portal, Snackbar } from 'react-native-paper';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import {
  DispatchHeroHeader,
  DispatchTabNavigator,
  DispatchOverviewTab,
  DispatchItemsTab,
  DispatchGRNsTab,
  DispatchImagesTab,
  DispatchInvoicesTab,
  TabKey,
  DispatchItem,
  GRNInfo,
  DispatchImageData,
} from '@/components/dispatch-details';
import { ImageOverlay, ImageData } from '@/components/ImageOverlay';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
import { uploadDispatchImage } from '@/features/dispatch/services/dispatchImageService';

import { showAlert } from '@/utils/alert';
// ============================================================================
// STYLES (docs/STYLE_GUIDE.md §14.2 object page)
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  tabContent: {
    flex: 1,
  },
  errorContainer: {
    alignItems: 'center' as const,
    padding: space.xl,
    maxWidth: 320,
  },
  errorTitle: {
    ...typography.title3,
    marginTop: space.lg,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  errorMessage: {
    ...typography.subhead,
    marginTop: space.sm,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    marginTop: space.xl,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    gap: space.sm,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  tertiaryButton: {
    marginTop: space.sm,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
  },
  tertiaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  tertiaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingRight: space.sm,
    marginLeft: -space.sm,
  },
  backButtonText: {
    ...typography.body,
    color: t.brand.tint,
    marginLeft: -space.xs,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  snackbar: {
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
  },
  snackbarText: {
    ...typography.subhead,
    color: t.text.inverse,
  },
});

function DispatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const { canUpdate, canDelete, isCustomer } = usePermissions();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DispatchDetailsResponse['data'] | null>(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageUploadRef = useRef(false);

  // Image overlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayImages, setOverlayImages] = useState<ImageData[]>([]);
  const [overlayInitialIndex, setOverlayInitialIndex] = useState(0);

  // P3: AbortController for cancelling requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auth check
  useEffect(() => {
    if (!userProfile && (!user || !session)) {
      router.replace('/login');
    }
  }, [user, session, userProfile]);

  // Fetch dispatch details
  const fetchDispatchDetails = useCallback(async () => {
    if (!id) return;

    // Cancel any pending request before starting new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    try {
      const result = await getDispatchDetails(id);

      // Check if request was aborted before updating state
      if (controller.signal.aborted) {
        if (__DEV__) console.log('[DispatchDetailScreen] Request was aborted, skipping state update');
        return;
      }

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || result.message || "Check your connection and try again.");
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (isAbortError(err)) {
        if (__DEV__) console.log('[DispatchDetailScreen] Request was aborted');
        return;
      }
      console.error('[DispatchDetailScreen] Exception:', err);
      setError('Check your connection and try again.');
    } finally {
      // Only update loading state if not aborted
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id]);

  useEffect(() => {
    if (userProfile || (user && session)) {
      fetchDispatchDetails();
    }

    // Cleanup: abort any pending request on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id, fetchDispatchDetails, user, session, userProfile]);

  // Track focus count to skip refetch on initial mount
  const focusCountRef = useRef(0);

  // Refetch on focus (e.g., returning from edit screen)
  // Skip the first focus (initial mount) to avoid double-fetch
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      // Only refetch on subsequent focuses (not initial mount)
      if (focusCountRef.current > 1) {
        fetchDispatchDetails();
      }
    }, [fetchDispatchDetails])
  );

  // Handle GRN navigation
  const handleViewGRN = (grnId: string) => {
    router.push(`/grn-details/${grnId}`);
  };

  // Handle dispatch edit
  const handleEditDispatch = () => {
    if (!id) return;
    // Navigate to dispatch edit screen (step 1)
    router.push(`/dispatch-edit/${id}/step1`);
  };

  // Handle dispatch deletion
  const handleDeleteDispatch = async () => {
    if (!id || !userProfile?.id) return;

    try {
      const result = await deleteDispatch(id, userProfile.id);

      if (result.success) {
        showAlert(
          'Dispatch deleted',
          data?.dispatch.disp_no ? `Dispatch ${data.dispatch.disp_no} is deleted.` : 'The dispatch is deleted.',
          [
            {
              text: 'View dispatches',
              onPress: () => {
                // Navigate back to dispatch list
                router.replace('/dispatch');
              },
            },
          ]
        );
      } else {
        // Handle invoice blocking case specially
        if (result.blockingReason === 'invoices_exist') {
          showAlert(
            "Can't delete dispatch",
            `${result.error}\n\n${result.instructions || 'Delete its invoices first, then try again.'}`,
            [{ text: 'Close' }]
          );
        } else {
          showAlert("Couldn't delete dispatch", result.error || result.message || 'Try again.');
        }
      }
    } catch (error) {
      console.error('[DispatchDetailScreen] Error deleting dispatch:', error);
      showAlert("Couldn't delete dispatch", 'Check your connection and try again.');
    }
  };

  // Handle Share PDF
  const handleSharePDF = async () => {
    if (!data?.dispatch.disp_no) return;

    setIsShareLoading(true);
    try {
      if (__DEV__) console.log('[DispatchDetailScreen] Generating PDF for Dispatch:', data.dispatch.disp_no);

      // Generate PDF
      const pdfResult = await generateDispatchPDF(data.dispatch.disp_no);

      if (!pdfResult.success || !pdfResult.pdfUrl) {
        showAlert("Couldn't create the PDF", 'Check your connection and try again.');
        return;
      }

      if (__DEV__) console.log('[DispatchDetailScreen] PDF generated, downloading and sharing...');

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Dispatch_${data.dispatch.disp_no}.pdf`
      );

      if (!shareResult.success) {
        showAlert("Couldn't share the PDF", 'Try again.');
      }
    } catch (error) {
      console.error('[DispatchDetailScreen] Share PDF error:', error);
      showAlert("Couldn't share the PDF", 'Try again.');
    } finally {
      setIsShareLoading(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  // Handle image press - open overlay
  const handleImagePress = (images: DispatchImageData[], initialIndex: number) => {
    const convertedImages: ImageData[] = images.map((img) => ({
      id: img.id,
      imageUrl: img.image_url,
      fileName: img.file_name || 'image.jpg',
      fileSize: 0,
      mimeType: 'image/jpeg',
      uploadTimestamp: new Date().toISOString(),
      uploadStatus: 'completed' as const,
    }));
    setOverlayImages(convertedImages);
    setOverlayInitialIndex(initialIndex);
    setOverlayVisible(true);
  };

  // Prepare data for components
  if (!data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: !loading && !error ? 'Dispatch not found' : 'Dispatch',
            headerBackTitle: 'Back',
            headerShown: true,
            headerStyle: { backgroundColor: t.surface.header },
            headerShadowVisible: false,
            headerTintColor: t.brand.tint,
            headerTitleStyle: styles.headerTitle,
          }}
        />
        <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
        <View style={styles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={5} cardCount={3} />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
              <Text style={styles.errorTitle} accessibilityRole="header">Couldn't load the dispatch</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <Pressable
                style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
                onPress={() => {
                  setLoading(true);
                  fetchDispatchDetails();
                }}
                accessibilityRole="button"
                accessibilityLabel="Try loading the dispatch again"
              >
                <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
                <Text style={styles.retryButtonText}>Try again</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.tertiaryButton, pressed && styles.tertiaryButtonPressed]}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={styles.tertiaryButtonText}>Go back</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Icon name="truck-delivery-outline" size={iconSize.hero} color={t.icon.secondary} />
              <Text style={styles.errorTitle} accessibilityRole="header">Dispatch not found</Text>
              <Text style={styles.errorMessage}>
                It may have been deleted. Go back to the dispatch list.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.tertiaryButton, pressed && styles.tertiaryButtonPressed]}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={styles.tertiaryButtonText}>Go back</Text>
              </Pressable>
            </View>
          )}
        </View>
      </>
    );
  }

  const { dispatch } = data;

  // Prepare items for DispatchItemsTab (snake_case from backend)
  const items: DispatchItem[] = (dispatch.items || []).map((item: any) => ({
    id: item.id || item.grn_item_id,
    item_name: item.item_details?.name || item.item_name || 'Unknown Item',
    dispatch_quantity: item.disp_qty || item.dispatch_quantity || 0,
    grn_no: item.grn_details?.gr_no || item.grn_no || 'N/A',
    grn_date: item.grn_details?.date || item.grn_date || new Date().toISOString(),
    grn_id: item.grn_details?.id || item.grn_id,
    original_quantity: item.grn_item_details?.qty || item.original_qty,
    weight: item.grn_item_details?.weight || item.weight,
    package_mark: item.grn_item_details?.package_mark || item.package_mark,
  }));

  // Prepare GRNs grouped data
  const grnsMap = new Map<string, GRNInfo>();
  items.forEach((item) => {
    if (!grnsMap.has(item.grn_no)) {
      grnsMap.set(item.grn_no, {
        grn_id: item.grn_id || '',
        grn_no: item.grn_no,
        grn_date: item.grn_date,
        items: [],
      });
    }
    grnsMap.get(item.grn_no)!.items.push({
      item_name: item.item_name,
      dispatch_quantity: item.dispatch_quantity,
      original_quantity: item.original_quantity,
      weight: item.weight,
      package_mark: item.package_mark,
    });
  });
  const grns: GRNInfo[] = Array.from(grnsMap.values());

  // Statistics (snake_case from backend)
  const statistics = dispatch.statistics || {
    total_items: 0,
    total_dispatched_qty: 0,
    unique_grns: 0,
    total_invoiced_items: 0,
    total_invoice_amount: 0,
  };

  // Invoice summary (snake_case from backend)
  const invoiceSummary = dispatch.invoices_summary || {
    total_invoices: 0,
    total_amount: 0,
    invoice_numbers: [],
  };

  // A photo can be added after submit (testvm2 issue 4): the create flow's photo
  // section sits below the item list and is easy to miss.
  const handleAddImage = async () => {
    if (!id || !canUpdate || imageUploadRef.current) return;
    imageUploadRef.current = true;
    try {
      // Android's system picker grants access to the selected asset; broad
      // library permissions are deliberately blocked by our native manifest.
      if (Platform.OS !== 'android') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setSnackbarMessage('Allow photo access in Settings to add a photo.');
          setSnackbarVisible(true);
          return;
        }
      }
      const picked = await withNativeHandoff(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images' as const,
          allowsEditing: false,
          quality: 0.8,
          allowsMultipleSelection: false,
        })
      );
      if (picked.canceled || !picked.assets?.[0]) return;

      setIsUploadingImage(true);
      const result = await uploadDispatchImage(picked.assets[0], id);
      if (!result.success) {
        setSnackbarMessage("Couldn't upload the photo. Try again.");
        setSnackbarVisible(true);
        return;
      }
      await fetchDispatchDetails();
      setSnackbarMessage('Photo added.');
      setSnackbarVisible(true);
    } catch {
      setSnackbarMessage("Couldn't upload the photo. Try again.");
      setSnackbarVisible(true);
    } finally {
      setIsUploadingImage(false);
      imageUploadRef.current = false;
    }
  };

  // Prepare images for DispatchImagesTab (use processed_images with signed URLs)
  const dispatchImages: DispatchImageData[] = (dispatch.processed_images || []).map((img: any) => ({
    id: img.id,
    image_url: img.image_url,
    file_name: img.file_name,
  }));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: t.surface.header },
          headerShadowVisible: false,
          headerTintColor: t.brand.tint,
          headerTitleAlign: 'center',
          // Custom back button to ensure it always works
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="chevron-left" size={iconSize.lg + 4} color={t.brand.tint} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
              Dispatch
            </Text>
          ),
        }}
      />
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Hero Header - Quick Stats Only */}
        <DispatchHeroHeader
          disp_no={dispatch.disp_no}
          date={dispatch.disp_date}
          total_items={statistics.total_items}
          total_quantity={statistics.total_dispatched_qty}
          customer_name={dispatch.customer_details?.name}
        />

        {/* Tab Navigator */}
        <DispatchTabNavigator
          activeTab={activeTab}
          onTabChange={setActiveTab}
          item_count={items.length}
          grn_count={grns.length}
          image_count={dispatchImages.length}
          invoice_count={invoiceSummary.total_invoices}
        />

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'overview' && (
            <DispatchOverviewTab
              customer_details={dispatch.customer_details}
              supervisor_details={dispatch.supervisor_details}
              registration={dispatch.registration ?? undefined}
              note={dispatch.note ?? undefined}
              source_order_no={dispatch.source_order_no ?? undefined}
              dispatch_id={id}
              disp_no={dispatch.disp_no}
              can_edit={canUpdate}
              can_delete={canDelete}
              onEdit={handleEditDispatch}
              onDelete={handleDeleteDispatch}
              onSharePDF={handleSharePDF}
              is_share_loading={isShareLoading}
              onPrint={!isCustomer ? handlePrint : undefined}
            />
          )}

          {activeTab === 'items' && (
            <DispatchItemsTab
              items={items}
              loading={loading}
              onViewGRN={handleViewGRN}
            />
          )}

          {activeTab === 'grns' && (
            <DispatchGRNsTab
              grns={grns}
              onViewGRN={handleViewGRN}
            />
          )}

          {activeTab === 'images' && (
            <DispatchImagesTab
              images={dispatchImages}
              onImagePress={handleImagePress}
              onUpload={canUpdate ? handleAddImage : undefined}
              isUploading={isUploadingImage}
            />
          )}

          {activeTab === 'invoices' && (
            <DispatchInvoicesTab invoiceSummary={invoiceSummary} />
          )}
        </View>
      </View>

      {/* Image Overlay */}
      <ImageOverlay
        visible={overlayVisible}
        images={overlayImages}
        initialIndex={overlayInitialIndex}
        onClose={() => setOverlayVisible(false)}
      />

      {/* Print Dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={async (start, end) => {
          const result = await printDispatchRange(start, end);
          if (result.success) {
            setSnackbarMessage(
              `Print job${result.print_job?.cups_job_id ? ` ${result.print_job.cups_job_id}` : ''} sent to the printer.`
            );
          } else {
            setSnackbarMessage("Couldn't send the print job. Try again.");
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
        }}
        title="Print dispatches"
        defaultNumber={dispatch.disp_no || ''}
        label="Dispatch number"
        placeholder="For example, I4613"
      />

      {/* Snackbar for print and photo feedback (guide §13.9) */}
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={4000}
          style={styles.snackbar}
        >
          <Text style={styles.snackbarText}>{snackbarMessage}</Text>
        </Snackbar>
      </Portal>
    </>
  );
}

export default DispatchDetailScreen;
