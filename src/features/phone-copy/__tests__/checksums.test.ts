/**
 * WH-298, spec edge case "Checksum mismatch" (contract 6.7, 7.3; T40, T41): after a full sync the phone compares its
 * count and sum with the server's for every entity; a difference reloads that entity and is reported with the entity's
 * name and both counts only.
 *
 * Real: the engine, the checksum code, the schema (the `v_hi` and `v_lo` columns), the store. Faked at the edge: the
 * server's answers (fakeFeed.ts computes the contract's count and sum from its rows; `checksumEdit` changes them) and the
 * phone's native modules (phoneEnv.ts); the Sentry reporter is observed.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - After a full sync, when `meta.checksum_at` is absent, older than 24 h, or in the future, the engine calls
 *    `get_sync_checksums({ p_position, p_copy })` (the position and copy key of the copy) without a trigger of the test.
 *  - The report is `captureMessage('sync_checksum_mismatch', ...)` of `@/config/sentryConfig`, with the entity and both
 *    counts in its text or extras and no row data.
 *  - `meta.checksum_at` is milliseconds on the phone's clock.
 * ===========================================================================================
 */
import { bootPhone, env, eraseEverything, idsOf, metaOf, resetEnv, type Phone } from '../tests/phoneEnv';
import { grnRow } from '../tests/fakeFeed';

const reports: unknown[][] = [];
const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-25T07:00:00Z');

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  resetEnv();
  reports.length = 0;
  const f = env.feed;
  // v values with their high bits set, so a sum that overflowed or lost bits would differ from the server's.
  f.rows.goodsreceived.push(
    { ...grnRow('g1', { gr_no: 'G-001' }), v: 'ffffffffffffffff' }, { ...grnRow('g2', { gr_no: 'G-002' }), v: 'f0f0f0f0f0f0f0f0' }, { ...grnRow('g3', { gr_no: 'G-003' }), v: '8000000000000001' },
  );
  f.rows.customers.push({ id: 'c1', row: { id: 'c1', name: 'Fictional Customer' }, v: '123456789abcdef0' });
  f.rows.dispatch.push({ id: 'd1', row: { id: 'd1', disp_no: 'D-1' } });
});
afterEach(async () => { await eraseEverything(); jest.useRealTimers(); });

function boot(): Phone {
  jest.doMock('@/config/sentryConfig', () => ({
    captureMessage: (...args: unknown[]) => { reports.push(args); },
    captureException: jest.fn(), initializeSentry: jest.fn(), redactErrorText: (s: string) => s,
  }));
  return bootPhone();
}
const checksumCalls = () => env.feed.named('get_sync_checksums');
async function fullSync(phone: Phone) {
  await phone.engine.startPhoneCopy();
  return phone.engine.syncNow('open');
}
const mismatches = () => reports.filter(r => JSON.stringify(r).includes('sync_checksum_mismatch'));

describe('T40: the local sum follows the server\'s rule', () => {
  it('compares after the first full sync, sending the copy\'s position and key', async () => {
    const phone = boot();
    expect(await fullSync(phone)).toBe('done');
    expect(checksumCalls()).toHaveLength(1);
    expect(checksumCalls()[0].args).toMatchObject({ p_position: env.feed.startPosition, p_copy: env.feed.copy });
  });

  it('equal counts and sums, with rows whose v has the high bits set, change nothing and report nothing', async () => {
    const phone = boot();
    await fullSync(phone);
    expect(mismatches()).toEqual([]);
    expect(env.feed.pagesOf('goodsreceived')).toHaveLength(1);              // not loaded a second time
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2', 'g3']);
  });
});

describe('T41: a difference', () => {
  it('a different count reloads that entity only, and reports its name and both counts, with no row data', async () => {
    env.feed.checksumEdit = answer => ({
      ...answer, entities: answer.entities.map(e => (e.e === 'goodsreceived' ? { ...e, count: e.count + 1 } : e)),
    });
    const phone = boot();
    await fullSync(phone);
    expect(env.feed.pagesOf('goodsreceived').length).toBe(2);               // the first load and the reload
    expect(env.feed.pagesOf('customers')).toHaveLength(1);
    expect(env.feed.pagesOf('dispatch')).toHaveLength(1);
    const [report] = mismatches();
    expect(report).toBeDefined();
    const text = JSON.stringify(report);
    expect(text).toContain('goodsreceived');
    expect(text).toContain('3');                                            // the phone's count
    expect(text).toContain('4');                                            // the server's count
    expect(text).not.toContain('G-001');
    expect(text).not.toContain('ffffffffffffffff');
  });

  it('a different sum with the same count is also a mismatch', async () => {
    env.feed.checksumEdit = answer => ({
      ...answer, entities: answer.entities.map(e => (e.e === 'customers' ? { ...e, sum: String(BigInt(e.sum) + 1n) } : e)),
    });
    const phone = boot();
    await fullSync(phone);
    expect(env.feed.pagesOf('customers').length).toBe(2);
    expect(mismatches()).toHaveLength(1);
  });

  it('a mismatch the reload fixes is not found again on the next comparison', async () => {
    let first = true;
    env.feed.checksumEdit = answer => {
      if (!first) return answer;
      first = false;
      return { ...answer, entities: answer.entities.map(e => (e.e === 'goodsreceived' ? { ...e, count: 99 } : e)) };
    };
    const phone = boot();
    await fullSync(phone);
    expect(mismatches()).toHaveLength(1);
    jest.setSystemTime(NOW + 25 * HOUR);
    await phone.engine.syncNow('interval');
    expect(mismatches()).toHaveLength(1);
  });

  it('an entity that is not settled is skipped and compared on a later full sync, at most once an hour', async () => {
    env.feed.checksumEdit = answer => ({
      ...answer,
      entities: answer.entities.map(e => (e.e === 'goodsreceived' ? { ...e, count: 99, settled: false } : e)),
    });
    const phone = boot();
    await fullSync(phone);
    expect(mismatches()).toEqual([]);                                       // skipped, not reloaded
    expect(env.feed.pagesOf('goodsreceived')).toHaveLength(1);
    expect(checksumCalls()).toHaveLength(1);

    jest.setSystemTime(NOW + 30 * 60_000);
    await phone.engine.syncNow('interval');
    expect(checksumCalls()).toHaveLength(1);                                // not within the hour

    env.feed.checksumEdit = null;
    jest.setSystemTime(NOW + 61 * 60_000);
    await phone.engine.syncNow('interval');
    expect(checksumCalls()).toHaveLength(2);                                // and now it is settled and equal
    expect(mismatches()).toEqual([]);
  });

  it('once every entity has been compared, the next comparison waits 24 hours', async () => {
    const phone = boot();
    await fullSync(phone);
    expect(await metaOf(phone, 'checksum_at')).not.toBeNull();
    jest.setSystemTime(NOW + 23 * HOUR);
    await phone.engine.syncNow('interval');
    expect(checksumCalls()).toHaveLength(1);
    jest.setSystemTime(NOW + 25 * HOUR);
    await phone.engine.syncNow('interval');
    expect(checksumCalls()).toHaveLength(2);
  });

  it('a phone clock moved back (the stored time is in the future) compares again', async () => {
    const phone = boot();
    await fullSync(phone);
    jest.setSystemTime(NOW - 48 * HOUR);
    await phone.engine.syncNow('interval');
    expect(checksumCalls()).toHaveLength(2);
  });

  it('an answer with reload_all is handled as a reload of everything', async () => {
    env.feed.checksumEdit = (answer) => ({ ...answer, reload_all: { reason: 'BULK_IMPORT' }, entities: [] });
    const phone = boot();
    await fullSync(phone);
    expect(env.feed.named('get_sync_start').length).toBeGreaterThanOrEqual(2);
  });

  it('a failed comparison (no answer) does not fail the sync it followed or lose the copy', async () => {
    env.feed.failWhen = c => c.name === 'get_sync_checksums';
    const phone = boot();
    expect(await fullSync(phone)).toBe('done');
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2', 'g3']);
  });
});
