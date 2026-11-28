/**
 * Whether the unsent-only bar is drawn (WH-301, Product and Design 2026-11-28): the facility's phone copy is off, but this
 * phone still holds unsent, held or refused work. The bar then shows the status bar's second line alone (no copy to
 * describe) and opens "Unsent items". It goes away when the last item is gone.
 */
import { useSyncExternalStore } from 'react';
import { deriveUnsentLine } from '@/features/phone-copy/statusBarState';
import { useCopyFeatureOn, useCopySession } from '@/hooks/usePhoneCopyStatus';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { isSendingUnsent, subscribeSendingUnsent } from './sendEngine';
import { useUnsentSummary } from './unsentStore';

/** A send pass is running now. */
export const useSendingUnsent = (): boolean => useSyncExternalStore(subscribeSendingUnsent, isSendingUnsent, isSendingUnsent);

export function useUnsentOnlyBar(): boolean {
  const session = useCopySession();
  const featureOn = useCopyFeatureOn();
  const offline = useIsOffline();
  const unsent = useUnsentSummary();
  const sending = useSendingUnsent();
  return session && !featureOn && deriveUnsentLine(unsent, offline, { sending }) !== null;
}
