/**
 * WH-301 (contract section 8; Design 4.6): an open GRN form is saved to the phone one second after the last change, at once
 * when the app goes to the background or the form closes, offered again ("Continue your unfinished GRN?") when it is opened,
 * and ended only by the person's own Discard or a successful save, never by the reset that a sign-out does.
 *
 * Real: `useFormDraft`, `formDrafts`, the unsent store and its file, the GRN and dispatch form slices in a real redux store,
 * the real session scope. Faked at the edge: expo-sqlite, files, secure-store, NetInfo, the signed-in person, the dialog
 * (`askAlert`, the person's answer), and the store hook (react-redux is not transformed for Jest here, so the store is bound
 * by hand as in useDispatchFormPhotoFiles.test.tsx).
 */
import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { resetForm as resetGrn, updateHeader, hydrateDraft } from '@/store/slices/grnFormSlice';
import dispatchFormReducer from '@/store/slices/dispatchFormSlice';
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { loadFormDraft, saveFormDraft, whileSessionEnds, listOwnForms } from '@/features/unsent/formDrafts';
import { initUnsent } from '@/features/unsent/unsentStore';
import { useFormDraft, flushFormDraft, requestContinue } from '@/features/unsent/useFormDraft';
import { saveOperatorServer } from '@/config/operatorServer';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';
import { askAlert } from '@/utils/alert';
import { t } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer, dispatchForm: dispatchFormReducer }, middleware: gdm => gdm({ serializableCheck: false, immutableCheck: false }) });
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => ({ useAppStore: () => mockStore }));
jest.mock('@/utils/alert', () => ({ askAlert: jest.fn() }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const ask = jest.mocked(askAlert);
const flush = () => act(async () => { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)); });
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };
const forms = async () => listOwnForms();
const type = (note: string) => act(async () => { mockStore.dispatch(updateHeader({ note })); });
const mount = async (stillOpen = () => true, kind: 'grn' | 'grnEdit' = 'grn') => {
  const hook = await renderHook(() => useFormDraft(kind, null, true, stillOpen));
  await flush();
  return hook;
};
const KEPT = { header: { gr_no: 'RV15002', customer_name: 'Asha Fictional Traders', note: 'kept note', gr_images: [] }, items: [] };

beforeAll(async () => {
  await saveOperatorServer(SERVER);
  await initUnsent();
});
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  files.reset();
  env.subject = 'user-1';
  setFacilityCapabilities(SERVER, { sync: true });
  mockStore = makeStore();
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); }
  await initUnsent();
});
afterEach(() => { jest.useRealTimers(); });

describe('saving as the person types', () => {
  it('saves one second after the last change, not before, and a later change moves the time', async () => {
    await mount();
    await type('three bags short');
    await advance(999);
    expect(await forms()).toEqual([]);
    await type('three bags short, one wet');
    await advance(999);
    expect(await forms()).toEqual([]);
    await advance(1);
    expect(await forms()).toHaveLength(1);
    expect(((await loadFormDraft('grn'))?.state as { header: { note: string } }).header.note).toBe('three bags short, one wet');
  });

  it('keeps nothing for a form with nothing entered', async () => {
    await mount();
    await advance(5_000);
    expect(await forms()).toEqual([]);
  });

  it('saves at once when the app goes to the background', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, listener: (state: string) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as never);
    await mount();
    await type('typed just now');
    expect(await forms()).toEqual([]);
    await act(async () => { listeners.forEach(listener => listener('background')); });
    await flush();
    expect(await forms()).toHaveLength(1);
  });

  it('saves at once when the form closes, within the second', async () => {
    const hook = await mount();
    await type('closed quickly');
    await hook.unmount();
    await flush();
    expect(await forms()).toHaveLength(1);
  });

  it('flushFormDraft keeps the form as it stands (the Save that the 2-hour limit refuses)', async () => {
    await mount();
    await type('refused at Save');
    await act(async () => { await flushFormDraft(); });
    expect(await forms()).toHaveLength(1);
  });

  it('does nothing where the facility has no offline feature', async () => {
    setFacilityCapabilities(SERVER, { sync: false });
    await mount();
    await type('x');
    await advance(5_000);
    expect(await forms()).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('offering a kept form again', () => {
  beforeEach(async () => { await saveFormDraft({ kind: 'grn', state: KEPT, customer: 'Asha Fictional Traders', at: Date.now() }); });

  it('asks "Continue your unfinished GRN?" with the customer, and Continue puts the form back as it was', async () => {
    ask.mockResolvedValueOnce('continue');
    const hook = await mount();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe(t('offline.resume.grnTitle'));
    expect(ask.mock.calls[0][1]).toContain('Asha Fictional Traders');
    expect(ask.mock.calls[0][2].map(button => button.text)).toEqual([t('offline.resume.continue'), t('offline.resume.startNew')]);
    expect(hook.result.current.ready).toBe(true);
    expect(mockStore.getState().grnForm.header).toMatchObject({ note: 'kept note', gr_no: 'RV15002' });
  });

  it('is not asked a second time while the same form stays open', async () => {
    ask.mockResolvedValueOnce('continue');
    await mount();
    await type('more');
    await advance(1_000);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('Start new asks the discard question first; Discard then ends the kept form and the form starts empty', async () => {
    ask.mockResolvedValueOnce('new').mockResolvedValueOnce('discard');
    const hook = await mount();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toBe(t('components.steps.discardFor.grn'));
    expect(await loadFormDraft('grn')).toBeNull();
    expect(mockStore.getState().grnForm.header.note).toBe('');
    expect(hook.result.current.ready).toBe(true);
  });

  it('Start new and then Cancel on the discard question keeps the form and asks again', async () => {
    ask.mockResolvedValueOnce('new').mockResolvedValueOnce('keep').mockResolvedValueOnce('continue');
    await mount();
    expect(ask).toHaveBeenCalledTimes(3);
    expect(await loadFormDraft('grn')).not.toBeNull();
    expect(mockStore.getState().grnForm.header.note).toBe('kept note');
  });

  it('"Not finished" opens it without the question', async () => {
    requestContinue('grn', null);
    await mount();
    expect(ask).not.toHaveBeenCalled();
    expect(mockStore.getState().grnForm.header.note).toBe('kept note');
  });

  it('a kept form of another person is not offered', async () => {
    env.subject = 'user-2';
    await initUnsent();
    const hook = await mount();
    expect(ask).not.toHaveBeenCalled();
    expect(hook.result.current.ready).toBe(true);
    expect(mockStore.getState().grnForm.header.note).toBe('');
  });
});

describe('ending a form', () => {
  it('the person emptying the form (Discard) ends the kept form', async () => {
    await mount();
    await type('to be discarded');
    await advance(1_000);
    expect(await forms()).toHaveLength(1);
    await act(async () => { mockStore.dispatch(resetGrn()); });
    await flush();
    expect(await forms()).toEqual([]);
  });

  it('the reset that a sign-out does is not a Discard: the form is kept', async () => {
    await mount();
    await type('unfinished at sign-out');
    await advance(1_000);
    await act(async () => { whileSessionEnds(() => { mockStore.dispatch(resetGrn()); }); });
    await flush();
    expect(await forms()).toHaveLength(1);
  });

  it('the reset of a screen that is already left is not a Discard: the form is kept', async () => {
    await mount(() => false);
    await type('screen left');
    await advance(1_000);
    await act(async () => { mockStore.dispatch(resetGrn()); });
    await flush();
    expect(await forms()).toHaveLength(1);
  });

  it('a form put back from the kept copy is saved again as the person goes on', async () => {
    await saveFormDraft({ kind: 'grn', state: KEPT });
    ask.mockResolvedValueOnce('continue');
    await mount();
    await act(async () => { mockStore.dispatch(hydrateDraft(KEPT as never)); mockStore.dispatch(updateHeader({ note: 'went on' })); });
    await advance(1_000);
    expect(((await loadFormDraft('grn'))?.state as { header: { note: string } }).header.note).toBe('went on');
  });
});
