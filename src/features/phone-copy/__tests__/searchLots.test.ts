/**
 * WH-298 groundwork for spec step 8 (contract section 10; T49, T50): the read API of the copy finds lots by the same
 * rule as the server and the app's `matchesSearch`: every word (cut at 120 characters, at most 8 words, any case) must be
 * found inside at least one of gr_no, customer name, item, marking, rack and registration; 1 and 2 character words count;
 * `%` and `_` are literal; a word never matches across two columns. Parity on the 60,000-GRN set is WH-299's.
 *
 * Real: the copy store with its search table and FTS index, loaded by the real first load, and `copyQueries`. Faked at the
 * edge: the server's answers and the phone's native modules.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives) =====
 *  - `@/features/phone-copy/copyQueries`: `searchLots(query, { limit?, after? })` → `{ rows: CopyLot[], next: LotCursor | null, olderLoading }`,
 *    `readGrn(id)`, `readSetting(key)`, `CopyNotReadableError`; order `g.date DESC, g.id, t.id`; limit default and maximum 50.
 *  - Row fields read from the server rows: GRN `gr_no`, `customer_name`, `registration`, `date`; lot `item_name`, `package_mark`, `rack`, `gr_id`.
 * ============================================================
 */
import { bootPhone, env, eraseEverything, resetEnv, type Phone } from '../tests/phoneEnv';
import { statementLog } from '../tests/fakeExpoSqlite';
import { grnRow, lotRow } from '../tests/fakeFeed';
import { matchesSearch, searchTerms } from '@/features/filters/searchMatch';

type Lot = { lotId: string; gr_no: string; customer: string; item: string; mark: string; rack: string; reg: string | null; date: string };
const lots: Lot[] = [
  { lotId: 'l01', gr_no: 'G-001', customer: 'Asha Fictional Traders', item: 'Fictional Peas', mark: 'PK-77', rack: 'A-1', reg: 'GJ01AB1234', date: '2026-11-20' },
  { lotId: 'l02', gr_no: 'G-001', customer: 'Asha Fictional Traders', item: 'Fictional Beans', mark: 'PK-78', rack: 'A-2', reg: 'GJ01AB1234', date: '2026-11-20' },
  { lotId: 'l03', gr_no: 'G-002', customer: 'Bhavin Sample Foods', item: 'Fictional Peas', mark: '50%_OFF', rack: 'B-2', reg: null, date: '2026-11-21' },
  { lotId: 'l04', gr_no: 'G-003', customer: 'ASHA FICTIONAL TRADERS', item: 'Fictional Rice', mark: 'PK-99', rack: 'C-3', reg: 'GJ05XY9999', date: '2026-11-22' },
  { lotId: 'l05', gr_no: 'G-004', customer: 'ભાવિન સેમ્પલ ટ્રેડર્સ', item: 'મગફળી', mark: 'ગ-5', rack: 'D-4', reg: null, date: '2026-11-23' },
  { lotId: 'l06', gr_no: 'G-005', customer: 'Chirag Example', item: 'Fictional Peas', mark: 'X', rack: 'E-5', reg: 'MH12QQ0001', date: '2026-11-19' },
  { lotId: 'l07', gr_no: 'G-006', customer: 'Fictional', item: 'Peas', mark: 'A', rack: 'F-6', reg: null, date: '2026-11-18' },
];
const grnIdOf = (gr_no: string) => `g-${gr_no}`;

beforeEach(async () => {
  resetEnv();
  for (const l of lots) {
    if (!env.feed.rows.goodsreceived.some(g => g.id === grnIdOf(l.gr_no))) {
      env.feed.rows.goodsreceived.push(grnRow(grnIdOf(l.gr_no), { gr_no: l.gr_no, customer_name: l.customer, registration: l.reg, date: l.date }));
    }
    env.feed.rows.goodsreceived_trl.push(lotRow(l.lotId, grnIdOf(l.gr_no), { gr_id: grnIdOf(l.gr_no), item_name: l.item, package_mark: l.mark, rack: l.rack }));
  }
});
afterEach(async () => { await eraseEverything(); });

async function loaded(): Promise<Phone> {
  const phone = bootPhone();
  await phone.engine.startPhoneCopy();
  expect(await phone.engine.syncNow('open')).toBe('done');
  return phone;
}
const expectedIds = (query: string) =>
  lots.filter(l => matchesSearch(searchTerms(query), [l.gr_no, l.customer, l.item, l.mark, l.rack, l.reg])).map(l => l.lotId).sort();
const found = async (phone: Phone, query: string) => (await phone.queries.searchLots(query, { limit: 50 })).rows.map(r => r.lotId).sort();

describe('T49: the same rows as the server\'s rule', () => {
  it.each([
    ['a 1-character word', 'a'], ['a 2-character word', 'pk'], ['a 3-or-more-character word', 'fict'], ['a GRN number', 'g-001'],
    ['upper case in the data', 'asha'], ['upper case in the query', 'FICTIONAL PEAS'], ['two words in different columns', 'peas b-2'],
    ['a registration', 'gj05'], ['a rack', 'c-3'], ['Gujarati text', 'મગફળી'], ['Gujarati customer', 'ભાવિન'],
    ['a word found nowhere', 'zzzz'], ['one word that matches and one that does not', 'peas zzzz'],
  ])('%s: "%s"', async (_name, query) => {
    const phone = await loaded();
    const expected = expectedIds(query);
    expect(await found(phone, query)).toEqual(expected);
    if (query === 'zzzz') expect(expected).toEqual([]);
    else expect(expected.length).toBeGreaterThan(0);
  });

  it('"%" and "_" are literal characters, not wildcards', async () => {
    const phone = await loaded();
    expect(await found(phone, '%')).toEqual(['l03']);
    expect(await found(phone, '_')).toEqual(['l03']);
    expect(await found(phone, '50%_')).toEqual(['l03']);
    expect(await found(phone, 'p%k')).toEqual([]);
  });

  it('a word never matches across two columns (the columns are not run together)', async () => {
    const phone = await loaded();
    // "Peas" ends the item and "PK-77" starts the marking: "peaspk" must not be found.
    expect(await found(phone, 'peaspk')).toEqual([]);
    expect(await found(phone, 'a-1fict')).toEqual([]);
  });

  it('reads at most 8 words and the first 120 characters, as the server does', async () => {
    const phone = await loaded();
    const nineWords = 'fictional peas g-001 pk-77 a-1 gj01 asha traders zzzz';        // the ninth word is dropped
    expect(await found(phone, nineWords)).toEqual(expectedIds(nineWords));
    expect(expectedIds(nineWords)).toEqual(['l01']);
    const long = `fictional ${'x'.repeat(130)}`;                                       // cut inside the second word
    expect(await found(phone, long)).toEqual(expectedIds(long));
  });

  it('an empty or blank query returns every lot', async () => {
    const phone = await loaded();
    expect(await found(phone, '')).toEqual(lots.map(l => l.lotId).sort());
    expect(await found(phone, '   ')).toEqual(lots.map(l => l.lotId).sort());
  });

  it('a change of customer name on the GRN is what search finds afterwards', async () => {
    const phone = await loaded();
    expect(await found(phone, 'renamed')).toEqual([]);
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived', id: grnIdOf('G-001'), op: 'upsert', v: 'a3f09c2b11d4e5f6', row: { id: grnIdOf('G-001'), gr_no: 'G-001', customer_name: 'Renamed Traders', registration: 'GJ01AB1234', date: '2026-11-20' } }],
    });
    await phone.engine.syncNow('pull-to-refresh');
    expect(await found(phone, 'renamed')).toEqual(['l01', 'l02']);
  });
});

describe('T50: pages', () => {
  it('rows come newest GRN first, then by GRN id and lot id', async () => {
    const phone = await loaded();
    const ids = (await phone.queries.searchLots('', { limit: 50 })).rows.map(r => r.lotId);
    expect(ids).toEqual(['l05', 'l04', 'l03', 'l01', 'l02', 'l06', 'l07']);
  });

  it('returns the first rows with a keyset cursor, and the next page continues after it without repeating or skipping', async () => {
    const phone = await loaded();
    const first = await phone.queries.searchLots('', { limit: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.next).not.toBeNull();
    const second = await phone.queries.searchLots('', { limit: 3, after: first.next });
    const third = await phone.queries.searchLots('', { limit: 3, after: second.next });
    const all = [...first.rows, ...second.rows, ...third.rows].map(r => r.lotId);
    expect(all).toEqual((await phone.queries.searchLots('', { limit: 50 })).rows.map(r => r.lotId));
    expect(new Set(all).size).toBe(lots.length);
    expect(third.next).toBeNull();
  });

  it('no match is a true "nothing found": zero rows, no cursor', async () => {
    const phone = await loaded();
    expect(await phone.queries.searchLots('zzzz')).toMatchObject({ rows: [], next: null });
  });

  it('never asks for more than 50 rows, whatever the limit given, and runs no count query', async () => {
    for (let i = 0; i < 80; i++) {
      env.feed.rows.goodsreceived_trl.push(lotRow(`m${String(i).padStart(3, '0')}`, grnIdOf('G-001'), { gr_id: grnIdOf('G-001'), item_name: 'Fictional Peas', package_mark: `M-${i}`, rack: 'Z' }));
    }
    const phone = await loaded();
    statementLog().length = 0;
    const result = await phone.queries.searchLots('fictional', { limit: 500 });
    expect(result.rows).toHaveLength(50);
    expect(result.next).not.toBeNull();
    expect(statementLog().some(sql => /count\s*\(/i.test(sql))).toBe(false);
  });

  it('each row carries its GRN and its lot as the server sent them', async () => {
    const phone = await loaded();
    const [row] = (await phone.queries.searchLots('pk-77')).rows;
    expect(row).toMatchObject({ lotId: 'l01', grId: grnIdOf('G-001'), grn: { gr_no: 'G-001' }, lot: { package_mark: 'PK-77', rack: 'A-1' } });
  });

  it('reads one GRN with its lots, photos and lock, and a setting by its key', async () => {
    env.feed.rows.grn_images.push({ id: 'im1', row: { id: 'im1', grn_id: grnIdOf('G-001') } });
    env.feed.rows.grn_lock.push({ id: grnIdOf('G-001'), row: { grn_id: grnIdOf('G-001') } });
    env.feed.rows.settings.push({ id: 'rack_presets', row: { presets: ['A-1', 'A-2'] } });
    const phone = await loaded();
    const grn = await phone.queries.readGrn(grnIdOf('G-001'));
    expect(grn?.grn).toMatchObject({ gr_no: 'G-001' });
    expect(grn?.lots.map(l => l.id).sort()).toEqual(['l01', 'l02']);
    expect(grn?.images).toHaveLength(1);
    expect(grn?.lock).toMatchObject({ grn_id: grnIdOf('G-001') });
    expect(await phone.queries.readGrn('nowhere')).toBeNull();
    expect(await phone.queries.readSetting('rack_presets')).toMatchObject({ presets: ['A-1', 'A-2'] });
    expect(await phone.queries.readSetting('numbering')).toBeNull();
  });

  it('throws CopyNotReadableError while the copy is not readable (stage one, or nothing loaded)', async () => {
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    await expect(phone.queries.searchLots('a')).rejects.toBeInstanceOf(phone.queries.CopyNotReadableError);
    await expect(phone.queries.readGrn('g')).rejects.toBeInstanceOf(phone.queries.CopyNotReadableError);
    await expect(phone.queries.readSetting('rack_presets')).rejects.toBeInstanceOf(phone.queries.CopyNotReadableError);
  });
});
