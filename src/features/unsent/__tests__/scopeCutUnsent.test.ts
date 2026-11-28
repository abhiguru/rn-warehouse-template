/**
 * WH-381 Section 3 (contract product/tech/app-offline-scope-cut.md; Design offline-capture.md Part 13.1 C;
 * Spec offline-capture.md steps 10, 17, 19, 31, criteria 8, 9):
 *  1. `unsent-work.db` schema upgrade 2 -> 3 in-place: deletes legacy dispatch forms, items (`newDispatch`,
 *     dispatch `photos`), `item_photos`, and photo files while preserving every GRN form, item (`newGrn`,
 *     `grnEdit`, `lotChange`, GRN `photos`), and photo file; legacy dispatches never block sign-out or trip
 *     the 2-hour gate after upgrade.
 *  2. Stock overlays (`unsentOverlay`, `lotOverlay`, `FindGoodsRow`, `UnsentLotLines`): lot stock is server
 *     `goodsreceived_trl.stock` plus only `newGrn` additions and `grnEdit` quantity deltas (`stock + (now - was)`);
 *     `lessUnsent`, `lessHeld`, `lessOthersUnsent`, and `deductions()` are always 0 / empty; no deduction lines
 *     (`lessNotSent` / `lessHeld` / `lessOtherPerson`) render on lots or Find goods.
 *  3. Holding list (`WH-304`): no `<HeldStrip />` on Dispatch tab (`app/(tabs)/dispatch.tsx`), `<HeldStrip />`
 *     stays on GRN tab (`app/(tabs)/grn.tsx`); historical `kind === 'newDispatch'` rows in `held_items` are
 *     filtered out of `ownHeldCopyRows` and `heldNeedingDecision`, while `newGrn`, `grnEdit`, `lotChange`, and
 *     GRN `photos` stay intact.
 *
 * Contract-first: written against 71d7159d before WH-381 implementation; assertions on new WH-381 behaviour fail
 * until Development builds Section 3.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import {
  bootUnsent,
  DOCUMENT_PHOTOS,
  rawRows,
  rawRun,
  restart,
  server,
  unsentFileNames,
} from '@/tests/unsent/unsentPhone';
import { bootHolding, heldDispatchFeedRow, recorderHeldFeedRow } from '@/tests/unsent/holdingPhone';

const HOUR = 3_600_000;

/** The address of a photo file in the unsent folder. */
const photoUri = (name: string): string => `${DOCUMENT_PHOTOS}${name}`;

const sampleNewGrnBody = (localId: string, qty = 20) => ({
  v: 1,
  localId,
  lotLocalIds: [`${localId}-lot-1`],
  args: {
    p_gr_no: '',
    p_issue_number: true,
    p_date: '2026-11-27',
    p_customer_id: 'c1',
    p_customer_name: 'Asha Fictional Traders',
    p_items: [{ item_id: 'i1', item_name: 'Fictional Peas', packaging: 'Bag', qty, weight: 50, rack: 'A-1', package_mark: 'M-1' }],
    p_warn_duplicate: true,
  },
  show: {
    customerName: 'Asha Fictional Traders',
    lines: [{ itemName: 'Fictional Peas', packaging: 'Bag' }],
  },
});

const sampleGrnEditBody = (grnId: string, lotId: string, fromQty: number, toQty: number) => ({
  v: 1,
  grnId,
  loadedAt: '2026-11-27T08:00:00.000Z',
  recordedAt: '2026-11-27T09:00:00+05:30',
  lots: { [lotId]: { qty: { from: fromQty, to: toQty } } },
});

const sampleLotChangeBody = (lotId: string, grnId: string) => ({
  lotId,
  grnId,
  recordedAt: '2026-11-27T09:00:00+05:30',
  changes: { rack: { from: 'A-1', to: 'C-2' } },
});

const sampleDispatchBody = (localId = '5f381000-0000-4000-8000-0000000000d1', lotId = 'l03', qty = 6) => ({
  v: 1,
  localId,
  args: {
    p_dispatch_data: { disp_no: '', issue_number: true, customer_id: 'c1', disp_date: '2026-11-27' },
    p_dispatch_items: [{ gr_trl_id: lotId, disp_qty: qty }],
    p_generate_invoice: false,
    p_retry_count: 0,
  },
  show: { customerName: 'Asha Fictional Traders' },
});

/** Seeds a schema-2 `unsent-work.db` directly so reopening exercises the 2 -> 3 in-place migration. */
async function seedSchema2Db(plant: readonly string[], seed: (helpers: { scope: string; insertItem: (row: {
  id: string;
  seq: number;
  kind: string;
  body: unknown;
  dependsOn?: string | null;
  state?: string;
  what: string;
  recordedAt?: number;
  recordedTick?: number;
  formRow?: unknown;
}) => Promise<void>; insertPhoto: (itemId: string, storedPath: string, clientPhotoId: string, role: string) => Promise<void>; insertForm: (row: {
  id: string;
  kind: string;
  grnId?: string;
  state: unknown;
  photos?: string[];
  rawPhotos?: string;
}) => Promise<void>; setClockLedger: (t: number, wall: number) => Promise<void> }) => Promise<void>): Promise<void> {
  const first = await bootUnsent();
  await first.store.initUnsent();
  const scope = (await first.phone.scope())!;
  const dbName = fakeDatabaseNames().find(n => n.includes('unsent-work'))!;
  const sqlite = require('expo-sqlite') as {
    openDatabaseAsync(name: string): Promise<{ runAsync(sql: string, params?: unknown[]): Promise<unknown> }>;
  };
  const db = await sqlite.openDatabaseAsync(dbName);
  await db.runAsync('DELETE FROM item_photos');
  await db.runAsync('DELETE FROM items');
  await db.runAsync('DELETE FROM forms');
  // The file the first start made has today's shape; take out what version 4 added, so it really is a version-2 file.
  await db.runAsync('ALTER TABLE item_photos DROP COLUMN report_queued');
  await db.runAsync('DROP TABLE photo_reports');
  // The files are planted only now: the first start's sweep (above) would remove unnamed form-* files planted earlier.
  for (const name of plant) files.held.set(photoUri(name), 1200);
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2')");

  const insertItem = async (row: {
    id: string;
    seq: number;
    kind: string;
    body: unknown;
    dependsOn?: string | null;
    state?: string;
    what: string;
    recordedAt?: number;
    recordedTick?: number;
    formRow?: unknown;
  }) => {
    await db.runAsync(
      `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, depends_on, target_ref, what, customer, state, attempts, recorded_at, recorded_tick, form_row)
       VALUES (?, ?, ?, 'Ravi Fictional', ?, ?, ?, ?, NULL, ?, 'Asha Fictional Traders', ?, 0, ?, ?, ?)`,
      [
        row.id,
        row.seq,
        scope,
        row.kind,
        `rk-${row.id}`,
        JSON.stringify(row.body),
        row.dependsOn ?? null,
        row.what,
        row.state ?? 'saved',
        row.recordedAt ?? Date.now(),
        row.recordedTick ?? 0,
        row.formRow === undefined ? null : JSON.stringify(row.formRow),
      ],
    );
  };
  const insertPhoto = async (itemId: string, storedPath: string, clientPhotoId: string, role: string) => {
    await db.runAsync(
      'INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES (?, ?, ?, ?, NULL, 0, 0)',
      [itemId, storedPath, clientPhotoId, role],
    );
  };
  const insertForm = async (row: { id: string; kind: string; grnId?: string; state: unknown; photos?: string[]; rawPhotos?: string }) => {
    await db.runAsync(
      `INSERT INTO forms (id, scope, kind, grn_id, state, photos, customer, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Asha Fictional Traders', ?, ?)`,
      [
        row.id,
        scope,
        row.kind,
        row.grnId ?? '',
        JSON.stringify(row.state),
        row.rawPhotos ?? JSON.stringify(row.photos ?? []),
        Date.now(),
        Date.now(),
      ],
    );
  };
  const setClockLedger = async (t: number, wall: number) => {
    await db.runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('clock', ?)",
      [JSON.stringify({ t, wall, runId: 'previous-run' })],
    );
  };

  await seed({ scope, insertItem, insertPhoto, insertForm, setClockLedger });
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-11-27T12:00:00+05:30'),
    doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
  });
  resetEnv();
  files.reset();
  server.reset();
  env.subject = 'user-1';
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  await eraseEverything();
});

describe('1. unsent-work.db schema upgrade 2 -> 3 in-place (never wipes GRN work)', () => {
  it('UNSENT_SCHEMA_VERSION is 4 (3 removed the dispatch work, 4 added the photo reports)', async () => {
    await bootUnsent();
    const schema = require('@/features/unsent/unsentSchema') as { UNSENT_SCHEMA_VERSION: number };
    expect(schema.UNSENT_SCHEMA_VERSION).toBe(4);
  });

  it('WH-385: the 3 -> 4 step deletes no row and no file: dispatch work a version-3 file still holds stays, and the report column and table appear', async () => {
    const photo = photoUri('v3-grn-photo.jpg');
    await seedSchema2Db(['v3-grn-photo.jpg'], async ({ insertItem, insertPhoto }) => {
      // A row only step 3 would remove: it shows that step 3 is not run again on a version-3 file.
      await insertItem({ id: 'disp-v3', seq: 1, kind: 'newDispatch', body: sampleDispatchBody(), what: 'New dispatch' });
      await insertItem({ id: 'photos-v3', seq: 2, kind: 'photos', body: { doc: 'grn', recordId: 'g-B1' }, what: 'Photos' });
      await insertPhoto('photos-v3', 'unsent-work/photos/v3-grn-photo.jpg', 'cp-v3-1', 'header');
    });
    await rawRun(`UPDATE meta SET value = '3' WHERE key = 'schema_version'`);

    await restart();

    expect((await rawRows<{ value: string; key: string }>('meta')).find(row => row.key === 'schema_version')?.value).toBe('4');
    expect((await rawRows<{ id: string }>('items', 'ORDER BY seq')).map(row => row.id)).toEqual(['disp-v3', 'photos-v3']);
    expect(await rawRows('item_photos')).toEqual([expect.objectContaining({ client_photo_id: 'cp-v3-1', report_queued: 0 })]);
    expect(await rawRows('photo_reports' as never)).toEqual([]);
    expect(files.held.has(photo)).toBe(true);
  });

  it('upgrades schema-2 DB in-place: deletes legacy dispatch forms, items, item_photos and photo files while preserving all GRN work and files', async () => {
    const legacyFormPhoto = photoUri('form-legacy-disp.jpg');
    const legacyDispPhoto = photoUri('legacy-disp-direct.jpg');
    const legacyDispDepPhoto = photoUri('legacy-disp-dep.jpg');
    const legacyDispStandalonePhoto = photoUri('legacy-disp-standalone.jpg');
    const keptFormPhoto = photoUri('form-kept-grn.jpg');
    const keptGrnPhoto = photoUri('kept-grn-photo.jpg');

    await seedSchema2Db(['form-legacy-disp.jpg', 'legacy-disp-direct.jpg', 'legacy-disp-dep.jpg', 'legacy-disp-standalone.jpg', 'form-kept-grn.jpg', 'kept-grn-photo.jpg'], async ({ insertItem, insertPhoto, insertForm }) => {
      // Legacy dispatch rows that MUST be deleted by migration 2 -> 3
      await insertForm({
        id: 'form-disp-1',
        kind: 'dispatch',
        state: { header: { note: 'legacy' }, images: [{ uri: 'app-doc:///unsent-work/photos/form-legacy-disp.jpg' }] },
        photos: ['unsent-work/photos/form-legacy-disp.jpg'],
      });
      await insertItem({
        id: 'item-disp-1',
        seq: 1,
        kind: 'newDispatch',
        body: sampleDispatchBody(),
        what: 'New dispatch',
        recordedTick: 0,
      });
      await insertPhoto('item-disp-1', 'unsent-work/photos/legacy-disp-direct.jpg', 'cp-disp-1', 'dispatch');
      await insertItem({
        id: 'item-disp-photos-dep',
        seq: 2,
        kind: 'photos',
        dependsOn: 'item-disp-1',
        body: { doc: 'dispatch' },
        what: 'Photos',
        recordedTick: 0,
      });
      await insertPhoto('item-disp-photos-dep', 'unsent-work/photos/legacy-disp-dep.jpg', 'cp-disp-2', 'dispatch');
      await insertItem({
        id: 'item-disp-photos-standalone',
        seq: 3,
        kind: 'photos',
        body: { doc: 'dispatch', recordId: 'disp-srv-1' },
        what: 'Photos',
        recordedTick: 0,
      });
      await insertPhoto('item-disp-photos-standalone', 'unsent-work/photos/legacy-disp-standalone.jpg', 'cp-disp-3', 'dispatch');

      // Kept GRN forms, items and photos that MUST survive intact
      await insertForm({
        id: 'form-grn-1',
        kind: 'grn',
        state: { header: { note: 'keep grn', gr_images: [{ uri: 'app-doc:///unsent-work/photos/form-kept-grn.jpg' }] }, items: [] },
        photos: ['unsent-work/photos/form-kept-grn.jpg'],
      });
      await insertForm({
        id: 'form-grn-edit-1',
        kind: 'grnEdit',
        grnId: 'g-B1',
        state: { header: { gr_no: 'B1' }, items: [] },
        photos: [],
      });
      await insertItem({
        id: 'item-new-grn',
        seq: 4,
        kind: 'newGrn',
        body: sampleNewGrnBody('5f381000-0000-4000-8000-0000000000a1'),
        what: 'New GRN',
        recordedTick: 3 * HOUR,
      });
      await insertItem({
        id: 'item-grn-edit',
        seq: 5,
        kind: 'grnEdit',
        body: sampleGrnEditBody('g-B1', 'l06', 100, 110),
        what: 'GRN B1: Qty changed',
        recordedTick: 3 * HOUR,
      });
      await insertItem({
        id: 'item-lot-change',
        seq: 6,
        kind: 'lotChange',
        body: sampleLotChangeBody('l06', 'g-B1'),
        what: 'GRN B1: Rack changed',
        recordedTick: 3 * HOUR,
      });
      await insertItem({
        id: 'item-grn-photos',
        seq: 7,
        kind: 'photos',
        body: { doc: 'grn', recordId: 'g-B1' },
        what: 'Photos',
        recordedTick: 3 * HOUR,
      });
      await insertPhoto('item-grn-photos', 'unsent-work/photos/kept-grn-photo.jpg', 'cp-grn-1', 'header');
    });

    await restart();

    // Upgraded in-place: same single DB file, now at the newest schema version.
    expect(unsentFileNames()).toHaveLength(1);
    const meta = await rawRows<{ key: string; value: string }>('meta');
    expect(meta.find(row => row.key === 'schema_version')?.value).toBe('4');

    // Legacy dispatch forms and items are deleted; every GRN form and item survives.
    const forms = await rawRows<{ id: string; kind: string }>('forms', 'ORDER BY id');
    expect(forms.map(f => [f.id, f.kind])).toEqual([
      ['form-grn-1', 'grn'],
      ['form-grn-edit-1', 'grnEdit'],
    ]);

    const items = await rawRows<{ id: string; kind: string }>('items', 'ORDER BY seq');
    expect(items.map(i => [i.id, i.kind])).toEqual([
      ['item-new-grn', 'newGrn'],
      ['item-grn-edit', 'grnEdit'],
      ['item-lot-change', 'lotChange'],
      ['item-grn-photos', 'photos'],
    ]);

    const photoRows = await rawRows<{ item_id: string; client_photo_id: string }>('item_photos');
    expect(photoRows).toEqual([expect.objectContaining({ item_id: 'item-grn-photos', client_photo_id: 'cp-grn-1' })]);

    // Legacy dispatch photo files (both item photos and orphaned form photo) are deleted; GRN files stay.
    expect(files.held.has(legacyFormPhoto)).toBe(false);
    expect(files.held.has(legacyDispPhoto)).toBe(false);
    expect(files.held.has(legacyDispDepPhoto)).toBe(false);
    expect(files.held.has(legacyDispStandalonePhoto)).toBe(false);
    expect(files.held.has(keptFormPhoto)).toBe(true);
    expect(files.held.has(keptGrnPhoto)).toBe(true);
  });

  it('WH-301 sweep case: a photo file named only in a form text or a kept form row survives for GRN work, goes for dispatch work, and a file both name survives', async () => {
    // Each file is named ONLY by text (a form's state, or an item's kept form_row): neither the photos column nor item_photos lists it.
    const grnFormTextOnly = photoUri('form-grn-text-only.jpg');
    const grnKeptRowOnly = photoUri('form-grn-kept-row-only.jpg');
    const dispatchFormTextOnly = photoUri('form-disp-text-only.jpg');
    const dispatchKeptRowOnly = photoUri('form-disp-kept-row-only.jpg');
    const sharedByBoth = photoUri('form-shared-grn-and-disp.jpg');
    const strayUnnamed = photoUri('form-stray-unnamed.jpg');

    await seedSchema2Db(['form-grn-text-only.jpg', 'form-grn-kept-row-only.jpg', 'form-disp-text-only.jpg', 'form-disp-kept-row-only.jpg', 'form-shared-grn-and-disp.jpg', 'form-stray-unnamed.jpg'], async ({ insertItem, insertForm }) => {
      await insertForm({
        id: 'form-grn-text',
        kind: 'grn',
        state: { header: { gr_images: [{ uri: 'app-doc:///unsent-work/photos/form-grn-text-only.jpg' }, { uri: 'app-doc:///unsent-work/photos/form-shared-grn-and-disp.jpg' }] }, items: [] },
        photos: [],
      });
      await insertForm({
        id: 'form-disp-text',
        kind: 'dispatch',
        state: { header: {}, images: [{ uri: 'app-doc:///unsent-work/photos/form-disp-text-only.jpg' }, { uri: 'app-doc:///unsent-work/photos/form-shared-grn-and-disp.jpg' }] },
        photos: [],
      });
      await insertItem({
        id: 'grn-with-kept-row',
        seq: 1,
        kind: 'newGrn',
        body: sampleNewGrnBody('5f381000-0000-4000-8000-0000000000a4'),
        what: 'New GRN',
        formRow: { photos: '[]', state: { header: { gr_images: [{ uri: 'app-doc:///unsent-work/photos/form-grn-kept-row-only.jpg' }] } } },
      });
      await insertItem({
        id: 'disp-with-kept-row',
        seq: 2,
        kind: 'newDispatch',
        body: sampleDispatchBody(),
        what: 'New dispatch',
        formRow: { photos: '[]', state: { images: [{ uri: 'app-doc:///unsent-work/photos/form-disp-kept-row-only.jpg' }] } },
      });
    });

    await restart();

    expect((await rawRows<{ id: string }>('forms')).map(f => f.id)).toEqual(['form-grn-text']);
    expect((await rawRows<{ id: string }>('items')).map(i => i.id)).toEqual(['grn-with-kept-row']);
    // GRN work keeps every file its text names, including the one a deleted dispatch form also named.
    expect(files.held.has(grnFormTextOnly)).toBe(true);
    expect(files.held.has(grnKeptRowOnly)).toBe(true);
    expect(files.held.has(sharedByBoth)).toBe(true);
    // Dispatch work is gone, and so are the files only it named.
    expect(files.held.has(dispatchFormTextOnly)).toBe(false);
    expect(files.held.has(dispatchKeptRowOnly)).toBe(false);
    // An unnamed leftover form file is swept as before.
    expect(files.held.has(strayUnnamed)).toBe(false);
  });

  it('when any row cannot be read, the 2 -> 3 step removes the dispatch rows but NO photo file at all (a file kept is harmless, a file lost is not)', async () => {
    const dispatchFile = photoUri('legacy-disp-unreadable-case.jpg');
    const dispatchFormFile = photoUri('legacy-disp-form-unreadable-case.jpg');
    const grnFile = photoUri('kept-grn-unreadable-case.jpg');

    await seedSchema2Db(['legacy-disp-unreadable-case.jpg', 'legacy-disp-form-unreadable-case.jpg', 'kept-grn-unreadable-case.jpg'], async ({ insertItem, insertPhoto, insertForm }) => {
      await insertItem({ id: 'disp-u', seq: 1, kind: 'newDispatch', body: sampleDispatchBody(), what: 'New dispatch' });
      await insertPhoto('disp-u', 'unsent-work/photos/legacy-disp-unreadable-case.jpg', 'cp-u-1', 'dispatch');
      await insertForm({
        id: 'form-disp-u',
        kind: 'dispatch',
        state: { images: [{ uri: 'app-doc:///unsent-work/photos/legacy-disp-form-unreadable-case.jpg' }] },
        photos: ['unsent-work/photos/legacy-disp-form-unreadable-case.jpg'],
      });
      await insertItem({ id: 'grn-u', seq: 2, kind: 'newGrn', body: sampleNewGrnBody('5f381000-0000-4000-8000-0000000000a5'), what: 'New GRN' });
      await insertPhoto('grn-u', 'unsent-work/photos/kept-grn-unreadable-case.jpg', 'cp-u-2', 'header');
      // A GRN form whose photo list is not a list: the step cannot tell what it names.
      await insertForm({ id: 'form-grn-unreadable', kind: 'grn', state: { header: {}, items: [] }, rawPhotos: '{"not":"a list"}' });
    });

    await restart();

    expect((await rawRows<{ id: string }>('items')).map(i => i.id)).toEqual(['grn-u']);
    expect((await rawRows<{ id: string }>('forms')).map(f => f.id)).toEqual(['form-grn-unreadable']);
    expect(files.held.has(dispatchFile)).toBe(true);
    expect(files.held.has(dispatchFormFile)).toBe(true);
    expect(files.held.has(grnFile)).toBe(true);
  });

  it('after upgrade, legacy dispatch items > 2 hours old do not count in ownUnsentCount(), do not block sign-out, and do not trip limitReached', async () => {
    const now = Date.now();
    await seedSchema2Db([], async ({ insertItem, setClockLedger }) => {
      await setClockLedger(4 * HOUR, now);
      await insertItem({
        id: 'old-disp-1',
        seq: 1,
        kind: 'newDispatch',
        body: sampleDispatchBody(),
        what: 'New dispatch',
        recordedAt: now - 3 * HOUR,
        recordedTick: HOUR, // 3 hours old on the work clock (> 2-hour gate)
      });
      await insertItem({
        id: 'old-disp-photos',
        seq: 2,
        kind: 'photos',
        body: { doc: 'dispatch', recordId: 'disp-srv-9' },
        what: 'Photos',
        recordedAt: now - 3 * HOUR,
        recordedTick: HOUR,
      });
    });

    const reopened = await restart();
    const store = require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore');

    expect(store.ownUnsentCount()).toBe(0);
    expect(reopened.store.getUnsentSummary()).toMatchObject({ count: 0, limitReached: false, unreadable: false });
    expect(reopened.gate.accountActionAllowed()).toEqual({ ok: true });
    expect(reopened.gate.canStartWork()).toEqual({ ok: true });
  });

  it('a > 2-hour legacy dispatch next to a recent newGrn is removed so sign-out counts only the GRN and the 2-hour gate stays clear', async () => {
    const now = Date.now();
    await seedSchema2Db([], async ({ insertItem, setClockLedger }) => {
      await setClockLedger(4 * HOUR, now);
      await insertItem({
        id: 'old-disp-1',
        seq: 1,
        kind: 'newDispatch',
        body: sampleDispatchBody(),
        what: 'New dispatch',
        recordedAt: now - 3 * HOUR,
        recordedTick: HOUR, // 3 hours old
      });
      await insertItem({
        id: 'fresh-grn-1',
        seq: 2,
        kind: 'newGrn',
        body: sampleNewGrnBody('5f381000-0000-4000-8000-0000000000a2'),
        what: 'New GRN',
        recordedAt: now - 30 * 60_000,
        recordedTick: 3.5 * HOUR, // 30 minutes old (< 2 hours)
      });
    });

    const reopened = await restart();
    const store = require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore');

    expect(store.ownUnsentCount()).toBe(1);
    expect(reopened.gate.accountActionAllowed()).toEqual({ ok: false, count: 1 });
    expect(reopened.store.getUnsentSummary()).toMatchObject({ count: 1, limitReached: false });
    expect(reopened.gate.canStartWork()).toEqual({ ok: true });
  });
});

describe('2. Stock overlays: server stock + newGrn + grnEdit deltas only, zero dispatch deductions', () => {
  it('lessUnsent, lessHeld, lessOthersUnsent, and deductions() are always 0 / empty even if legacy rows or held dispatches exist', async () => {
    const phone = await bootHolding({
      role: 'supervisor',
      withCopy: true,
      heldFeedRows: [heldDispatchFeedRow('held-legacy-disp', [{ lot_id: 'l03', qty: 6 }])],
    });
    // Even if a legacy item exists in the queue whose kind emits `lessUnsent`, the overlay must never deduct bags.
    const legacyDispatchKind = {
      lane: 'record' as const,
      send: async () => ({ kind: 'transient' as const }),
      overlay: () => ({ lessUnsent: { l03: 4 } }),
    };
    phone.kinds.registerSendKind('legacyDispatchTest', legacyDispatchKind as never);
    await phone.offline();
    await phone.queue.enqueue({ kind: 'legacyDispatchTest', body: {}, what: 'Legacy dispatch' });

    const { getUnsentOverlay, netStock } = require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay');
    const overlay = getUnsentOverlay();

    expect(overlay.lessUnsent('l03')).toBe(0);
    expect(overlay.lessHeld('l03')).toBe(0);
    expect((overlay as { lessOthersUnsent?(l: string): number }).lessOthersUnsent?.('l03') ?? 0).toBe(0);
    expect(overlay.deductions().size).toBe(0);
    expect(netStock(overlay, 'l03', 19)).toBe(19);
  });

  it('overlaidLot applies grnEdit quantity deltas (stock + (now - was)) and newGrn adds to newLots() with no dispatch deductions', async () => {
    const phone = await bootHolding({
      role: 'staff',
      withCopy: true,
      heldFeedRows: [heldDispatchFeedRow('held-legacy-disp', [{ lot_id: 'l03', qty: 6 }])],
    });
    require('@/features/unsent/newGrnKind');
    require('@/features/grn/offline-edit/grnEditKind');
    await phone.offline();
    await phone.queue.enqueue({
      kind: 'newGrn',
      body: sampleNewGrnBody('5f381000-0000-4000-8000-0000000000a3', 25),
      what: 'New GRN',
      customer: 'Asha Fictional Traders',
    });
    await phone.queue.enqueue({
      kind: 'grnEdit',
      body: sampleGrnEditBody('g-A2', 'l03', 100, 115),
      what: 'GRN A2: Qty changed',
      customer: 'Asha Fictional Traders',
      targetRef: { grnId: 'g-A2', number: 'A2' },
    });
    await phone.queue.enqueue({
      kind: 'grnEdit',
      body: sampleGrnEditBody('g-A10', 'l04', 100, 92),
      what: 'GRN A10: Qty changed',
      customer: 'Bhavin Foods',
      targetRef: { grnId: 'g-A10', number: 'A10' },
    });

    const { getUnsentOverlay } = require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay');
    const { overlaidLot } = require('@/features/phone-copy/reads/lotOverlay') as typeof import('@/features/phone-copy/reads/lotOverlay');
    const overlay = getUnsentOverlay();

    // Server stock 19 + (115 - 100) = 34 (no -6 held dispatch deduction!)
    expect(overlaidLot({ id: 'l03', qty: 100, stock: 19 }, overlay).stock).toBe(34);
    // Server stock 20 + (92 - 100) = 12
    expect(overlaidLot({ id: 'l04', qty: 100, stock: 20 }, overlay).stock).toBe(12);
    // With real unsent GRN work in the queue (so the overlay is built, not the empty one), nothing is deducted from any lot.
    for (const lotId of ['l03', 'l04']) {
      expect(overlay.lessUnsent(lotId)).toBe(0);
      expect(overlay.lessHeld(lotId)).toBe(0);
    }
    expect(overlay.deductions().size).toBe(0);
    // Unsent new GRN lot is present in newLots()
    expect(overlay.newLots()).toEqual([expect.objectContaining({ grn_id: '5f381000-0000-4000-8000-0000000000a3', qty: 25, stock: 25 })]);
  });

  it('FindGoodsRow and UnsentLotLines render no lessNotSent / lessHeld / lessOtherPerson deduction lines', async () => {
    await bootUnsent();
    jest.doMock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
    jest.doMock('@/store/hooks', () => {
      const theme = jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' });
      return { useAppSelector: (select: (s: unknown) => unknown) => select({ theme }), useAppDispatch: () => () => undefined };
    });
    // Even if an overlay stand-in reports non-zero deductions, UI components must no longer draw deduction lines.
    jest.doMock('@/features/phone-copy/unsentOverlay', () => ({
      ...jest.requireActual('@/features/phone-copy/unsentOverlay'),
      getUnsentOverlay: () => ({
        grn: () => null,
        lot: () => null,
        dispatch: () => null,
        lessUnsent: () => 4,
        lessHeld: () => 2,
        lessOthersUnsent: () => 3,
        deductions: () => new Map([['l06', 9]]),
        lotValues: () => new Map(),
        marker: () => null,
        changedFields: () => [],
        newDocuments: () => [],
        newLots: () => [],
        lotsAdded: () => [],
        lotsRemoved: () => [],
        lotsGone: () => [],
      }),
    }));
    require('@testing-library/react-native/dist/matchers/extend-expect');
    const rtl = require('@testing-library/react-native/pure') as typeof import('@testing-library/react-native/pure');
    const React = require('react') as typeof import('react');
    const { FindGoodsRow } = require('@/features/find-goods/FindGoodsRow') as typeof import('@/features/find-goods/FindGoodsRow');
    const { UnsentLotLines } = require('@/features/unsent/UnsentMarkers') as typeof import('@/features/unsent/UnsentMarkers');

    const rowView = await rtl.render(
      React.createElement(FindGoodsRow, {
        item: {
          id: 'g-B1',
          grn_item_id: 'l06',
          gr_no: 'B1',
          date: '2026-11-20',
          customer_id: 'c1',
          customer_name: 'Asha Fictional Traders',
          item_id: 'i1',
          item_name: 'Fictional Peas',
          packaging: 'Bag',
          qty: 20,
          stock: 9,
          weight: 50,
          rack: 'D-4',
          package_mark: 'PK-99',
        } as never,
        words: ['peas'],
        onPress: jest.fn(),
        divider: false,
      }),
    );
    expect(rtl.screen.queryByTestId('lot-less-unsent-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByTestId('lot-less-held-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByTestId('lot-less-others-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByText(/Less \d+ in/)).not.toBeOnTheScreen();
    await rowView.unmount();

    const lotView = await rtl.render(React.createElement(UnsentLotLines, { lotId: 'l06' }));
    expect(rtl.screen.queryByTestId('lot-less-unsent-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByTestId('lot-less-held-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByTestId('lot-less-others-l06')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByText(/Less \d+ in/)).not.toBeOnTheScreen();
    await lotView.unmount();
  });
});

describe('3. Holding list: GRN-only held rows and HeldStrip on GRN tab only', () => {
  const grnHeldRow = (id: string, kind: 'newGrn' | 'grnEdit' | 'lotChange' | 'photos', overrides: Record<string, unknown> = {}) =>
    recorderHeldFeedRow({
      id,
      kind,
      what: { key: kind === 'newGrn' ? 'offline.unsent.whatNewGrn' : kind === 'photos' ? 'offline.unsent.whatPhotosNewGrn' : 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'], count: 1 } },
      reason: 'noRate',
      reason_data: { lines: [{ item_name: 'Fictional Peas' }] },
      needs_decision: kind !== 'photos',
      lines: null,
      body: { v: 1, localId: id },
      ...overrides,
    });

  it('filters historical kind === newDispatch rows out of ownHeldCopyRows and heldNeedingDecision while keeping newGrn, grnEdit, lotChange and GRN photos', async () => {
    await bootHolding({
      role: 'supervisor',
      withCopy: true,
      heldFeedRows: [
        recorderHeldFeedRow({ id: 'legacy-disp-held', kind: 'newDispatch', state: 'held', needs_decision: true }),
        recorderHeldFeedRow({ id: 'legacy-disp-rejected', kind: 'newDispatch', state: 'rejected', seen_at: null, needs_decision: false }),
        grnHeldRow('grn-1', 'newGrn'),
        grnHeldRow('grn-2', 'grnEdit'),
        grnHeldRow('grn-3', 'lotChange'),
        grnHeldRow('grn-4', 'photos'),
      ],
    });

    const { ownHeldCopyRows, heldNeedingDecision } = require('@/features/holding/heldRows') as typeof import('@/features/holding/heldRows');

    expect(heldNeedingDecision()).toBe(3);
    expect(ownHeldCopyRows().map(row => row.id).sort()).toEqual(['grn-1', 'grn-2', 'grn-3', 'grn-4']);
    expect(ownHeldCopyRows().some(row => row.kind === 'newDispatch')).toBe(false);
  });

  it('when only historical newDispatch rows exist in held_items, heldNeedingDecision() is 0 and ownHeldCopyRows() is empty', async () => {
    await bootHolding({
      role: 'admin',
      withCopy: true,
      heldFeedRows: [
        heldDispatchFeedRow('legacy-disp-1', [{ lot_id: 'l03', qty: 4 }]),
        recorderHeldFeedRow({ id: 'legacy-disp-2', kind: 'newDispatch', state: 'held', needs_decision: true }),
      ],
    });
    const { ownHeldCopyRows, heldNeedingDecision } = require('@/features/holding/heldRows') as typeof import('@/features/holding/heldRows');
    const store = require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore');

    expect(heldNeedingDecision()).toBe(0);
    expect(ownHeldCopyRows()).toEqual([]);
    expect(store.getUnsentSummary().held).toBe(0);
  });

  async function setupTabsWithHeldGrns() {
    await bootHolding({
      role: 'admin',
      withCopy: true,
      heldFeedRows: [grnHeldRow('grn-strip-1', 'newGrn'), grnHeldRow('grn-strip-2', 'grnEdit')],
    });
    jest.doMock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
    jest.doMock('expo-router', () => ({
      router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
      useLocalSearchParams: () => ({}),
    }));
    jest.doMock('@/store/hooks', () => {
      const state = {
        auth: { userProfile: { id: 'profile-admin-1', role: 'admin', name: 'Neha Fictional' } },
        theme: jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' }),
      };
      return { useAppSelector: (select: (s: unknown) => unknown) => select(state), useAppDispatch: () => () => undefined };
    });
    jest.doMock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
    jest.doMock('@/components/lists', () => ({ DispatchFlashList: () => null }));
    jest.doMock('@/components/GRNListFiori', () => ({ __esModule: true, default: () => null }));
    jest.doMock('@/features/find-goods/FindGoodsScreen', () => ({ FindGoodsScreen: () => null }));
    jest.doMock('@/features/find-goods/findGoodsGate', () => ({ useFindGoodsState: () => 'hidden' }));
    jest.doMock('@/features/find-goods/findGoodsSession', () => ({ useFindGoodsSession: () => ({ view: 'grn' }) }));
    jest.doMock('@/features/dispatch/hooks/useOpenNewDispatchForm', () => ({ useOpenNewDispatchForm: () => jest.fn() }));
    jest.doMock('@/features/phone-copy/components/CustomerAgeStrip', () => ({ CustomerAgeStrip: () => null }));
    require('@testing-library/react-native/dist/matchers/extend-expect');
    return {
      rtl: require('@testing-library/react-native/pure') as typeof import('@testing-library/react-native/pure'),
      React: require('react') as typeof import('react'),
    };
  }

  it('Dispatch tab does NOT render HeldStrip even for managers with held GRN items', async () => {
    const { rtl, React } = await setupTabsWithHeldGrns();
    const DispatchTab = (require('../../../../app/(tabs)/dispatch') as { default: React.ComponentType }).default;
    const dispatchView = await rtl.render(React.createElement(DispatchTab));
    expect(rtl.screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
    await dispatchView.unmount();
  });

  it('GRN tab keeps HeldStrip for managers with held GRN items', async () => {
    const { rtl, React } = await setupTabsWithHeldGrns();
    const GRNTab = (require('../../../../app/(tabs)/grn') as { default: React.ComponentType }).default;
    const grnView = await rtl.render(React.createElement(GRNTab));
    expect(rtl.screen.getByTestId('holding-strip')).toHaveTextContent('2 held items need a decision');
    await grnView.unmount();
  });
});

describe('4. A dispatch is made online only: nothing of it is kept or queued on the phone', () => {
  it('a dispatch form is never kept as an unfinished form, while the GRN and Edit GRN forms still are', async () => {
    await bootUnsent();
    // react-redux is not transformed by this repo's Jest config; formOfPath never calls its hooks.
    jest.doMock('react-redux', () => ({ useSelector: () => undefined, useDispatch: () => () => undefined, useStore: () => ({}) }));
    jest.doMock('expo-router', () => ({ usePathname: () => '/', router: {} }));
    const { formOfPath } = require('@/features/unsent/FormDraftHost') as typeof import('@/features/unsent/FormDraftHost');
    expect(formOfPath('/dispatch-form')).toBeNull();
    expect(formOfPath('/dispatch-form/step2')).toBeNull();
    expect(formOfPath('/grn-form/step1')).toEqual({ kind: 'grn', grnId: null });
    expect(formOfPath('/grn-edit/g-B1/step1')).toEqual({ kind: 'grnEdit', grnId: 'g-B1' });
  });

  it('there is no offline save for a dispatch: offlineNew offers only the GRN save', async () => {
    await bootUnsent();
    const offlineNew = require('@/features/unsent/offlineNew') as Record<string, unknown>;
    expect(typeof offlineNew.saveNewGrn).toBe('function');
    expect(offlineNew.saveNewDispatch).toBeUndefined();
  });
});
