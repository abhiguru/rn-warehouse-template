import { operatorResumeGate } from '@/config/operatorResume';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { createClient } from '@supabase/supabase-js';
import {
  ensureValidTokens,
  getCurrentConfig,
  getStoredToken,
} from '@/config/supabaseConfig';
import {
  getSessionGeneration,
  onSessionChange,
} from '@/config/sessionLifecycle';

// Events are invalidation signals only. Fetch authoritative data through the
// existing authenticated/RLS paths; never merge socket payloads into the UI.
export function subscribeToOrderChanges(refresh: () => void | Promise<void>) {
  const generation = getSessionGeneration();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  const current = () => !stopped && generation === getSessionGeneration();
  const schedule = () => {
    if (!current()) return;
    pending = true;
    if (timer || running) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (!current()) return;
      pending = false;
      running = true;
      try {
        await refresh();
      } catch {
        // The normal screen fetch reports errors and retains manual refresh.
      } finally {
        running = false;
        if (pending) schedule();
      }
    }, 150);
  };

  let client: ReturnType<typeof createClient> | undefined;
  let unsubscribeSession = () => {};
  let unsubscribeSuspension = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    pending = false;
    clearTimeout(timer);
    unsubscribeSession();
    unsubscribeSuspension();
    // Disconnect synchronously before async channel cleanup on logout.
    client?.realtime.disconnect();
    void client?.removeAllChannels().catch(() => {});
  };
  // supabase-js asks for the token once inside createClient and logs a warning ("Failed to set
  // initial Realtime auth token", backlog A19, seen just after a facility sign-in) when that
  // read is refused. When the subscription ended while that first read was on its way (its
  // screen went, or the session changed), the read is left unanswered instead: the client is
  // already disconnected and must get no token, and null would give it the public key. A read
  // made for a subscription that is still current and finds no session is refused as before.
  let constructing = false;
  const ended = () => new Promise<never>(() => {});
  const start = () => {
    if (!current()) return;
    const config = getCurrentConfig();
    constructing = true;
    try {
      client = createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        accessToken: async () => {
          const first = constructing;
          const refuse = () => {
            if (first && !current()) return ended();
            throw new AppError('SIGN_IN_REQUIRED', t('errors.auth.signInRequired'));
          };
          if (!current() || !(await ensureValidTokens())) return refuse();
          const token = await getStoredToken();
          if (!current() || !token.isValid || !token.authToken) return refuse();
          return token.authToken;
        },
      });
    } finally {
      constructing = false;
    }
    const channel = client
      .channel('warehouse-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        schedule
      )
      .on('system', {}, payload => {
        if (payload.status === 'ok') schedule();
      });
    channel.subscribe(status => {
      // This also runs after automatic socket rejoin: recover missed changes.
      if (status === 'SUBSCRIBED') schedule();
    });
  };
  unsubscribeSession = onSessionChange(stop);
  unsubscribeSuspension = operatorResumeGate.onSuspend(stop);
  if (operatorResumeGate.isVerified()) start();
  else
    void operatorResumeGate
      .ensureVerified()
      .then(verified => {
        if (verified) start();
      })
      .catch(() => {});
  return stop;
}
