/**
 * What "online" means for this app (WS-L): the facility's server answers, not that Google does.
 *
 * NetInfo decides `isInternetReachable` by fetching a URL. Its default is a Google address, so a Wi-Fi
 * that blocks Google, or a broadband outage with the warehouse server still reachable on the LAN, made
 * about twenty screens show the offline banner and refuse to save. Here NetInfo is pointed at the
 * selected facility's public `GET /functions/v1/hello` instead, which answers 200 with a short text.
 *
 *  - Installed in `bootstrapApp` (app/_layout.tsx); applied again whenever the selected server changes
 *    (`onOperatorServerChange`), and reset to NetInfo's defaults when there is none (`clearOperatorServer`).
 *  - Only a probe the facility did not answer counts as "unreachable": a 200, a 429 and any answer that carries
 *    the gateway's `X-Warehouse-Path` header (a 5xx of the gateway included) are the facility answering
 *    (`publicAnswered`, src/config/lanTransport.ts). Without that, a busy functions limit, which every phone
 *    behind the facility's address shares, would mark the internet unreachable and move the phone to plain http.
 *  - `useIsOffline` (src/hooks/useNetworkStatus.ts) is false when this public probe fails but the
 *    warehouse network path is in use (src/config/lanTransport.ts).
 *  - When the probe finds the public address unreachable, the transport confirms it and asks the LAN
 *    address (`notePublicUnreachable`), so the switch does not wait for a request to fail. Every NetInfo
 *    event also tells the transport the phone's network (`noteNetworkState`): a change of network type,
 *    Wi-Fi address or subnet puts the phone back on the public path, so the identity check of the LAN
 *    address runs again on the new network (review H1).
 *  - NetInfo's `reachabilityShouldRun` is not used to hold the probe back during an upload or in the
 *    background: NetInfo reads it only when the connection changes, and a "no" there reports the internet as
 *    unreachable. The transport instead ignores a failed probe while an upload is going out.
 *
 * `NetInfo.configure` stops every listener added before it, so it is called only when the probe URL
 * really changes, and the listeners of the hooks are renewed through `netInfoGeneration.ts`.
 */
import NetInfo, { type NetInfoConfiguration, type NetInfoState } from '@react-native-community/netinfo';
import { getActiveOperatorServer, onOperatorServerChange } from './operatorServer';
import { noteNetworkState, notePublicUnreachable, publicAnswered, type NetworkSnapshot } from './lanTransport';
import { bumpNetInfoGeneration } from './netInfoGeneration';

export const REACHABILITY_PATH = '/functions/v1/hello';

/** The NetInfo configuration that makes "internet reachable" mean "this facility's server answers". */
export function reachabilityConfiguration(origin: string): Partial<NetInfoConfiguration> {
  return {
    reachabilityUrl: `${origin}${REACHABILITY_PATH}`,
    // GET, as the contract documents `hello`; NetInfo's default HEAD is not part of it.
    reachabilityMethod: 'GET',
    // The platform's own answer is "some network has internet"; only the facility's answer counts here.
    useNativeReachability: false,
    reachabilityTest: response => Promise.resolve(publicAnswered(response)),
  };
}

/** The reachability URL NetInfo uses now: a facility's `hello`, null for NetInfo's defaults, undefined before the first call. */
let applied: string | null | undefined;
let stopServerListener: (() => void) | undefined;
let stopNetInfoListener: (() => void) | undefined;

/** The part of a NetInfo state the transport needs; the addresses are those of Wi-Fi and Ethernet only. */
export function networkOf(state: NetInfoState): NetworkSnapshot {
  const details = state.details as { ipAddress?: unknown; subnet?: unknown } | null;
  return {
    connected: state.isConnected ?? null,
    type: state.type ?? null,
    ipAddress: typeof details?.ipAddress === 'string' ? details.ipAddress : null,
    subnet: typeof details?.subnet === 'string' ? details.subnet : null,
  };
}

function listenToNetInfo(): void {
  stopNetInfoListener?.();
  stopNetInfoListener = NetInfo.addEventListener(state => {
    // The network first: a change puts the phone back on the public path before the check below asks anything.
    noteNetworkState(networkOf(state));
    if (state.isConnected && state.isInternetReachable === false) notePublicUnreachable();
  });
}

/** Points NetInfo at the selected facility (or back to its defaults when none is selected). */
export function applyNetReachability(): void {
  const origin = getActiveOperatorServer()?.origin ?? null;
  const url = origin ? `${origin}${REACHABILITY_PATH}` : null;
  if (url === applied) return;
  const first = applied === undefined;
  applied = url;
  try {
    // Nothing to reset before the first call when no facility is selected: NetInfo is still on its defaults.
    if (origin) NetInfo.configure(reachabilityConfiguration(origin));
    else if (!first) NetInfo.configure({});
    listenToNetInfo();
  } catch {
    // The probe is an improvement over the default; without it the app behaves as before.
  }
  // `configure` stopped the listeners of the hooks; they subscribe again.
  bumpNetInfoGeneration();
}

/** The shortest time between two re-checks started by failing requests: a screen that fails ten reads asks once. */
export const RECHECK_MIN_INTERVAL_MS = 5000;
let lastRecheckAt = 0;

/**
 * A request failed with a network failure (no answer at all): ask NetInfo to check reachability now, so the offline
 * banner follows within seconds instead of at the next scheduled check. Debounced; never throws and never waits.
 */
export function noteRequestNetworkFailure(now: number = Date.now()): void {
  // Only once the reachability probe is installed (bootstrapApp): before that NetInfo has nothing to re-check.
  if (applied === undefined) return;
  if (now - lastRecheckAt < RECHECK_MIN_INTERVAL_MS) return;
  lastRecheckAt = now;
  try {
    Promise.resolve(NetInfo.refresh()).catch(() => {});
  } catch {
    // The re-check is an improvement; without it the banner follows at NetInfo's next check.
  }
}

/** Called once from `bootstrapApp`; safe to call again. */
export function installNetReachability(): void {
  if (!stopServerListener) stopServerListener = onOperatorServerChange(applyNetReachability);
  applyNetReachability();
}

/** For tests: forget what was applied and stop listening. */
export function resetNetReachability(): void {
  stopServerListener?.();
  stopServerListener = undefined;
  stopNetInfoListener?.();
  stopNetInfoListener = undefined;
  applied = undefined;
  lastRecheckAt = 0;
}
