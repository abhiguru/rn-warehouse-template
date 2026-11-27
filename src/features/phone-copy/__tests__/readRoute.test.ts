/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md section 2: the one decision, copy or server, for a read
 * (`copyRoute`), and `readVia`.
 *
 * Real: the sync engine, the copy, the store (role), the capabilities. Faked at the edge: the server and the phone's
 * native modules.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives) =====
 *  - `@/features/phone-copy/readRoute`: `copyRoute('stage1' | 'all')` → 'copy' | 'server'; `readVia(need, fromCopy)` →
 *    `{ value, source: { kind: 'copy', asOf } } | null`.
 *  - `@/features/phone-copy/sourced`: `CopyReadError`.
 *  - The role is the signed-in profile's in the app's store; offline is told as PhoneCopyLifecycle and NetInfo tell it.
 * =============================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, goOffline, loadCopy, loadUpTo, type Role } from '@/tests/phoneCopy/wh299Phone';

type Need = 'stage1' | 'all';
type ReadRoute = {
  copyRoute: (need: Need) => 'copy' | 'server';
  readVia: <T>(need: Need, fromCopy: (q: unknown) => Promise<T>) => Promise<{ value: T; source: unknown } | null>;
};
const route = () => require('@/features/phone-copy/readRoute') as ReadRoute;
const both = () => ({ stage1: route().copyRoute('stage1'), all: route().copyRoute('all') });
const SERVER = { stage1: 'server', all: 'server' };
const COPY = { stage1: 'copy', all: 'copy' };

beforeEach(() => {
  resetEnv();
  seedWarehouse();
});
afterEach(async () => { await eraseEverything(); });

describe('copyRoute', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('%s with a ready copy reads the copy', async role => {
    const w = await bootWarehouse({ role });
    await loadCopy(w);
    expect(both()).toEqual(COPY);
  });

  it('stays on the copy when a ready phone loses its connection', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    await goOffline(w);
    expect(both()).toEqual(COPY);
  });

  it('a customer session never reads a copy that was loaded for a warehouse role', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    w.setRole('customer' satisfies Role);
    expect(both()).toEqual(SERVER);
  });

  it('a facility without the capability reads the server', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    w.setCapability(false);
    expect(both()).toEqual(SERVER);
  });

  it('a format-1 server: the copy still loads, and every read stays on the server', async () => {
    env.feed.format = 1;
    const w = await bootWarehouse();
    await loadCopy(w);
    expect(w.phone.syncStore.getSyncSnapshot().phase).toBe('ready');
    expect(both()).toEqual(SERVER);
    await goOffline(w);
    expect(both()).toEqual(SERVER);
  });

  it('an older server (no sync functions) reads the server', async () => {
    const w = await bootWarehouse();
    env.feed.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await w.phone.engine.startPhoneCopy();
    expect(await w.phone.engine.syncNow('open')).toBe('off');
    expect(both()).toEqual(SERVER);
    await goOffline(w);
    expect(both()).toEqual(SERVER);
  });

  it('nothing loaded yet reads the server, offline too', async () => {
    const w = await bootWarehouse();
    await w.phone.engine.startPhoneCopy();
    await goOffline(w);
    expect(both()).toEqual(SERVER);
  });

  it('first stage still loading reads the server, offline too', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'goodsreceived');
    expect(both()).toEqual(SERVER);
    await goOffline(w);
    expect(both()).toEqual(SERVER);
    await load.finish();
  });

  it('second stage with the server reachable reads the server', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    expect(both()).toEqual(SERVER);
    await load.finish();
    expect(both()).toEqual(COPY);
  });

  it('second stage offline: the copy only for what the first stage holds', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    await goOffline(w);
    expect(both()).toEqual({ stage1: 'copy', all: 'server' });
    await load.finish();
  });
});

describe('readVia', () => {
  it('answers what the reader read, with the server time the copy was confirmed at', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    const first = await route().readVia('all', async () => 'rows');
    expect(first).toEqual({ value: 'rows', source: { kind: 'copy', asOf: '2026-11-25T05:12:00.000+00:00' } });
    env.feed.asOf = '2026-11-25T06:40:00.000+00:00';
    await w.phone.engine.syncNow('pull-to-refresh');
    expect((await route().readVia('all', async () => 'rows'))?.source).toEqual({ kind: 'copy', asOf: '2026-11-25T06:40:00.000+00:00' });
  });

  it('gives the reader a view of the open copy: its rows, first row, server time, phase and identity', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    type Reader = {
      all: <T>(sql: string, params?: string[]) => Promise<T[]>;
      get: <T>(sql: string, params?: string[]) => Promise<T | null>;
      asOf: string; phase: string; copyId: string;
    };
    const answer = await route().readVia('stage1', async q => {
      const reader = q as Reader;
      return {
        all: await reader.all<{ id: string }>('SELECT id FROM items ORDER BY id'),
        first: await reader.get<{ id: string }>('SELECT id FROM items WHERE id = ?', ['i2']),
        none: await reader.get('SELECT id FROM items WHERE id = ?', ['nowhere']),
        asOf: reader.asOf, phase: reader.phase, copyId: reader.copyId,
      };
    });
    expect(answer && 'value' in answer ? answer.value : null).toEqual({
      all: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }], first: { id: 'i2' }, none: null,
      asOf: env.feed.asOf, phase: 'ready', copyId: env.feed.copy,
    });
  });

  it('answers null, without calling the reader, when the route is the server', async () => {
    const w = await bootWarehouse({ capability: false });
    await loadCopy(w);
    const reader = jest.fn(async () => 'rows');
    expect(await route().readVia('stage1', reader)).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });

  it('answers null after the copy was erased', async () => {
    const w = await bootWarehouse();
    await loadCopy(w);
    expect(await route().readVia('stage1', async () => 'rows')).not.toBeNull();
    await w.phone.copyDb.eraseCopy();
    expect(await route().readVia('stage1', async () => 'rows')).toBeNull();
  });

  it('CopyReadError is an Error of its own, so a list can tell it from other failures', () => {
    const { CopyReadError } = require('@/features/phone-copy/sourced') as { CopyReadError: new () => Error };
    const error = new CopyReadError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CopyReadError);
    expect(new Error('other')).not.toBeInstanceOf(CopyReadError);
  });
});
