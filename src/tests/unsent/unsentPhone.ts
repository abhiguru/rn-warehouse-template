/// <reference types="node" />
/// <reference types="jest" />
/**
 * A phone for the WH-301 tests (product/tech/app-offline-unsent-work.md). `bootUnsent()` starts the app's modules afresh over
 * the phone's files (a kill and reopen) with the edges faked as in phoneCopy/phoneEnv.ts (expo-sqlite over Node's SQLite,
 * secure-store, NetInfo, AppState, the signed-in person) plus the files (fakeFiles.ts) and the server's answers to the
 * RPCs a send makes (`server`). The unsent-work code itself (src/features/unsent) is the real code.
 *
 * The module types below are the contract's signatures (sections 2, 5, 6); the modules do not exist yet (test first), so
 * they are loaded with `require` and typed here. Names the contract does not give are marked ASSUMED, and listed in the hand-back.
 */
import { bootPhone, env, overrides, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files, fileSystemModule } from '@/tests/phoneCopy/fakeFiles';

export type ItemState = 'saved' | 'sending' | 'sent' | 'refused' | 'waiting';
export type SendOutcome =
  | { kind: 'sent'; result: unknown }
  | { kind: 'refused'; reason: string; code?: string }
  | { kind: 'lost' }
  | { kind: 'transient' }
  | { kind: 'stop' };
export interface SendKind {
  send(body: any, ctx: { requestKey: string; resolved: Record<string, unknown> }): Promise<SendOutcome>;
  lane: 'record' | 'photo';
}
export interface EnqueueInput {
  kind: string;
  body: unknown;
  dependsOn?: string;
  targetRef?: Record<string, unknown>;
  what: string;
  customer?: string;
  photos?: { file: string; role: string; lineRef?: string }[];
}
export interface UnsentSummary { count: number; sendBy: number; limitReached: boolean; unreadable: boolean; waitingForAdmin: number }
export type SendTrigger = 'open' | 'foreground' | 'reconnect' | 'saved' | 'send-now' | 'sync' | 'retry-timer';

export interface UnsentModules {
  queue: {
    enqueue(input: EnqueueInput): Promise<{ id: string; requestKey: string }>;
    mergeInto(id: string, patch: (body: unknown) => unknown): Promise<boolean>;
    deleteItem(id: string): Promise<void>;
    listItems(): Promise<{ id: string; state: ItemState }[]>; // ASSUMED: a row view carries `id` and `state`
    otherPeople(): Promise<{ name: string; count: number }[]>;
  };
  store: {
    initUnsent(): Promise<void>; // ASSUMED name: loads the store and the snapshot at app open
    getUnsentSummary(): UnsentSummary; // ASSUMED name: the non-hook form of `useUnsentSummary`
  };
  kinds: {
    registerSendKind(name: string, kind: SendKind): void; // ASSUMED name: the registry's entry point
  };
  engine: {
    sendNow(reason: SendTrigger): Promise<void>;
    classify(result: unknown, error: unknown): SendOutcome;
  };
  gate: {
    canStartWork(): { ok: true } | { ok: false; count: number; oldestAgeMs: number | null };
    accountActionAllowed(): { ok: true } | { ok: false; count: number | null };
  };
}

export type RpcAnswer = { data: unknown; error: unknown };
/** What the facility's server answers to each RPC a send makes, and every call it got, in order. */
export const server = {
  calls: [] as { name: string; args: Record<string, unknown> }[],
  answers: {} as Record<string, (args: Record<string, any>) => RpcAnswer | Promise<RpcAnswer>>,
  reset() { server.calls = []; server.answers = {}; },
};
export const NO_NETWORK: RpcAnswer = { data: null, error: { message: 'No internet connection', code: 'NETWORK' } };
export const GATEWAY_TIMEOUT: RpcAnswer = { data: null, error: { message: 'Gateway Timeout', status: 504 } };

export const DOCUMENT_PHOTOS = 'file:///phone/documents/unsent-work/photos/';
export const addPhoto = (name: string, bytes = 1200) => {
  const uri = `file:///phone/cache/${name}`;
  files.held.set(uri, bytes);
  return uri;
};
/** The photo files the unsent store keeps. */
export const keptPhotoFiles = () => [...files.held.keys()].filter(path => path.includes('unsent-work/'));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
export type UnsentPhone = { phone: Phone; setSyncCapability(on: boolean): void } & UnsentModules;

/** A started phone. The facility has the offline feature (`capabilities.sync`) on unless the test says otherwise (criterion 14). */
export async function bootUnsent({ sync = true }: { sync?: boolean } = {}): Promise<UnsentPhone> {
  overrides.fileSystem = () => fileSystemModule(); // before bootPhone, which stands expo-file-system in and loads the modules that keep it
  const phone = bootPhone();
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const client = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      server.calls.push({ name, args });
      return server.answers[name]?.(args) ?? NO_NETWORK;
    },
  });
  supabase.getAuthenticatedClient = client;
  supabase.getSupabaseClient = client;
  (require('@/config/lanTransport') as Record<string, unknown>).setLanContext = () => undefined;
  await (require('@/config/operatorServer') as typeof import('@/config/operatorServer')).saveOperatorServer(SERVER);
  const capabilities = require('@/config/facilityCapabilities') as typeof import('@/config/facilityCapabilities');
  const setSyncCapability = (on: boolean) => capabilities.setFacilityCapabilities(SERVER, { sync: on });
  setSyncCapability(sync);
  return {
    phone,
    setSyncCapability,
    queue: require('@/features/unsent/unsentQueue'),
    store: require('@/features/unsent/unsentStore'),
    kinds: require('@/features/unsent/sendKinds'),
    engine: require('@/features/unsent/sendEngine'),
    gate: require('@/features/unsent/workGate'),
  };
}

/** The rows of a table of the unsent file, read through the fake database (the contract's columns, section 1). */
export async function rawRows<T = Record<string, any>>(table: 'items' | 'item_photos' | 'forms' | 'meta', order = ''): Promise<T[]> {
  const name = fakeDatabaseNames().find(n => n.includes('unsent-work'));
  if (!name) return [];
  const sqlite = require('expo-sqlite') as { openDatabaseAsync(n: string): Promise<{ getAllAsync(sql: string): Promise<T[]> }> };
  const db = await sqlite.openDatabaseAsync(name);
  return db.getAllAsync(`SELECT * FROM ${table} ${order}`);
}
export const unsentFileNames = () => fakeDatabaseNames().filter(n => n.includes('unsent-work'));
/** Forget the failures a test planned on the fake database (so a later open is healthy). */
export const clearPlannedFailures = () => { ((globalThis as any).__fakePhoneFailures as unknown[]).length = 0; };

/** A kill: `bootUnsent()` again, the phone's files stay. The store loads as at app open. */
export async function restart() {
  const next = await bootUnsent();
  await next.store.initUnsent();
  return next;
}
export { env };

/** Runs one statement on the unsent file (a test that damages it, e.g. the clock ledger). */
export async function rawRun(sql: string): Promise<void> {
  const name = fakeDatabaseNames().find(n => n.includes('unsent-work'));
  const sqlite = require('expo-sqlite') as { openDatabaseAsync(n: string): Promise<{ runAsync(sql: string): Promise<unknown> }> };
  await (await sqlite.openDatabaseAsync(name!)).runAsync(sql);
}

/** A kind for a test: sends `rpcName` with `{ p_key, p_body }` through the real client and lets the real `classify` read the answer. */
export function rpcKind(phone: UnsentModules, rpcName: string, lane: 'record' | 'photo' = 'record'): SendKind {
  return {
    lane,
    send: async (body, ctx) => {
      const { getAuthenticatedClient } = require('@/config/supabaseConfig') as { getAuthenticatedClient(): Promise<{ rpc(n: string, a: unknown): Promise<RpcAnswer> }> };
      const client = await getAuthenticatedClient();
      const answer = await client.rpc(rpcName, { p_key: ctx.requestKey, p_body: body, resolved: ctx.resolved });
      return phone.engine.classify(answer.data, answer.error);
    },
  };
}
