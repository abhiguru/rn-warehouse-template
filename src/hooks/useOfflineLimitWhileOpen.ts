/**
 * The 30-day offline limit while the app stays in front (WH-354, src/config/offlineLimit.ts). The foreground check
 * (WH-350) runs only after a real stay in the background; an app kept in front, or away only inside the grace window,
 * would keep showing the phone copy past the limit. While the phone has no connection to the facility, the kept
 * profile is read again now, on a timer, and on every return to the front. It reads the phone only: no request is
 * made. Within the limit, and online, nothing happens. Past it, `close` gets the same marked failure the foreground
 * check raises, so the app closes onto the same screen (WH-351).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { markPastOfflineLimit } from '@/config/offlineStart';
import { getCachedUserProfile } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { useFacilityCapabilities } from '@/hooks/useCapability';
import { useIsOffline } from './useNetworkStatus';

/** How often an app kept in front reads the kept profile again while offline; the limit is thirty days long. */
export const OFFLINE_LIMIT_CHECK_MS = 15 * 60 * 1000;

export function useOfflineLimitWhileOpen(close: (failure: unknown) => void): void {
  const offline = useIsOffline();
  const syncEnabled = useFacilityCapabilities().sync === true;
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!offline || !syncEnabled) return undefined;
    let active = true;
    let reading = false;
    const check = async () => {
      if (reading) return;
      reading = true;
      try {
        let passed = false;
        // The same read and rule as the offline start; a store that cannot be read says nothing and closes nothing (WH-357).
        await getCachedUserProfile({ allowExpired: true, onLimitPassed: () => { passed = true; } });
        if (passed && active) {
          const failure = new Error(t('nav.bootstrap.unreachable'));
          markPastOfflineLimit(failure);
          closeRef.current(failure);
        }
      } finally {
        reading = false;
      }
    };
    const run = () => {
      void check().catch(() => undefined);
    };
    run();
    const timer = setInterval(run, OFFLINE_LIMIT_CHECK_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [offline, syncEnabled]);
}
