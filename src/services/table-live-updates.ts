import { operatorResumeGate } from '@/config/operatorResume';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { createClient } from '@supabase/supabase-js';
import {
  acquireValidSession,
  getCurrentConfig,
} from '@/config/supabaseConfig';
import {
  getSessionGeneration,
  onSessionChange,
} from '@/config/sessionLifecycle';

/** The table a subscription follows and the name of its Realtime channel. */
export interface TableSubscription {
  table: string;
  channel: string;
  /** Defaults to `public`. */
  schema?: string;
}

// Events are invalidation signals only. Fetch authoritative data through the
// existing authenticated/RLS paths; never merge socket payloads into the UI.
export function subscribeToTableChanges(
  { table, channel: channelName, schema = 'public' }: TableSubscription,
  refresh: () => void | Promise<void>,
): () => void {
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
          if (!current()) return refuse();
          const session = await acquireValidSession();
          if (!current() || !session || session.generation !== generation) return refuse();
          return session.authToken;
        },
      });
    } finally {
      constructing = false;
    }
    let systemOk = false;
    let joined = false;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema, table },
        schedule
      )
      .on('system', {}, payload => {
        if (payload.status !== 'ok') return;
        // Same as the first join below: the first ok needs no refetch, a later one does.
        if (systemOk) schedule();
        systemOk = true;
      });
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      // The first join needs no refetch: the screen loads, or catches up on its return,
      // itself. A later one is an automatic socket rejoin: recover missed changes.
      if (joined) schedule();
      joined = true;
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
