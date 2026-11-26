/// <reference types="node" />
/// <reference types="jest" />
/**
 * The server's answers to the sync RPCs (product/tech/server-change-log-feed.md, section 3), and nothing else.
 * It is the network edge: the app's own sync code runs against it. First-load pages are computed from `rows`
 * (keyset by id, `p_limit` clamped to 2000, as the contract says); the answers to `get_sync_changes` are scripted
 * by the test, one per call, because what a page of changes holds is the server's business.
 */
export type FeedRow = { id: string; row: Record<string, unknown>; v?: string };
export type Change =
  | { e: string; id: string; op: 'upsert'; v: string; row: Record<string, unknown> }
  | { e: string; id: string; op: 'delete' | 'stale' };
export type ChangesAnswer = {
  position: string; as_of: string; more: boolean; reload_all: null | { reason: string }; reload: string[]; changes: Change[];
};
export type Call = { name: string; args: Record<string, unknown> };
type Gate = { matches: (call: Call) => boolean; release: () => void; opened: Promise<void>; onHit: () => void; wait: Promise<void> };

/** Stage one is customers to grn_images; the rest is stage two (contract 3.1). */
export const ENTITIES = ['customers', 'items', 'settings', 'people', 'goodsreceived', 'goodsreceived_trl', 'grn_images',
  'dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'grn_lock', 'user_profiles', 'users_customers_new'] as const;
/** What a format-3 feed adds (WH-348 contract section 14.1; the names are the contract's topics, the build confirms them). */
export const FORMAT_3_ENTITIES = ['grn_rates', 'item_storage_prices', 'standard_rate_tiers', 'item_price_history', 'payments'] as const;
const entitiesFor = (format: number): readonly string[] => (format >= 3 ? [...ENTITIES, ...FORMAT_3_ENTITIES] : ENTITIES);
export const STAGE_ONE = ENTITIES.slice(0, 7);
export const STAGE_TWO = ENTITIES.slice(7);

export const COPY_KEY = '1.6f1c0000-0000-4000-8000-000000000001.9e107d9d372bb6826bd81d3542a419d6';

export function createFakeFeed() {
  const feed = {
    format: 1,
    copy: COPY_KEY,
    startPosition: '1048576',
    asOf: '2026-11-25T05:12:00.000+00:00',
    rows: Object.fromEntries([...ENTITIES, ...FORMAT_3_ENTITIES].map(e => [e, [] as FeedRow[]])) as Record<string, FeedRow[]>,
    calls: [] as Call[],
    changeAnswers: [] as Array<ChangesAnswer | { error: { message: string; code?: string } } | { refusal: string }>,
    gates: [] as Gate[],
    /** Make a call fail as a lost connection does: the client library answers with an error, it does not throw. */
    failWhen: null as null | ((call: Call) => boolean),
    /** The `copy` a page answers with, when it should differ from the start's. */
    pageCopy: null as null | string,
    /** Change what get_sync_checksums answers (a count or sum that differs, an entity not settled). */
    checksumEdit: null as null | ((answer: { success: boolean; position: string; entities: Array<{ e: string; count: number; sum: string; settled: boolean }> }) => unknown),

    named(name: string) { return feed.calls.filter(c => c.name === name); },
    pagesOf(entity: string) { return feed.calls.filter(c => c.name === 'get_sync_page' && c.args.p_entity === entity); },
    ids(entity: string) { return feed.rows[entity].map(r => r.id).sort(); },
    /** Calls that match wait until `gate.release()`; `gate.opened` resolves when the first one arrives. */
    hold(matches: (call: Call) => boolean): Gate {
      let release!: () => void;
      let onHit!: () => void;
      const opened = new Promise<void>(resolve => { onHit = resolve; });
      const wait = new Promise<void>(resolve => { release = resolve; });
      const gate = { matches, release, opened, onHit, wait };
      feed.gates.push(gate);
      return gate;
    },

    /** What the supabase client's `.rpc` answers. */
    async rpc(name: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: unknown }> {
      const call = { name, args };
      feed.calls.push(call);
      for (const gate of feed.gates) {
        if (gate.matches(call)) { gate.onHit(); await gate.wait; }
      }
      if (feed.failWhen?.(call)) return { data: null, error: { message: 'Network request failed' } };
      if (name === 'get_sync_start') {
        return { data: { success: true, format: feed.format, copy: feed.copy, position: feed.startPosition, as_of: feed.asOf,
          page_limit: 2000, entities: [...entitiesFor(feed.format)] }, error: null };
      }
      if (name === 'get_sync_page') {
        const entity = String(args.p_entity);
        const limit = Math.min(Math.max(Number(args.p_limit ?? 2000), 1), 2000);
        const sorted = [...(feed.rows[entity] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
        const after = args.p_after as string | null | undefined;
        const rest = after ? sorted.filter(r => r.id > after) : sorted;
        const page = rest.slice(0, limit);
        const last = rest.length > limit ? page[page.length - 1].id : null;
        return { data: { success: true, entity, copy: feed.pageCopy ?? feed.copy,
          rows: page.map(r => ({ id: r.id, v: r.v ?? defaultV(r.id), row: r.row })), next_after: last }, error: null };
      }
      if (name === 'get_sync_changes') {
        const next = feed.changeAnswers.shift();
        if (!next) return { data: { success: true, format: feed.format, position: String(args.p_position), as_of: feed.asOf,
          more: false, reload_all: null, reload: [], changes: [] }, error: null };
        if ('error' in next) return { data: null, error: next.error };
        if ('refusal' in next) return { data: { success: false, error_code: 'WH409', reason: next.refusal, error: 'refused', message: 'refused' }, error: null };
        return { data: { success: true, format: feed.format, ...next }, error: null };
      }
      if (name === 'get_sync_checksums') {
        // What the server holds now, by the contract's rule: count, and the sum of the first 15 hex digits of v modulo 2^60.
        const entities = entitiesFor(feed.format).map(e => {
          const sum = feed.rows[e].reduce((total, r) => total + BigInt(`0x${(r.v ?? defaultV(r.id)).slice(0, 15)}`), 0n) % (1n << 60n);
          return { e, count: feed.rows[e].length, sum: sum.toString(), settled: true };
        });
        const answer = { success: true, position: feed.startPosition, entities };
        return { data: feed.checksumEdit ? feed.checksumEdit(answer) : answer, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
  return feed;
}
export type FakeFeed = ReturnType<typeof createFakeFeed>;

export const grnRow = (id: string, extra: Record<string, unknown> = {}): FeedRow => ({ id, row: { id, gr_no: `G-${id}`, ...extra } });
export const lotRow = (id: string, grnId: string, extra: Record<string, unknown> = {}): FeedRow => ({ id, row: { id, grn_id: grnId, qty: 10, ...extra } });

import { createHash } from 'node:crypto';
/** A `v` as the server makes it: 16 lower-case hex characters, here from a label (the same label gives the same v). */
export const hex = (label: string) => createHash('md5').update(label).digest('hex').slice(0, 16);
/** The `v` a first-load row has when the test gives none. */
export function defaultV(id: string) { return hex(`row:${id}`); }
