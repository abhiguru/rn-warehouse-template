import { operatorResumeGate } from '@/config/operatorResume';
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
  const start = () => {
    if (!current()) return;
    const config = getCurrentConfig();
    client = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      accessToken: async () => {
        if (!current() || !(await ensureValidTokens()))
          throw new Error('Sign in required');
        const token = await getStoredToken();
        if (!current() || !token.isValid || !token.authToken)
          throw new Error('Sign in required');
        return token.authToken;
      },
    });
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
