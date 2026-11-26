/**
 * True when the phone has no connection and the screens read the phone copy: an action that needs the server says so
 * where it is offered, before the tap (WH-299; Design offline-capture.md 2.5). With the feature off, today's
 * behaviour stays: this is false whatever the connection.
 */
import { useSyncExternalStore } from 'react';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { t } from '@/i18n';
import { getSyncSnapshot, subscribeSync } from './syncStore';

const featureOn = (): boolean => getSyncSnapshot().feature === 'on';

export function useNeedsConnection(): boolean {
  const offline = useIsOffline();
  const on = useSyncExternalStore(subscribeSync, featureOn, featureOn);
  return offline && on;
}

/** "<label>, needs a connection": the screen-reader label of a disabled action (Design 2.5 and 2.7). */
export function needsConnectionLabel(label: string): string {
  const reason = t('components.offlineRead.needsConnection');
  return `${label}, ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
