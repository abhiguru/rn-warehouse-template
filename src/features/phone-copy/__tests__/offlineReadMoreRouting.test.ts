/**
 * WH-348, contract product/tech/app-offline-read-more.md sections 2 and 11 (R1 to R4): Invoices, Customers, Items and
 * Users read the phone copy, with no call to the server, and with the feature off, an older server or a customer account
 * today's calls run unchanged (spec criterion 14).
 *
 * Real: the four services, the sync engine, the copy, the store. Faked at the edge: the server's answers and the phone's
 * native modules (wh299Phone.ts).
 *
 * Not here, on purpose: the feed's format and entities (Product 2026-11-26: format 3 comes with WH-328, Development folds it
 * into the contract later). Whatever format the WH-348 readers need is set in one place, WH348_FORMAT. What the readers
 * return key for key (parity P1 to P8), rates, invoice amounts and settings wait for slice 0.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, copySource, loadCopy, sourceOf, tryLoadCopy, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

/** The copy format whose readers WH-348 adds (contract section 2, "Format gate"). */
const WH348_FORMAT = 3;

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
  env.feed.format = WH348_FORMAT;
  // The columns the Invoices list shows (contract section 0 lists `invoice`, `invoice_trl` as feed entities already).
  const invoice = env.feed.rows.invoice.find(r => r.id === 'inv1');
  if (invoice) Object.assign(invoice.row, { customer_name: 'Bhavin Foods', inv_prefix: 'INV-', inv_fin_year: 2026, cancelled_at: null, doc_type: 'invoice' });
  env.feed.rows.user_profiles.push({
    id: 'p2', row: { id: 'p2', name: 'Nilesh Fictional', display_name: 'Nilesh', role: 'supervisor', mobile: '9000000010', active: true, is_service_account: false },
  });
});
afterEach(async () => { await eraseEverything(); });

const customers = () => (require('@/services/customer-service') as typeof import('@/services/customer-service')).customerService;
const items = () => (require('@/services/item-service') as typeof import('@/services/item-service')).itemService;
const users = () => (require('@/services/admin-user-service') as typeof import('@/services/admin-user-service')).adminUserService;
const invoices = () => require('@/services/invoice-service') as typeof import('@/services/invoice-service');

const pricing = () => require('@/services/item-pricing-service') as typeof import('@/services/item-pricing-service');

const mentions =(result: unknown, text: string) => JSON.stringify(result).includes(text);

type Read = { name: string; role: Role[]; rpc: string; run: () => Promise<unknown>; shows: string | null };
const READS: Read[] = [
  { name: 'Customers list', role: ['admin', 'supervisor', 'staff'], rpc: 'from:customers', shows: 'Bhavin Foods', run: () => customers().getCustomerList({ active: null }, 20, 0) },
  { name: 'Items list', role: ['admin', 'supervisor', 'staff'], rpc: 'get_items', shows: 'Beans', run: () => items().getItemList({ active: null }, 20, 0) },
  { name: 'Invoices list', role: ['admin', 'supervisor', 'staff'], rpc: 'get_invoices_list', shows: '7001', run: () => invoices().getInvoicesList({ p_limit: 20, p_offset: 0 }) },
  { name: 'Users list', role: ['admin', 'supervisor'], rpc: 'get_users_list', shows: 'Meera Fictional', run: () => users().getUsersList({}, 20, 0) },
  // The invoices of one GRN (GRN details, the "Invoices" tab): the same list, filtered to the GRN.
  { name: 'GRN invoice rows', role: ['admin', 'supervisor', 'staff'], rpc: 'get_invoices_list', shows: '7001',
    run: () => invoices().getGrnInvoiceRows({ grnId: 'g-A10', grnNo: 'A10', customerId: 'c2', warehouseRole: true }) },
  // No price history is seeded (its feed entity is not in the fake feed yet): only where the answer comes from is checked.
  { name: 'Item price history', role: ['admin', 'supervisor'], rpc: 'get_item_price_history', shows: null,
    run: () => pricing().getItemPriceHistory({ itemId: 'i1' }) },
];

async function ready(role: Role): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}

describe('R1: with a ready copy each list reads the copy and asks the server nothing', () => {
  for (const read of READS) {
    it.each(read.role)(`${read.name}: %s`, async role => {
      const w = await ready(role);
      const result = await read.run();
      expect(w.serverCalls).toEqual([]);
      if (read.shows) expect(mentions(result, read.shows)).toBe(true);
      expect(sourceOf(result)).toEqual(copySource());
    });
  }

  it('the Invoices list names every invoice of the copy, and the offline phone gives the same answer', async () => {
    const w = await ready('staff');
    const online = await invoices().getInvoicesList({ p_limit: 20, p_offset: 0 });
    const { goOffline } = require('@/tests/phoneCopy/wh299Phone') as typeof import('@/tests/phoneCopy/wh299Phone');
    await goOffline(w);
    const offline = await invoices().getInvoicesList({ p_limit: 20, p_offset: 0 });
    expect(w.serverCalls).toEqual([]);
    expect(JSON.stringify(offline)).toEqual(JSON.stringify(online));
  });
});

describe('R4: a role the feed does not fill for the screen takes today\'s server path', () => {
  // Staff cannot open these online (Product PQ4; contract section 7): their copy carries none of it, so the server answers.
  const STAFF_CLOSED: [string, string, () => Promise<unknown>][] = [
    ['Users list', 'get_users_list', () => users().getUsersList({}, 20, 0)],
    ['Item price history', 'get_item_price_history', () => pricing().getItemPriceHistory({ itemId: 'i1' })],
    ['Item rates', 'get_item_storage_prices', () => pricing().getItemStoragePrices({})],
    ['Standard rate', 'get_standard_rate', () => pricing().getStandardRate().catch(() => null)],
  ];
  it.each(STAFF_CLOSED)('staff on %s: the server is asked, and the copy is not read', async (_name, rpc, run) => {
    const w = await ready('staff');
    const result = await run();
    expect(w.serverCalls.map(c => c.name)).toEqual([rpc]);
    expect(sourceOf(result)).toBeUndefined();
  });
});

type OffCase = [string, () => Promise<Warehouse>];
const OFF: OffCase[] = [
  ['the feature is off for the facility', async () => {
    const w = await bootWarehouse({ role: 'admin', capability: false });
    await tryLoadCopy(w);
    return w;
  }],
  ['the server is older (format 2)', async () => {
    env.feed.format = 2;
    return ready('admin');
  }],
  ['the server is older still (format 1)', async () => {
    env.feed.format = 1;
    return ready('admin');
  }],
  ['the signed-in person is a customer account', async () => {
    const w = await bootWarehouse({ role: 'customer' });
    await tryLoadCopy(w);
    return w;
  }],
];

describe('R2 and R3: otherwise each list asks the server as today, and never answers from the copy', () => {
  describe.each(OFF)('%s', (_why, arrange) => {
    it.each(READS.map(r => [r.name, r] as const))('%s', async (_name, read) => {
      const w = await arrange();
      const result = await read.run();
      expect(w.serverCalls.map(c => c.name)).toEqual([read.rpc]);
      expect(sourceOf(result)).toBeUndefined();
      if (read.shows) expect(mentions(result, read.shows)).toBe(false);
    });
  });

  it('the Customers list sends today\'s query to the server unchanged on an older server', async () => {
    env.feed.format = 2;
    const w = await ready('admin');
    w.answers['from:customers'] = () => ({ data: [{ id: 'server-c', name: 'Server Only Traders', mobile: null, city: null, email: null, address: null, active: true }], error: null });
    const result = await customers().getCustomerList({ active: null }, 20, 0);
    expect(mentions(result, 'Server Only Traders')).toBe(true);
    expect(mentions(result, 'Bhavin Foods')).toBe(false);
  });
});
