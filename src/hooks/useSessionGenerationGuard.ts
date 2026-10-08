import { useEffect } from 'react';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { getStoredToken } from '@/config/supabaseConfig';

/**
 * Ends the Redux session when the stored credentials disappear underneath a
 * mounted profile (rejected refresh, replaced instance, secure storage
 * failure). Every session change is followed by a credential read; when a
 * profile is present but no tokens remain, `onCredentialsGone` runs once.
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
      const stored = await getStoredToken();
      // A newer change triggers its own check; never act on a superseded read.
      if (!active || fired || generation !== getSessionGeneration()) return;
      if (stored.authToken || stored.refreshToken) return;
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
