/**
 * usePrintJobPolling Hook
 *
 * Manages polling intervals for print jobs and printer status.
 * Extracts polling logic from PrintJobsBottomSheet for better testability.
 */

import { useRef, useEffect, useCallback } from 'react';

interface UsePrintJobPollingOptions {
  /** Whether polling should be active */
  isActive: boolean;
  /** Callback to fetch print jobs */
  onFetchJobs: () => void;
  /** Callback to update printer status */
  onUpdateStatus: () => void;
  /** Interval for job polling in ms (default: 10000) */
  jobPollInterval?: number;
  /** Interval for status polling in ms (default: 2000) */
  statusPollInterval?: number;
}

interface UsePrintJobPollingReturn {
  /** Manually trigger immediate job fetch */
  fetchNow: () => void;
  /** Manually trigger immediate status update */
  updateStatusNow: () => void;
}

/**
 * Hook for managing print job and printer status polling
 *
 * @example
 * ```tsx
 * const { fetchNow, updateStatusNow } = usePrintJobPolling({
 *   isActive: isSheetOpen,
 *   onFetchJobs: fetchPrintJobs,
 *   onUpdateStatus: updatePrinterStatus,
 *   jobPollInterval: 10000,
 *   statusPollInterval: 2000,
 * });
 * ```
 */
export function usePrintJobPolling({
  isActive,
  onFetchJobs,
  onUpdateStatus,
  jobPollInterval = 10000,
  statusPollInterval = 2000,
}: UsePrintJobPollingOptions): UsePrintJobPollingReturn {
  const jobIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear job polling interval
  const clearJobInterval = useCallback(() => {
    if (jobIntervalRef.current) {
      clearInterval(jobIntervalRef.current);
      jobIntervalRef.current = null;
    }
  }, []);

  // Clear status polling interval
  const clearStatusInterval = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  }, []);

  // Job polling effect
  useEffect(() => {
    if (isActive) {
      // Fetch immediately when becoming active
      onFetchJobs();

      // Then poll at specified interval
      jobIntervalRef.current = setInterval(onFetchJobs, jobPollInterval);
    } else {
      clearJobInterval();
    }

    return clearJobInterval;
  }, [isActive, onFetchJobs, jobPollInterval, clearJobInterval]);

  // Status polling effect
  useEffect(() => {
    if (isActive) {
      // Update status immediately when becoming active
      onUpdateStatus();

      // Then poll at specified interval
      statusIntervalRef.current = setInterval(onUpdateStatus, statusPollInterval);
    } else {
      clearStatusInterval();
    }

    return clearStatusInterval;
  }, [isActive, onUpdateStatus, statusPollInterval, clearStatusInterval]);

  // Manual trigger functions
  const fetchNow = useCallback(() => {
    onFetchJobs();
  }, [onFetchJobs]);

  const updateStatusNow = useCallback(() => {
    onUpdateStatus();
  }, [onUpdateStatus]);

  return {
    fetchNow,
    updateStatusNow,
  };
}

export default usePrintJobPolling;
