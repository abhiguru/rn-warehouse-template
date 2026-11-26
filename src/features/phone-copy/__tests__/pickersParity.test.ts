/**
 * WH-299 slice 5, contract product/tech/app-offline-read-from-copy.md sections 7.2 and 13 (P4): the customer, item and
 * supervisor pickers find the same rows over the copy as the server does.
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules.
 * Expected rows are derived by hand from `search_customers` (migration 147), `search_items_autocomplete` and
 * `get_supervisors` (baseline), backend cd9531e. Rack presets: serviceRouting.test.ts.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, goOffline, loadCopy, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const customer = (id: string, name: string, mobile: string | null, extra: Record<string, unknown> = {}) =>
  env.feed.rows.customers.push({ id, row: { id, name, mobile, active: true, deleted_at: null, ...extra } });
const item = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  env.feed.rows.items.push({ id, row: { id, name, packaging: 'Bag', description: 'Fictional Produce', active: true, ...extra } });
const person = (id: string, name: string, role: string, extra: Record<string, unknown> = {}) =>
  env.feed.rows.user_profiles.push({ id, row: { id, name, display_name: name.split(' ')[0], role, mobile: `90000000${id.slice(1).padStart(2, '0')}`, active: true, is_service_account: false, ...extra } });

beforeEach(() => {
  resetEnv();
  seedWarehouse(); // c1 asha Traders +91 90000 00001, c2 Bhavin Foods 09000000002, c3 Chirag Stores (no mobile)
  customer('c4', 'Asha Old Foods', null, { active: false });
  customer('c5', 'Asha Deleted', null, { deleted_at: '2026-11-01T05:00:00+00:00' });
  customer('c6', 'New asha Cold', '9000000777');
  customer('c7', '100% Pure', null);
  customer('c8', '1000 Pure Goods', null);
  item('i4', 'Split Peas', { packaging: 'Box', description: 'Dry' });
  item('i5', 'Peas Old', { active: false });
  item('i6', 'Chana', { packaging: 'Crate', description: 'Pea family' });
  person('p1', 'Meera Fictional', 'staff');
  person('p2', 'arun Fictional', 'supervisor');
  person('p3', 'Zoya Fictional', 'admin');
  for (const [id, name, role] of [['p1', 'Meera Fictional', 'staff'], ['p2', 'arun Fictional', 'supervisor'], ['p3', 'Zoya Fictional', 'admin'], ['p4', 'Cara Customer', 'customer']]) {
    env.feed.rows.people.push({ id, row: { id, name, display_name: name.split(' ')[0], role } });
  }
  person('p4', 'Cara Customer', 'customer');
  person('p5', 'Robot Fictional', 'staff', { is_service_account: true });
  person('p6', 'Gone Fictional', 'staff', { active: false });
});
afterEach(async () => { await eraseEverything(); });

async function ready(role: Role = 'admin') {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  await goOffline(w);
  return w;
}
const asked = (w: Warehouse) => expect(w.serverCalls).toEqual([]);
const customers = async (query: string, includeInactive = false) => {
  const { searchService } = require('@/services/search-service') as typeof import('@/services/search-service');
  return searchService.searchCustomersOrThrow(query, includeInactive ? { includeInactive } : {});
};
const names = (rows: { label: string }[]) => rows.map(row => row.label);

describe('P4: customers', () => {
  it('puts names that start with the query first, then names with its words inside; never the inactive or deleted', async () => {
    const w = await ready();
    expect(names(await customers('asha'))).toEqual(['asha Traders', 'New asha Cold']);
    asked(w);
  });

  it('lists deactivated customers, marked, when asked for, and still no deleted one', async () => {
    const w = await ready();
    const found = await customers('asha', true);
    expect(names(found)).toEqual(['Asha Old Foods', 'asha Traders', 'New asha Cold']);
    expect(found.map(row => (row as { inactive?: boolean }).inactive ?? false)).toEqual([true, false, false]);
    asked(w);
  });

  it.each<[string, string, string[]]>([
    ['every word somewhere in the name', 'cold new', ['New asha Cold']],
    ['a mobile without India\'s 91 although stored with it', '9000000001', ['asha Traders']],
    ['a mobile with +91 and spaces although stored with 0', '+91 90000 00002', ['Bhavin Foods']],
    ['the start of a mobile', '9000000 7', ['New asha Cold']],
    ['a percent sign, taken literally', '100%', ['100% Pure']],
    ['nothing for an underscore no name has', '_', []],
  ])('%s', async (_name, query, expected) => {
    const w = await ready();
    expect(names(await customers(query))).toEqual(expected);
    asked(w);
  });

  it('answers with the customer\'s id and mobile', async () => {
    await ready();
    expect(await customers('bhavin')).toEqual([expect.objectContaining({ value: 'c2', label: 'Bhavin Foods', mobile: '09000000002', type: 'customer' })]);
  });

  it('states of recent customers come from the copy, an inactive and a deleted one included', async () => {
    const w = await ready();
    const { customerService } = require('@/services/customer-service') as typeof import('@/services/customer-service');
    expect(await customerService.getCustomerStates(['c4', 'c5', 'c1', 'nobody'])).toEqual(new Map([
      ['c1', { active: true, deleted: false }],
      ['c4', { active: false, deleted: false }],
      ['c5', { active: true, deleted: true }],
    ]));
    asked(w);
  });
});

describe('P4: items', () => {
  const items = async (query: string) =>
    (await (require('@/services/item-search-service') as typeof import('@/services/item-search-service')).searchItems(query)).map(row => row.name);

  it.each<[string, string, string[]]>([
    ['names that start with it, then names containing it, then description matches', 'pea', ['Peas', 'Split Peas', 'Chana']],
    ['an underscore in the query matches any one character, as on the server', 'p_a', ['Peas', 'Split Peas', 'Chana']],
    ['a percent sign matches every active item, in name order', '%', ['Beans', 'Chana', 'Peas', 'Rice', 'Split Peas']],
    ['the packaging, in name order', 'bag', ['Beans', 'Peas', 'Rice']],
  ])('%s', async (_name, query, expected) => {
    const w = await ready();
    expect(await items(query)).toEqual(expected);
    asked(w);
  });

  it('gives every match: the server\'s limit does not cut this answer', async () => {
    for (let n = 1; n <= 25; n += 1) item(`x${n}`, `Lentil ${String(n).padStart(2, '0')}`);
    const w = await ready();
    expect(await items('lentil')).toHaveLength(25);
    asked(w);
  });

  it('the filter sheet\'s item search answers the same rows', async () => {
    const w = await ready();
    const { searchService } = require('@/services/search-service') as typeof import('@/services/search-service');
    expect((await searchService.searchGRNItems('pea')).map(row => row.value)).toEqual(['i1', 'i4', 'i6']);
    asked(w);
  });
});

describe('P4: supervisors', () => {
  /** The names in the answer, in the order given, whatever envelope holds them. */
  const found = async (query: string) => {
    const service = require(`@/services/${'supervisor-service'}`) as { getSupervisors: (q: string) => Promise<unknown> };
    const answer = JSON.stringify(await service.getSupervisors(query));
    return { answer, names: [...answer.matchAll(/"name":"([^"]*)"/g)].map(match => match[1]) };
  };

  it('an administrator gets active staff, supervisors and administrators in name order, with their phone', async () => {
    const w = await ready('admin');
    const result = await found('');
    expect(result.names).toEqual(['arun Fictional', 'Meera Fictional', 'Zoya Fictional']);
    expect(result.answer).toContain('"phone":"9000000001"');
    asked(w);
  });

  it('staff get the same people without phones', async () => {
    const w = await ready('staff');
    const result = await found('');
    expect(result.names).toEqual(['arun Fictional', 'Meera Fictional', 'Zoya Fictional']);
    expect(result.answer).not.toContain('"phone"');
    expect(result.answer).not.toContain('900000000');
    asked(w);
  });

  it('an underscore in the query matches any one character', async () => {
    const w = await ready('admin');
    expect((await found('m_era')).names).toEqual(['Meera Fictional']);
    asked(w);
  });
});
