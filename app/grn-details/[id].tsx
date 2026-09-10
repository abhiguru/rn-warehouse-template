/**
 * GRN Details Screen - 100% SAP Fiori Compliant
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
import {
  View,
  StyleSheet,
  Alert,
  Text,
  Pressable,
  Platform,
} from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAbortError } from '@/hooks/useAbortableFetch';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  getGRNDetails,
  GRNDetailsResponse,
  getGRNItemDispatches,
  DispatchRecord,
  ProcessedImage,
  deleteGRN,
  RpcGrnDetails,
} from '@/services/grn-detail-service';
import { generateGRNPDF } from '@/services/pdf-service';
import { printGRNRange } from '@/services/print-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { Portal, Snackbar } from 'react-native-paper';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { ImageOverlay, ImageData } from '@/components/ImageOverlay';
import {
  GRNHeroHeader,
  GRNTabNavigator,
  GRNOverviewTab,
  GRNItemsTab,
  GRNDispatchesTab,
  GRNImagesTab,
  GRNInvoicesTab,
  TabKey,
  GRNItem,
  GRNImageData,
} from '@/components/grn-details';
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

function GRNDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const FIORI = useFioriColors();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GRNDetailsResponse['data'] | null>(null);
  const [allDispatches, setAllDispatches] = useState<DispatchRecord[]>([]);
  const [dispatchesByItem, setDispatchesByItem] = useState<Record<string, DispatchRecord[]>>({});
  const [itemDispatchSummaries, setItemDispatchSummaries] = useState<
    Record<string, { total_dispatched: number; dispatch_count: number }>
  >({});
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Image overlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayImages, setOverlayImages] = useState<ImageData[]>([]);
  const [overlayInitialIndex, setOverlayInitialIndex] = useState(0);

  // AbortController for cancelling requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auth check
  useEffect(() => {
    if (!userProfile && (!user || !session)) {
      router.replace('/login');
    }
  }, [user, session]);

  // Use centralized permission system
  const { canUpdate, canDelete, isCustomer } = usePermissions();

  // Check edit permissions
  useEffect(() => {
    setCanEdit(canUpdate);
  }, [canUpdate]);

  // Convert ProcessedImage to ImageData for overlay
  const convertToImageData = (images: ProcessedImage[]): ImageData[] => {
    return images.map((img) => ({
      id: img.id,
      imageUrl: img.image_url,
      fileName: img.file_name,
      fileSize: img.file_size,
      mimeType: img.mime_type,
      uploadTimestamp: img.uploaded_at,
      uploadStatus: 'completed' as const,
    }));
  };

  // Handle image press
  const handleImagePress = (images: any[], initialIndex: number = 0) => {
    const convertedImages = convertToImageData(images);
    setOverlayImages(convertedImages);
    setOverlayInitialIndex(initialIndex);
    setOverlayVisible(true);
  };

  // Fetch GRN details
  const fetchGRNDetails = useCallback(async () => {
    if (!id) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    try {
      // Try to load cached data first (with images already processed)
      const cacheKey = `grn_detail_${id}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      let initialData = null;

      if (cachedData) {
        try {
          initialData = JSON.parse(cachedData);
          if (__DEV__) console.log('[GRNDetailScreen] Loaded cached GRN data with processed images');
        } catch (e) {
          console.warn('[GRNDetailScreen] Failed to parse cached data');
        }
      }

      // Fetch fresh data from API (images will be processed in background)
      const result = await getGRNDetails(id);

      if (controller.signal.aborted) {
        if (__DEV__) console.log('[GRNDetailScreen] Request aborted, skipping state update');
        return;
      }

      if (result.success && result.data) {
        // Use API data first (which has fresh content), will be updated with signed URLs in background
        setData(result.data);
        setError(null);
      } else {
        // Fall back to cached data if API fails
        if (initialData) {
          if (__DEV__) console.log('[GRNDetailScreen] API failed, using cached data');
          setData(initialData);
        }
        setError(
          result.error || result.message || 'Failed to load GRN details'
        );
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (__DEV__) console.log('[GRNDetailScreen] Request was aborted');
        return;
      }
      console.error('[GRNDetailScreen] Exception:', err);
      setError(
        'Failed to load GRN details. Please check your connection and try again.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id]);

  // Fetch all dispatches for all items
  const fetchAllDispatches = async () => {
    if (!data?.grn.items) return;

    setLoadingDispatches(true);
    try {
      const dispatchPromises = data.grn.items.map((item) =>
        getGRNItemDispatches(item.id)
      );

      const results = await Promise.all(dispatchPromises);

      const combined: DispatchRecord[] = [];
      const byItem: Record<string, DispatchRecord[]> = {};
      const summaries: Record<
        string,
        { total_dispatched: number; dispatch_count: number }
      > = {};

      results.forEach((result, index) => {
        const itemId = data.grn.items?.[index]?.id;

        if (result.success && result.data) {
          if (result.data.dispatches) {
            combined.push(...result.data.dispatches);
            // Group dispatches by item ID (ascending date order - oldest first)
            if (itemId) {
              byItem[itemId] = result.data.dispatches.sort(
                (a, b) =>
                  new Date(a.disp_date).getTime() - new Date(b.disp_date).getTime()
              );
            }
          }

          if (result.data.summary && itemId) {
            summaries[itemId] = {
              total_dispatched: result.data.summary.total_dispatched_qty || 0,
              dispatch_count: result.data.summary.total_dispatches || 0,
            };
          }
        }
      });

      combined.sort(
        (a, b) =>
          new Date(b.disp_date).getTime() - new Date(a.disp_date).getTime()
      );

      setAllDispatches(combined);
      setDispatchesByItem(byItem);
      setItemDispatchSummaries(summaries);
    } catch (error) {
      console.error('[GRNDetailScreen] Error loading dispatches:', error);
    } finally {
      setLoadingDispatches(false);
    }
  };

  useEffect(() => {
    fetchGRNDetails();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id, fetchGRNDetails]);

  useEffect(() => {
    if (
      (activeTab === 'dispatches' || activeTab === 'items') &&
      data &&
      allDispatches.length === 0
    ) {
      fetchAllDispatches();
    }
  }, [activeTab, data]);

  // Poll for background image processing completion
  useEffect(() => {
    if (!id || !data) return;

    const checkForUpdates = async () => {
      try {
        const cacheKey = `grn_detail_${id}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          // Check if images have been processed (have signed URLs)
          const hasImages =
            (parsed.grn?.processed_header_images?.length > 0 &&
              parsed.grn.processed_header_images[0]?.image_url?.includes('token')) ||
            (parsed.grn?.items?.some((item: any) =>
              item.processed_images?.some((img: any) => img.image_url?.includes('token'))
            ));

          if (hasImages) {
            if (__DEV__) console.log('[GRNDetailScreen] Background images processed, updating UI');
            setData(parsed);
          }
        }
      } catch (error) {
        console.warn('[GRNDetailScreen] Error checking for image updates:', error);
      }
    };

    // Check every 2 seconds for up to 30 seconds
    const interval = setInterval(checkForUpdates, 2000);
    const timeout = setTimeout(() => clearInterval(interval), 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [id, data]);

  // Handle edit action
  const handleEditGRN = () => {
    router.push(`/grn-edit/${id}/step1`);
  };

  // Handle item image press
  const handleViewItemImages = (item: GRNItem) => {
    if (item.processed_images && item.processed_images.length > 0) {
      handleImagePress(item.processed_images as ProcessedImage[], 0);
    }
  };

  // Handle item dispatches press
  const handleViewItemDispatches = () => {
    setActiveTab('dispatches');
  };

  // Handle delete GRN
  const handleDeleteGRN = () => {
    Alert.alert(
      'Delete GRN',
      'Are you sure you want to delete this GRN? This action cannot be undone.\n\nNote: GRNs with existing dispatches or invoices cannot be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;

            try {
              const result = await deleteGRN(id);

              if (result.success) {
                const message = result.message || 'GRN deleted successfully';
                const details = result.deleted_counts
                  ? `\n\nDeleted:\n• ${result.deleted_counts.grn_items} items\n• ${result.deleted_counts.order_items} order items\n• ${result.deleted_counts.stock_movements} stock movements\n• ${result.deleted_counts.images} images`
                  : '';

                Alert.alert('Success', message + details, [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } else {
                let errorMessage = result.error || 'Failed to delete GRN';

                if (result.blocking_dependencies) {
                  const deps = result.blocking_dependencies;
                  if (deps.invoiced_dispatches) {
                    errorMessage += `\n\n${deps.invoiced_dispatches} dispatch items have been invoiced.`;
                  } else if (deps.dispatches) {
                    errorMessage += `\n\n${deps.dispatches} dispatch items exist.`;
                  }

                  if (result.instructions) {
                    errorMessage += `\n\n${result.instructions}`;
                  }
                }

                Alert.alert('Cannot Delete GRN', errorMessage);
              }
            } catch (error) {
              console.error('[GRNDetailScreen] Delete error:', error);
              Alert.alert(
                'Error',
                'An unexpected error occurred while deleting the GRN'
              );
            }
          },
        },
      ]
    );
  };

  // Handle Share PDF
  const handleSharePDF = async () => {
    if (!data?.grn.gr_no) return;

    setIsShareLoading(true);
    try {
      if (__DEV__) console.log('[GRNDetailScreen] Generating PDF for GRN:', data.grn.gr_no);

      const pdfResult = await generateGRNPDF(data.grn.gr_no);

      if (!pdfResult.success || !pdfResult.pdfUrl) {
        Alert.alert('Error', pdfResult.error || 'Failed to generate PDF');
        return;
      }

      if (__DEV__) console.log('[GRNDetailScreen] PDF generated, downloading and sharing...');

      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `GRN_${data.grn.gr_no}.pdf`
      );

      if (!shareResult.success) {
        Alert.alert('Error', shareResult.error || 'Failed to share PDF');
      }
    } catch (error) {
      console.error('[GRNDetailScreen] Share PDF error:', error);
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
    errorIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: FIORI.colors.destructiveLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: FIORI_STATIC.spacing.lg,
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
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: FIORI.colors.tint,
      height: FIORI_STATIC.dimensions.buttonHeight,
      paddingHorizontal: FIORI_STATIC.spacing.lg,
      borderRadius: FIORI_STATIC.dimensions.buttonRadius,
      gap: FIORI_STATIC.spacing.sm,
      marginBottom: FIORI_STATIC.spacing.md,
    },
    primaryButtonPressed: {
      opacity: 0.8,
    },
    primaryButtonText: {
      ...FIORI_STATIC.typography.headline,
      color: FIORI.colors.iconOnPrimary,
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

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================
  // Check both data and data.grn to prevent crash when grn is undefined
  if (!data || !data.grn) {
    // Determine display state - show meaningful error when grn is undefined
    const displayError = error || (!loading && !data?.grn ? 'GRN data is unavailable' : null);

    return (
      <>
        <Stack.Screen
          options={{
            title: loading ? 'Loading...' : displayError ? 'Error' : 'GRN Not Found',
            headerBackTitle: 'Back',
            headerShown: true,
          }}
        />
        <View style={dynamicStyles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={4} cardCount={4} />
          ) : displayError ? (
            <View style={dynamicStyles.errorContainer}>
              <View style={dynamicStyles.errorIconContainer}>
                <Icon
                  name="alert-circle-outline"
                  size={48}
                  color={FIORI.colors.destructive}
                />
              </View>
              <Text style={dynamicStyles.errorTitle}>Failed to Load</Text>
              <Text style={dynamicStyles.errorMessage}>{displayError}</Text>
              <Pressable
                style={({ pressed }) => [
                  dynamicStyles.primaryButton,
                  pressed && dynamicStyles.primaryButtonPressed,
                ]}
                onPress={() => {
                  setLoading(true);
                  fetchGRNDetails();
                }}
              >
                <Icon name="refresh" size={20} color={FIORI.colors.iconOnPrimary} />
                <Text style={dynamicStyles.primaryButtonText}>Try Again</Text>
              </Pressable>
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
          ) : (
            <View style={dynamicStyles.errorContainer}>
              <View style={dynamicStyles.emptyIconContainer}>
                <Icon
                  name="file-document-outline"
                  size={48}
                  color={FIORI.colors.textTertiary}
                />
              </View>
              <Text style={dynamicStyles.errorTitle}>GRN Not Found</Text>
              <Text style={dynamicStyles.errorMessage}>
                The requested GRN could not be found.
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

  // Safe to destructure - we know data.grn exists (typed as RpcGrnDetails - snake_case)
  const { grn } = data;

  // Enrich items with dispatch summaries (all snake_case)
  const items: GRNItem[] = (grn.items || []).map((item) => ({
    ...item,
    dispatch_summary: (item as any).dispatch_summary ||
      itemDispatchSummaries[item.id] || {
        total_dispatched: 0,
        dispatch_count: 0,
      },
  }));

  // Statistics from backend (already snake_case via RpcGrnStatistics)
  const statistics = grn.statistics || {
    total_items: 0,
    total_qty: 0,
    total_stock: 0,
    total_dispatched: 0,
    total_weight: 0,
  };

  // Invoices summary (snake_case)
  const invoiceSummary = grn.invoices_summary || {
    total_invoices: 0,
    total_amount: 0,
    invoice_numbers: [],
  };

  // Dispatches summary (snake_case)
  const dispatchSummary = grn.dispatches_summary || {
    total_dispatches: 0,
    dispatch_numbers: [],
  };

  // Prepare all images for images tab (using processed_images with signed URLs)
  const allImages: GRNImageData[] = [
    ...((grn as any).processed_header_images || []).map((img: ProcessedImage) => ({
      id: img.id,
      image_url: img.image_url,
      file_name: img.file_name,
      category: 'header' as const,
    })),
    ...items.flatMap((item) =>
      ((item as any).processed_images || []).map((img: ProcessedImage) => ({
        id: img.id,
        image_url: img.image_url,
        file_name: img.file_name,
        category: 'item' as const,
        item_name: item.item_name,
      }))
    ),
  ];

  // Format date for display - Fiori spec: keep it concise
  const formattedDate = new Date(grn.date || new Date()).toLocaleDateString('en-US', {
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
              {/* Title - GRN Number (Fiori: mandatory, max 24 chars with subtitle) */}
              <Text style={dynamicHeaderStyles.title} numberOfLines={1}>
                {grn.gr_no}
              </Text>

              {/* Subtitle - Customer & Date (Fiori: optional) */}
              {grn.customer_details?.name ? (
                <Text style={dynamicHeaderStyles.subtitle} numberOfLines={1}>
                  {grn.customer_details.name}
                </Text>
              ) : null}
              <Text style={dynamicHeaderStyles.date}>{formattedDate}</Text>
            </View>
          ),
        }}
      />

      <View style={[dynamicStyles.container, { paddingBottom: insets.bottom }]}>
        {/* Hero Header - Quick Stats */}
        <GRNHeroHeader
          gr_no={grn.gr_no}
          date={grn.date}
          total_qty={statistics.total_qty}
          total_stock={statistics.total_stock}
          total_dispatched={statistics.total_dispatched}
          customer_name={grn.customer_details?.name}
        />

        {/* Tab Navigator */}
        <GRNTabNavigator
          activeTab={activeTab}
          onTabChange={setActiveTab}
          item_count={items.length}
          dispatch_count={dispatchSummary.total_dispatches}
          image_count={allImages.length}
          invoice_count={invoiceSummary.total_invoices}
        />

        {/* Tab Content */}
        <View style={dynamicStyles.tabContent}>
          {activeTab === 'overview' && (
            <GRNOverviewTab
              customer_details={grn.customer_details}
              supervisor_details={grn.supervisor_details}
              registration={grn.registration}
              note={grn.note}
              pricing_mode={grn.pricing_mode}
              grn_id={grn.id}
              gr_no={grn.gr_no}
              can_edit={canEdit}
              can_delete={canDelete}
              onEdit={handleEditGRN}
              onDelete={handleDeleteGRN}
              onSharePDF={handleSharePDF}
              is_share_loading={isShareLoading}
              onPrint={!isCustomer ? handlePrint : undefined}
            />
          )}

          {activeTab === 'items' && (
            <GRNItemsTab
              items={items}
              loading={loading}
              onViewItemImages={handleViewItemImages}
              onViewItemDispatches={handleViewItemDispatches}
            />
          )}

          {activeTab === 'dispatches' && (
            <GRNDispatchesTab
              items={items}
              dispatchesByItem={dispatchesByItem}
              loading={loadingDispatches}
            />
          )}

          {activeTab === 'images' && (
            <GRNImagesTab
              images={allImages}
              onImagePress={(images, index) => handleImagePress(images, index)}
            />
          )}

          {activeTab === 'invoices' && (
            <GRNInvoicesTab invoiceSummary={invoiceSummary} />
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
          const result = await printGRNRange(start, end);
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
        title="Print GRN"
        defaultNumber={grn.gr_no || ''}
        label="GRN Number"
        placeholder="e.g., Z0797"
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

export default GRNDetailScreen;
