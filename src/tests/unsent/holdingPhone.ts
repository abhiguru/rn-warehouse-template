/// <reference types="node" />
/// <reference types="jest" />
/**
 * A phone for the WH-304 tests (product/tech/app-offline-holding-list.md): `bootUnsent()` plus the holding-list release
 * flag (`holdingList` via a current `schemaHead`), signed-in role (`admin` | `supervisor` | `staff` | `customer`), and
 * optional loaded phone copy whose change feed speaks format >= 5 with `held_items` (for staff-side roles, never for
 * customer accounts per PQ3).
 *
 * Faked only at the edge, as unsentPhone.ts and wh299Phone.ts: the server's answers to the sync RPCs (`env.feed`) and
 * holding/save RPCs (`server`), expo-sqlite, expo-secure-store, expo-file-system, NetInfo, AppState.
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - `backendFeatures.ts` adds `holdingList` to `INTRODUCED_BY_MIGRATION`; a high `schemaHead` turns it on and an older
 *    `schemaHead` (`00000000000209_lot_quick_change`) turns it off.
 *  - `copySchema.ts` adds `'held_items'` to `ENTITY_SPECS` and adds feed format >= 5 to `SYNC_FORMATS`.
 *  - `env.feed` in `fakeFeed.ts` lists the format-1..3 entities; this helper adds `held_items` to `get_sync_start`'s
 *    entities at `format >= 5` for staff-side roles and never for `customer` (§11.7 / PQ3). Copy keys are the fake's own.
 * ============================================
 */
import { env, setReachable } from '@/tests/phoneCopy/phoneEnv';
import type { FeedRow } from '@/tests/phoneCopy/fakeFeed';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootUnsent, NO_NETWORK, server, type RpcAnswer, type UnsentPhone } from '@/tests/unsent/unsentPhone';

export type HoldingRole = 'admin' | 'supervisor' | 'staff' | 'customer';

export const HOLDING_SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
/** Minimum feed format that carries `held_items` (contract §11.7). */
export const MIN_HELD_FEED_FORMAT = 5;

export interface BootHoldingOptions {
  role?: HoldingRole;
  profileId?: string;
  profileName?: string;
  sync?: boolean;
  /** True sets a high schemaHead so `backendHasFeature('holdingList')` is true; false sets an older schemaHead (209). */
  holdingFeature?: boolean;
  /** Feed format advertised by `get_sync_start` (default 5). */
  feedFormat?: number;
  /** Initial `held_items` rows in the fake feed before first load. */
  heldFeedRows?: FeedRow[];
  /** Whether to run first load of the phone copy before returning. */
  withCopy?: boolean;
}

export type HoldingPhone = UnsentPhone & {
  setRole(role: HoldingRole, profileId?: string, name?: string): void;
  setHoldingFeature(on: boolean): void;
  offline(): Promise<void>;
  online(): Promise<void>;
  pass(ms?: number): Promise<void>;
  sync(): Promise<string>;
};

export async function bootHolding({
  role = 'staff',
  profileId = 'profile-staff-1',
  profileName = 'Ravi Fictional',
  sync = true,
  holdingFeature = true,
  feedFormat = MIN_HELD_FEED_FORMAT,
  heldFeedRows = [],
  withCopy = false,
}: BootHoldingOptions = {}): Promise<HoldingPhone> {
  seedWarehouse();
  env.feed.format = feedFormat;
  env.feed.rows.held_items = [...heldFeedRows];

  const phone = await bootUnsent({ sync });
  let currentRole: HoldingRole = role;

  // The feed's own answers (fakeFeed.ts), with `held_items` added to the start's entities for staff-side roles at a
  // format that carries it, and never for a customer account (contract §11.7). Pages of `held_items` come from
  // `env.feed.rows.held_items` through the fake's own keyset paging; a customer's phone never asks for them.
  const feedRpc = async (name: string, args: Record<string, unknown> = {}): Promise<RpcAnswer> => {
    const base = await env.feed.rpc(name, args);
    if (name !== 'get_sync_start') return base;
    const data = base.data as Record<string, unknown> | null;
    if (!data || data.success !== true) return base;
    const entities = (data.entities as string[]).filter(e => e !== 'held_items');
    if (currentRole !== 'customer' && env.feed.format >= MIN_HELD_FEED_FORMAT) entities.push('held_items');
    return { data: { ...data, entities }, error: null };
  };

  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const routed = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name.startsWith('get_sync_')) return feedRpc(name, args);
      server.calls.push({ name, args });
      return server.answers[name]?.(args) ?? NO_NETWORK;
    },
  });
  supabase.getAuthenticatedClient = routed;
  supabase.getSupabaseClient = routed;

  jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));
  const { store } = require('@/store') as typeof import('@/store');
  const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
  const setRole = (nextRole: HoldingRole, nextProfileId = profileId, nextName = profileName) => {
    currentRole = nextRole;
    store.dispatch(auth.setUserProfile({ id: nextProfileId, role: nextRole, name: nextName } as never));
  };
  setRole(role, profileId, profileName);

  const features = require('@/config/backendFeatures') as typeof import('@/config/backendFeatures');
  const setHoldingFeature = (on: boolean) => {
    features.setFacilityRelease(HOLDING_SERVER, {
      schemaHead: on ? '00000000009999_wh304_holding_list' : '00000000000209_lot_quick_change',
    });
  };
  setHoldingFeature(holdingFeature);

  if (withCopy) {
    await phone.phone.engine.startPhoneCopy();
    await phone.phone.engine.syncNow('open');
  }
  await phone.store.initUnsent();

  return {
    ...phone,
    setRole,
    setHoldingFeature,
    offline: async () => {
      await setReachable(false);
      phone.phone.engine.setCopyOffline(true);
    },
    online: async () => {
      await setReachable(true);
      phone.phone.engine.setCopyOffline(false);
    },
    pass: async (ms = 60_000) => {
      const done = phone.engine.sendNow('send-now');
      await jest.advanceTimersByTimeAsync(ms);
      await done;
    },
    sync: async () => phone.phone.engine.syncNow('open'),
  };
}

/** A fictional `newDispatch` body matching contract §11.4 (`NewDispatchBody`). */
export const sampleDispatchBody = (lotId = 'l03', qty = 6, localId = '5f304000-0000-4000-8000-0000000000d1') => ({
  v: 1,
  localId,
  args: {
    p_dispatch_data: { disp_no: '', issue_number: true, customer_id: 'c1', disp_date: '2026-11-27' },
    p_dispatch_items: [{ gr_trl_id: lotId, disp_qty: qty }],
    p_generate_invoice: false,
    p_retry_count: 0,
  },
  show: { customerName: 'asha Traders' },
});

/** A fictional `lotChange` body matching contract §11.4. */
export const sampleLotChangeBody = (lotId = 'l06', grnId = 'g-B1', from = 'D-4', to = 'C-2') => ({
  lotId,
  grnId,
  recordedAt: '2026-11-27T09:05:00+05:30',
  changes: { rack: { from, to } },
});

/** A server refusal in `warehouse_security.refuse` shape (contract §11.1, §11.2). */
export const serverRefusal = (reason: string, message: string, data: Record<string, unknown> = {}): RpcAnswer => ({
  data: { success: false, error_code: 'WH409', reason, error: message, message, ...data },
  error: null,
});

/** A staff/manager feed row for a held dispatch (contract §11.7). */
export const heldDispatchFeedRow = (
  id: string,
  lines: { lot_id: string; qty: number }[],
  extra: Record<string, unknown> = {},
): FeedRow => ({
  id,
  row: {
    id,
    kind: 'newDispatch',
    state: 'held',
    needs_decision: true,
    lines,
    ...extra,
  },
});

/** A full recorder feed row for a held / decided item (contract §11.7). */
export const recorderHeldFeedRow = (overrides: Record<string, unknown> = {}): FeedRow => {
  const id = String(overrides.id ?? 'held-1');
  return {
    id,
    row: {
      id,
      kind: 'newDispatch',
      what: { key: 'offline.unsent.whatNewDispatch' },
      customer_name: 'asha Traders',
      recorded_by_name: 'Ravi Fictional',
      recorded_at: '2026-11-27T09:00:00+05:30',
      phone: 'Android phone',
      reason: 'stockShort',
      reason_data: { lines: [{ lot_id: 'l03', item_name: 'Beans', available: 4, requested: 6 }] },
      state: 'held',
      follows: null,
      needs_decision: true,
      decided_by_name: null,
      decided_at: null,
      reject_reason: null,
      result: null,
      body: sampleDispatchBody('l03', 6),
      accepted_body: null,
      lines: [{ lot_id: 'l03', qty: 6 }],
      grn_id: null,
      dispatch_id: null,
      seen_at: null,
      ...overrides,
    },
  };
};

/** Helper to filter recorded RPC calls by name. */
export const rpcCalls = (name: string) => server.calls.filter(c => c.name === name);
