/**
 * WH-301 (contract sections 1 and 8; Design 4.6): the person's unfinished forms on the phone. One form per kind (and per GRN
 * for an edit), kept until the person's own Discard or a successful save, offered again when the form is opened, a picked
 * photo copied into the unsent folder, and one person never sees or removes another's.
 *
 * Real: `formDrafts`, the unsent store and its file, the session scope. Faked at the edge: expo-sqlite, files,
 * secure-store, NetInfo, the signed-in person. The hook that calls these (save after one second, the question) is in
 * useFormDraft.test.tsx.
 */
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, keptPhotoFiles, rawRows, rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { countOwnForms, deleteOwnForms, endFormDraft, listOwnForms, loadFormDraft, saveFormDraft } from '@/features/unsent/formDrafts';
import { initUnsent } from '@/features/unsent/unsentStore';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));

const state = (note: string, photos: string[] = []) => ({
  header: { gr_no: 'RV15001', customer_name: 'Asha Fictional Traders', note, gr_images: photos.map(uri => ({ uri })) },
  items: [],
});

beforeAll(async () => { await initUnsent(); });
beforeEach(async () => {
  files.reset();
  env.subject = 'user-1';
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); }
  await initUnsent();
});

describe('save and resume', () => {
  it('saves the form and gives it back as it was, with the customer and when it was started', async () => {
    expect(await saveFormDraft({ kind: 'grn', state: state('three bags short'), customer: 'Asha Fictional Traders', at: 1_000 })).toBe(true);
    const draft = await loadFormDraft('grn');
    expect(draft).toMatchObject({ kind: 'grn', grnId: null, customer: 'Asha Fictional Traders', startedAt: 1_000 });
    expect(draft?.state).toEqual(state('three bags short'));
  });

  it('a second save of the same form replaces the first and keeps when it was started: one form, not two', async () => {
    await saveFormDraft({ kind: 'grn', state: state('first'), at: 1_000 });
    await saveFormDraft({ kind: 'grn', state: state('second'), at: 5_000 });
    expect(await rawRows('forms')).toHaveLength(1);
    expect(await loadFormDraft('grn')).toMatchObject({ startedAt: 1_000, state: state('second') });
  });

  it('a GRN, a dispatch and the edit of two GRNs are separate forms', async () => {
    await saveFormDraft({ kind: 'grn', state: state('new grn') });
    await saveFormDraft({ kind: 'dispatch', state: state('dispatch') });
    await saveFormDraft({ kind: 'grnEdit', grnId: 'grn-1', state: state('edit 1') });
    await saveFormDraft({ kind: 'grnEdit', grnId: 'grn-2', state: state('edit 2') });
    expect(await countOwnForms()).toBe(4);
    expect((await loadFormDraft('grnEdit', 'grn-2'))?.state).toEqual(state('edit 2'));
    expect(await loadFormDraft('grnEdit', 'grn-3')).toBeNull();
  });

  it('lists them oldest first, an edit with its GRN number', async () => {
    await saveFormDraft({ kind: 'grnEdit', grnId: 'grn-1', state: state('edit'), at: 9_000 });
    await saveFormDraft({ kind: 'dispatch', state: state('d'), at: 2_000 });
    const list = await listOwnForms();
    expect(list.map(form => form.kind)).toEqual(['dispatch', 'grnEdit']);
    expect(list[1]).toMatchObject({ grnId: 'grn-1', number: 'RV15001' });
  });

  it('a form kept through a restart is still there (the file, not memory)', async () => {
    await saveFormDraft({ kind: 'grn', state: state('kept') });
    await initUnsent();
    expect((await loadFormDraft('grn'))?.state).toEqual(state('kept'));
  });
});

describe('photos of a form', () => {
  it('a picked photo is copied into the unsent folder and the saved state names the copy', async () => {
    const picked = addPhoto('pick.jpg');
    await saveFormDraft({ kind: 'grn', state: state('x', [picked]) });
    expect(keptPhotoFiles()).toHaveLength(1);
    const draft = await loadFormDraft('grn');
    const uri = (draft?.state as { header: { gr_images: { uri: string }[] } }).header.gr_images[0].uri;
    expect(uri).toContain('unsent-work/');
    expect(files.held.has(uri)).toBe(true);
  });

  it('saving again does not copy the same photo twice', async () => {
    const picked = addPhoto('pick.jpg');
    await saveFormDraft({ kind: 'grn', state: state('x', [picked]) });
    const [kept] = keptPhotoFiles();
    await saveFormDraft({ kind: 'grn', state: state('y', [kept]) });
    expect(keptPhotoFiles()).toHaveLength(1);
  });

  it('a photo the form no longer names is removed from the phone', async () => {
    const picked = addPhoto('pick.jpg');
    await saveFormDraft({ kind: 'grn', state: state('x', [picked]) });
    await saveFormDraft({ kind: 'grn', state: state('x', []) });
    expect(keptPhotoFiles()).toEqual([]);
  });

  it('Discard (endFormDraft) removes the form and its photo files', async () => {
    await saveFormDraft({ kind: 'grn', state: state('x', [addPhoto('pick.jpg')]) });
    await endFormDraft('grn');
    expect(await loadFormDraft('grn')).toBeNull();
    expect(await rawRows('forms')).toEqual([]);
    expect(keptPhotoFiles()).toEqual([]);
  });
});

describe('discard and the other person', () => {
  it('Discard ends only that form', async () => {
    await saveFormDraft({ kind: 'grn', state: state('a') });
    await saveFormDraft({ kind: 'dispatch', state: state('b') });
    await endFormDraft('grn');
    expect(await loadFormDraft('grn')).toBeNull();
    expect(await loadFormDraft('dispatch')).not.toBeNull();
  });

  it("another person's form is neither offered, listed, counted nor ended by this person's Discard", async () => {
    await saveFormDraft({ kind: 'grn', state: state('user one') });
    env.subject = 'user-2';
    expect(await loadFormDraft('grn')).toBeNull();
    expect(await listOwnForms()).toEqual([]);
    expect(await countOwnForms()).toBe(0);
    await endFormDraft('grn');
    await deleteOwnForms();
    env.subject = 'user-1';
    expect((await loadFormDraft('grn'))?.state).toEqual(state('user one'));
  });

  it("deleteOwnForms removes all of this person's forms and their photos, and leaves the other person's", async () => {
    await saveFormDraft({ kind: 'grn', state: state('mine', [addPhoto('a.jpg')]) });
    await saveFormDraft({ kind: 'dispatch', state: state('mine too') });
    env.subject = 'user-2';
    await saveFormDraft({ kind: 'grn', state: state('theirs') });
    env.subject = 'user-1';
    await deleteOwnForms();
    expect(await countOwnForms()).toBe(0);
    expect(keptPhotoFiles()).toEqual([]);
    env.subject = 'user-2';
    expect(await countOwnForms()).toBe(1);
  });
});

describe('failures', () => {
  it('a save that cannot be written says false and never throws', async () => {
    const { failStatement } = require('@/tests/phoneCopy/fakeExpoSqlite') as typeof import('@/tests/phoneCopy/fakeExpoSqlite');
    failStatement(/INSERT INTO forms/i, new Error('SQLITE_FULL'));
    expect(await saveFormDraft({ kind: 'grn', state: state('x') })).toBe(false);
    expect(await rawRows('forms')).toEqual([]);
  });
});
