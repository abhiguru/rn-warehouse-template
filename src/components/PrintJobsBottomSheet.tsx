/**
 * PrintJobsBottomSheet - Print job queue management bottom sheet
 *
 * SAP Fiori Design System - Bottom Sheet Component
 * Spec: design/sap-fiori-specs/07-bottom-sheet.md
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

import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useListColors } from '@/hooks/useListColors';
import { getPrintJobs, cancelPrintJob, PrintJob, PrinterStatus } from '@/services/print-service';
import { usePrintJobPolling } from '@/hooks/usePrintJobPolling';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/07-bottom-sheet.md
// ============================================================================
const FIORI = {
  // Bottom Sheet dimensions
  bottomSheet: {
    cornerRadius: 16,
    handleWidth: 36,
    handleHeight: 5,
    handleTopMargin: 8,
    handleColor: '#C6C6C8',
    backdropOpacity: 0.4,
  },
  // Header
  header: {
    height: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Chips (per 09-chip.md)
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  // Tabs (per 15-segmented-control.md)
  tab: {
    minHeight: 44,
    fontSize: 15,
    fontWeight: '600' as const,
    indicatorHeight: 3,
  },
  // Cards
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  // Touch targets
  touch: {
    minHeight: 44,
  },
  // Typography
  typography: {
    title: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    badge: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  },
  // Colors
  colors: {
    background: '#FFFFFF',
    divider: '#E5E5E5',
    backdrop: 'rgba(0, 0, 0, 0.4)',
  },
} as const;

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
    const [printerMessage, setPrinterMessage] = useState<string>('Checking...');

    // Theme colors for dark mode support
    const colors = useListColors();

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
          setPrinterMessage(recentJob.error_message || 'Printer error');
        } else if (recentJob.status === 'printing') {
          // 🔄 Currently printing
          setPrinterStatus('busy');
          setPrinterMessage('Printing in progress...');
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
              setSnackbarMessage(error || 'Failed to load print jobs');
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
              setSnackbarMessage(error || 'Failed to load print jobs');
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
          setSnackbarMessage('An error occurred while loading print jobs');
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
          setSnackbarMessage(result.message || 'Print job cancelled successfully');
          setSnackbarVisible(true);
          // Refresh the list immediately
          fetchPrintJobs();
        } else {
          setSnackbarMessage(result.error || 'Failed to cancel print job');
          setSnackbarVisible(true);
        }
      } catch (error) {
        console.error('[PrintJobsBottomSheet] Error cancelling job:', error);
        setSnackbarMessage('An error occurred while cancelling the job');
        setSnackbarVisible(true);
      }
    }, [fetchPrintJobs]);

    // Get status color and background (Fiori semantic colors)
    const getStatusColors = useCallback((status: string) => {
      switch (status) {
        case 'completed':
          return {
            background: colors.success,
            text: '#FFFFFF',
            lightBg: colors.successLight,
          };
        case 'pending':
          return {
            background: colors.warning,
            text: '#FFFFFF',
            lightBg: colors.warningLight,
          };
        case 'printing':
          return {
            background: colors.primary,
            text: '#FFFFFF',
            lightBg: colors.primaryLight,
          };
        case 'failed':
          return {
            background: colors.error,
            text: '#FFFFFF',
            lightBg: colors.errorLight,
          };
        case 'cancelled':
          return {
            background: colors.gray400,
            text: '#FFFFFF',
            lightBg: colors.gray100,
          };
        default:
          return {
            background: colors.gray400,
            text: '#FFFFFF',
            lightBg: colors.gray100,
          };
      }
    }, [colors]);

    // Get job type icon (Ionicons)
    const getJobTypeIcon = (jobType: string): keyof typeof Ionicons.glyphMap => {
      switch (jobType) {
        case 'grn':
          return 'cube-outline';
        case 'dispatch':
          return 'car-outline';
        case 'invoice':
          return 'receipt-outline';
        default:
          return 'document-outline';
      }
    };

    // Format timestamp (relative time)
    const formatTimestamp = (timestamp: string) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    };

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

    // Render job card
    const renderJobCard = useCallback(({ item: job }: { item: PrintJob }) => {
      const statusColors = getStatusColors(job.status);

      return (
        <Pressable
          onPress={() => handleJobCardPress(job)}
          style={({ pressed }) => [
            {
              backgroundColor: colors.cellBackground,
              borderRadius: FIORI.card.borderRadius,
              padding: FIORI.card.padding,
              marginBottom: FIORI.card.marginBottom,
              borderWidth: 1,
              borderColor: colors.cellDivider,
            },
            pressed && { backgroundColor: colors.gray100 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${job.job_type.toUpperCase()} print job, ${job.document_range_start} to ${job.document_range_end}, status ${job.status}`}
          accessibilityHint="Double tap to view documents"
        >
          {/* Header Row: Job Type + Status */}
          <View style={styles.jobHeader}>
            {/* Type Chip */}
            <View style={[styles.typeChip, { backgroundColor: colors.gray100 }]}>
              <Ionicons
                name={getJobTypeIcon(job.job_type)}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.typeChipText, { color: colors.textSecondary }]}>
                {job.job_type.toUpperCase()}
              </Text>
            </View>

            {/* Status Chip */}
            <View style={[styles.statusChip, { backgroundColor: statusColors.background }]}>
              <Text style={styles.statusChipText}>
                {job.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Range */}
          <Text style={[styles.rangeText, { color: colors.textPrimary }]}>
            {job.document_range_start} - {job.document_range_end}
          </Text>

          {/* Printer Info */}
          <View style={styles.printerInfo}>
            <Ionicons name="print-outline" size={14} color={colors.gray600} />
            <Text style={[styles.printerText, { color: colors.textSecondary }]}>{job.printer_name}</Text>
            <Text style={[styles.printerSeparator, { color: colors.gray400 }]}>•</Text>
            <Text style={[styles.documentCountText, { color: colors.textSecondary }]}>
              {job.document_count} doc{job.document_count !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Footer: Timestamp + Cancel Button */}
          <View style={styles.jobFooter}>
            <Text style={[styles.timestampText, { color: colors.textTertiary }]}>
              {formatTimestamp(job.created_at)}
            </Text>

            {job.status === 'pending' && activeTab === 'inProgress' && (
              <Pressable
                onPress={() => handleCancelJob(job.id)}
                style={({ pressed }) => [
                  styles.cancelButton,
                  { borderColor: colors.error },
                  pressed && { backgroundColor: colors.errorLight },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel print job"
              >
                <Text style={[styles.cancelButtonText, { color: colors.error }]}>Cancel</Text>
              </Pressable>
            )}
          </View>

          {/* Success Message (if completed successfully) */}
          {job.status === 'completed' && !job.error_message && (
            <View style={[styles.successContainer, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.successText, { color: colors.success }]}>Printed successfully</Text>
            </View>
          )}

          {/* Error Message (if failed) */}
          {job.error_message && (
            <View style={[styles.errorContainer, { backgroundColor: colors.errorLight, borderColor: colors.error }]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{job.error_message}</Text>
            </View>
          )}
        </Pressable>
      );
    }, [handleCancelJob, activeTab, handleJobCardPress, getStatusColors, colors]);

    // Empty state (Fiori Empty State pattern)
    const renderEmpty = useCallback(() => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: colors.gray50 }]}>
          <Ionicons name="print-outline" size={64} color={colors.gray400} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          {activeTab === 'inProgress' ? 'No Jobs In Progress' : 'No Completed Jobs'}
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
          {activeTab === 'inProgress'
            ? 'Your active print jobs will appear here'
            : 'Your completed print jobs will appear here'}
        </Text>
      </View>
    ), [activeTab, colors]);

    // Loading state
    const renderLoading = useCallback(() => (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading print jobs...</Text>
      </View>
    ), [colors]);

    return (
      <>
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={['50%', '90%']}
          enablePanDownToClose
          onChange={handleSheetChanges}
          backgroundStyle={{ backgroundColor: colors.cellBackground }}
          handleIndicatorStyle={{ backgroundColor: colors.gray300, width: 36 }}
        >
          <View style={styles.contentContainer}>
            {/* Header - Fiori 56pt height */}
            <View style={[styles.header, { borderBottomColor: colors.cellDivider }]}>
              <View style={styles.headerLeft}>
                <Ionicons name="print" size={24} color={colors.primary} />
                <Text style={[styles.title, { color: colors.textPrimary }]}>Print Jobs</Text>
              </View>
              <View style={[styles.jobCountBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.jobCountText}>
                  {printJobs.length}
                </Text>
              </View>
            </View>

            {/* Printer Status Chip - Fiori style */}
            <View style={[styles.printerStatusContainer, { borderBottomColor: colors.cellDivider }]}>
              <View style={[
                styles.printerStatusChip,
                printerStatus === 'online' && { backgroundColor: colors.successLight },
                printerStatus === 'offline' && { backgroundColor: colors.errorLight },
                printerStatus === 'error' && { backgroundColor: colors.errorLight },
                printerStatus === 'busy' && { backgroundColor: colors.warningLight },
                !printerStatus && { backgroundColor: colors.gray100 },
              ]}>
                <View style={[
                  styles.statusDot,
                  printerStatus === 'online' && { backgroundColor: colors.success },
                  printerStatus === 'offline' && { backgroundColor: colors.error },
                  printerStatus === 'error' && { backgroundColor: colors.error },
                  printerStatus === 'busy' && { backgroundColor: colors.warning },
                  !printerStatus && { backgroundColor: colors.gray400 },
                ]} />
                <Text style={[styles.printerStatusText, { color: colors.textPrimary }]}>
                  {printerStatus ? printerStatus.charAt(0).toUpperCase() + printerStatus.slice(1) : 'Checking...'}
                </Text>
              </View>
              {printerMessage && (
                <Text style={[styles.printerStatusMessage, { color: colors.textSecondary }]}>{printerMessage}</Text>
              )}
            </View>

            {/* Tabs - Fiori Segmented Control style */}
            <View style={[styles.tabContainer, { borderBottomColor: colors.cellDivider }]} accessibilityRole="tablist">
              <Pressable
                style={[
                  styles.tab,
                  activeTab === 'inProgress' && styles.activeTab,
                ]}
                onPress={() => setActiveTab('inProgress')}
                accessibilityRole="tab"
                accessibilityLabel="In Progress print jobs"
                accessibilityState={{ selected: activeTab === 'inProgress' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: colors.textSecondary },
                    activeTab === 'inProgress' && { color: colors.primary, fontWeight: '600' },
                  ]}
                >
                  In Progress
                </Text>
                {activeTab === 'inProgress' && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === 'completed' && styles.activeTab,
                ]}
                onPress={() => setActiveTab('completed')}
                accessibilityRole="tab"
                accessibilityLabel="Completed print jobs"
                accessibilityState={{ selected: activeTab === 'completed' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: colors.textSecondary },
                    activeTab === 'completed' && { color: colors.primary, fontWeight: '600' },
                  ]}
                >
                  Completed
                </Text>
                {activeTab === 'completed' && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
              </Pressable>
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
                    colors={[colors.primary]}
                    tintColor={colors.gray400}
                    progressBackgroundColor={colors.cellBackground}
                  />
                }
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </BottomSheet>

        {/* Snackbar for feedback - Native implementation */}
        {snackbarVisible && (
          <View style={styles.snackbar}>
            <View style={[styles.snackbarContent, { backgroundColor: colors.gray900 }]}>
              <Text style={styles.snackbarText}>{snackbarMessage}</Text>
              <Pressable
                onPress={() => setSnackbarVisible(false)}
                style={styles.snackbarDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}
      </>
    );
};

export default forwardRef(PrintJobsBottomSheet);

// ============================================================================
// Styles - Layout only (colors applied inline)
// ============================================================================
const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    paddingHorizontal: FIORI.header.paddingHorizontal,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: FIORI.header.height,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
  },
  jobCountBadge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCountText: {
    fontSize: FIORI.typography.badge.fontSize,
    fontWeight: FIORI.typography.badge.fontWeight,
    color: '#FFFFFF',
  },
  printerStatusContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  printerStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: FIORI.chip.height,
    paddingHorizontal: FIORI.chip.paddingHorizontal,
    borderRadius: FIORI.chip.borderRadius,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  printerStatusText: {
    fontSize: FIORI.chip.fontSize,
    fontWeight: FIORI.chip.fontWeight,
  },
  printerStatusMessage: {
    fontSize: FIORI.typography.caption.fontSize,
    marginTop: 4,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.chip.height,
    paddingHorizontal: FIORI.chip.paddingHorizontal,
    borderRadius: FIORI.chip.borderRadius,
    gap: 4,
  },
  typeChipText: {
    fontSize: FIORI.chip.fontSize,
    fontWeight: FIORI.chip.fontWeight,
  },
  statusChip: {
    height: FIORI.chip.height,
    paddingHorizontal: FIORI.chip.paddingHorizontal,
    borderRadius: FIORI.chip.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusChipText: {
    fontSize: FIORI.chip.fontSize,
    fontWeight: FIORI.chip.fontWeight,
    color: '#FFFFFF',
  },
  rangeText: {
    fontSize: FIORI.typography.body.fontSize,
    fontWeight: '600',
    lineHeight: FIORI.typography.body.lineHeight,
    marginBottom: 4,
  },
  printerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  printerText: {
    fontSize: FIORI.typography.caption.fontSize,
    fontWeight: '500',
  },
  printerSeparator: {
    fontSize: FIORI.typography.caption.fontSize,
    marginHorizontal: 2,
  },
  documentCountText: {
    fontSize: FIORI.typography.caption.fontSize,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: FIORI.touch.minHeight,
  },
  timestampText: {
    fontSize: FIORI.typography.caption.fontSize,
  },
  cancelButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  successText: {
    flex: 1,
    fontSize: FIORI.typography.caption.fontSize,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: FIORI.typography.caption.fontSize,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: FIORI.typography.body.fontSize,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: FIORI.typography.body.fontSize,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    minHeight: FIORI.tab.minHeight,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {},
  tabText: {
    fontSize: FIORI.tab.fontSize,
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FIORI.tab.indicatorHeight,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  snackbar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  snackbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  snackbarText: {
    flex: 1,
    fontSize: FIORI.typography.body.fontSize,
    color: '#FFFFFF',
  },
  snackbarDismiss: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
