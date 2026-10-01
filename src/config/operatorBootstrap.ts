import { discoverOperator, loadOperatorServer, saveOperatorServer } from './operatorServer';

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
