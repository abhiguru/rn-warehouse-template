import { discoverOperator, loadOperatorServer, saveOperatorServer, getActiveOperatorServer } from './operatorServer';

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
  const discovery = await discoverOperator(selected.origin);
  if (!isCurrent()) return { kind: 'superseded' };
  if (selected.instanceId !== discovery.server.instanceId) {
    await clearReplacedInstance();
    if (!isCurrent()) return { kind: 'superseded' };
  }
  await saveOperatorServer(discovery.server, false);
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
