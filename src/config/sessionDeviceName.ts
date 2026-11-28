/**
 * The name this phone gives its session (WH-411): the maker and model from `phoneDisplayName()`, for example
 * "Samsung SM-A156E (7F3A)", so the signed-in devices list can show which phone a session is.
 *
 * Two ways in, both cosmetic (a failure changes nothing the person sees):
 *   - `deviceNameField()` is added to the body of a sign-in request (central-exchange, operator-otp verify and break-glass,
 *     pairing-redeem). The sign-in functions of an older backend read only the fields they know and ignore this one, so it is
 *     sent without waiting for the facility's release to be known (a facility's config is not read yet on a pairing code).
 *   - `ensureSessionDeviceName()` names a session that was made without it (an older app, an older backend at the time): once per
 *     session generation, when signed in and the backend has `set_session_device_name`. The server fills a missing name only, never
 *     overwrites, so the call is safe to repeat; there is no retry loop.
 */
import { backendHasFeature } from './backendFeatures';
import { getSessionGeneration } from './sessionLifecycle';
import { registerSessionScoped } from './sessionScopedRegistry';
import { phoneDisplayName } from '@/features/users/phoneDisplayName';
import { createLogger } from '@/utils/logger';

const log = createLogger('SessionDeviceName');

/** `{ device_name }` for a sign-in request body, or nothing when this phone has no name (iOS, no model). Never throws. */
export async function deviceNameField(): Promise<{ device_name?: string }> {
  try {
    const name = await phoneDisplayName();
    return name === null ? {} : { device_name: name };
  } catch {
    return {};
  }
}

/** The session generation already tried, or null. Cleared with the session. */
let triedGeneration: number | null = null;
registerSessionScoped('session-device-name', () => {
  triedGeneration = null;
});

/** Names the current session once per generation; failures are ignored (the name is cosmetic). Never throws. */
export async function ensureSessionDeviceName(): Promise<void> {
  const generation = getSessionGeneration();
  if (triedGeneration === generation || !backendHasFeature('sessionDeviceName')) return;
  triedGeneration = generation;
  try {
    const name = await phoneDisplayName();
    if (name === null) return;
    // Loaded when used: supabaseConfig imports this module for the sign-in bodies, so a static import would be a cycle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- loaded when used, see above
    const { getAuthenticatedClient } = require('./supabaseConfig') as typeof import('./supabaseConfig');
    const client = await getAuthenticatedClient();
    if (generation !== getSessionGeneration()) return;
    await client.rpc('set_session_device_name', { p_device_name: name });
  } catch {
    log.warn('Naming the session failed; it stays unnamed');
  }
}
