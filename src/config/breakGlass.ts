/**
 * Sign-in with a code from the facility (backend migration 132): for a worker whose association sign-in cannot be
 * used, for example while the internet is down. The facility's operator makes a one-time code on the facility's own
 * server; the worker chooses the facility from the facilities this phone has used, types their mobile number and the
 * code, and the app signs in at the facility alone (`breakGlassSignIn` in src/config/supabaseConfig.ts). No central
 * session is involved.
 *
 * This file makes the chosen facility the selected server, the way the server address screen and "My facilities" do
 * (the shared switch sequence of src/store/operatorSwitch.ts, which ends the previous facility's session), and gives
 * the transport the facility's warehouse-network address from src/config/facilityLanMemory.ts so that the discovery
 * and the sign-in can reach a facility whose public address does not answer. Both ride the existing LAN fallback
 * rules (src/config/lanTransport.ts): the address is checked against the facility's instance id before anything is
 * sent, and only on a network that can hold it.
 */
import { store } from '@/store';
import { retryStaleFacilityCleanup, switchOperatorServer } from '@/store/operatorSwitch';
import { t } from '@/i18n';
import { appTooOldInfo, isAppTooOld, type AppTooOldInfo } from './appTooOld';
import { setFacilityRelease } from './backendFeatures';
import { loadAllMyFacilities, type MyFacility } from './centralFacilities';
import { getCentralState } from './centralState';
import { setFacilityCapabilities } from './facilityCapabilities';
import { recallFacilityLan } from './facilityLanMemory';
import { getLanContext, setLanContext } from './lanTransport';
import { discoverOperator, getActiveOperatorServer, recordServerLanAddress } from './operatorServer';
import { isStaleFacility } from './staleFacilitySession';
import { initializeSupabase } from './supabaseConfig';
import { DISCOVERY_BUSY_CODE, UPGRADING_CODE } from '@/utils/serverText';

/** The facilities the worker can choose from: those on any person's list on this phone, minus the ones the association dropped. */
export async function listFacilitiesForCode(): Promise<MyFacility[]> {
  return (await loadAllMyFacilities()).filter(entry => !entry.gone);
}

export type PrepareResult = { ok: true } | { ok: false; message: string; appTooOld?: AppTooOldInfo };

const refused = (message: string, appTooOld?: AppTooOldInfo): PrepareResult => ({
  ok: false,
  message,
  ...(appTooOld ? { appTooOld } : {}),
});

/**
 * Makes `facility` the selected server so that the code can be sent to it. Never throws. The previous facility's
 * session is ended by the switch, as for any other change of facility.
 */
export async function prepareFacilityForCode(facility: MyFacility): Promise<PrepareResult> {
  const auth = store.getState().auth;
  if (getCentralState().leaving > 0 || auth.logoutRequest || auth.forceLogoutRequest || auth.deleteRequest)
    return refused(t('central.facilities.signingOutMessage'));
  const previousContext = getLanContext();
  let committed = false;
  try {
    // A session of an earlier sign-in at this facility that could not be ended yet: nothing is asked of it.
    if (await isStaleFacility(facility.origin)) {
      await retryStaleFacilityCleanup(store.dispatch);
      if (await isStaleFacility(facility.origin)) return refused(t('central.open.previousPending'));
    }
    // The address on the warehouse network, so that the discovery below can fall back to it. When the facility is
    // already selected the transport has its own address and keeps it.
    const remembered = await recallFacilityLan(facility.origin);
    const selected = getActiveOperatorServer();
    if (remembered && selected?.origin !== facility.origin)
      setLanContext({ canonical: facility.origin, lan: remembered.lan, instanceId: remembered.instanceId });
    let discovery: Awaited<ReturnType<typeof discoverOperator>>;
    try {
      discovery = await discoverOperator(facility.origin);
    } catch (error) {
      if (isAppTooOld(error)) return refused((error as Error).message, appTooOldInfo(error));
      const code = (error as { code?: unknown } | null)?.code;
      if (code === UPGRADING_CODE) return refused(t('components.upgrading.message'));
      if (code === DISCOVERY_BUSY_CODE) return refused(t('errors.server.discoveryBusy'));
      return refused(t('central.open.unreachable', { facility: facility.name }));
    }
    const switched = await switchOperatorServer(discovery.server, store.dispatch);
    if (switched.kind === 'busy') return refused(t('central.switch.busyMessage'));
    if (switched.kind === 'failed') return refused(t('central.open.switchFailed', { facility: facility.name }));
    committed = true;
    initializeSupabase(discovery.config.supabaseUrl, discovery.config.anonKey);
    setFacilityCapabilities(discovery.server, discovery.config.capabilities);
    setFacilityRelease(discovery.server, discovery.config);
    // A switch saves the server as discovery described it, without the address on the warehouse network.
    if (remembered && !getActiveOperatorServer()?.lan) await recordServerLanAddress(discovery.server.origin, remembered.lan);
    return { ok: true };
  } catch {
    return refused(t('central.open.failed', { facility: facility.name }));
  } finally {
    // Nothing changed: the transport goes back to what it had.
    if (!committed && getActiveOperatorServer()?.origin !== facility.origin) setLanContext(previousContext);
  }
}
