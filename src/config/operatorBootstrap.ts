import { discoverOperator, loadOperatorServer, saveOperatorServer, getActiveOperatorServer } from './operatorServer';
import { setFacilityCapabilities } from './facilityCapabilities';
import { noteBackendRelease } from './backendTooOld';
import { clearAppTooOld, isAppTooOld, reportAppTooOld } from './appTooOld';
import { noteDiscoveryAnswered, noteDiscoveryUpgrading } from './upgradeNotice';
import { UPGRADING_CODE } from '@/utils/serverText';
import type { PublicConfig } from '@/services/configService';
import type { OperatorServer } from './operatorServer';
import { getCachedUserProfile, getStoredToken, initializeSupabase } from './supabaseConfig';
import { getSessionGeneration } from './sessionLifecycle';
import {
  clearOfflineStarted,
  hasSyncCapability,
  isCopyRole,
  isNoAnswer,
  keepOfflineStart,
  markOfflineStarted,
  readOfflineStart,
} from './offlineStart';

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;
type BootstrapResult =
  | { kind: 'selection' }
  | { kind: 'superseded' }
  | { kind: 'verified'; discovery: Discovery }
  | { kind: 'offline'; server: OperatorServer; config: PublicConfig };

/**
 * The kept config of the selected facility when the app may open into it with no answer from the server (WH-298,
 * contract 3.2): the facility has the offline feature, and the person is signed in on this phone (a stored token, of
 * any validity, and a cached profile for it that the server confirmed within the idle limit of
 * src/config/offlineLimit.ts) in a role that has the phone copy. The client is set up from the kept config first, because the cached
 * profile is filed under the facility's address. Null otherwise: the facility still needs the server.
 * 'profile-refused' also needs the server: the person is signed in at a facility with the feature, but the kept profile
 * gives nothing (past the idle limit, no stored time, the clock set back, or no readable profile for this session).
 */
async function offlineStartConfig(selected: OperatorServer): Promise<PublicConfig | 'profile-refused' | null> {
  const config = await readOfflineStart(selected);
  if (!config || !hasSyncCapability(config)) return null;
  const token = await getStoredToken();
  if (!token.authToken) return null;
  initializeSupabase(config.supabaseUrl, config.anonKey);
  // Customer accounts never open offline (Product's P5): their screens keep today's behaviour.
  const profile = (await getCachedUserProfile({ allowExpired: true })) as { role?: unknown } | null;
  if (!profile) return 'profile-refused';
  return isCopyRole(profile.role) ? config : null;
}

// Discovery is public. Complete local cleanup before adopting a replacement
// identity or allowing callers to initialize an authenticated application.
//
// `onOfflineRefused` is told, with the failure that is then thrown, when the server gave no answer and the kept profile
// may no longer open the app (WH-350): an app that is already open must close, as a start would not have opened it.
export async function verifySelectedOperator(
  isCurrent: () => boolean,
  clearReplacedInstance: () => Promise<void>,
  onOfflineRefused?: (error: unknown) => void
): Promise<BootstrapResult> {
  const selected = await loadOperatorServer();
  if (!isCurrent()) return { kind: 'superseded' };
  if (!selected) return { kind: 'selection' };
  let discovery: Discovery;
  try {
    discovery = await discoverOperator(selected.origin);
  } catch (error) {
    // This is the ACTIVE facility, asked on a cold start and on every return to the foreground. What it answers is
    // told to the whole app, not only to the caller that happened to ask: a minimum above this build puts up the
    // "Update the app" screen (appTooOld.ts), the upgrade answer raises the banner (upgradeNotice.ts).
    if (isCurrent()) {
      if (isAppTooOld(error)) reportAppTooOld(error);
      else if ((error as { code?: unknown } | null)?.code === UPGRADING_CODE) noteDiscoveryUpgrading();
    }
    // No answer at all (never an answer with an error): a facility opened on this phone before opens from its kept
    // config. Its capabilities are those of that last answer.
    if (isNoAnswer(error)) {
      if (!isCurrent()) return { kind: 'superseded' };
      const generation = getSessionGeneration();
      const config = await offlineStartConfig(selected);
      if (!isCurrent()) return { kind: 'superseded' };
      if (config === 'profile-refused') {
        // A session that ended or was replaced during the read says nothing about the one now open.
        if (generation === getSessionGeneration()) onOfflineRefused?.(error);
      } else if (config) {
        setFacilityCapabilities(selected, config.capabilities);
        markOfflineStarted();
        return { kind: 'offline', server: selected, config };
      }
    }
    throw error;
  }
  if (!isCurrent()) return { kind: 'superseded' };
  // The facility answered and this build is accepted: no "update" screen, no "being updated" banner. (The check has just read
  // the facility afresh, so ending the banner here needs no second check.)
  clearAppTooOld();
  noteDiscoveryAnswered();
  clearOfflineStarted();
  if (selected.instanceId !== discovery.server.instanceId) {
    await clearReplacedInstance();
    if (!isCurrent()) return { kind: 'superseded' };
  }
  await saveOperatorServer(discovery.server, false);
  // Every active-server path passes here (cold start, server change, return to the
  // foreground), so the facility's capabilities are always those of its latest answer.
  setFacilityCapabilities(discovery.server, discovery.config.capabilities);
  noteBackendRelease(discovery.server, discovery.config);
  // The config an offline start opens with: kept while the facility has the feature, removed when it is switched off.
  await keepOfflineStart(discovery.server, discovery.config);
  if (!isCurrent()) return { kind: 'superseded' };
  return { kind: 'verified', discovery };
}

// Reuse startup cleanup on resume, without remounting matching-instance drafts.
export async function verifyForegroundOperator(
  isCurrent: () => boolean,
  clearReplacedInstance: () => Promise<void>,
  initializeReplacement: (config: Discovery['config']) => void,
  onOfflineRefused?: (error: unknown) => void
): Promise<boolean> {
  const previous = getActiveOperatorServer();
  const result = await verifySelectedOperator(isCurrent, clearReplacedInstance, onOfflineRefused);
  if (result.kind !== 'verified' || !isCurrent()) return false;
  if (previous?.origin !== result.discovery.server.origin ||
      previous.instanceId !== result.discovery.server.instanceId) {
    initializeReplacement(result.discovery.config);
  }
  return isCurrent();
}
