/**
 * Pairing this phone with a facility on its local network only (WH-146; the person scanned the QR code an administrator made,
 * `parsePairingPayload` in src/config/pairingCrypto.ts). The order is the security of it:
 *
 *   1. Ask the address for its public configuration (no secret sent) and require the instance id of the QR: the box at that
 *      address says who it is before the one-time code goes anywhere.
 *   2. Send the code and a fresh nonce to `<lan>/functions/v1/pairing-redeem` (the one call that needs no signature).
 *   3. Check the server's PROOF under the QR's secret, in constant time, and only then decrypt the session (pairingCrypto.ts).
 *      A device that does not know the secret is refused here and nothing of its answer is used.
 *   4. Only then is the facility made the selected one (the shared switch sequence ends the previous facility's session) and
 *      the session and its warehouse network key are kept in secure storage (`pairedSignIn`).
 *
 * The facility is filed under a placeholder origin (src/config/localFacility.ts) and told apart by `instanceId`. The secret
 * and the code live in this call only: they are not stored, logged or put in an error; the session is never logged.
 */
import { switchOperatorServer } from '@/store/operatorSwitch';
import { appTooOldInfo, isAppTooOld, type AppTooOldInfo } from './appTooOld';
import { noteBackendRelease } from './backendTooOld';
import { setFacilityCapabilities } from './facilityCapabilities';
import { getLanContext, setLanContext } from './lanTransport';
import { localOnlyOrigin } from './localFacility';
import { discoverOperator, getActiveOperatorServer } from './operatorServer';
import { newPairingNonce, openPairingAnswer, PairingAnswerError, type PairingPayload } from './pairingCrypto';
import { getStoredToken, initializeSupabase, pairedSignIn } from './supabaseConfig';
import type { UserProfile } from '@/types/user.types';

export type PairFailure =
  /** 409 PAIRING_CODE_INVALID: used, replaced or expired. */
  | 'used-or-expired'
  | 'rate-limited'
  /** The address did not answer, or this phone is not on a network that can hold it. */
  | 'unreachable'
  /** The device at the address is not the facility of the QR, or did not prove the secret. Nothing was sent after that. */
  | 'wrong-server'
  | 'app-too-old'
  /** Something else is going on in the app (a write in flight, a switch under way). */
  | 'busy'
  /** The person chose Cancel at "Switch to ...?": nothing was redeemed, the code can be scanned again. */
  | 'cancelled'
  | 'failed';

export type PairResult = { ok: true; userProfile: UserProfile } | { ok: false; reason: PairFailure; appTooOld?: AppTooOldInfo };

const fail = (reason: PairFailure, appTooOld?: AppTooOldInfo): PairResult => ({ ok: false, reason, ...(appTooOld ? { appTooOld } : {}) });

const REDEEM_TIMEOUT_MS = 15000;

/** The redeem call. Resolves with the answer's `data`, or the failure it stands for. */
async function redeem(payload: PairingPayload, nonce: string): Promise<{ data: unknown } | PairResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDEEM_TIMEOUT_MS);
  try {
    const response = await fetch(`${payload.addr}/functions/v1/pairing-redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code: payload.code, nonce }),
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status === 409) return fail('used-or-expired');
    if (response.status === 429) return fail('rate-limited');
    if (response.status === 404 || response.status === 503) return fail('unreachable');
    if (!response.ok) return fail('failed');
    const body = (await response.json().catch(() => null)) as { success?: unknown; data?: unknown } | null;
    return body?.success === true && body.data ? { data: body.data } : fail('failed');
  } catch {
    return fail('unreachable');
  } finally {
    clearTimeout(timer);
  }
}

/** Pairs with the facility of `payload`. Never throws. `dispatch` is the store's. */
export async function pairWithFacility(
  payload: PairingPayload,
  dispatch: (action: any) => any,
  /** Asked once, after the address has proved to be the QR's facility and before the code is redeemed, and only when another facility's session exists. */
  confirmSwitch?: (names: { next: string; current: string }) => Promise<boolean>
): Promise<PairResult> {
  const origin = localOnlyOrigin(payload.instanceId);
  const previousContext = getLanContext();
  let committed = false;
  try {
    // 1. Who is at the address (public configuration; no secret leaves the phone).
    const pairingContext = { canonical: origin, lan: payload.addr, instanceId: payload.instanceId, localOnly: true };
    setLanContext(pairingContext);
    let discovery: Awaited<ReturnType<typeof discoverOperator>>;
    try {
      discovery = await discoverOperator(origin);
    } catch (error) {
      if (isAppTooOld(error)) return fail('app-too-old', appTooOldInfo(error));
      return fail('unreachable');
    }
    if (discovery.server.instanceId !== payload.instanceId) return fail('wrong-server');

    // Another facility's session ends with the switch: ask first, while the code is still unspent (Cancel keeps both).
    const other = getActiveOperatorServer();
    if (confirmSwitch && other && other.instanceId !== payload.instanceId) {
      const stored = await getStoredToken().catch(() => null);
      if (stored?.authToken) {
        // The address is proved; while the question waits the current facility keeps its own LAN context.
        setLanContext(previousContext);
        if (!(await confirmSwitch({ next: discovery.server.displayName, current: other.displayName }))) return fail('cancelled');
        setLanContext(pairingContext);
      }
    }

    // 2 and 3. Redeem, check the proof, open the box.
    const nonce = await newPairingNonce();
    const redeemed = await redeem(payload, nonce);
    if (!('data' in redeemed)) return redeemed;
    let session: Record<string, unknown>;
    try {
      session = await openPairingAnswer({ secret: payload.secret, code: payload.code, nonce }, redeemed.data);
    } catch (error) {
      return fail(error instanceof PairingAnswerError && error.reason === 'wrong-server' ? 'wrong-server' : 'failed');
    }

    // 4. The facility becomes the selected one and the session is kept. The code is spent by now: a failure from here on
    // needs a new code.
    const server = { ...discovery.server, lan: payload.addr, kind: 'local' as const };
    const switched = await switchOperatorServer(server, dispatch);
    if (switched.kind === 'busy') return fail('busy');
    if (switched.kind === 'failed') return fail('failed');
    committed = true;
    initializeSupabase(discovery.config.supabaseUrl, discovery.config.anonKey);
    setFacilityCapabilities(discovery.server, discovery.config.capabilities);
    noteBackendRelease(discovery.server, discovery.config);
    const signedIn = await pairedSignIn(session);
    if (!signedIn.success) return fail('failed');
    return { ok: true, userProfile: signedIn.userProfile };
  } catch {
    return fail('failed');
  } finally {
    // Nothing changed: the transport goes back to what it had.
    if (!committed && getActiveOperatorServer()?.instanceId !== payload.instanceId) setLanContext(previousContext);
  }
}
