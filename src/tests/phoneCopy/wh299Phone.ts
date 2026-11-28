/// <reference types="node" />
/// <reference types="jest" />
/**
 * A signed-in phone for the WH-299 read tests (product/tech/app-offline-read-from-copy.md): `bootPhone()` plus what a
 * service needs to know who is asking (the real store with the role, the active server and its capabilities) and a
 * record of every read that went to the server.
 *
 * Faked: only what phoneEnv fakes. The client also gets `.from()` (a direct table read), recorded and answered as a
 * lost connection unless a test says otherwise.
 */
import { bootPhone, env, SCOPE_ORIGIN, setReachable, type Phone } from './phoneEnv';

export type Role = 'admin' | 'supervisor' | 'staff' | 'customer';
export type ServerCall = { name: string; args: unknown };
type RpcAnswer = { data: unknown; error: unknown };

export const LOST: RpcAnswer = { data: null, error: { message: 'Network request failed' } };
const SERVER = { origin: SCOPE_ORIGIN, instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };

export interface Warehouse {
  phone: Phone;
  /** Reads that went to the server (the sync calls are not reads of a screen). */
  serverCalls: ServerCall[];
  /** What the server answers to a read; every other read is a lost connection. */
  answers: Record<string, (args: Record<string, unknown>) => RpcAnswer>;
  setRole(role: Role): void;
  setCapability(on: boolean): void;
}

/** The eight entities WH-381 takes out of the feed (format 8). */
export const DROPPED_BY_WH381 = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

/** Makes the fake server answer as a WH-381 server: its entity list and checksums name only the kept entities. */
export function serveKeptEntitiesOnly(): void {
  const rpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED_BY_WH381.has(e)) } };
    if (name === 'get_sync_checksums') return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED_BY_WH381.has(e.e)) } };
    return answer;
  };
}

/** `legacyServer: true` keeps the fake server listing the dropped entities, as a server not yet on format 8 does. */
export async function bootWarehouse({ role = 'staff', capability = true, legacyServer = false }: { role?: Role; capability?: boolean; legacyServer?: boolean } = {}): Promise<Warehouse> {
  env.feed.legacyServer = legacyServer;
  if (!legacyServer) serveKeptEntitiesOnly();
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  const phone = bootPhone(null);
  const serverCalls: ServerCall[] = [];
  const answers: Warehouse['answers'] = {};

  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push({ name, args });
    return answers[name]?.(args) ?? LOST;
  };
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const from = (table: string) => {
    serverCalls.push({ name: `from:${table}`, args: {} });
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'eq', 'is', 'order', 'limit', 'range', 'ilike', 'or', 'gte', 'lte', 'single', 'maybeSingle']) {
      query[method] = () => query;
    }
    query.then = (resolve: (value: RpcAnswer) => unknown) => resolve(answers[`from:${table}`]?.({}) ?? LOST);
    return query;
  };
  const client = async () => ({ rpc: (name: string, args?: Record<string, unknown>) => env.feed.rpc(name, args ?? {}), from });
  supabase.getAuthenticatedClient = client;
  supabase.getSupabaseClient = client;
  supabase.RequestTimeoutError = class RequestTimeoutError extends Error {};

  // Saving the active server tells the LAN transport about it; the phone here has no warehouse network.
  (require('@/config/lanTransport') as Record<string, unknown>).setLanContext = () => undefined;
  const operator = require('@/config/operatorServer') as typeof import('@/config/operatorServer');
  await operator.saveOperatorServer(SERVER);
  const capabilities = require('@/config/facilityCapabilities') as typeof import('@/config/facilityCapabilities');
  const setCapability = (on: boolean) => capabilities.setFacilityCapabilities(SERVER, { sync: on });
  setCapability(capability);

  // react-redux is not transformed by this repo's Jest config; no screen renders here, so its hooks are never called.
  jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));
  const { store } = require('@/store') as typeof import('@/store');
  const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
  const setRole = (next: Role) => {
    store.dispatch(auth.setUserProfile({ id: 'profile-1', role: next, name: 'Asha Fictional' } as never));
  };
  setRole(role);
  return { phone, serverCalls, answers, setRole, setCapability };
}

/** The whole first load, as the app does it after sign-in. */
export async function loadCopy(w: Warehouse): Promise<void> {
  await w.phone.engine.startPhoneCopy();
  expect(await w.phone.engine.syncNow('open')).toBe('done');
}

/**
 * For the cases where today's paths must hold: starts the load whatever comes of it (a build that does not read format 2
 * turns the feature off; the routing cases that need a loaded copy use `loadCopy`, which checks it).
 */
export async function tryLoadCopy(w: Warehouse): Promise<void> {
  await w.phone.engine.startPhoneCopy();
  await w.phone.engine.syncNow('open');
}

/**
 * Stops the first load on the first page of `entity`: before 'goodsreceived' the phase is 'stage1', before 'dispatch' it
 * is 'stage2'. `finish()` lets the load end; call it before the test ends.
 */
export async function loadUpTo(w: Warehouse, entity: 'goodsreceived' | 'dispatch' | 'grn_lock') {
  const gate = env.feed.hold(call => call.name === 'get_sync_page' && call.args.p_entity === entity);
  await w.phone.engine.startPhoneCopy();
  const run = w.phone.engine.syncNow('open');
  await Promise.race([gate.opened, run]); // a load that ends early never reaches the gate: fail on the phase below
  expect(w.phone.syncStore.getSyncSnapshot().phase).toBe(entity === 'dispatch' ? 'stage2' : 'stage1');
  return {
    finish: async () => {
      gate.release();
      await run;
    },
  };
}

/** No connection: NetInfo tells its listeners and the engine is told, as PhoneCopyLifecycle does. */
export async function goOffline(w: Warehouse): Promise<void> {
  await setReachable(false);
  w.phone.engine.setCopyOffline(true);
}

/** The `source` a service result carries; undefined means the server answered. */
export const sourceOf = (result: unknown): unknown => (result as { source?: unknown } | null)?.source;
export const copySource = () => ({ kind: 'copy', asOf: env.feed.asOf });

/** Lets writes the services do not wait for (the list caches) finish. */
export async function settleWrites(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
}
