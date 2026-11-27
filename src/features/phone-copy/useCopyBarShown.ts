/**
 * Whether the phone copy's status bar is drawn (WH-306, Design offline-capture.md 9.1): for the warehouse roles whenever the
 * feature is on; for a customer account only in its first-load states, because the strip under its headers carries the
 * time. The inset the bar reserves follows it.
 */
import { useSyncExternalStore } from 'react';
import { useCopyFeatureOn } from '@/hooks/usePhoneCopyStatus';
import { useAppSelector } from '@/store/hooks';
import { customerBarShown } from './statusBarState';
import { getSyncSnapshot, subscribeSync } from './syncStore';

export function useCopyBarShown(): boolean {
  const on = useCopyFeatureOn();
  const customerAccount = useAppSelector(state => state.auth.userProfile?.role === 'customer');
  const phase = useSyncExternalStore(subscribeSync, () => getSyncSnapshot().phase);
  return on && (!customerAccount || customerBarShown(phase));
}
