/// <reference types="node" />
/// <reference types="jest" />
/**
 * WH-306: the fictional warehouse of grnDataset / documentsDataset as the change feed sends it to a CUSTOMER account
 * (contract product/tech/app-offline-customer-accounts.md sections 0 and 14): format 7, the 14 entities of section 14.2,
 * only the rows of the account's own customers, and none of `customer_hidden_columns()`. Faked, as in fakeFeed.ts, only
 * the server's answers; the phone's own sync code runs against them.
 */
import { env } from './phoneEnv';
import { seedWarehouse } from './grnDataset';
import { seedDocuments } from './documentsDataset';

/** Contract 14.2, in the order of fakeFeed's ENTITIES (stage one ends at grn_images). */
export const CUSTOMER_ENTITIES = ['customers', 'items', 'goodsreceived', 'goodsreceived_trl', 'grn_images', 'dispatch', 'dispatch_trl',
  'dispatch_images', 'invoice', 'invoice_trl', 'orders', 'order_items', 'payments', 'grn_rates'] as const;
/** Entities a customer account's copy never holds (contract 0, 14.2). */
export const NEVER_FOR_CUSTOMER = ['settings', 'people', 'grn_lock', 'user_profiles', 'users_customers_new', 'item_storage_prices',
  'standard_rate_tiers', 'item_price_history', 'grn_replacements', 'held_items'] as const;
/** `customer_hidden_columns()` (contract 0). */
export const HIDDEN_COLUMNS = ['created_by', 'updated_by', 'deleted_by', 'supervisor_id', 'sender_id', 'import_batch_id', 'uploaded_by'];
/** The feed format of WH-306 (contract 14.1): WH-303 4, WH-304 5, WH-305 6, WH-306 7. */
export const CUSTOMER_FORMAT = 7;

type Row = Record<string, unknown>;
const OWN_KEY: Record<string, string> = { goodsreceived: 'customer_id', dispatch: 'customer_id', invoice: 'customer_id' };

/**
 * Loads the fake server with the warehouse as one customer account's feed. `own` are the account's customers
 * (c1 asha Traders, c2 Bhavin Foods, c3 Chirag Stores). Call after `resetEnv()`.
 */
export function seedCustomerAccount(own: string[], format: number = CUSTOMER_FORMAT): void {
  seedWarehouse();
  seedDocuments();
  const feed = env.feed;
  feed.format = format;
  const keep = (entity: string, test: (row: Row) => boolean) => {
    feed.rows[entity] = feed.rows[entity].filter(r => test(r.row));
  };
  keep('customers', r => own.includes(String(r.id)));
  for (const entity of ['goodsreceived', 'dispatch', 'invoice']) keep(entity, r => own.includes(String(r[OWN_KEY[entity]])));
  const grnIds = feed.rows.goodsreceived.map(r => r.id);
  const dispatchIds = feed.rows.dispatch.map(r => r.id);
  const invoiceIds = feed.rows.invoice.map(r => r.id);
  keep('goodsreceived_trl', r => grnIds.includes(String(r.gr_id)));
  keep('dispatch_trl', r => dispatchIds.includes(String(r.disp_id)));
  keep('invoice_trl', r => invoiceIds.includes(String(r.invoice_id)));
  keep('grn_images', r => grnIds.includes(String(r.grn_id)));
  keep('dispatch_images', r => dispatchIds.includes(String(r.dispatch_id)));
  for (const entity of Object.keys(feed.rows)) {
    for (const row of feed.rows[entity]) for (const column of HIDDEN_COLUMNS) delete row.row[column];
  }
  for (const entity of NEVER_FOR_CUSTOMER) feed.rows[entity] = [];
  for (const entity of CUSTOMER_ENTITIES) feed.rows[entity] ??= [];

  // The server's start and checksums list exactly the customer entities.
  const rpc = feed.rpc;
  feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') return { ...answer, data: { ...data, entities: [...CUSTOMER_ENTITIES] } };
    if (name === 'get_sync_checksums') {
      const have = new Map((data.entities as Array<{ e: string }>).map(e => [e.e, e]));
      const entities = CUSTOMER_ENTITIES.map(e => have.get(e) ?? { e, count: 0, sum: '0', settled: true });
      return { ...answer, data: { ...data, entities } };
    }
    return answer;
  };
}

/** The GRN numbers of the fictional warehouse that belong to each customer (grnDataset). */
export const GRNS_OF = { c1: ['A2', 'B1', 'GR-1'], c2: ['A10', 'a3'], c3: ['X1', '5'] } as const;
