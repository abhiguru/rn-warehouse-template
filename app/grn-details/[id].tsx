/**
 * GRN details: the GRN object page (style guide §14.2).
 *
 * Hero header on surface.card (GRNHeroHeader), detail tabs (Overview, Items,
 * Dispatches, Images, Invoices), the image viewer, the print dialog and a
 * snackbar for feedback. Loading uses the detail skeleton; load failures and
 * a missing GRN get their own full-screen states.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { DetailSkeleton } from '@/components/skeletons';
import { isAbortError } from '@/hooks/useAbortableFetch';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
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
import { useGRNDetailTab } from '@/hooks/useGRNDetailTab';
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
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import { deleteGRNImage, uploadGRNImage } from '@/features/grn/services/imageUploadService';

import { showAlert } from '@/utils/alert';
import { formatCount } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
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
  // Full-screen error and not-found states (style guide §13.6)
  stateContainer: {
    alignItems: 'center' as const,
    paddingHorizontal: space.xxxl,
    maxWidth: 420,
    gap: space.sm,
  },
  stateTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  stateMessage: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
  },
  stateActions: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
  // Header back button
  // Custom back button (same on every headerless screen): platform glyph,
  // brand.tint, the word "Back", at least touchTarget in size (§8)
  // Native stack titles accept only font size, weight and colour.
  headerTitle: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
    color: t.text.primary,
  },
  snackbar: {
    backgroundColor: t.surface.inverse,
    borderRadius: radius.button,
    ...t.shadow[3],
  },
  snackbarText: {
    ...typography.subhead,
    color: t.text.inverse,
  },
});

function GRNDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string | string[] }>();
  const { user, session, userProfile } = useAppSelector((state) => state.auth);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // State
  const [activeTab, setActiveTab] = useGRNDetailTab(id, tab);
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
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const imageMutationRef = useRef(false);

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
  }, [user, session, userProfile]);

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

  const handleAddHeaderImage = async () => {
    if (!id || !canEdit || imageMutationRef.current) return;
    imageMutationRef.current = true;
    try {
      // Android's system picker grants access to the selected asset; broad
      // library permissions are deliberately blocked by our native manifest.
      if (Platform.OS !== 'android') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setSnackbarMessage(tr('grn.details.photoAccessNeeded'));
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
      const result = await uploadGRNImage(picked.assets[0], id, 'header');
      if (!result.success) {
        setSnackbarMessage(result.error || tr('grn.details.imageUploadFailed'));
        setSnackbarVisible(true);
        return;
      }
      await fetchGRNDetails();
      setSnackbarMessage(tr('grn.details.imageAdded'));
      setSnackbarVisible(true);
    } catch {
      setSnackbarMessage(tr('grn.details.imageUploadFailed'));
      setSnackbarVisible(true);
    } finally {
      setIsUploadingImage(false);
      imageMutationRef.current = false;
    }
  };

  const handleDeleteImage = (image: GRNImageData) => {
    if (imageMutationRef.current) return;
    imageMutationRef.current = true;
    showAlert(tr('grn.details.deleteImageTitle'), tr('grn.details.deleteImageMessage'), [
      { text: tr('common.cancel'), style: 'cancel', onPress: () => { imageMutationRef.current = false; } },
      {
        text: tr('grn.details.deleteImage'),
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeletingImage(true);
            const result = await deleteGRNImage(image.id, image.image_url);
            if (result.success) {
              await fetchGRNDetails();
              setSnackbarMessage(result.partial ? result.error || tr('grn.details.imageRemoved') : tr('grn.details.imageDeleted'));
            } else {
              setSnackbarMessage(result.error || tr('grn.details.imageDeleteFailed'));
            }
          } catch {
            setSnackbarMessage(tr('grn.details.imageDeleteFailed'));
          } finally {
            setIsDeletingImage(false);
            imageMutationRef.current = false;
            setSnackbarVisible(true);
          }
        },
      },
    ]);
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
      // Fetch current caller-authorized data; protected details are never
      // restored from a previous account's persistent cache.
      const result = await getGRNDetails(id);

      if (controller.signal.aborted) {
        if (__DEV__) console.log('[GRNDetailScreen] Request aborted, skipping state update');
        return;
      }

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(
          result.error || result.message || tr('grn.details.loadFailed')
        );
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (__DEV__) console.log('[GRNDetailScreen] Request was aborted');
        return;
      }
      console.error('[GRNDetailScreen] Exception:', err);
      setData(null);
      setError(
        tr('grn.details.loadFailedConnection')
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
    if (!data?.grn?.items) return;

    setLoadingDispatches(true);
    setDispatchError(null);
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
      let firstError: string | null = null;

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
        } else if (!firstError) {
          firstError =
            result.error || result.message || tr('grn.details.dispatchHistoryFailed');
        }
      });

      combined.sort(
        (a, b) =>
          new Date(b.disp_date).getTime() - new Date(a.disp_date).getTime()
      );

      setAllDispatches(combined);
      setDispatchesByItem(byItem);
      setItemDispatchSummaries(summaries);
      setDispatchError(firstError);
    } catch (error) {
      console.error('[GRNDetailScreen] Error loading dispatches:', error);
      setDispatchError(
        tr('grn.details.dispatchHistoryFailedConnection')
      );
    } finally {
      setLoadingDispatches(false);
    }
  };

  useEffect(() => {
    if (userProfile || (user && session)) {
      fetchGRNDetails();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [id, fetchGRNDetails, user, session, userProfile]);

  useEffect(() => {
    if (
      (activeTab === 'dispatches' || activeTab === 'items') &&
      data &&
      allDispatches.length === 0
    ) {
      fetchAllDispatches();
    }
  }, [activeTab, data]);

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
    showAlert(
      data?.grn?.gr_no
        ? tr('grn.details.deleteTitle', { number: formatIdentifier(data.grn.gr_no) })
        : tr('grn.details.deleteTitleNoNumber'),
      tr('grn.details.deleteMessage'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('grn.details.deleteGrn'),
          style: 'destructive',
          onPress: async () => {
            if (!id) return;

            try {
              const result = await deleteGRN(id);

              if (result.success) {
                const message = result.message || (data?.grn?.gr_no ? tr('grn.details.deletedWithNumber', { number: formatIdentifier(data.grn.gr_no) }) : tr('grn.details.deleted'));
                const details = result.deleted_counts
                  ? tr('grn.details.removedCounts', {
                      items: formatCount(result.deleted_counts.grn_items, 'item'),
                      orderItems: tr('grn.details.orderItemCount', { count: result.deleted_counts.order_items ?? 0 }),
                      stockMovements: tr('grn.details.stockMovementCount', { count: result.deleted_counts.stock_movements ?? 0 }),
                      images: formatCount(result.deleted_counts.images, 'image'),
                    })
                  : '';

                showAlert(tr('grn.details.deletedTitle'), message + details, [
                  { text: tr('common.done'), onPress: () => router.back() },
                ]);
              } else {
                let errorMessage = result.error || tr('grn.details.deleteFailed');

                if (result.blocking_dependencies) {
                  const deps = result.blocking_dependencies;
                  if (deps.invoiced_dispatches) {
                    errorMessage += `\n\n${tr('grn.details.dispatchItemsInvoiced', { count: deps.invoiced_dispatches })}`;
                  } else if (deps.dispatches) {
                    errorMessage += `\n\n${tr('grn.details.dispatchItemsRecorded', { count: deps.dispatches })}`;
                  }

                  if (result.instructions) {
                    errorMessage += `\n\n${result.instructions}`;
                  }
                }

                showAlert(tr('grn.details.deleteFailedTitle'), errorMessage);
              }
            } catch (error) {
              console.error('[GRNDetailScreen] Delete error:', error);
              showAlert(
                tr('grn.details.deleteFailedTitle'),
                tr('common.checkConnection')
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
        showAlert(tr('grn.details.pdfCreateFailedTitle'), pdfResult.error || tr('grn.details.tryAgainInMoment'));
        return;
      }

      if (__DEV__) console.log('[GRNDetailScreen] PDF generated, downloading and sharing...');

      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `GRN_${data.grn.gr_no}.pdf`
      );

      if (!shareResult.success) {
        showAlert(tr('grn.details.pdfShareFailedTitle'), shareResult.error || tr('grn.details.tryAgainInMoment'));
      }
    } catch (error) {
      console.error('[GRNDetailScreen] Share PDF error:', error);
      showAlert(tr('grn.details.pdfShareFailedTitle'), tr('common.checkConnection'));
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
  // Check both data and data.grn to prevent crash when grn is undefined
  if (!data || !data.grn) {
    // Determine display state - show meaningful error when grn is undefined
    const displayError = error || (!loading && !data?.grn ? tr('grn.details.unavailable') : null);

    return (
      <>
        <Stack.Screen
          options={{
            title: !loading && !displayError ? tr('grn.details.notFoundTitle') : tr('common.grn'),
            headerBackTitle: tr('common.back'),
            headerShown: true,
            headerStyle: { backgroundColor: t.surface.header },
            headerTintColor: t.brand.tint,
            headerTitleStyle: styles.headerTitle,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.centerContainer}>
          {loading ? (
            <DetailSkeleton tabCount={4} cardCount={4} />
          ) : displayError ? (
            <View style={styles.stateContainer} accessibilityLiveRegion="polite">
              <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
              <Text style={styles.stateTitle} accessibilityRole="header">
                {tr('grn.details.loadFailedTitle')}
              </Text>
              <Text style={styles.stateMessage}>{displayError}</Text>
              <View style={styles.stateActions}>
                <Button
                  type="secondary"
                  variant="tint"
                  size="fullWidth"
                  onPress={() => {
                    setLoading(true);
                    fetchGRNDetails();
                  }}
                >
                  {tr('common.retry')}
                </Button>
                <Button type="tertiary" variant="tint" size="fullWidth" onPress={() => router.back()}>
                  {tr('common.goBack')}
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} />
              <Text style={styles.stateTitle} accessibilityRole="header">
                {tr('grn.details.notFoundTitle')}
              </Text>
              <Text style={styles.stateMessage}>
                {tr('grn.details.notFoundMessage')}
              </Text>
              <View style={styles.stateActions}>
                <Button type="secondary" variant="tint" size="fullWidth" onPress={() => router.back()}>
                  {tr('common.goBack')}
                </Button>
              </View>
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

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: t.surface.header },
          headerTintColor: t.brand.tint,
          headerTitleStyle: styles.headerTitle,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          title: tr('grn.details.titleWithNumber', { number: formatIdentifier(grn.gr_no) }),
          // Custom back button so Back always returns, even after a deep link
          headerLeft: () => (
            <HeaderBackButton />
          ),
        }}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
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
        <View style={styles.tabContent}>
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
              error={dispatchError}
              onRetry={fetchAllDispatches}
            />
          )}

          {activeTab === 'images' && (
            <GRNImagesTab
              images={allImages}
              onImagePress={(images, index) => handleImagePress(images, index)}
              onUpload={canEdit ? handleAddHeaderImage : undefined}
              onDeleteImage={canEdit ? handleDeleteImage : undefined}
              isUploading={isUploadingImage}
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
              result.print_job?.cups_job_id
                ? tr('grn.details.printJobSentWithId', { jobId: String(result.print_job.cups_job_id) })
                : tr('grn.details.printJobSent')
            );
          } else {
            setSnackbarMessage(result.error || tr('grn.details.printFailed'));
          }
          setSnackbarVisible(true);
          setShowPrintDialog(false);
        }}
        title={tr('grn.details.printTitle')}
        defaultNumber={grn.gr_no || ''}
        entity="grn"
        placeholder={tr('grn.details.printPlaceholder', { example: 'Z0797' })}
      />

      {/* Snackbar for print feedback */}
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

export default GRNDetailScreen;
