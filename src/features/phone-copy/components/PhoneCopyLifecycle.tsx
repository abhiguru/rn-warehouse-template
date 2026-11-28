/**
 * Starts and stops the phone copy's sync with the app (WH-298, contract 6.6). Mounted once in app/_layout.tsx for a
 * signed-in administrator, supervisor or staff member; renders nothing.
 *
 * - Opening (and the facility having the feature): open the copy, then sync.
 * - Foreground: sync. Background: the request in flight is dropped, a local write ends, nothing runs until active.
 * - Reconnecting: sync at once. Offline: no tick, and the copy is not current.
 * - While mounted, the engine's interval (45 s after a full sync) and its waits after a failure run.
 * - The facility without the feature: no copy on the phone.
 * - The facility's settings not read yet: nothing is started and nothing erased (WH-355).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { getKnownCapabilitiesOf, subscribeFacilityCapabilities } from '@/config/facilityCapabilities';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { getLanStatus } from '@/config/lanTransport';
import { getNetInfoGeneration, subscribeNetInfoGeneration } from '@/config/netInfoGeneration';
import { isOfflineState } from '@/config/netOffline';
import { FormDraftHost } from '@/features/unsent/FormDraftHost';
import { initUnsent } from '@/features/unsent/unsentStore';
import { sendNow } from '@/features/unsent/sendEngine';
import { createLogger, loggableError } from '@/utils/logger';
import { eraseCopy } from '../copyDb';
import { startHeldPhotos, stopHeldPhotos } from '@/features/holding/heldPhotos';
import { startPhotoReports, stopPhotoReports } from '@/features/unsent/photoReports';
import { startMoneyRefresh, stopMoneyRefresh } from '../money/moneyRefresh';
import { setCopyForeground, setCopyOffline, setSyncSchedule, startPhoneCopy, stopPhoneCopy, syncNow } from '../syncEngine';

const logger = createLogger('[phone-copy-lifecycle]');

export function PhoneCopyLifecycle() {
  useEffect(() => {
    let live = true;
    let enabled = false;
    let foreground = AppState.currentState !== 'background';
    let offline: boolean | null = null;

    const begin = async () => {
      await startPhoneCopy();
      if (live && enabled && foreground) await syncNow('open');
    };

    let known = false;
    const applyCapability = async () => {
      // The capability of the server this session belongs to (its scope names the server; while the session cannot be
      // read, that is the selected server).
      const scope = await getSessionCacheScope();
      const [origin, instanceId] = scope ? (JSON.parse(scope) as string[]) : [];
      const server = origin && instanceId ? { origin, instanceId } : getActiveOperatorServer();
      const capabilities = server ? getKnownCapabilitiesOf(server) : undefined;
      // Not known is not off: the subscription below asks again when the server's settings are read.
      if (!live || !capabilities) return;
      const on = capabilities.sync;
      if (known && on === enabled) return;
      known = true;
      enabled = on;
      setSyncSchedule(on);
      if (on) {
        if (foreground) await begin();
      } else {
        // A facility without the feature, or whose feature was switched off, keeps no copy on the phone (criterion 14).
        await eraseCopy();
      }
    };

    const onNet = (state: NetInfoState | undefined) => {
      const now = isOfflineState(state, getLanStatus());
      const was = offline;
      offline = now;
      setCopyOffline(now);
      // The unsent work is sent on reconnecting whatever the facility's feature says (the engine hears the copy's offline flag).
      if (live && enabled && foreground && was === true && !now) void syncNow('reconnect');
    };

    const onAppState = (state: string) => {
      const active = state === 'active';
      if (state !== 'active' && state !== 'background') return;
      if (active === foreground) return;
      foreground = active;
      setCopyForeground(active);
      // Unsent work is sent when the app comes forward, with the feature on or off.
      if (active) void sendNow('foreground');
      if (!enabled) return;
      if (active) {
        void startPhoneCopy().then(() => (live && foreground ? syncNow('foreground') : undefined));
      }
      else void stopPhoneCopy();
    };

    // The connection is followed only while the feature is on. NetInfo.configure (src/config/netReachability.ts) stops
    // earlier listeners: listen again after it.
    let stopNet: (() => void) | null = null;
    let generation = getNetInfoGeneration();
    function listenToNet() {
      stopNet?.();
      generation = getNetInfoGeneration();
      stopNet = NetInfo.addEventListener(onNet);
    }
    function stopListening() {
      stopNet?.();
      stopNet = null;
      offline = null;
    }
    const stopGeneration = subscribeNetInfoGeneration(() => {
      if (stopNet && getNetInfoGeneration() !== generation) listenToNet();
    });
    startMoneyRefresh();
    startHeldPhotos();
    startPhotoReports();
    const appState = AppState.addEventListener('change', onAppState);
    const stopCapabilities = subscribeFacilityCapabilities(() => void applyCapability());
    setCopyForeground(foreground);
    // The unsent work does not depend on the phone copy (WH-301): it is opened and sent for any signed-in warehouse session,
    // with the feature on or off, and the connection is followed for it either way (contract 4, triggers).
    listenToNet();
    void initUnsent().then(
      () => sendNow('open'),
      error => logger.warn('The unsent work could not be started', loggableError(error))
    );
    void applyCapability();

    return () => {
      live = false;
      stopListening();
      stopGeneration();
      appState.remove();
      stopMoneyRefresh();
      stopHeldPhotos();
      stopPhotoReports();
      stopCapabilities();
      setSyncSchedule(false);
      void stopPhoneCopy();
    };
  }, []);

  return <FormDraftHost />;
}

export default PhoneCopyLifecycle;
