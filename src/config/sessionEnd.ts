/**
 * The end of a session started with a code from the facility (backend migration 132).
 *
 * The facility ends such a session 24 hours after sign-in (`session_ends_at` of the sign-in answer). Refresh works
 * until then and never extends it; after it, refresh and calls are refused. The app does not wait for the refusal:
 * it keeps the time next to the session's tokens (cleared with them, src/config/supabaseConfig.ts) and signs the
 * person out at that time, with a reason shown by the sign-out reason strip.
 */
import * as SecureStore from 'expo-secure-store';
import { t } from '@/i18n';

export const SESSION_ENDS_AT_KEY = 'secure_session_ends_at';

/** A refusal this close before the stored end is taken to be that end (device clock and server clock differ a little). */
const END_TOLERANCE_MS = 5 * 60 * 1000;
/** setTimeout cannot wait longer than this; a session is 24 hours, so this only guards a damaged value. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

/** The end as milliseconds, or null when the text is not a time. */
export function parseSessionEnd(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Stores the end next to the session. Throws when it cannot be written. */
export async function storeSessionEnd(endsAtMs: number): Promise<void> {
  await SecureStore.setItemAsync(SESSION_ENDS_AT_KEY, String(endsAtMs));
}

/** The stored end in milliseconds; null when the session has none (an ordinary sign-in) or it cannot be read. */
export async function readSessionEnd(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_ENDS_AT_KEY);
    const ms = raw ? Number(raw) : NaN;
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/** The stored end has come, or is so near that a refusal now is that end (a session of an ordinary sign-in has none: false). */
export async function sessionEndReached(now: number = Date.now()): Promise<boolean> {
  const endsAt = await readSessionEnd();
  return endsAt !== null && now >= endsAt - END_TOLERANCE_MS;
}

export const sessionEndedReason = (): string => t('auth.facilityCode.sessionEnded');

/**
 * The reason to show for a forced sign-out: when the session had an end and it has come (or the facility refused the
 * session just before it), the person is told that the code session ended; any other reason stays as it was.
 */
export async function explainEndedSession(reason: string, now: number = Date.now()): Promise<string> {
  const endsAt = await readSessionEnd();
  return endsAt !== null && now >= endsAt - END_TOLERANCE_MS ? sessionEndedReason() : reason;
}

/**
 * Calls `onEnd` at `endsAtMs` (at once when it is past). Returns the function that cancels it. A phone that was in the
 * background when the time came is handled by calling this again on return to the foreground.
 */
export function scheduleSessionEnd(endsAtMs: number, onEnd: () => void, now: number = Date.now()): () => void {
  const wait = endsAtMs - now;
  if (wait <= 0) {
    onEnd();
    return () => {};
  }
  const timer = setTimeout(onEnd, Math.min(wait, LONGEST_TIMER_MS));
  return () => clearTimeout(timer);
}
