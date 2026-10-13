/**
 * usePolling: one owner for a screen's repeating read.
 *
 * Rules (performance review 2026-10-13, R3 and DATA-04):
 * - Single flight. A tick that finds a run in flight is skipped, never queued.
 * - Completion driven. The next timer starts when the run settles, so a slow request
 *   can never overlap the next tick.
 * - Gated. Runs only while `enabled`, the hosting route is focused (when `focus` is on)
 *   and the app is in the foreground.
 * - A genuine return (refocus, foreground, enabled again) runs once at once; a re-render
 *   does not.
 * - `runNow()` (pull to refresh, a refresh button) joins a run in flight instead of
 *   starting another.
 * - Stops cleanly on blur, background, disable and unmount: the pending timer is cleared
 *   and a run that was in flight is no longer current, so its late result can be
 *   ignored through the `isCurrent` callback every run receives.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAppForeground, useRouteFocus } from './useRouteFocus';

/** Whether a run is still the current one: false once polling stopped or `resetKey` changed. */
export type IsCurrent = () => boolean;
export type PollRun = (isCurrent: IsCurrent) => Promise<void>;

export interface UsePollingOptions {
  /** Time between the end of one run and the start of the next. */
  intervalMs: number;
  /** Poll only while true. */
  enabled: boolean;
  /** Also require the hosting route to be focused (default true). */
  focus?: boolean;
  /**
   * When this value changes while polling, the run in flight stops being current and a
   * fresh run starts as soon as it settles (for example a different tab of a list).
   */
  resetKey?: unknown;
}

export interface UsePollingResult {
  /** Run now, or join the run in flight. Resolves when that run settles. */
  runNow: () => Promise<void>;
  /** Whether polling is currently allowed to run (enabled, focused, foreground). */
  active: boolean;
}

export function usePolling(
  run: PollRun,
  { intervalMs, enabled, focus = true, resetKey }: UsePollingOptions
): UsePollingResult {
  const focused = useRouteFocus(focus);
  const foreground = useAppForeground();
  const active = enabled && focused && foreground;

  const runRef = useRef(run);
  runRef.current = run;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;
  const activeRef = useRef(active);
  activeRef.current = active;

  /** Bumped whenever polling stops or restarts; a run started under an older value is stale. */
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A fresh run is owed as soon as the one in flight settles. */
  const rerunRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Declared through refs so start/schedule can call each other without changing identity.
  const startRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const schedule = useCallback(() => {
    clearTimer();
    if (!mountedRef.current || !activeRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // A tick that finds a run in flight is skipped; completion schedules the next one.
      if (inFlightRef.current) return;
      void startRef.current();
    }, intervalRef.current);
  }, [clearTimer]);

  startRef.current = () => {
    if (inFlightRef.current) return inFlightRef.current;
    clearTimer();
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation;
    let promise: Promise<void>;
    try {
      promise = Promise.resolve(runRef.current(isCurrent));
    } catch (error) {
      promise = Promise.reject(error);
    }
    const settled = promise
      .catch(() => undefined)
      .then(() => {
        inFlightRef.current = null;
        if (!mountedRef.current) return;
        if (rerunRef.current) {
          rerunRef.current = false;
          if (activeRef.current) {
            void startRef.current();
            return;
          }
        }
        if (activeRef.current) schedule();
      });
    inFlightRef.current = settled;
    return settled;
  };

  const runNow = useCallback(() => startRef.current(), []);

  // Start on every genuine transition to active; stop on every transition away.
  useEffect(() => {
    if (!active) {
      generationRef.current += 1;
      rerunRef.current = false;
      clearTimer();
      return undefined;
    }
    if (inFlightRef.current) {
      // A run from before is still on the wire: stay single flight and run when it settles.
      rerunRef.current = true;
    } else {
      void startRef.current();
    }
    return undefined;
  }, [active, clearTimer]);

  // A changed reset key makes the run in flight stale and asks for a fresh one.
  const firstKeyRef = useRef(true);
  useEffect(() => {
    if (firstKeyRef.current) {
      firstKeyRef.current = false;
      return;
    }
    generationRef.current += 1;
    if (!activeRef.current) return;
    if (inFlightRef.current) {
      rerunRef.current = true;
    } else {
      void startRef.current();
    }
  }, [resetKey]);

  // A changed interval applies to the timer already waiting.
  useEffect(() => {
    if (timerRef.current !== null) schedule();
  }, [intervalMs, schedule]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      clearTimer();
    };
  }, [clearTimer]);

  return { runNow, active };
}

export default usePolling;
