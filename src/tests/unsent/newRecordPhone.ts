/// <reference types="node" />
/// <reference types="jest" />
/**
 * A phone for the WH-161 tests (product/tech/app-offline-new-records.md): `bootUnsent()` (the unsent-work phone) plus what a new
 * GRN or dispatch needs: the facility says it has the topic (`offlineNewRecords`), a copy of the warehouse is loaded with the
 * facility's `numbering` row, the signed-in role is set, and the two kinds are registered (the modules do not exist yet).
 *
 * Faked only at the edge, as unsentPhone.ts: the server's answers to the RPCs (`server`), files, NetInfo, expo-sqlite.
 */
import { env, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootUnsent, NO_NETWORK, server, type RpcAnswer, type UnsentPhone } from '@/tests/unsent/unsentPhone';

export const SERVER_IDENTITY = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
export type Scheme = 'letters' | 'year' | 'sequence' | 'free';
export type NewRecordPhone = UnsentPhone & {
  offline(): Promise<void>;
  online(): Promise<void>;
  /** One send pass, with the clock moved on by `ms`. */
  pass(ms?: number): Promise<void>;
};

const numberingRow = (scheme: Scheme) => ({
  grn: { scheme, server_issues: scheme !== 'free' },
  dispatch: { scheme, server_issues: scheme !== 'free' },
  invoice: { scheme: 'sequence', server_issues: true },
});

export async function bootNewRecords({ scheme = 'letters', withCopy = true }: { scheme?: Scheme; withCopy?: boolean } = {}): Promise<NewRecordPhone> {
  seedWarehouse();
  env.feed.rows.settings.push({ id: 'numbering', row: numberingRow(scheme) });
  const phone = await bootUnsent();
  // The sync calls go to the fake feed, every other call to the facility's answers (`server`).
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const routed = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name.startsWith('get_sync_')) return env.feed.rpc(name, args);
      server.calls.push({ name, args });
      return server.answers[name]?.(args) ?? NO_NETWORK;
    },
  });
  supabase.getAuthenticatedClient = routed;
  supabase.getSupabaseClient = routed;
  // react-redux is not transformed by this repo's Jest config; the services below never call its hooks.
  jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined }));
  const { store } = require('@/store') as typeof import('@/store');
  const auth = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
  store.dispatch(auth.setUserProfile({ id: 'profile-1', role: 'admin', name: 'Asha Fictional' } as never));
  (require('@/config/backendFeatures') as typeof import('@/config/backendFeatures')).setFacilityRelease(SERVER_IDENTITY as never, {
    schemaHead: '00000000009999_wh161_topics',
  });
  if (withCopy) {
    await phone.phone.engine.startPhoneCopy();
    expect(await phone.phone.engine.syncNow('open')).toBe('done');
  }
  require('@/features/unsent/photosKind');
  require('@/features/unsent/newGrnKind');
  require('@/features/unsent/newDispatchKind');
  await phone.store.initUnsent();
  const result: NewRecordPhone = {
    ...phone,
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
  };
  return result;
}

/** What `save_grn` answers on success (backend contract section 0). */
export const grnSaved = (number = '312', lines = 1): RpcAnswer => ({
  data: {
    success: true,
    data: { grn_id: 'grn-server-1', gr_no: number, item_mapping: Array.from({ length: lines }, (_, index) => ({ index, item_id: `item-server-${index}` })) },
  },
  error: null,
});
/** What `create_dispatch_with_stock_check` answers on success: no dispatch number today, `disp_no` with this topic. */
export const dispatchSaved = (number = '77', orderEffects: unknown = []): RpcAnswer => ({
  data: { success: true, dispatch_id: 'disp-server-1', disp_no: number, dispatch_items: [], invoice_data: null, order_effects: orderEffects },
  error: null,
});
export const refusal = (reason: string, extra: Record<string, unknown> = {}): RpcAnswer => ({
  data: { success: false, reason, message: `refused: ${reason}`, ...extra },
  error: null,
});

/** The rows of one save RPC the server got, in order. */
export const callsOf = (name: string) => server.calls.filter(call => call.name === name);

/** A fictional GRN form's payload as `createGRN` takes it (grnFormService.ts), a blank number unless given. */
export function grnPayload(extra: { number?: string; rates?: unknown; photos?: boolean } = {}) {
  return {
    header: {
      gr_no: extra.number ?? '',
      date: '2026-11-27',
      customer_id: 'c1',
      customer_name: 'asha Traders',
      supervisor_id: 'sup-1',
      supervisor_name: 'Meera Fictional',
      registration: 'GJ01AB1234',
      note: '',
      pricing_mode: 'MONTHLY',
    },
    items: [
      { item_table_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 40, weight: 25, rack: 'A-1', package_mark: 'M1' },
    ],
    ...(extra.rates === undefined ? {} : { rates: extra.rates }),
    nonce: 'form-nonce-1',
  };
}

/** A fictional dispatch form's payload as `createDispatch` takes it (dispatchFormService.ts). */
export function dispatchPayload(extra: { number?: string; lotId?: string; qty?: number } = {}) {
  return {
    header: {
      disp_no: extra.number ?? '',
      disp_date: '2026-11-27',
      registration: 'GJ01AB1234',
      customer_id: 'c1',
      customer_name: 'asha Traders',
      supervisor_id: 'sup-1',
      supervisor_name: 'Meera Fictional',
      note: '',
    },
    items: [{ grnItems_id: extra.lotId ?? 'l06', disp_quantity: extra.qty ?? 4 }],
    submissionNonce: 'form-nonce-2',
  };
}
