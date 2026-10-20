/**
 * Opening a facility with the central sign-in (docs/CENTRAL_LOGIN.md): the one
 * function behind "My facilities", the catalogue and the facility-code step.
 *
 *   1. discover the facility and check that it trusts this build's issuer;
 *   2. switch the app to it with the shared server-switch sequence
 *      (src/store/operatorSwitch.ts), which ends the previous facility's
 *      session and clears its state;
 *   3. ask the central service for a token for this facility only;
 *   4. hand the token to the facility (`central-exchange`);
 *   5. turn the answer into a session, a waiting request, the facility's own code
 *      step (asked when the facility has switched it on, at each new sign-in
 *      there) or a plain message, and record the status on the person's own list.
 *
 * The result is also published in centralState, because step 2 rebuilds the
 * navigation tree: the screen that started the open may not be the one that
 * shows its answer.
 *
 * An open belongs to the person it began for (a `Ticket`: that person and the
 * identity generation of centralState.ts). Before each step that acts (the
 * switch, the token request, the exchange, every list write, the profile, the
 * facility's code) it checks that the central person has not changed since; if it
 * has, it stops with "sign in again", and a facility session it got for the
 * previous person is left at once (`leaveStaleSession`): with one more try after a
 * write in flight has settled, and if that still fails, ended locally without the
 * switch gate and the facility listed as stale (src/config/staleFacilitySession.ts)
 * until its cleanup has run. Such a stale facility is not opened (`blockedByEarlierSession`).
 */
import { getCentralLoginConfig } from './envConfig';
import {
  getCentralIdentityGeneration,
  getCentralState,
  nextOutcomeId,
  setCentralState,
  type CentralUser,
  type FacilityStatus,
  type OpenFailureReason,
  type OpenOutcome,
} from './centralState';
import { requestFacilityToken, type CentralFailure } from './centralSession';
import { updateMyFacility } from './centralFacilities';
import { discoverOperator, getActiveOperatorServer, type OperatorServer } from './operatorServer';
import { setFacilityCapabilities } from './facilityCapabilities';
import { clearStaleFacility, forgetStaleGeneration, isStaleFacility, markStaleFacility } from './staleFacilitySession';
import { getSessionGeneration } from './sessionLifecycle';
import {
  exchangeCentralIdentity,
  initializeSupabase,
  signInWithPhone,
  type CentralExchangeCode,
  type CentralExchangeResult,
} from './supabaseConfig';
import { forceLeaveFacility, leaveWithRetryDetailed, retryStaleFacilityCleanup, switchOperatorServer } from '@/store/operatorSwitch';
import { store } from '@/store';
import { setUserProfile } from '@/store/slices/authSlice';
import { localizeDigits, t, type TranslationKey } from '@/i18n';
import { showAlert } from '@/utils/alert';

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;

/** The name a facility goes by in messages: its company name, as on the sign-in screen. */
export const facilityNameOf = (server: OperatorServer): string => server.companyName || server.displayName;

const failed = (reason: OpenFailureReason, message: string, retryAfterSeconds?: number): OpenOutcome => ({
  kind: 'failed',
  reason,
  message,
  ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
});

/** The person an open began for, and the identity generation at that moment. */
type Ticket = { user: CentralUser; generation: number };

/** A ticket for the person signed in now, or null when nobody is. */
function takeTicket(): Ticket | null {
  const current = getCentralState();
  return current.status === 'signedIn' && current.user ? { user: current.user, generation: getCentralIdentityGeneration() } : null;
}

/** True while the central person is still the one the ticket was taken for. */
function isCurrent(ticket: Ticket): boolean {
  const current = getCentralState();
  return getCentralIdentityGeneration() === ticket.generation && current.status === 'signedIn' && current.user?.id === ticket.user.id;
}

/** The answer of an open whose person has changed or signed out meanwhile. */
const ended = (): OpenOutcome => failed('not_signed_in', t('central.errors.sessionEnded'));

/**
 * The person changed during the exchange, and the facility answered with a session (or a
 * waiting request) that belongs to the previous person. It must not stay on the phone for
 * whoever uses it next.
 *
 *   1. The facility is listed as stale on disk at once, so that a restart at any point of
 *      what follows does not restore the session (initializeAuth) and an open does not reach
 *      it until the cleanup has run.
 *   2. It is left like any other, and a write still in flight is first given time to settle
 *      (`leaveWithRetryDetailed`), so that write's outcome is not lost. When that works the entry is
 *      removed again.
 *   3. If it could not be left, the session is ended locally without waiting for the switch
 *      gate (`forceLeaveFacility`: late answers are dropped, and offline the local clear is enough).
 *
 * All of it acts only on that session: its generation is taken now, and once a later sign-in
 * has replaced it (the generation moved without this cleanup), nothing more is done, so the
 * session of the person on the phone now is never ended in its place.
 *
 * Only step 3 is told to the person on the phone now, and without the facility's name,
 * which belongs to the earlier sign-in.
 */
async function leaveStaleSession(server: OperatorServer): Promise<OpenOutcome> {
  const facility = { origin: server.origin, instanceId: server.instanceId };
  const session = { generation: getSessionGeneration() };
  await markStaleFacility(facility, session.generation).catch(() => {});
  const retry = await leaveWithRetryDetailed(store.dispatch, { facility, session });
  if (retry.outcome === 'left') {
    await clearStaleFacility(facility);
    return ended();
  }
  if (retry.storageKept) {
    // The cleanup ran through and the facility is no longer selected; only the phone's storage kept the sign-in.
    forgetStaleGeneration(facility);
    return failed('previous_session_not_cleared', t('central.open.previousNotCleared'));
  }
  const cleared = await forceLeaveFacility(store.dispatch, facility, session);
  // Not all of it ran: the next cleanup goes by the selection, not by the generation.
  if (!cleared) forgetStaleGeneration(facility);
  return cleared
    ? failed('previous_session_closed', t('central.open.previousClosed'))
    : failed('previous_session_not_cleared', t('central.open.previousNotCleared'));
}

/** The titles of the answers about an earlier sign-in's session; neither names a facility. */
export const EARLIER_SESSION_TITLES: Partial<Record<OpenFailureReason, TranslationKey>> = {
  previous_session_closed: 'central.open.previousClosedTitle',
  previous_session_not_cleared: 'central.open.previousNotClearedTitle',
};

/** The answers about an earlier sign-in's session: for whoever is on the phone now (see `publish`). */
const isAboutEarlierSession = (outcome: OpenOutcome): outcome is Extract<OpenOutcome, { kind: 'failed' }> =>
  outcome.kind === 'failed' && EARLIER_SESSION_TITLES[outcome.reason] !== undefined;

/**
 * True while the phone may still hold a session at `origin` for an earlier sign-in (see
 * `leaveStaleSession`). The cleanup is tried first, so only a facility that still cannot be
 * left (a write in flight) stays closed; the open is then refused and nothing is asked.
 */
async function blockedByEarlierSession(origin: string): Promise<boolean> {
  if (!(await isStaleFacility(origin))) return false;
  await retryStaleFacilityCleanup(store.dispatch);
  return isStaleFacility(origin);
}

// The facility is not named: that it is still being closed tells where the earlier sign-in was.
const earlierSessionBusy = (): OpenOutcome => failed('busy', t('central.open.previousPending'));

/** Writes to the ticket's person's list, only while that person is still the one signed in. */
async function record(ticket: Ticket, origin: string, change: Parameters<typeof updateMyFacility>[2]): Promise<void> {
  if (isCurrent(ticket)) await updateMyFacility(ticket.user.id, origin, change);
}

/** As `record`, for a step after the person has been let in: a failed write is not an outcome. */
async function recordBestEffort(ticket: Ticket, origin: string, change: Parameters<typeof updateMyFacility>[2]): Promise<void> {
  try {
    await record(ticket, origin, change);
  } catch {
    // The list shows the older status until the next open writes it.
  }
}

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
  /** The central person changed before the token or the exchange: nothing more was asked. */
  | { stale: true; central?: undefined; answer?: undefined }
  /** The central service gave no token. */
  | { stale?: undefined; central: CentralFailure; answer?: undefined }
  | { stale?: undefined; central?: undefined; answer: CentralExchangeResult };

/**
 * A fresh token for every call: the facility spends each one, whatever it answers. The token
 * is asked for the ticket's person only (never with whoever is stored by then), and neither it
 * nor the exchange is begun once that person has changed.
 */
async function exchangeOnce(ticket: Ticket, origin: string, otpCode?: string): Promise<ExchangeStep> {
  if (!isCurrent(ticket)) return { stale: true };
  const token = await requestFacilityToken(origin, ticket.user.id);
  if (!token.ok) return { central: token };
  if (!isCurrent(ticket)) return { stale: true };
  return { answer: await exchangeCentralIdentity(token.identityToken, otpCode ? { otpCode } : undefined) };
}

/**
 * Token, exchange, and the one retry for a token the facility says it has
 * already seen (a repeat of a request whose answer was lost).
 */
async function exchange(ticket: Ticket, origin: string, otpCode?: string): Promise<ExchangeStep> {
  const first = await exchangeOnce(ticket, origin, otpCode);
  if (first.stale || first.central || first.answer.success || first.answer.code !== 'identity_token_used') return first;
  return exchangeOnce(ticket, origin, otpCode);
}

/** Turns the facility's answer into the outcome and writes the list status. */
async function settle(
  ticket: Ticket,
  server: OperatorServer,
  result: ExchangeStep,
  linking: boolean
): Promise<OpenOutcome> {
  const name = facilityNameOf(server);
  const origin = server.origin;
  if (result.stale) return ended();
  if (result.central) return fromCentral(result.central);
  const answer = result.answer;
  if (!isCurrent(ticket)) {
    // The person changed during the exchange. A facility session it started is this
    // exchange's and belongs to the previous person: it is left at once.
    return answer.success ? leaveStaleSession(server) : ended();
  }
  if (answer.success) {
    setCentralState({ pendingLink: null, facilitySmsOrigin: null });
    if (answer.data.action === 'pending') {
      await recordBestEffort(ticket, origin, { status: 'requested', opened: true });
      return { kind: 'pending' };
    }
    // The same step as the code screen after an SMS sign-in: with the profile
    // in the store the route guard lets the person into the facility. Dispatched
    // right after the check above, before the list write waits for the storage.
    store.dispatch(setUserProfile(answer.data.userProfile));
    // The person is in: a list write that fails (a full phone) must not turn this into a failed open.
    await recordBestEffort(ticket, origin, { status: 'approved', opened: true });
    return { kind: 'login' };
  }
  if (answer.code === 'link_required') {
    await record(ticket, origin, { status: 'link_needed' });
    // With a code already sent the facility should not ask again; say it plainly.
    if (linking) return failed('failed', t('central.open.failed', { facility: name }));
    // The number of the person the open began for, not whatever memory holds by now.
    const phoneNumber = ticket.user.phoneNumber;
    if (!isCurrent(ticket)) return ended();
    const sent = await signInWithPhone(phoneNumber);
    if (!isCurrent(ticket)) return ended();
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
  if (known.status) await record(ticket, origin, { status: known.status });
  return failed(known.reason, t(known.message, { facility: name }));
}

async function discover(ticket: Ticket, origin: string, fallbackName: string): Promise<Discovery | OpenOutcome> {
  try {
    const discovery = await discoverOperator(origin);
    if (!isCurrent(ticket)) return ended();
    await record(ticket, origin, { instanceId: discovery.server.instanceId });
    return discovery;
  } catch {
    // Not reachable right now; nothing was learned about the person's access there.
    return failed('facility_unreachable', t('central.open.unreachable', { facility: fallbackName }));
  }
}

/** Steps 2 to 5 for a facility that accepts association sign-in. */
async function switchAndExchange(ticket: Ticket, discovery: Discovery): Promise<OpenOutcome> {
  const { server, config } = discovery;
  const name = facilityNameOf(server);
  if (!isCurrent(ticket)) return ended();
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
  setFacilityCapabilities(server, config.capabilities);
  return settle(ticket, server, await exchange(ticket, server.origin), false);
}

async function open(ticket: Ticket | null, origin: string, fallbackName: string): Promise<OpenOutcome> {
  const central = getCentralLoginConfig();
  if (!central || !ticket || !isCurrent(ticket)) return ended();
  if (await blockedByEarlierSession(origin)) return earlierSessionBusy();
  const discovery = await discover(ticket, origin, fallbackName);
  if ('kind' in discovery) return discovery;
  // A facility that does not name this build's issuer does not accept
  // association sign-in (a non-member, or one that trusts another issuer).
  // Nothing was learned about the person's access there, so the status stays.
  if (discovery.config.centralLogin?.issuer !== central.issuer) return { kind: 'sms_offer' };
  return switchAndExchange(ticket, discovery);
}

/** Counts the opens begun; an open is the latest while no other has begun since it. */
let openSeq = 0;

/**
 * Hands the answer to whichever screen is mounted. An answer for a central
 * session that has ended meanwhile (signed out, refused, deleted, another
 * person signed in) is dropped: the next person to sign in must not be told
 * about the previous one's facility.
 *
 * Such a late answer also leaves alone what belongs to the person on the phone
 * now: the "opening" state (and with it the guard against a second open) when an
 * open of theirs has begun since, and an answer of theirs still waiting to be
 * shown. The one late answer that is told says only that this phone ended an
 * earlier sign-in's facility session, without a facility name: on the list when
 * nothing is waiting there, or else in a dialog of its own.
 */
function publish(ticket: Ticket | null, seq: number, origin: string, name: string, outcome: OpenOutcome): OpenOutcome {
  const latest = seq === openSeq;
  if (ticket !== null && isCurrent(ticket)) {
    setCentralState({
      ...(latest ? { opening: null } : {}),
      outcome: { id: nextOutcomeId(), origin, name, outcome },
    });
    return outcome;
  }
  if (latest) setCentralState({ opening: null });
  if (isAboutEarlierSession(outcome)) {
    if (getCentralState().outcome === null) setCentralState({ outcome: { id: nextOutcomeId(), origin: '', name: '', outcome } });
    else showAlert(t(EARLIER_SESSION_TITLES[outcome.reason]!), outcome.message);
  }
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
  return getCentralState().leaving > 0 || Boolean(auth.logoutRequest || auth.forceLogoutRequest || auth.deleteRequest);
}

/** The facility being opened and the sign-in it was started for (for the refusal of a second open). */
let openingFacility: { name: string; generation: number } | null = null;

/**
 * Open a facility from "My facilities". `name` is what the list calls it, for
 * messages about a facility that could not even be reached. Never throws.
 *
 * While a facility session is being ended its profile is already gone from the
 * store and My facilities is shown, but the cleanup is still running: an open
 * now would race it (and, after an account deletion, file a new access request
 * for the deleted account). Such an open is refused as busy and the refusal is
 * said in a dialog at once (title "Still signing out" while a sign-out runs); `opening`
 * is left alone, since another open may really be in flight.
 */
export async function openFacility(origin: string, name: string): Promise<OpenOutcome> {
  const stillSigningOut = signOutInProgress();
  if (getCentralState().opening || stillSigningOut) {
    // Said in a dialog of its own, at once. Not published as an answer: one may already be
    // waiting, and a refusal that is dropped leaves the tap with no reaction at all.
    const title = stillSigningOut ? t('central.facilities.signingOutTitle') : t('auth.server.busyTitle');
    // The name is used only while it belongs to this sign-in; otherwise the message names no facility.
    const message = stillSigningOut
      ? t('central.facilities.signingOutMessage')
      : openingFacility && openingFacility.generation === getCentralIdentityGeneration()
        ? t('central.facilities.stillOpening', { facility: openingFacility.name })
        : t('central.switch.busyMessage');
    showAlert(title, message);
    return failed('busy', message);
  }
  const ticket = takeTicket();
  const seq = ++openSeq;
  openingFacility = { name, generation: getCentralIdentityGeneration() };
  setCentralState({ opening: origin, outcome: null, autoOpenSpent: true });
  try {
    return publish(ticket, seq, origin, name, await open(ticket, origin, name));
  } catch {
    return publish(ticket, seq, origin, name, failed('failed', t('central.open.failed', { facility: name })));
  }
}

/**
 * The second step of linking: the person typed the code the facility sent.
 * A fresh identity token goes to the facility together with the code.
 * The result is returned to the code screen and not published. A code step
 * begun for another number than the signed-in person's is not completed.
 */
export async function completeFacilityLink(code: string): Promise<OpenOutcome> {
  const link = getCentralState().pendingLink;
  const ticket = takeTicket();
  const server = getActiveOperatorServer();
  if (!link || !ticket || !server || server.origin !== link.origin || link.phoneNumber !== ticket.user.phoneNumber)
    return failed('failed', t('central.open.failed', { facility: link?.name ?? '' }));
  try {
    return await settle(ticket, server, await exchange(ticket, link.origin, code), true);
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
  const ticket = takeTicket();
  if (!ticket) return ended();
  if (await blockedByEarlierSession(origin)) return earlierSessionBusy();
  const discovery = await discover(ticket, origin, name);
  if ('kind' in discovery) return discovery;
  if (!isCurrent(ticket)) return ended();
  const switched = await switchOperatorServer(discovery.server, store.dispatch);
  if (switched.kind === 'busy') return failed('busy', t('central.switch.busyMessage'));
  if (switched.kind === 'failed')
    return failed('switch_failed', t('central.open.switchFailed', { facility: facilityNameOf(discovery.server) }));
  initializeSupabase(discovery.config.supabaseUrl, discovery.config.anonKey);
  setFacilityCapabilities(discovery.server, discovery.config.capabilities);
  if (!isCurrent(ticket)) return ended();
  setCentralState({ facilitySmsOrigin: discovery.server.origin, autoOpenSpent: true });
  return { kind: 'sms_offer' };
}

/**
 * A screen takes the answer of the last open to show it or act on it. True for the one
 * caller that gets it; false when another screen has taken it already. Two My facilities
 * can be mounted at once (one under the other in the stack) and both see the same answer
 * in the same render: only the first to ask may navigate or show the message.
 */
export function consumeOpenOutcome(id: number): boolean {
  if (getCentralState().outcome?.id !== id) return false;
  setCentralState({ outcome: null });
  return true;
}
