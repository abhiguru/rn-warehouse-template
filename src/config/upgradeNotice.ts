/**
 * The facility's server is being upgraded: the gateway answers every API request 503 with the body
 * `{"code":"upgrading", ...}` and `Retry-After` (docs/API_CONTRACT.md, "The gateway's upgrading answer").
 *
 * The request layer (`gatedFetch`, src/config/supabaseConfig.ts) reads that answer once, for every screen:
 *  - it raises this notice, which `UpgradingBanner` shows (a status, not an error: nothing was lost);
 *  - a READ waits `Retry-After` and is sent again, once; a WRITE is never sent again silently (the person sees the
 *    message and decides);
 *  - any other answer from the server lowers the notice.
 * The session is not touched: a stale key is answered 503 during an upgrade too, so 503 never means "signed out".
 *
 * A phone that stays open through an upgrade must learn what the new release needs (its minimum app version, its
 * schema head). So when the notice goes down because an ordinary request was answered, the identity check is required
 * again (`operatorResumeGate.suspend()`): the next request runs discovery once and reads the facility afresh. The check
 * that itself ends the notice (discovery answered) and a change of server or session lower it without that.
 */
import { UPGRADING_CODE } from '@/utils/serverText';
import { operatorResumeGate } from './operatorResume';
import { registerSessionScoped } from './sessionScopedRegistry';

/** Used when the answer carries no usable `Retry-After`; the gateway's own value. */
export const DEFAULT_RETRY_AFTER_SECONDS = 120;
const MAX_RETRY_AFTER_SECONDS = 300;

let upgrading = false;
const listeners = new Set<() => void>();

export const isUpgrading = (): boolean => upgrading;
export const subscribeUpgrading = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function setUpgrading(next: boolean): void {
  if (upgrading === next) return;
  upgrading = next;
  for (const listener of [...listeners]) listener();
}

/** Seconds from a `Retry-After` header (whole seconds; an HTTP date is not used), kept within 1 and 300. */
export function retryAfterSeconds(value: string | null | undefined): number {
  const seconds = /^\s*\d+\s*$/.test(value ?? '') ? Number(value) : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, seconds));
}

/** Any answer but a 503 means the server is taking requests again: the notice goes down. Synchronous on purpose. */
export function noteServerAnswered(): void {
  if (!upgrading) return;
  setUpgrading(false);
  // The facility may now be a newer release: check it again before the next request (see the top of this file).
  // A check already required, or running, reads the facility afresh: suspending again would void it.
  if (operatorResumeGate.isVerified()) operatorResumeGate.suspend();
}

/** Discovery (a public request outside `gatedFetch`) was answered "upgrading": the same notice as for any request. */
export function noteDiscoveryUpgrading(): void {
  setUpgrading(true);
}

/** Discovery itself was answered: the facility is taking requests, and it has just been read afresh, so no new check is due. */
export function noteDiscoveryAnswered(): void {
  setUpgrading(false);
}

/** A server or session change: the notice belonged to the facility the phone has left. */
export function clearUpgradeNotice(): void {
  setUpgrading(false);
}
// Session end and every session generation change (sign-in or out); a change of server is also cleared by operatorServer.ts.
registerSessionScoped('upgrade-notice', () => clearUpgradeNotice(), { onGenerationChange: true });

/**
 * Reads a 503: raises the notice and says whether it was the upgrade answer (any other 503 leaves the notice as it
 * was). The body is read from a copy, so the caller's answer is untouched.
 */
export async function noteUpgradeAnswer(response: Response): Promise<{ upgrading: boolean; retryAfter: number }> {
  try {
    const body = (await response.clone().json()) as { code?: unknown } | null;
    if (body && body.code === UPGRADING_CODE) {
      setUpgrading(true);
      return { upgrading: true, retryAfter: retryAfterSeconds(response.headers?.get?.('Retry-After')) };
    }
  } catch {
    // Not the gateway's JSON: an ordinary 503.
  }
  return { upgrading: false, retryAfter: 0 };
}

/** Waits `seconds`, or less when `signal` aborts; resolves either way (the caller checks the signal). */
export function waitForRetry(seconds: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, seconds * 1000);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** Tests only. */
export function resetUpgradeNotice(): void {
  upgrading = false;
  listeners.clear();
}
