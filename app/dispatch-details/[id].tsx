/**
 * Dispatch Details Screen - 100% SAP Fiori Compliant
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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Text, TouchableOpacity, Platform, Pressable } from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import { isAbortError } from '@/hooks/useAbortableFetch';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
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

function DispatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const { canUpdate, canDelete, isCustomer } = usePermissions();
  const insets = useSafeAreaInsets();
  const FIORI = useFioriColors();

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
  }, [user, session]);

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
        setError(result.error || result.message || 'Failed to load dispatch details');
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (isAbortError(err)) {
        if (__DEV__) console.log('[DispatchDetailScreen] Request was aborted');
        return;
      }
      console.error('[DispatchDetailScreen] Exception:', err);
      setError('Failed to load dispatch details. Please check your connection and try again.');
    } finally {
      // Only update loading state if not aborted
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchDispatchDetails();

    // Cleanup: abort any pending request on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id, fetchDispatchDetails]);

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
        Alert.alert(
          'Success',
          result.message || 'Dispatch deleted successfully',
          [
            {
              text: 'OK',
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
          Alert.alert(
            'Cannot Delete Dispatch',
            `${result.error}\n\n${result.instructions || 'Please delete all related invoices first.'}`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', result.error || result.message || 'Failed to delete dispatch');
        }
      }
    } catch (error) {
      console.error('[DispatchDetailScreen] Error deleting dispatch:', error);
      Alert.alert('Error', 'An unexpected error occurred while deleting the dispatch');
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
        Alert.alert('Error', pdfResult.error || 'Failed to generate PDF');
        return;
      }

      if (__DEV__) console.log('[DispatchDetailScreen] PDF generated, downloading and sharing...');

      // Download and share
      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `Dispatch_${data.dispatch.disp_no}.pdf`
      );

      if (!shareResult.success) {
        Alert.alert('Error', shareResult.error || 'Failed to share PDF');
      }
    } catch (error) {
      console.error('[DispatchDetailScreen] Share PDF error:', error);
      Alert.alert('Error', 'Failed to share PDF');
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
    errorTitle: {
      marginTop: FIORI_STATIC.spacing.md,
      fontSize: 20,
      fontWeight: '700',
      color: FIORI.colors.textPrimary,
    },
    errorMessage: {
      marginTop: FIORI_STATIC.spacing.sm,
      fontSize: 15,
      color: FIORI.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    retryButton: {
      marginTop: FIORI_STATIC.spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: FIORI.colors.tint,
      paddingHorizontal: FIORI_STATIC.spacing.xl,
      paddingVertical: FIORI_STATIC.spacing.md,
      borderRadius: FIORI_STATIC.dimensions.buttonRadius,
      gap: FIORI_STATIC.spacing.sm,
    },
    retryButtonText: {
      color: FIORI.colors.iconOnPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    backButtonStyle: {
      marginTop: FIORI_STATIC.spacing.md,
      paddingHorizontal: FIORI_STATIC.spacing.xl,
      paddingVertical: FIORI_STATIC.spacing.sm,
    },
    backButtonTextStyle: {
      color: FIORI.colors.tint,
      fontSize: 15,
      fontWeight: '500',
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
      marginLeft: -8,
    },
    backButtonText: {
      fontSize: 17,
      fontWeight: '400',
      color: FIORI.colors.tint,
      marginLeft: -4,
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

  // Prepare data for components
  if (!data) {
    return (
      <>
        <Stack.Screen
          options={{
            title: loading ? 'Loading...' : error ? 'Error' : 'Dispatch Not Found',
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={dynamicStyles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={5} cardCount={3} />
          ) : error ? (
            <View style={dynamicStyles.errorContainer}>
              <Icon name="alert-circle-outline" size={64} color={FIORI.colors.destructive} />
              <Text style={dynamicStyles.errorTitle}>Failed to Load</Text>
              <Text style={dynamicStyles.errorMessage}>{error}</Text>
              <TouchableOpacity
                style={dynamicStyles.retryButton}
                onPress={() => {
                  setLoading(true);
                  fetchDispatchDetails();
                }}
              >
                <Icon name="refresh" size={20} color={FIORI.colors.iconOnPrimary} />
                <Text style={dynamicStyles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.backButtonStyle}
                onPress={() => router.back()}
              >
                <Text style={dynamicStyles.backButtonTextStyle}>Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={dynamicStyles.errorContainer}>
              <Icon name="truck-delivery-outline" size={64} color={FIORI.colors.textTertiary} />
              <Text style={dynamicStyles.errorTitle}>Dispatch Not Found</Text>
              <Text style={dynamicStyles.errorMessage}>The requested dispatch could not be found.</Text>
              <TouchableOpacity
                style={dynamicStyles.backButtonStyle}
                onPress={() => router.back()}
              >
                <Text style={dynamicStyles.backButtonTextStyle}>Go Back</Text>
              </TouchableOpacity>
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

  // Prepare images for DispatchImagesTab (use processed_images with signed URLs)
  const dispatchImages: DispatchImageData[] = (dispatch.processed_images || []).map((img: any) => ({
    id: img.id,
    image_url: img.image_url,
    file_name: img.file_name,
  }));

  // Format date for display - Fiori spec: keep it concise
  const formattedDate = new Date(dispatch.disp_date || new Date()).toLocaleDateString('en-US', {
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
              <Icon name="chevron-left" size={28} color={FIORI.colors.tint} />
              <Text style={dynamicHeaderStyles.backButtonText}>Back</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <View style={dynamicHeaderStyles.container}>
              {/* Title - Dispatch Number (Fiori: mandatory, max 24 chars with subtitle) */}
              <Text style={dynamicHeaderStyles.title} numberOfLines={1}>
                {dispatch.disp_no}
              </Text>

              {/* Subtitle - Customer & Date (Fiori: optional) */}
              {dispatch.customer_details?.name ? (
                <Text style={dynamicHeaderStyles.subtitle} numberOfLines={1}>
                  {dispatch.customer_details.name}
                </Text>
              ) : null}
              <Text style={dynamicHeaderStyles.date}>{formattedDate}</Text>
            </View>
          ),
        }}
      />

      <View style={[dynamicStyles.container, { paddingBottom: insets.bottom }]}>
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
        <View style={dynamicStyles.tabContent}>
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
              `Print job submitted${result.print_job?.cups_job_id ? ` (Job #${result.print_job.cups_job_id})` : ''}`
            );
          } else {
            setSnackbarMessage(result.error || 'Failed to submit print job');
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
        }}
        title="Print Dispatch"
        defaultNumber={dispatch.disp_no || ''}
        label="Dispatch Number"
        placeholder="e.g., I4613"
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

export default DispatchDetailScreen;
