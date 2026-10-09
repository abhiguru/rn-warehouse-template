/**
 * PrintJobsBottomSheet - Print job queue management bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
 *
 * Displays and manages print jobs with real-time status updates.
 * Shows job progress, printer status, and provides job cancellation.
 *
 * Features:
 * - Real-time print job polling (10s intervals)
 * - Printer status monitoring (2s intervals when active)
 * - Tab navigation between in-progress and completed jobs
 * - Pull-to-refresh for manual updates
 * - Job cancellation with confirmation
 *
 * @example
 * ```tsx
 * const printSheetRef = useRef<PrintJobsBottomSheetRef>(null);
 * <PrintJobsBottomSheet ref={printSheetRef} onDismiss={handleDismiss} />
 * // Open: printSheetRef.current?.open()
 * ```
 */

import React, { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  BackHandler,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { getPrintJobs, cancelPrintJob, PrintJob, PrinterStatus } from '@/services/print-service';
import { usePrintJobPolling } from '@/hooks/usePrintJobPolling';

const LOAD_ERROR_MESSAGE = "Couldn't load print jobs. Pull down to try again.";
/** Snackbars hide after 4 seconds (guide §13.9). */
const SNACKBAR_DURATION_MS = 4000;

type StatusKind = 'negative' | 'critical' | 'positive' | 'informative' | 'neutral';

/** Print job status → Fiori status (guide §3.5). */
const JOB_STATUS: Record<PrintJob['status'], { kind: StatusKind; icon: string; label: string }> = {
  pending: { kind: 'neutral', icon: 'circle-outline', label: 'Pending' },
  printing: { kind: 'informative', icon: 'information', label: 'Printing' },
  completed: { kind: 'positive', icon: 'check-circle', label: 'Completed' },
  failed: { kind: 'negative', icon: 'alert-circle', label: 'Failed' },
  cancelled: { kind: 'neutral', icon: 'circle-outline', label: 'Cancelled' },
};

const PRINTER_STATUS: Record<PrinterStatus, { kind: StatusKind; icon: string; label: string }> = {
  online: { kind: 'positive', icon: 'check-circle', label: 'Online' },
  offline: { kind: 'negative', icon: 'alert-circle', label: 'Offline' },
  error: { kind: 'negative', icon: 'alert-circle', label: 'Error' },
  busy: { kind: 'informative', icon: 'information', label: 'Busy' },
};

const JOB_TYPE: Record<string, { icon: string; label: string }> = {
  grn: { icon: 'package-down', label: 'GRN' },
  dispatch: { icon: 'truck-delivery-outline', label: 'Dispatch' },
  invoice: { icon: 'file-document-outline', label: 'Invoice' },
};

const getJobType = (jobType: string) =>
  JOB_TYPE[jobType.toLowerCase()] ?? { icon: 'file-outline', label: 'Document' };

/** Relative time under 24 hours, then the date (guide §12.3). */
const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} h ago`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export interface PrintJobsBottomSheetRef {
  open: () => void;
  close: () => void;
}

interface PrintJobsBottomSheetProps {
  onDismiss?: () => void;
  documentType?: 'grn' | 'dispatch' | 'invoice' | string;
}

const PrintJobsBottomSheet: React.ForwardRefRenderFunction<
  PrintJobsBottomSheetRef,
  PrintJobsBottomSheetProps
> = ({ onDismiss }, ref) => {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'inProgress' | 'completed'>('inProgress');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Printer status state
    const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
    const [printerMessage, setPrinterMessage] = useState<string>('Checking…');

    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const insets = useSafeAreaInsets();

    // Expose open/close methods to parent
    useImperativeHandle(ref, () => ({
      open: () => {
        bottomSheetRef.current?.expand();
        setIsOpen(true);
      },
      close: () => {
        bottomSheetRef.current?.close();
        setIsOpen(false);
      },
    }));

    // Fetch and update printer status from most recent print job
    const updatePrinterStatus = useCallback(async () => {
      try {
        if (__DEV__) console.log('[PrintJobsBottomSheet] Fetching printer status from print_jobs...');

        // Query the print_jobs table for the most recent job (limit=1, no filters)
        // This gets the absolute latest job regardless of type or status
        const result = await getPrintJobs(undefined, 1, undefined);

        if (!result.success || !result.data || result.data.length === 0) {
          if (__DEV__) console.log('[PrintJobsBottomSheet] No recent print jobs found');
          setPrinterStatus('offline');
          setPrinterMessage('No recent print activity');
          return;
        }

        const recentJob = result.data[0];
        if (__DEV__) console.log('[PrintJobsBottomSheet] Most recent job:', {
          id: recentJob.id,
          printer: recentJob.printer_name,
          status: recentJob.status,
          error: recentJob.error_message,
          created: recentJob.created_at,
          completed: recentJob.completed_at
        });

        // Filter by LQ1310_RAW printer only
        if (recentJob.printer_name !== 'LQ1310_RAW') {
          if (__DEV__) console.log('[PrintJobsBottomSheet] Most recent job is not for LQ1310_RAW');
          setPrinterStatus('offline');
          setPrinterMessage('No recent print activity');
          return;
        }

        // Derive printer status from job status
        if (recentJob.status === 'completed') {
          // ✅ Printer online (last job succeeded)
          setPrinterStatus('online');
          setPrinterMessage('Printer ready');
        } else if (recentJob.status === 'failed') {
          // ❌ Printer offline (last job failed)
          setPrinterStatus('offline');
          setPrinterMessage(recentJob.error_message || 'The last print job failed');
        } else if (recentJob.status === 'printing') {
          // 🔄 Currently printing
          setPrinterStatus('busy');
          setPrinterMessage('Printing in progress');
        } else if (recentJob.status === 'pending') {
          // ⏳ Job queued
          setPrinterStatus('busy');
          setPrinterMessage('Print job queued');
        } else if (recentJob.status === 'cancelled') {
          // Last job was cancelled, assume printer is online
          setPrinterStatus('online');
          setPrinterMessage('Printer ready');
        } else {
          // Unknown status, assume online
          setPrinterStatus('online');
          setPrinterMessage('Printer ready');
        }
      } catch (error) {
        console.error('[PrintJobsBottomSheet] Error fetching printer status:', error);
        setPrinterStatus(null);
        setPrinterMessage('Status unavailable');
      }
    }, []);

    // Fetch print jobs based on active tab
    const fetchPrintJobs = useCallback(async (isRefreshing = false) => {
      if (!isRefreshing) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        // Fetch jobs based on active tab by making multiple RPC calls
        // This is more efficient for large datasets as we only fetch relevant statuses
        let allJobs: PrintJob[] = [];

        if (activeTab === 'inProgress') {
          // Fetch pending and printing jobs separately using Promise.allSettled
          // to handle partial failures gracefully
          const [pendingSettled, printingSettled] = await Promise.allSettled([
            getPrintJobs(undefined, 50, 'pending'),
            getPrintJobs(undefined, 50, 'printing'),
          ]);

          // Extract results, handling rejected promises
          const pendingResult = pendingSettled.status === 'fulfilled'
            ? pendingSettled.value
            : { success: false, error: 'Failed to fetch pending jobs' };
          const printingResult = printingSettled.status === 'fulfilled'
            ? printingSettled.value
            : { success: false, error: 'Failed to fetch printing jobs' };

          if (__DEV__) console.log('[PrintJobsBottomSheet] In Progress results:', {
            pending: {
              success: pendingResult.success,
              count: pendingResult.data?.length || 0,
              data: pendingResult.data
            },
            printing: {
              success: printingResult.success,
              count: printingResult.data?.length || 0,
              data: printingResult.data
            },
          });

          if (pendingResult.success && pendingResult.data) {
            allJobs = [...allJobs, ...pendingResult.data];
          }
          if (printingResult.success && printingResult.data) {
            allJobs = [...allJobs, ...printingResult.data];
          }

          // Check for errors
          if (!pendingResult.success || !printingResult.success) {
            const error = pendingResult.error || printingResult.error;
            console.error('[PrintJobsBottomSheet] Failed to fetch in-progress jobs:', error);
            if (!isRefreshing) {
              setSnackbarMessage(LOAD_ERROR_MESSAGE);
              setSnackbarVisible(true);
            }
          }
        } else {
          // Fetch completed, failed, and cancelled jobs separately using Promise.allSettled
          // to handle partial failures gracefully
          const [completedSettled, failedSettled, cancelledSettled] = await Promise.allSettled([
            getPrintJobs(undefined, 50, 'completed'),
            getPrintJobs(undefined, 50, 'failed'),
            getPrintJobs(undefined, 50, 'cancelled'),
          ]);

          // Extract results, handling rejected promises
          const completedResult = completedSettled.status === 'fulfilled'
            ? completedSettled.value
            : { success: false, error: 'Failed to fetch completed jobs' };
          const failedResult = failedSettled.status === 'fulfilled'
            ? failedSettled.value
            : { success: false, error: 'Failed to fetch failed jobs' };
          const cancelledResult = cancelledSettled.status === 'fulfilled'
            ? cancelledSettled.value
            : { success: false, error: 'Failed to fetch cancelled jobs' };

          if (completedResult.success && completedResult.data) {
            allJobs = [...allJobs, ...completedResult.data];
          }
          if (failedResult.success && failedResult.data) {
            allJobs = [...allJobs, ...failedResult.data];
          }
          if (cancelledResult.success && cancelledResult.data) {
            allJobs = [...allJobs, ...cancelledResult.data];
          }

          // Check for errors
          if (!completedResult.success || !failedResult.success || !cancelledResult.success) {
            const error = completedResult.error || failedResult.error || cancelledResult.error;
            console.error('[PrintJobsBottomSheet] Failed to fetch completed jobs:', error);
            if (!isRefreshing) {
              setSnackbarMessage(LOAD_ERROR_MESSAGE);
              setSnackbarVisible(true);
            }
          }
        }

        // Sort by created_at descending (most recent first)
        allJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        if (__DEV__) console.log('[PrintJobsBottomSheet] Final merged jobs:', {
          count: allJobs.length,
          jobs: allJobs
        });

        setPrintJobs(allJobs);
        // Fetch printer status separately
        updatePrinterStatus();
      } catch (error) {
        console.error('[PrintJobsBottomSheet] Error fetching jobs:', error);
        if (!isRefreshing) {
          setSnackbarMessage(LOAD_ERROR_MESSAGE);
          setSnackbarVisible(true);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [activeTab, updatePrinterStatus]);

    // Handle pull-to-refresh
    const handleRefresh = useCallback(() => {
      fetchPrintJobs(true);
      updatePrinterStatus();
    }, [fetchPrintJobs, updatePrinterStatus]);

    // Handle job cancellation
    const handleCancelJob = useCallback(async (jobId: string) => {
      try {
        const result = await cancelPrintJob(jobId);

        if (result.success) {
          setSnackbarMessage('Print job cancelled.');
          setSnackbarVisible(true);
          // Refresh the list immediately
          fetchPrintJobs();
        } else {
          setSnackbarMessage("Couldn't cancel the print job. Try again.");
          setSnackbarVisible(true);
        }
      } catch (error) {
        console.error('[PrintJobsBottomSheet] Error cancelling job:', error);
        setSnackbarMessage("Couldn't cancel the print job. Try again.");
        setSnackbarVisible(true);
      }
    }, [fetchPrintJobs]);

    // Snackbars dismiss themselves after 4 seconds
    useEffect(() => {
      if (!snackbarVisible) return undefined;
      const timer = setTimeout(() => setSnackbarVisible(false), SNACKBAR_DURATION_MS);
      return () => clearTimeout(timer);
    }, [snackbarVisible, snackbarMessage]);

    // Android back closes the sheet first
    useEffect(() => {
      if (!isOpen) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        bottomSheetRef.current?.close();
        return true;
      });
      return () => sub.remove();
    }, [isOpen]);

    // Use custom polling hook for jobs and printer status
    usePrintJobPolling({
      isActive: isOpen,
      onFetchJobs: fetchPrintJobs,
      onUpdateStatus: updatePrinterStatus,
      jobPollInterval: 10000,  // Poll jobs every 10 seconds
      statusPollInterval: 2000, // Poll status every 2 seconds
    });

    // Handle sheet changes
    const handleSheetChanges = useCallback((index: number) => {
      if (index === -1) {
        setIsOpen(false);
        onDismiss?.();
      }
    }, [onDismiss]);

    // Navigate to list screen with range filter based on job type
    const handleJobCardPress = useCallback((job: PrintJob) => {
      const rangeStart = job.document_range_start;
      const rangeEnd = job.document_range_end;

      // Determine the route based on job type
      let route = '';
      if (job.job_type.toLowerCase() === 'grn') {
        route = `/grn?rangeStart=${encodeURIComponent(rangeStart)}&rangeEnd=${encodeURIComponent(rangeEnd)}`;
      } else if (job.job_type.toLowerCase() === 'dispatch') {
        route = `/dispatch?rangeStart=${encodeURIComponent(rangeStart)}&rangeEnd=${encodeURIComponent(rangeEnd)}`;
      } else if (job.job_type.toLowerCase() === 'invoice') {
        route = `/invoices?rangeStart=${encodeURIComponent(rangeStart)}&rangeEnd=${encodeURIComponent(rangeEnd)}`;
      }

      if (route) {
        if (__DEV__) console.log('[PrintJobsBottomSheet] Navigating with range filter:', route);
        router.push(route);
      }
    }, []);

    // Status tag: icon + word on the status background (guide §13.5)
    const renderStatusTag = (kind: StatusKind, icon: string, label: string) => (
      <View
        style={[
          styles.statusTag,
          { backgroundColor: t.status[kind].background },
        ]}
      >
        <Icon name={icon} size={iconSize.sm} color={t.status[kind].text} />
        <Text
          style={[styles.statusTagText, { color: t.status[kind].text }]}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
      </View>
    );

    // Render job card
    const renderJobCard = ({ item: job }: { item: PrintJob }) => {
      const status = JOB_STATUS[job.status] ?? JOB_STATUS.pending;
      const type = getJobType(job.job_type);
      const docCount = `${job.document_count} ${job.document_count === 1 ? 'document' : 'documents'}`;

      return (
        <Pressable
          onPress={() => handleJobCardPress(job)}
          style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${type.label} print job, ${job.document_range_start} to ${job.document_range_end}, ${docCount}, ${status.label}`}
          accessibilityHint="Opens the printed documents"
        >
          {/* Header Row: Job Type + Status */}
          <View style={styles.jobHeader}>
            <View style={styles.typeTag}>
              <Icon name={type.icon} size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.typeTagText} maxFontSizeMultiplier={1.6}>
                {type.label}
              </Text>
            </View>
            {renderStatusTag(status.kind, status.icon, status.label)}
          </View>

          {/* Range */}
          <Text style={styles.rangeText}>
            {job.document_range_start} – {job.document_range_end}
          </Text>

          {/* Printer Info */}
          <View style={styles.printerInfo}>
            <Icon name="printer-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.metaText}>
              {job.printer_name} · {docCount}
            </Text>
          </View>

          {/* Footer: Timestamp + Cancel Button */}
          <View style={styles.jobFooter}>
            <Text style={styles.timestampText}>{formatTimestamp(job.created_at)}</Text>

            {job.status === 'pending' && activeTab === 'inProgress' && (
              <Pressable
                onPress={() => handleCancelJob(job.id)}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.cancelButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Cancel print job ${job.document_range_start} to ${job.document_range_end}`}
              >
                <Text style={styles.cancelButtonText}>Cancel job</Text>
              </Pressable>
            )}
          </View>

          {/* Success message strip */}
          {job.status === 'completed' && !job.error_message && (
            <View style={[styles.messageStrip, styles.messageStripPositive]}>
              <Icon name="check-circle" size={iconSize.sm} color={t.status.positive.text} />
              <Text style={[styles.messageText, { color: t.status.positive.text }]}>
                Printed
              </Text>
            </View>
          )}

          {/* Error message strip */}
          {job.error_message && (
            <View style={[styles.messageStrip, styles.messageStripNegative]}>
              <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
              <Text style={[styles.messageText, { color: t.status.negative.text }]}>
                {job.error_message}
              </Text>
            </View>
          )}
        </Pressable>
      );
    };

    // Empty state (guide §13.6)
    const renderEmpty = () => (
      <View style={styles.emptyContainer}>
        <Icon name="printer-outline" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>
          {activeTab === 'inProgress' ? 'No print jobs in progress' : 'No finished print jobs'}
        </Text>
        <Text style={styles.emptySubtext}>
          {activeTab === 'inProgress'
            ? 'Print jobs you send appear here until they finish.'
            : 'Completed, failed and cancelled print jobs appear here.'}
        </Text>
      </View>
    );

    // Loading state
    const renderLoading = () => (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel="Loading print jobs">
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading print jobs…</Text>
      </View>
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={1}
          style={[props.style, { backgroundColor: t.overlay.scrim }]}
        />
      ),
      [t]
    );

    const printer = printerStatus ? PRINTER_STATUS[printerStatus] : null;

    const renderTab = (key: 'inProgress' | 'completed', label: string) => {
      const selected = activeTab === key;
      return (
        <Pressable
          style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          onPress={() => setActiveTab(key)}
          accessibilityRole="tab"
          accessibilityLabel={`${label} print jobs`}
          accessibilityState={{ selected }}
        >
          <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
          {selected && <View style={styles.tabIndicator} />}
        </Pressable>
      );
    };

    return (
      <>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={['50%', '90%']}
          enablePanDownToClose
          onChange={handleSheetChanges}
          backdropComponent={renderBackdrop}
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <View style={styles.contentContainer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.title} accessibilityRole="header">
                  Print jobs
                </Text>
                <View
                  style={styles.jobCountBadge}
                  accessible
                  accessibilityLabel={`${printJobs.length} ${printJobs.length === 1 ? 'job' : 'jobs'}`}
                >
                  <Text style={styles.jobCountText} maxFontSizeMultiplier={1.6}>
                    {printJobs.length}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => bottomSheetRef.current?.close()}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close print jobs"
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            {/* Printer status */}
            <View
              style={styles.printerStatusContainer}
              accessible
              accessibilityLabel={`Printer ${printer ? printer.label : 'status checking'}. ${printerMessage}`}
            >
              <Text style={styles.printerStatusLabel}>Printer</Text>
              {printer
                ? renderStatusTag(printer.kind, printer.icon, printer.label)
                : renderStatusTag('neutral', 'circle-outline', 'Checking…')}
              {!!printerMessage && (
                <Text style={styles.printerStatusMessage}>{printerMessage}</Text>
              )}
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer} accessibilityRole="tablist">
              {renderTab('inProgress', 'In progress')}
              {renderTab('completed', 'Finished')}
            </View>

            {/* Job List */}
            {loading && printJobs.length === 0 ? (
              renderLoading()
            ) : (
              <BottomSheetFlatList
                data={printJobs}
                renderItem={renderJobCard}
                keyExtractor={(item: PrintJob) => item.id}
                ListEmptyComponent={renderEmpty}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    colors={[t.brand.tint]}
                    tintColor={t.brand.tint}
                    progressBackgroundColor={t.surface.card}
                  />
                }
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: space.xxl + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </BottomSheet>

        {/* Snackbar (guide §13.9) */}
        {snackbarVisible && (
          <View style={[styles.snackbar, { bottom: space.xxl + insets.bottom }]}>
            <View style={styles.snackbarContent} accessibilityLiveRegion="polite">
              <Text style={styles.snackbarText}>{snackbarMessage}</Text>
              <Pressable
                onPress={() => setSnackbarVisible(false)}
                style={styles.snackbarDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss message"
              >
                <Icon name="close" size={iconSize.md} color={t.text.inverse} />
              </Pressable>
            </View>
          </View>
        )}
      </>
    );
};

export default forwardRef(PrintJobsBottomSheet);

// ============================================================================
// Styles (docs/STYLE_GUIDE.md §13.9 bottom sheets)
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: layout.marginCompact,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
  },
  jobCountBadge: {
    borderRadius: radius.pill,
    minWidth: 18,
    minHeight: 18,
    paddingHorizontal: space.s6,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  jobCountText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    fontVariant: ['tabular-nums' as const],
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
    marginRight: -space.sm,
  },
  closeButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  printerStatusContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  printerStatusLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  printerStatusMessage: {
    ...typography.footnote,
    color: t.text.secondary,
    width: '100%' as const,
  },
  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  statusTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },
  typeTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    backgroundColor: t.status.neutral.background,
  },
  typeTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.status.neutral.text,
  },
  tabContainer: {
    flexDirection: 'row' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  tabPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  tabText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  tabTextSelected: {
    color: t.brand.tint,
  },
  tabIndicator: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: t.brand.tint,
  },
  listContent: {
    paddingTop: space.lg,
  },
  jobCard: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.divider,
  },
  jobCardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  jobHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.md,
  },
  rangeText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
    marginBottom: space.xs,
  },
  printerInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
  },
  metaText: {
    ...typography.subhead,
    color: t.text.secondary,
    flexShrink: 1,
  },
  jobFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
  },
  timestampText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  cancelButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelButtonPressed: {
    backgroundColor: t.status.negative.background,
  },
  cancelButtonText: {
    ...typography.callout,
    color: t.status.negative.text,
  },
  messageStrip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
  },
  messageStripPositive: {
    backgroundColor: t.status.positive.background,
    borderColor: t.status.positive.border,
  },
  messageStripNegative: {
    backgroundColor: t.status.negative.background,
    borderColor: t.status.negative.border,
  },
  messageText: {
    ...typography.footnote,
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.giant,
    paddingHorizontal: space.xxxl,
    gap: space.sm,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptySubtext: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.giant,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.lg,
  },
  snackbar: {
    position: 'absolute' as const,
    left: space.lg,
    right: space.lg,
    zIndex: 1000,
  },
  snackbarContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.button,
    paddingVertical: space.xs,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    backgroundColor: t.surface.inverse,
    ...t.shadow[3],
  },
  snackbarText: {
    ...typography.subhead,
    flex: 1,
    color: t.text.inverse,
  },
  snackbarDismiss: {
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
});
