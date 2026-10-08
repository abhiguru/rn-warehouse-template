import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySelectedOperator, verifyForegroundOperator } from '../operatorBootstrap';
import { getActiveOperatorServer, loadOperatorServer, saveOperatorServer } from '../operatorServer';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
const oldFetch = global.fetch;
const selected = { origin: 'https://warehouse.example.test', instanceId: 'instance-old', displayName: 'Fictional Old', companyName: 'Fictional Company' };
const publicResponse = (instanceId = selected.instanceId) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data: {
    supabaseUrl: selected.origin,
    anonKey: `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`,
    environment: 'production', version: '0.1.0', maintenanceMode: false,
    instanceId, displayName: 'Fictional Current', companyName: selected.companyName,
    canonicalOrigin: selected.origin, supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: {},
    urls: { publicConfig: `${selected.origin}/functions/v1/get-public-config`, fullConfig: `${selected.origin}/functions/v1/get-config` },
  } }),
} as Response);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadOperatorServer();
  global.fetch = jest.fn().mockResolvedValue(publicResponse());
});
afterAll(() => { global.fetch = oldFetch; });

it('requires server selection before any discovery or credential cleanup on first launch', async () => {
  const clear = jest.fn();
  expect(await verifySelectedOperator(() => true, clear)).toEqual({ kind: 'selection' });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

it('preserves a matching instance and performs only public discovery', async () => {
  await saveOperatorServer(selected);
  const clear = jest.fn();
  const result = await verifySelectedOperator(() => true, clear);
  expect(result.kind).toBe('verified');
  expect(getActiveOperatorServer()?.instanceId).toBe(selected.instanceId);
  expect(clear).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(`${selected.origin}/functions/v1/get-public-config`,
    expect.objectContaining({ redirect: 'error' }));
  expect(jest.mocked(global.fetch).mock.calls[0][1]?.headers).toBeUndefined();
});

it('waits for complete replacement cleanup before adopting its public identity', async () => {
  await saveOperatorServer(selected);
  jest.mocked(global.fetch).mockResolvedValue(publicResponse('instance-new'));
  const cleanup = deferred<void>();
  const started = deferred<void>();
  const pending = verifySelectedOperator(() => true, async () => { started.resolve(); await cleanup.promise; });
  await started.promise;
  expect(getActiveOperatorServer()?.instanceId).toBe('instance-old');
  expect(JSON.parse((await AsyncStorage.getItem('operator_server_v1'))!).instanceId).toBe('instance-old');
  cleanup.resolve();
  expect((await pending).kind).toBe('verified');
  expect(getActiveOperatorServer()?.instanceId).toBe('instance-new');
});

it('does not adopt a replacement when local cleanup fails', async () => {
  await saveOperatorServer(selected);
  jest.mocked(global.fetch).mockResolvedValue(publicResponse('instance-new'));
  await expect(verifySelectedOperator(() => true, async () => { throw new Error('Fictional cleanup failure'); }))
    .rejects.toThrow('Fictional cleanup failure');
  expect(getActiveOperatorServer()).toEqual(selected);
});

it.each(['unreachable', 'incompatible'])('preserves selection and avoids cleanup for %s discovery', async kind => {
  await saveOperatorServer(selected);
  if (kind === 'unreachable') jest.mocked(global.fetch).mockRejectedValue(new Error('Fictional network failure'));
  else jest.mocked(global.fetch).mockResolvedValue({ ...publicResponse(), json: async () => ({ success: true, data: {} }) } as Response);
  const clear = jest.fn();
  await expect(verifySelectedOperator(() => true, clear)).rejects.toThrow();
  expect(getActiveOperatorServer()).toEqual(selected);
  expect(clear).not.toHaveBeenCalled();
});

it('ignores stale discovery before clearing credentials or saving an identity', async () => {
  await saveOperatorServer(selected);
  const response = deferred<Response>();
  jest.mocked(global.fetch).mockReturnValue(response.promise);
  let current = true;
  const clear = jest.fn();
  const pending = verifySelectedOperator(() => current, clear);
  for (let i = 0; i < 10 && !jest.mocked(global.fetch).mock.calls.length; i++) await Promise.resolve();
  current = false;
  response.resolve(publicResponse('instance-new'));
  expect(await pending).toEqual({ kind: 'superseded' });
  expect(clear).not.toHaveBeenCalled();
  expect(getActiveOperatorServer()).toEqual(selected);
});

it('does not adopt an old discovery after its replacement cleanup is superseded', async () => {
  await saveOperatorServer(selected);
  jest.mocked(global.fetch).mockResolvedValue(publicResponse('instance-new'));
  let current = true;
  const result = await verifySelectedOperator(() => current, async () => { current = false; });
  expect(result).toEqual({ kind: 'superseded' });
  expect(getActiveOperatorServer()).toEqual(selected);
});

it('foreground verification preserves matching drafts and sessions without client reinitialization', async () => {
  await saveOperatorServer(selected);
  const clear = jest.fn(), initialize = jest.fn();
  expect(await verifyForegroundOperator(() => true, clear, initialize)).toBe(true);
  expect(clear).not.toHaveBeenCalled(); expect(initialize).not.toHaveBeenCalled();
});
it('foreground replacement waits for local cleanup before initializing the replacement', async () => {
  await saveOperatorServer(selected);
  jest.mocked(global.fetch).mockResolvedValue(publicResponse('instance-new'));
  const cleanup = deferred<void>(), started = deferred<void>();
  const initialize = jest.fn();
  const verification = verifyForegroundOperator(() => true, async () => { started.resolve(); await cleanup.promise; }, initialize);
  await started.promise; expect(initialize).not.toHaveBeenCalled();
  cleanup.resolve(); expect(await verification).toBe(true);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(getActiveOperatorServer()?.instanceId).toBe('instance-new');
  expect(jest.mocked(global.fetch).mock.calls[0][1]?.headers).toBeUndefined();
});
it('offline foreground verification preserves selection and never initializes another client', async () => {
  await saveOperatorServer(selected);
  jest.mocked(global.fetch).mockRejectedValue(new Error('offline'));
  const clear = jest.fn(), initialize = jest.fn();
  await expect(verifyForegroundOperator(() => true, clear, initialize)).rejects.toThrow('offline');
  expect(clear).not.toHaveBeenCalled(); expect(initialize).not.toHaveBeenCalled();
  expect(getActiveOperatorServer()).toEqual(selected);
});
