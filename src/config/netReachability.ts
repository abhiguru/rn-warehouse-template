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
 *  - `useIsOffline` (src/hooks/useNetworkStatus.ts) is false when this public probe fails but the
 *    warehouse network path is in use (src/config/lanTransport.ts).
 *  - When the probe finds the public address unreachable, the transport confirms it and asks the LAN
 *    address (`notePublicUnreachable`), so the switch does not wait for a request to fail.
 *
 * `NetInfo.configure` stops every listener added before it, so it is called only when the probe URL
 * really changes, and the listeners of the hooks are renewed through `netInfoGeneration.ts`.
 */
import NetInfo, { type NetInfoConfiguration } from '@react-native-community/netinfo';
import { getActiveOperatorServer, onOperatorServerChange } from './operatorServer';
import { notePublicUnreachable } from './lanTransport';
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
    reachabilityTest: response => Promise.resolve(response.status === 200),
  };
}

/** The reachability URL NetInfo uses now: a facility's `hello`, null for NetInfo's defaults, undefined before the first call. */
let applied: string | null | undefined;
let stopServerListener: (() => void) | undefined;
let stopNetInfoListener: (() => void) | undefined;

function listenToNetInfo(): void {
  stopNetInfoListener?.();
  stopNetInfoListener = NetInfo.addEventListener(state => {
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
}
