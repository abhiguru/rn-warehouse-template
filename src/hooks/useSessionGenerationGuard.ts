import { useEffect } from 'react';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { getStoredToken } from '@/config/supabaseConfig';

/**
 * Ends the Redux session when the stored credentials disappear underneath a
 * mounted profile (rejected refresh, replaced instance). Every session change
 * is followed by a credential read; when a profile is present, the store was
 * read and no tokens remain, `onCredentialsGone` runs once. A read that fails
 * is tried again; a store that stays unreadable ends nothing (WH-361).
 */
export function useSessionGenerationGuard(
  hasProfile: boolean,
  onCredentialsGone: () => void
): void {
  useEffect(() => {
    if (!hasProfile) return undefined;
    let active = true;
    let fired = false;
    const check = async () => {
      const generation = getSessionGeneration();
      const stored = await getStoredToken({ retryUnreadable: true });
      // A newer change triggers its own check; never act on a superseded read.
      if (!active || fired || generation !== getSessionGeneration()) return;
      // An unreadable store does not say that the credentials are gone.
      if (stored.unreadable || stored.authToken || stored.refreshToken) return;
      fired = true;
      onCredentialsGone();
    };
    const unsubscribe = onSessionChange(() => {
      void check();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hasProfile, onCredentialsGone]);
}
