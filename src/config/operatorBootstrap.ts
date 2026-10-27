import { discoverOperator, loadOperatorServer, saveOperatorServer, getActiveOperatorServer } from './operatorServer';
import { setFacilityCapabilities } from './facilityCapabilities';
import { setFacilityRelease } from './backendFeatures';
import { clearAppTooOld, isAppTooOld, reportAppTooOld } from './appTooOld';
import { noteDiscoveryAnswered, noteDiscoveryUpgrading } from './upgradeNotice';
import { UPGRADING_CODE } from '@/utils/serverText';

type Discovery = Awaited<ReturnType<typeof discoverOperator>>;
type BootstrapResult = { kind: 'selection' } | { kind: 'superseded' } | { kind: 'verified'; discovery: Discovery };

// Discovery is public. Complete local cleanup before adopting a replacement
// identity or allowing callers to initialize an authenticated application.
export async function verifySelectedOperator(
  isCurrent: () => boolean,
  clearReplacedInstance: () => Promise<void>
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
    throw error;
  }
  if (!isCurrent()) return { kind: 'superseded' };
  // The facility answered and this build is accepted: no "update" screen, no "being updated" banner. (The check has just read
  // the facility afresh, so ending the banner here needs no second check.)
  clearAppTooOld();
  noteDiscoveryAnswered();
  if (selected.instanceId !== discovery.server.instanceId) {
    await clearReplacedInstance();
    if (!isCurrent()) return { kind: 'superseded' };
  }
  await saveOperatorServer(discovery.server, false);
  // Every active-server path passes here (cold start, server change, return to the
  // foreground), so the facility's capabilities are always those of its latest answer.
  setFacilityCapabilities(discovery.server, discovery.config.capabilities);
  setFacilityRelease(discovery.server, discovery.config);
  if (!isCurrent()) return { kind: 'superseded' };
  return { kind: 'verified', discovery };
}

// Reuse startup cleanup on resume, without remounting matching-instance drafts.
export async function verifyForegroundOperator(
  isCurrent: () => boolean,
  clearReplacedInstance: () => Promise<void>,
  initializeReplacement: (config: Discovery['config']) => void
): Promise<boolean> {
  const previous = getActiveOperatorServer();
  const result = await verifySelectedOperator(isCurrent, clearReplacedInstance);
  if (result.kind !== 'verified' || !isCurrent()) return false;
  if (previous?.origin !== result.discovery.server.origin ||
      previous.instanceId !== result.discovery.server.instanceId) {
    initializeReplacement(result.discovery.config);
  }
  return isCurrent();
}
