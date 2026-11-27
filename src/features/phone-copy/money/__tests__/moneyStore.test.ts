/**
 * WH-305, contract product/tech/app-offline-dues-statement.md 3 and T1, T2 (store part), T3, T10: the kept answers of
 * Customer dues, Statement and Customer activity in the phone copy's `money_answers` table.
 *
 * Real: the store, the sync engine, the copy. Faked at the edge: the phone's native modules and the server's feed.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract names "read, write, erase" but no signatures) =====
 *  - `@/features/phone-copy/money/moneyStore` exports
 *      `writeMoneyAnswer({ kind, key, asOf, today, body }): Promise<boolean>` (true when kept; `body` is the answer's JSON object,
 *      `today` is null for activity), and
 *      `readMoneyAnswer(kind, key): Promise<{ asOf: string; today: string | null; body: unknown; usedAt: number } | null>`.
 *    Erasing is done by the existing paths (sign-out, switch, reload_all, clearData): no store call is made for it here.
 *  - The table is `money_answers (kind, key, as_of, today, body, used_at)` exactly as the contract's SQL; `body` is JSON text.
 *  - Bounds: 2,000,000 characters per body; 20 activity answers (the newest by `used_at`).
 * ==============================================================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { bootWarehouse, loadCopy, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { duesBody, queueRun, seedMoney, statementBody, MORNING, YESTERDAY } from '@/tests/phoneCopy/moneyDataset';

beforeEach(() => { resetEnv(); seedMoney(); });
afterEach(async () => { await eraseEverything(); });

const store = () => require('@/features/phone-copy/money/moneyStore') as {
  writeMoneyAnswer: (a: { kind: string; key: string; asOf: string; today: string | null; body: unknown }) => Promise<boolean>;
  readMoneyAnswer: (kind: string, key: string) => Promise<{ asOf: string; today: string | null; body: unknown; usedAt: number } | null>;
};
async function ready(role: 'admin' | 'supervisor' | 'staff' = 'admin'): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}
async function rowsOfMoney(w: Warehouse) {
  const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
  return db.all<{ kind: string; key: string; as_of: string; today: string | null; body: string; used_at: number }>(
    'SELECT kind, key, as_of, today, body, used_at FROM money_answers ORDER BY kind, key');
}

describe('T1: answers are stored as the server sent them', () => {
  it('a dues, a statement and an activity answer read back equal, with their own time and day', async () => {
    const w = await ready();
    const dues = duesBody();
    const statement = statementBody('c2');
    const activity = { success: true, summary: { total_customers: 1 }, customers: [{ customer_id: 'c2' }] };
    expect(await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: dues.as_of, today: dues.today, body: dues })).toBe(true);
    expect(await store().writeMoneyAnswer({ kind: 'statement', key: 'c2', asOf: statement.as_of, today: statement.today, body: statement })).toBe(true);
    expect(await store().writeMoneyAnswer({ kind: 'activity', key: 'customers|2026-10-29|2026-11-27', asOf: MORNING, today: null, body: activity })).toBe(true);
    expect(await store().readMoneyAnswer('dues', '')).toMatchObject({ asOf: MORNING, today: '2026-11-27', body: dues });
    expect(await store().readMoneyAnswer('statement', 'c2')).toMatchObject({ body: statement });
    expect(await store().readMoneyAnswer('activity', 'customers|2026-10-29|2026-11-27')).toMatchObject({ today: null, body: activity });
    expect(await store().readMoneyAnswer('statement', 'c1')).toBeNull();
    // Byte for byte: the stored text is the body, the figures are not re-worked (the totals are not the sum of the rows).
    const [storedDues] = (await rowsOfMoney(w)).filter(r => r.kind === 'dues');
    expect(JSON.parse(storedDues.body)).toEqual(dues);
    expect(JSON.parse(storedDues.body).totals.invoices_amount).toBe(3007);
  });

  it('an older answer arriving late changes nothing; a newer one replaces', async () => {
    const w = await ready();
    const fresh = duesBody({ asOf: MORNING, invoices: 1000 });
    const older = duesBody({ asOf: YESTERDAY, today: '2026-11-26', invoices: 5 });
    await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: fresh.as_of, today: fresh.today, body: fresh });
    await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: older.as_of, today: older.today, body: older });
    expect((await store().readMoneyAnswer('dues', ''))?.body).toEqual(fresh);
    const newer = duesBody({ asOf: '2026-11-27T04:00:00.000Z', invoices: 2000 });
    await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: newer.as_of, today: newer.today, body: newer });
    expect((await store().readMoneyAnswer('dues', ''))?.body).toEqual(newer);
    expect(await rowsOfMoney(w)).toHaveLength(1);
  });

  it('an equal as_of replaces the kept answer', async () => {
    const w = await ready();
    const first = duesBody({ asOf: MORNING, invoices: 1000 });
    const replacement = duesBody({ asOf: MORNING, invoices: 1500 });
    expect(await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: first.as_of, today: first.today, body: first })).toBe(true);
    expect(await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: replacement.as_of, today: replacement.today, body: replacement })).toBe(true);
    expect((await store().readMoneyAnswer('dues', ''))?.body).toEqual(replacement);
    expect(await rowsOfMoney(w)).toHaveLength(1);
  });
});

describe('T2: no money maths on the phone', () => {
  it('a payment and an invoice arriving in the copy leave the kept answers as they were', async () => {
    const w = await ready();
    const dues = duesBody();
    const statement = statementBody('c2');
    await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: dues.as_of, today: dues.today, body: dues });
    await store().writeMoneyAnswer({ kind: 'statement', key: 'c2', asOf: statement.as_of, today: statement.today, body: statement });
    queueRun([
      { e: 'payments', id: 'pay-9', op: 'upsert', v: 'b000000000000009', row: { id: 'pay-9', payment_no: 19, payment_date: '2026-11-27T04:00:00+00:00', paid_on: '2026-11-27',
        customer_id: 'c2', invoice_id: 'inv1', amount: 4000, payment_mode: 'cash', note: null, updated_at: '2026-11-27T04:00:00+00:00', imported: false, recorded_in_app: true, entered_by_name: 'Meera Fictional' } },
      { e: 'invoice', id: 'inv1', op: 'upsert', v: 'b000000000000010', row: { id: 'inv1', gr_id: 'g-A10', customer_id: 'c2', inv_no: 7001, inv_date: '2026-11-24', total: 9999, deleted_at: null } },
    ]);
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    expect((await store().readMoneyAnswer('dues', ''))?.body).toEqual(dues);
    expect((await store().readMoneyAnswer('statement', 'c2'))?.body).toEqual(statement);
  });
});

describe('T3: bounds', () => {
  it('a body of 2,000,001 characters is not kept, one of 2,000,000 is', async () => {
    const w = await ready();
    const sized = (n: number) => ({ pad: 'x'.repeat(n - JSON.stringify({ pad: '' }).length) });
    expect(JSON.stringify(sized(2_000_000)).length).toBe(2_000_000);
    expect(await store().writeMoneyAnswer({ kind: 'statement', key: 'c1', asOf: MORNING, today: '2026-11-27', body: sized(2_000_001) })).toBe(false);
    expect(await store().readMoneyAnswer('statement', 'c1')).toBeNull();
    expect(await store().writeMoneyAnswer({ kind: 'statement', key: 'c2', asOf: MORNING, today: '2026-11-27', body: sized(2_000_000) })).toBe(true);
    expect((await rowsOfMoney(w)).map(r => r.key)).toEqual(['c2']);
  });

  it('the 21st activity key evicts the oldest by used_at; statements are never evicted', async () => {
    const w = await ready();
    const now = jest.spyOn(Date, 'now');
    const base = Date.parse('2026-11-27T05:30:00.000Z');
    now.mockReturnValue(base - 1000);
    await store().writeMoneyAnswer({ kind: 'statement', key: 'c1', asOf: MORNING, today: '2026-11-27', body: statementBody('c1') });
    for (let n = 1; n <= 21; n += 1) {
      now.mockReturnValue(base + n);
      await store().writeMoneyAnswer({ kind: 'activity', key: `customer:c1|2026-11-${String(n).padStart(2, "0")}|2026-11-27`, asOf: MORNING, today: null, body: { success: true, n } });
    }
    const rows = await rowsOfMoney(w);
    const activity = rows.filter(r => r.kind === 'activity').map(r => r.key);
    expect(activity).toHaveLength(20);
    expect(activity).not.toContain('customer:c1|2026-11-01|2026-11-27');
    expect(activity).toContain('customer:c1|2026-11-21|2026-11-27');
    expect(rows.filter(r => r.kind === 'statement').map(r => r.key)).toEqual(['c1']);
  });
});

describe('T10: erase', () => {
  async function keepSome(w: Warehouse) {
    await store().writeMoneyAnswer({ kind: 'dues', key: '', asOf: MORNING, today: '2026-11-27', body: duesBody() });
    await store().writeMoneyAnswer({ kind: 'statement', key: 'c1', asOf: MORNING, today: '2026-11-27', body: statementBody('c1') });
    expect(await rowsOfMoney(w)).toHaveLength(2);
  }

  it('sign-out and a server switch (the copy is erased) leave no answer', async () => {
    const w = await ready();
    await keepSome(w);
    await w.phone.copyDb.eraseCopy();
    const again = await ready();
    expect(await rowsOfMoney(again)).toEqual([]);
  });

  it('reload_all leaves no answer', async () => {
    const w = await ready();
    await keepSome(w);
    env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: { reason: 'BULK_IMPORT' }, reload: [], changes: [] });
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    expect(await rowsOfMoney(w)).toEqual([]);
  });

  it('a reload of invoice keeps the answers and marks every customer stale', async () => {
    const w = await ready();
    await keepSome(w);
    env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: ['invoice'], changes: [] });
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    expect(await rowsOfMoney(w)).toHaveLength(2);
    const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
    const stale = (await db.all<{ customer_id: string }>('SELECT customer_id FROM money_stale ORDER BY customer_id')).map(r => r.customer_id);
    expect(stale).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']));
  });
});
