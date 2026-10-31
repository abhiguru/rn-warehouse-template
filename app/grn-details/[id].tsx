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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  getGRNDetails,
  GRNDetailsResponse,
  getGRNItemDispatches,
  DispatchRecord,
  ProcessedImage,
  deleteGRN,
  settleLostDelete,
  photoPathsOf,
  removeGRNPhotoFiles,
  RpcGrnDetails,
} from '@/services/grn-detail-service';
import { generateGRNPDF } from '@/services/pdf-service';
import { printGRNRange } from '@/services/print-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { Portal, Snackbar } from 'react-native-paper';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { useBackHandler } from '@/hooks/useBackHandler';
import { LostAnswerNotice } from '@/features/grn/components/LostAnswerNotice';
import type { RpcGrnRate } from '@/types/rpc-canonical.types';
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
import { parseOrderEffects, previewDeleteGrn, withOrderEffects } from '@/services/orderEffects';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import { deleteGRNImage, uploadGRNImage } from '@/features/grn/services/imageUploadService';

import { showAlert } from '@/utils/alert';
import { formatCount } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { serverText, failureText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';
import { getGrnInvoiceRows, type Invoice } from '@/services/invoice-service';
import { invoiceTableFrom } from '@/components/common/invoiceTable';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

const log = createLogger('grn');
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
  // The Invoices tab's rows, read when the tab opens, for the summary they were read against
  // (`key`); null invoices: they could not be read, so the table falls back to the summary.
  const [grnInvoices, setGrnInvoices] = useState<{ key: string; invoices: Invoice[] | null } | null>(null);
  const invoiceRequestKey = useRef<string | null>(null);
  const { canManageOrders: isWarehouseRole, assignedCustomerIds } = useRoleBasedAccess();
  const [canEdit, setCanEdit] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const imageMutationRef = useRef(false);
  // The GRN is being deleted: a synchronous guard (a second press of Delete never starts a second delete),
  // the state for the button, and Back is ignored until the answer is in.
  const deleteRunningRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // The delete got no answer: the screen is locked while the server is asked whether the GRN is gone (owner rule
  // D22). Leaving is possible only through Back, with a warning, and stops the check.
  const [deleteChecking, setDeleteChecking] = useState(false);
  const deleteAbortRef = useRef<AbortController | null>(null);

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
    if (!id || !canEdit || imageMutationRef.current || deleteRunningRef.current) return;
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
        const failure = serverText(result.error, tr('grn.details.imageUploadFailed'), { write: true, photo: true });
        setSnackbarMessage(failure);
        setSnackbarVisible(true);
        // "No answer ... may have gone through": the photos are read again, so the tab shows what the server holds.
        if (failure === tr('errors.parsed.timeoutWritePhoto')) await fetchGRNDetails();
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
    if (imageMutationRef.current || deleteRunningRef.current) return;
    // A GRN keeps at least one GRN photo (the Edit form asks for one too): the only one is not offered for deletion.
    // The server refuses it as well; this saves the question and the trip.
    const grnPhotoCount = ((data?.grn as any)?.processed_header_images || []).length;
    if (image.category === 'header' && grnPhotoCount <= 1) {
      setSnackbarMessage(tr('grn.refusal.lastPhoto'));
      setSnackbarVisible(true);
      return;
    }
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
              setSnackbarMessage(result.partial ? serverText(result.error, tr('grn.details.imageRemoved'), { write: true, photo: true }) : tr('grn.details.imageDeleted'));
            } else {
              const failure = serverText(result.error, tr('grn.details.imageDeleteFailed'), { write: true, photo: true });
              setSnackbarMessage(failure);
              if (failure === tr('errors.parsed.timeoutWritePhoto')) await fetchGRNDetails();
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
        return;
      }

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(
          serverText(result.error || result.message, tr('grn.details.loadFailed'))
        );
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      log.error('Exception', loggableError(err));
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
            // result.error is the raw PostgREST text and stays in the log; the reader gets
            // the reason in the app's words, or the service's own message.
            failureText(result.error, result.message, tr('grn.details.dispatchHistoryFailed'));
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
      log.error('Error loading dispatches', loggableError(error));
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

  // Load again when the screen comes back into view (after an edit or an invoice change, this screen is still
  // on the stack and Back would show the figures from before). The first focus is the mount, which the effect
  // above already loads.
  const focusCountRef = useRef(0);
  // This page is the one in front: the "deleted" message's Done leaves only then (a page covered by another screen is
  // not taken off the stack from under it).
  const focusedRef = useRef(true);
  const fetchGRNDetailsRef = useRef(fetchGRNDetails);
  fetchGRNDetailsRef.current = fetchGRNDetails;
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      focusCountRef.current += 1;
      if (focusCountRef.current > 1) void fetchGRNDetailsRef.current();
      return () => {
        focusedRef.current = false;
      };
    }, [])
  );

  // While the GRN is being deleted the Back key does nothing. While the delete's answer is being checked it asks first
  // (the answer is not known yet): leaving stops the check.
  const askToLeaveDuringCheck = () => {
    showAlert(
      tr('grn.details.leaveWhileCheckingTitle'),
      tr('errors.lostAnswer.leaveWarningDelete'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('common.back'),
          style: 'destructive',
          onPress: () => {
            deleteAbortRef.current?.abort();
            router.back();
          },
        },
      ],
      { cancelable: true }
    );
  };
  useBackHandler({
    enabled: isDeleting,
    onBackPress: () => {
      if (deleteChecking) askToLeaveDuringCheck();
      return true;
    },
  });

  useEffect(() => {
    if (
      (activeTab === 'dispatches' || activeTab === 'items') &&
      data &&
      allDispatches.length === 0
    ) {
      fetchAllDispatches();
    }
  }, [activeTab, data]);

  // The summary the Invoices tab's rows must match; a refetch that changes it reads them again.
  const invoiceKey = data?.grn
    ? `${data.grn.id}|${data.grn.invoices_summary?.total_invoices ?? 0}|${data.grn.invoices_summary?.total_amount ?? 0}`
    : null;
  useEffect(() => {
    const grn = data?.grn;
    if (activeTab !== 'invoices' || !grn || !invoiceKey) return;
    if ((grn.invoices_summary?.total_invoices ?? 0) === 0) return;
    if (grnInvoices?.key === invoiceKey || invoiceRequestKey.current === invoiceKey) return;
    invoiceRequestKey.current = invoiceKey;
    getGrnInvoiceRows({
      grnId: grn.id,
      grnNo: grn.gr_no,
      customerId: grn.customer_details?.id,
      warehouseRole: isWarehouseRole,
      assignedCustomerIds,
    }).then((result) => {
      // A later summary (or another GRN) replaced this request: drop the answer.
      if (invoiceRequestKey.current !== invoiceKey) return;
      invoiceRequestKey.current = null;
      setGrnInvoices({ key: invoiceKey, invoices: result.success ? result.invoices : null });
    });
  }, [activeTab, data, invoiceKey, grnInvoices, isWarehouseRole, assignedCustomerIds]);

  // The invoice page keeps the PDF and sharing; its server call checks the role and customer.
  const handleViewInvoice = (invoiceId: string) => {
    // Not while a delete is on its way or its answer is being checked: the page must still be here for its result.
    if (deleteRunningRef.current) return;
    router.push(`/invoice-details/${invoiceId}`);
  };

  // Handle edit action
  const handleEditGRN = () => {
    if (deleteRunningRef.current) return;
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
  const askingDeleteRef = useRef(false);
  // Delete was tapped and the orders it would change are being read: the button says so (the read is capped).
  const [checkingOrders, setCheckingOrders] = useState(false);
  const handleDeleteGRN = async () => {
    // The question names the orders that lose lines (migration 128); an older server has no preview and it is asked as before.
    if (askingDeleteRef.current || deleteRunningRef.current) return;
    askingDeleteRef.current = true;
    setCheckingOrders(true);
    let orderEffects: Awaited<ReturnType<typeof previewDeleteGrn>>;
    try {
      orderEffects = id ? await previewDeleteGrn(id) : null;
    } finally {
      askingDeleteRef.current = false;
      setCheckingOrders(false);
    }
    showAlert(
      data?.grn?.gr_no
        ? tr('grn.details.deleteTitle', { number: formatIdentifier(data.grn.gr_no) })
        : tr('grn.details.deleteTitleNoNumber'),
      withOrderEffects(tr('grn.details.deleteMessage'), orderEffects),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('grn.details.deleteGrn'),
          style: 'destructive',
          onPress: async () => {
            if (!id || deleteRunningRef.current) return;
            deleteRunningRef.current = true;
            setIsDeleting(true);
            const grNumber = data?.grn?.gr_no;
            // The stored photo files of the GRN, read before it is gone: they are removed once it is deleted.
            const photoPaths = photoPathsOf(data?.grn);
            // The GRN is gone (this delete, or one whose answer was lost): its photo files go, and Done leaves for the
            // list only if this page is still the one in front.
            const showDeleted = (text: string) => {
              void removeGRNPhotoFiles(photoPaths);
              showAlert(tr('grn.details.deletedTitle'), text, [
                {
                  text: tr('common.done'),
                  onPress: () => {
                    if (focusedRef.current) router.back();
                  },
                },
              ]);
            };

            try {
              let sentAt = Date.now();
              let result = await deleteGRN(id);

              // No answer: the delete may have gone through. The screen locks, waits for the connection and for 10 s
              // to pass since the request was sent, then reads the GRN. Gone: it was deleted (the reports are told, in
              // settleLostDelete). Still there: the delete is sent once more, and its answer is handled like any other:
              // a failure of the resend that is not the server's answer (57014 behind the first delete, a failure before
              // sending) comes back as a lost answer too and starts this again; "GRN not found" is a success (it is
              // gone, as asked: `alreadyGone`), which is handled below with the photo files removed as well.
              while (result.lostAnswer) {
                const controller = new AbortController();
                deleteAbortRef.current = controller;
                setDeleteChecking(true);
                const state = await settleLostDelete(id, sentAt, controller.signal);
                deleteAbortRef.current = null;
                if (state === 'aborted') return;
                if (state === 'gone') {
                  showDeleted(grNumber ? tr('grn.details.deletedWithNumber', { number: formatIdentifier(grNumber) }) : tr('grn.details.deleted'));
                  return;
                }
                sentAt = Date.now();
                result = await deleteGRN(id, { resend: true });
              }

              if (result.success) {
                // The app's own sentence in the app's language, never the server's English.
                const message = grNumber ? tr('grn.details.deletedWithNumber', { number: formatIdentifier(grNumber) }) : tr('grn.details.deleted');
                const details = result.deleted_counts
                  ? tr('grn.details.removedCounts', {
                      items: formatCount(result.deleted_counts.grn_items, 'item'),
                      orderItems: tr('grn.details.orderItemCount', { count: result.deleted_counts.order_items ?? 0 }),
                      stockMovements: tr('grn.details.stockMovementCount', { count: result.deleted_counts.stock_movements ?? 0 }),
                      images: formatCount(result.deleted_counts.images, 'image'),
                    })
                  : '';

                showDeleted(withOrderEffects(message + details, parseOrderEffects(result.order_effects), 'doneLead'));
              } else {
                let errorMessage = serverText(result.error, tr('grn.details.deleteFailed'), { write: true, form: true, delete: true });

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
              log.error('Delete error', loggableError(error));
              showAlert(
                tr('grn.details.deleteFailedTitle'),
                tr('common.checkConnection')
              );
            } finally {
              deleteAbortRef.current = null;
              deleteRunningRef.current = false;
              setIsDeleting(false);
              setDeleteChecking(false);
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

      const pdfResult = await generateGRNPDF(data.grn.gr_no);

      if (!pdfResult.success || !pdfResult.pdfUrl) {
        showAlert(tr('grn.details.pdfCreateFailedTitle'), serverText(pdfResult.error, tr('grn.details.tryAgainInMoment')));
        return;
      }

      const shareResult = await downloadAndSharePDF(
        pdfResult.pdfUrl,
        `GRN_${data.grn.gr_no}.pdf`
      );

      if (!shareResult.success) {
        showAlert(tr('grn.details.pdfShareFailedTitle'), serverText(shareResult.error, tr('grn.details.tryAgainInMoment')));
      }
    } catch (error) {
      log.error('Share PDF error', loggableError(error));
      showAlert(tr('grn.details.pdfShareFailedTitle'), tr('common.checkConnection'));
    } finally {
      setIsShareLoading(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    // Not while a delete is on its way or its answer is being checked.
    if (deleteRunningRef.current) return;
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

  // Enrich items with dispatch summaries (all snake_case). Until the history is read there is
  // none, and the Items table counts received less in stock instead of showing 0 dispatched.
  const items: GRNItem[] = (grn.items || []).map((item) => ({
    ...item,
    dispatch_summary: (item as { dispatch_summary?: GRNItem['dispatch_summary'] }).dispatch_summary ||
      itemDispatchSummaries[item.id],
  }));

  // Statistics from backend (already snake_case via RpcGrnStatistics)
  const statistics = grn.statistics || {
    total_items: 0,
    total_qty: 0,
    total_stock: 0,
    total_dispatched: 0,
  };

  // Invoices summary (snake_case)
  const invoiceSummary = grn.invoices_summary || {
    total_invoices: 0,
    total_amount: 0,
    invoice_numbers: [],
  };
  // Rows only when they were read for this summary; otherwise the summary's numbers.
  const invoiceRows = grnInvoices?.key === invoiceKey ? grnInvoices.invoices : null;
  const invoiceTable = invoiceTableFrom(
    invoiceRows?.map((invoice) => ({
      invoice_id: invoice.invoice_id,
      invoice_no: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total: invoice.total,
    })),
    invoiceSummary
  );
  const invoicesLoading = invoiceSummary.total_invoices > 0 && grnInvoices?.key !== invoiceKey;

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
          headerTitle: () => (
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
              {tr('grn.details.titleWithNumber', { number: formatIdentifier(grn.gr_no) })}
            </Text>
          ),
          // Custom back button so Back always returns, even after a deep link. It does nothing while the GRN is being deleted.
          headerLeft: () => (
            <HeaderBackButton
              onPress={() => {
                if (deleteChecking) askToLeaveDuringCheck();
                else if (!deleteRunningRef.current) router.back();
              }}
            />
          ),
          gestureEnabled: !isDeleting,
        }}
      />

      {/* While the answer of the delete is being checked nothing on the page can be pressed (no link to another screen, no photo upload, no print). */}
      <View
        style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}
        pointerEvents={deleteChecking ? 'none' : 'auto'}
      >
        {deleteChecking ? <LostAnswerNotice message={tr('errors.lostAnswer.checkingDelete')} /> : null}

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
              rates={(grn as { rates?: RpcGrnRate[] }).rates}
              pricing_mode={grn.pricing_mode}
              grn_id={grn.id}
              gr_no={grn.gr_no}
              can_edit={canEdit}
              can_delete={canDelete}
              is_deleting={isDeleting}
              is_checking_orders={checkingOrders}
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
            <GRNInvoicesTab invoices={invoiceTable} loading={invoicesLoading} onViewInvoice={handleViewInvoice} />
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
            setSnackbarMessage(
              result.unconfirmed
                ? tr('grn.details.printUnconfirmed')
                : serverText(result.error, tr('grn.details.printFailed'))
            );
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
