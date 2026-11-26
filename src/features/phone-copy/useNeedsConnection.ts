/**
 * True when the phone has no connection and the screens read the phone copy: an action that needs the server says so
 * where it is offered, before the tap (WH-299; Design offline-capture.md 2.5). With the feature off, today's
 * behaviour stays: this is false whatever the connection.
 */
import { useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import { COPY_FORMAT_V3 } from './copySchema';
import { isCopyOffline, subscribeCopyOffline } from './syncEngine';
import { getSyncSnapshot, subscribeSync } from './syncStore';

const featureOn = (): boolean => getSyncSnapshot().feature === 'on';

/** The engine's own offline flag (the app's connection check feeds it), so no screen needs a second listener. */
export function useNeedsConnection(): boolean {
  const offline = useSyncExternalStore(subscribeCopyOffline, isCopyOffline, isCopyOffline);
  const on = useSyncExternalStore(subscribeSync, featureOn, featureOn);
  return offline && on;
}

const formatIsV3 = (): boolean => (getSyncSnapshot().format ?? 0) >= COPY_FORMAT_V3;

/**
 * `useNeedsConnection` for the screens WH-348 moves to the copy: only over a copy of format 3, so a copy of format 2 (or an
 * older server) keeps today's screen with today's offline messages (contract section 9).
 */
export function useNeedsConnectionV3(): boolean {
  const needs = useNeedsConnection();
  const v3 = useSyncExternalStore(subscribeSync, formatIsV3, formatIsV3);
  return needs && v3;
}

/** "<label>, needs a connection": the screen-reader label of a disabled action (Design 2.5 and 2.7). */
export function needsConnectionLabel(label: string): string {
  const reason = t('components.offlineRead.needsConnection');
  return `${label}, ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
