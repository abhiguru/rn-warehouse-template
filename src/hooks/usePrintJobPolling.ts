/**
 * usePrintJobPolling Hook
 *
 * One owner for the Print Jobs sheet's two repeating reads: the printer status (the
 * latest print job) and the job list. Both run through usePolling, so each one is single
 * flight and completion driven (the next read starts an interval after the last one
 * ended), runs only while the sheet is open, its screen is focused and the app is in the
 * foreground, and a read that ends after the sheet closed is no longer current
 * (performance review 2026-10-13, DATA-04).
 *
 * Cadence (defaults): while a job is queued or printing, status every 5 s and jobs every
 * 10 s; when idle, status every 30 s and jobs every 60 s. Steady requests per minute with
 * the sheet open: about 24 (in-progress tab) or 30 (finished tab) while a job is active,
 * 4 or 5 when idle; the earlier fixed intervals gave 48 or 54.
 */

import { useCallback } from 'react';
import { usePolling, type IsCurrent } from './usePolling';

/** A read: may skip its screen update when `isCurrent()` is false (sheet closed meanwhile). */
type PollRead = (isCurrent: IsCurrent) => void | Promise<void>;

interface UsePrintJobPollingOptions {
  /** Whether polling should be active (the sheet is open) */
  isActive: boolean;
  /** Callback to fetch print jobs */
  onFetchJobs: PollRead;
  /** Callback to update printer status */
  onUpdateStatus: PollRead;
  /** A job is queued or printing: use the faster intervals. */
  hasActiveJob?: boolean;
  /** Job polling interval while a job is active, in ms (default: 10000) */
  jobPollInterval?: number;
  /** Status polling interval while a job is active, in ms (default: 5000) */
  statusPollInterval?: number;
  /** Job polling interval when idle, in ms (default: 60000) */
  idleJobPollInterval?: number;
  /** Status polling interval when idle, in ms (default: 30000) */
  idleStatusPollInterval?: number;
  /**
   * When this changes (for example the selected tab), the job read in flight is no longer
   * current and a fresh job read starts as soon as it ends.
   */
  jobsKey?: unknown;
}

interface UsePrintJobPollingReturn {
  /** Fetch jobs now, or join the job read in flight. */
  fetchNow: () => Promise<void>;
  /** Update the printer status now, or join the status read in flight. */
  updateStatusNow: () => Promise<void>;
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
 *   hasActiveJob,
 *   jobsKey: activeTab,
 * });
 * ```
 */
export function usePrintJobPolling({
  isActive,
  onFetchJobs,
  onUpdateStatus,
  hasActiveJob = false,
  jobPollInterval = 10000,
  statusPollInterval = 5000,
  idleJobPollInterval = 60000,
  idleStatusPollInterval = 30000,
  jobsKey,
}: UsePrintJobPollingOptions): UsePrintJobPollingReturn {
  const runJobs = useCallback(
    async (isCurrent: IsCurrent) => { await onFetchJobs(isCurrent); },
    [onFetchJobs]
  );
  const runStatus = useCallback(
    async (isCurrent: IsCurrent) => { await onUpdateStatus(isCurrent); },
    [onUpdateStatus]
  );

  const jobs = usePolling(runJobs, {
    enabled: isActive,
    intervalMs: hasActiveJob ? jobPollInterval : idleJobPollInterval,
    resetKey: jobsKey,
  });
  const status = usePolling(runStatus, {
    enabled: isActive,
    intervalMs: hasActiveJob ? statusPollInterval : idleStatusPollInterval,
  });

  return {
    fetchNow: jobs.runNow,
    updateStatusNow: status.runNow,
  };
}

export default usePrintJobPolling;
