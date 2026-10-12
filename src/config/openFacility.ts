/**
 * Opening a facility with the central sign-in (docs/CENTRAL_LOGIN.md): the one
 * function behind "My facilities", the catalogue and the linking step.
 *
 *   1. discover the facility and check that it trusts this build's issuer;
 *   2. switch the app to it with the shared server-switch sequence
 *      (src/store/operatorSwitch.ts), which ends the previous facility's
 *      session and clears its state;
 *   3. ask the central service for a token for this facility only;
 *   4. hand the token to the facility (`central-exchange`);
 *   5. turn the answer into a session, a waiting request, the linking step or
 *      a plain message, and record the status on the person's own list.
 *
 * The result is also published in centralState, because step 2 rebuilds the
 * navigation tree: the screen that started the open may not be the one that
 * shows its answer.
 */
import { getCentralLoginConfig } from './envConfig';
import { getCentralState, nextOutcomeId, setCentralState, type FacilityStatus, type OpenFailureReason, type OpenOutcome } from './centralState';
import { requestFacilityToken, type CentralFailure } from './centralSession';
import { updateMyFacility } from './centralFacilities';
import { discoverOperator, getActiveOperatorServer, type OperatorServer } from './operatorServer';
import {
  exchangeCentralIdentity,
  initializeSupabase,
  signInWithPhone,
  type CentralExchangeCode,
  type CentralExchangeResult,
} from './supabaseConfig';
import { switchOperatorServer } from '@/store/operatorSwitch';
import { store } from '@/store';
import { setUserProfile } from '@/store/slices/authSlice';
import { localizeDigits, t, type TranslationKey } from '@/i18n';

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

/** The name a facility goes by in messages: its company name, as on the sign-in screen. */
export const facilityNameOf = (server: OperatorServer): string => server.companyName || server.displayName;

const failed = (reason: OpenFailureReason, message: string, retryAfterSeconds?: number): OpenOutcome => ({
  kind: 'failed',
  reason,
  message,
  ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
});

const fromCentral = (failure: CentralFailure): OpenOutcome =>
  failed(failure.code === 'unknown_facility' ? 'unknown_facility' : 'central', failure.message, failure.retryAfterSeconds);

/** The message and the list status for each refusal of `central-exchange`. */
const EXCHANGE_FAILURES: Record<
  Exclude<CentralExchangeCode, 'link_required' | 'identity_token_used' | 'rate_limited'>,
  { reason: OpenFailureReason; message: TranslationKey; status?: FacilityStatus }
> = {
  identity_conflict: { reason: 'identity_conflict', message: 'central.open.conflict', status: 'unavailable' },
  account_unavailable: { reason: 'account_unavailable', message: 'central.open.revoked', status: 'revoked' },
  central_unavailable: { reason: 'central_unavailable', message: 'central.open.centralUnavailable', status: 'unavailable' },
  central_keys_unavailable: { reason: 'central_keys_unavailable', message: 'central.open.keysUnavailable' },
  invalid_identity_token: { reason: 'invalid_identity_token', message: 'central.open.invalidToken', status: 'unavailable' },
  invalid_otp: { reason: 'invalid_otp', message: 'central.errors.invalidCode', status: 'link_needed' },
  enrollment_limited: { reason: 'enrollment_limited', message: 'errors.auth.enrollmentLimited' },
  invalid_request: { reason: 'failed', message: 'central.open.failed' },
  // The facility's database did not answer: transient, so the status stays.
  unavailable: { reason: 'failed', message: 'central.open.failed' },
  // No answer says nothing about the person's access: the status stays.
  network: { reason: 'network', message: 'central.open.network' },
  session_changed: { reason: 'failed', message: 'central.open.failed' },
  failed: { reason: 'failed', message: 'central.open.failed' },
};

function rateLimitMessage(name: string, seconds: number | undefined): string {
  if (!seconds) return t('central.open.rateLimited', { facility: name });
  return seconds < 120
    ? t('central.open.rateLimitedSeconds', { facility: name, seconds: localizeDigits(String(seconds)) })
    : t('central.open.rateLimitedMinutes', { facility: name, minutes: localizeDigits(String(Math.ceil(seconds / 60))) });
}

type ExchangeStep =
  /** The central service gave no token. */
  | { central: CentralFailure; answer?: undefined }
  | { central?: undefined; answer: CentralExchangeResult };

/** A fresh token for every call: the facility spends each one, whatever it answers. */
async function exchangeOnce(origin: string, otpCode?: string): Promise<ExchangeStep> {
  const token = await requestFacilityToken(origin);
  if (!token.ok) return { central: token };
  return { answer: await exchangeCentralIdentity(token.identityToken, otpCode ? { otpCode } : undefined) };
}

/**
 * Token, exchange, and the one retry for a token the facility says it has
 * already seen (a repeat of a request whose answer was lost).
 */
async function exchange(origin: string, otpCode?: string): Promise<ExchangeStep> {
  const first = await exchangeOnce(origin, otpCode);
  if (first.central || first.answer.success || first.answer.code !== 'identity_token_used') return first;
  return exchangeOnce(origin, otpCode);
}

/** Turns the facility's answer into the outcome and writes the list status. */
async function settle(
  userId: string,
  server: OperatorServer,
  result: ExchangeStep,
  linking: boolean
): Promise<OpenOutcome> {
  const name = facilityNameOf(server);
  const origin = server.origin;
  if (result.central) return fromCentral(result.central);
  const answer = result.answer;
  if (answer.success) {
    setCentralState({ pendingLink: null, facilitySmsOrigin: null });
    if (answer.data.action === 'pending') {
      await updateMyFacility(userId, origin, { status: 'requested', opened: true });
      return { kind: 'pending' };
    }
    await updateMyFacility(userId, origin, { status: 'approved', opened: true });
    // The same step as the code screen after an SMS sign-in: with the profile
    // in the store the route guard lets the person into the facility.
    store.dispatch(setUserProfile(answer.data.userProfile));
    return { kind: 'login' };
  }
  if (answer.code === 'link_required') {
    await updateMyFacility(userId, origin, { status: 'link_needed' });
    // With a code already sent the facility should not ask again; say it plainly.
    if (linking) return failed('failed', t('central.open.failed', { facility: name }));
    const phoneNumber = getCentralState().user?.phoneNumber ?? '';
    const sent = await signInWithPhone(phoneNumber);
    setCentralState({ pendingLink: { origin, name, phoneNumber } });
    if (sent.success) return { kind: 'link_required', codeSent: true };
    return {
      kind: 'link_required',
      codeSent: false,
      message: sent.error,
      ...('retryAfterSeconds' in sent && sent.retryAfterSeconds ? { retryAfterSeconds: sent.retryAfterSeconds } : {}),
    };
  }
  if (answer.code === 'rate_limited')
    return failed('rate_limited', rateLimitMessage(name, answer.retryAfterSeconds), answer.retryAfterSeconds);
  // "Already used" a second time: the facility cannot verify this sign-in.
  const known = EXCHANGE_FAILURES[answer.code === 'identity_token_used' ? 'invalid_identity_token' : answer.code];
  if (known.status) await updateMyFacility(userId, origin, { status: known.status });
  return failed(known.reason, t(known.message, { facility: name }));
}

async function discover(userId: string, origin: string, fallbackName: string): Promise<Discovery | OpenOutcome> {
  try {
    const discovery = await discoverOperator(origin);
    await updateMyFacility(userId, origin, { instanceId: discovery.server.instanceId });
    return discovery;
  } catch {
    // Not reachable right now; nothing was learned about the person's access there.
    return failed('facility_unreachable', t('central.open.unreachable', { facility: fallbackName }));
  }
}

/** Steps 2 to 5 for a facility that accepts association sign-in. */
async function switchAndExchange(userId: string, discovery: Discovery): Promise<OpenOutcome> {
  const { server, config } = discovery;
  const name = facilityNameOf(server);
  const switched = await switchOperatorServer(server, store.dispatch);
  if (switched.kind === 'busy') return failed('busy', t('central.switch.busyMessage'));
  if (switched.kind === 'failed') return failed('switch_failed', t('central.open.switchFailed', { facility: name }));
  // `same`: the facility is already the selected server (its session ended
  // while it stayed selected). Nothing had to be cleaned up, and the exchange
  // begins with startNewSession, which ends anything still stored. That is a
  // valid open; what is not is an open during a sign-out in progress, which
  // openFacility refuses before getting here.
  // `switched`: the bootstrap initialises the client again for the new
  // server; the exchange must not wait for it, and the second call changes
  // nothing.
  initializeSupabase(config.supabaseUrl, config.anonKey);
  return settle(userId, server, await exchange(server.origin), false);
}

async function open(origin: string, fallbackName: string): Promise<OpenOutcome> {
  const central = getCentralLoginConfig();
  const user = getCentralState().user;
  if (!central || getCentralState().status !== 'signedIn' || !user)
    return failed('not_signed_in', t('central.errors.sessionEnded'));
  const discovery = await discover(user.id, origin, fallbackName);
  if ('kind' in discovery) return discovery;
  // A facility that does not name this build's issuer does not accept
  // association sign-in (a non-member, or one that trusts another issuer).
  // Nothing was learned about the person's access there, so the status stays.
  if (discovery.config.centralLogin?.issuer !== central.issuer) return { kind: 'sms_offer' };
  return switchAndExchange(user.id, discovery);
}

/**
 * Hands the answer to whichever screen is mounted. An answer for a central
 * session that has ended meanwhile (signed out, refused, deleted) is dropped:
 * the next person to sign in must not be told about the previous one's facility.
 */
function publish(userId: string, origin: string, name: string, outcome: OpenOutcome): OpenOutcome {
  const current = getCentralState();
  const sameSession = current.status === 'signedIn' && current.user?.id === userId;
  setCentralState({ opening: null, outcome: sameSession ? { id: nextOutcomeId(), origin, name, outcome } : null });
  return outcome;
}

/**
 * A sign-out, forced sign-out or account deletion that has not finished yet:
 * the store's request flags, and the "leaving" flag that
 * src/store/centralSignOut.ts holds across the whole of its work (also the
 * moments between those flags and the list changes).
 */
function signOutInProgress(): boolean {
  const auth = store.getState().auth;
  return getCentralState().leaving || Boolean(auth.logoutRequest || auth.forceLogoutRequest || auth.deleteRequest);
}

/**
 * Open a facility from "My facilities". `name` is what the list calls it, for
 * messages about a facility that could not even be reached. Never throws.
 *
 * While a facility session is being ended its profile is already gone from the
 * store and My facilities is shown, but the cleanup is still running: an open
 * now would race it (and, after an account deletion, file a new access request
 * for the deleted account). Such an open is refused as busy, and the refusal is
 * published like any other answer so the list says so; `opening` is left alone,
 * since another open may really be in flight.
 */
export async function openFacility(origin: string, name: string): Promise<OpenOutcome> {
  if (getCentralState().opening || signOutInProgress()) {
    const outcome = failed('busy', t('central.switch.busyMessage'));
    setCentralState({ outcome: { id: nextOutcomeId(), origin, name, outcome } });
    return outcome;
  }
  const userId = getCentralState().user?.id ?? '';
  setCentralState({ opening: origin, outcome: null, autoOpenSpent: true });
  try {
    return publish(userId, origin, name, await open(origin, name));
  } catch {
    return publish(userId, origin, name, failed('failed', t('central.open.failed', { facility: name })));
  }
}

/**
 * The second step of linking: the person typed the code the facility sent.
 * A fresh identity token goes to the facility together with the code.
 * The result is returned to the code screen and not published.
 */
export async function completeFacilityLink(code: string): Promise<OpenOutcome> {
  const link = getCentralState().pendingLink;
  const user = getCentralState().user;
  const server = getActiveOperatorServer();
  if (!link || !user || !server || server.origin !== link.origin)
    return failed('failed', t('central.open.failed', { facility: link?.name ?? '' }));
  try {
    return await settle(user.id, server, await exchange(link.origin, code), true);
  } catch {
    return failed('failed', t('central.open.failed', { facility: link.name }));
  }
}

/** Ask the facility for another code during linking. */
export async function resendFacilityLinkCode() {
  const link = getCentralState().pendingLink;
  if (!link) return { success: false as const, error: t('errors.auth.otpSendFailed') };
  return signInWithPhone(link.phoneNumber);
}

/** Leave the linking step without finishing it. */
export function cancelFacilityLink(): void {
  setCentralState({ pendingLink: null });
}

/**
 * The person accepted the offer to use a facility's own SMS sign-in, because
 * that facility does not accept association sign-in: make it the server, as
 * the server address screen would, and let the existing sign-in screen take over.
 */
export async function beginFacilitySmsSignIn(origin: string, name: string): Promise<OpenOutcome> {
  const user = getCentralState().user;
  if (!user) return failed('not_signed_in', t('central.errors.sessionEnded'));
  const discovery = await discover(user.id, origin, name);
  if ('kind' in discovery) return discovery;
  const switched = await switchOperatorServer(discovery.server, store.dispatch);
  if (switched.kind === 'busy') return failed('busy', t('central.switch.busyMessage'));
  if (switched.kind === 'failed')
    return failed('switch_failed', t('central.open.switchFailed', { facility: facilityNameOf(discovery.server) }));
  initializeSupabase(discovery.config.supabaseUrl, discovery.config.anonKey);
  setCentralState({ facilitySmsOrigin: discovery.server.origin, autoOpenSpent: true });
  return { kind: 'sms_offer' };
}

/** The answer of the last open has been shown (or acted on) by a screen. */
export function consumeOpenOutcome(id: number): void {
  if (getCentralState().outcome?.id === id) setCentralState({ outcome: null });
}
