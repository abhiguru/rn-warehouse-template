/**
 * Session end for the offline modules registered with `registerSessionScoped` (commit 102ee28f): each one is given state the
 * way the product gives it, the registry's teardown (`runSessionScopedClears`, as sign-out and a server switch run it) is run,
 * and the state must be gone, so the next person on the phone starts clean. The hand-over and heldPhotos cases are beside
 * their modules (handOver.test.ts, heldPhotos.test.ts), where the phone harness they need already is.
 *
 * Real: the nine modules and the registry. Faked at the edge: the connection-bound calls that would make a save or a
 * download finish (they are held for ever so the in-flight state stays), the unsent-work store's rows (a plain array the
 * overlay reads), the facility capability and the alert answer of the draft question.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { runSessionScopedClears } from '@/config/sessionScopedRegistry';
import { openSaveWait, saveWaitLeft } from '@/features/unsent/saveWait';
import { getFormNumberMode, restoreFormNumberMode, setFormNumberMode, useFormNumberMode } from '@/features/unsent/formNumberMode';
import { saveNewGrn, type NewRecordForm } from '@/features/unsent/offlineNew';
import { keepPhoto } from '@/features/phone-copy/photoStore';
import { getUnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { registerSendKind } from '@/features/unsent/sendKinds';
import { useUnsentOverlay } from '@/features/unsent/UnsentMarkers';
import { requestContinue, useFormDraft } from '@/features/unsent/useFormDraft';
import grnFormReducer from '@/store/slices/grnFormSlice';
import dispatchFormReducer from '@/store/slices/dispatchFormSlice';
import { askAlert } from '@/utils/alert';

const NEVER = new Promise<never>(() => undefined);

let mockRows: unknown[] = [];
const mockScope = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'profile-a']);
jest.mock('@/features/unsent/unsentStore', () => ({
  loadedUnsentRows: () => mockRows,
  currentUnsentScope: () => mockScope,
  subscribeUnsent: () => () => undefined,
  ownUnsentRows: () => [],
}));
jest.mock('@/features/holding/heldRows', () => {
  const none: unknown[] = [];
  return { heldBagsByLot: () => new Map(), heldCopyRows: () => none, subscribeHeldRows: () => () => undefined };
});
jest.mock('@/features/phone-copy/syncEngine', () => ({ subscribeSyncRunEnd: () => () => undefined, isCopyOffline: () => false, isCopyReadable: () => false }));
// A save or a download that never answers: the work in flight stays in flight.
jest.mock('@/features/unsent/numberingCache', () => ({ refreshNumbering: () => Promise.resolve(), serverIssues: () => false }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: () => new Promise(() => undefined) }));
let mockNumbering: unknown = null;
jest.mock('@/features/phone-copy/copyQueries', () => ({ readSetting: async () => mockNumbering }));
jest.mock('@/config/lanSigner', () => ({ sha256Hex: () => new Promise(() => undefined) }));
jest.mock('@/features/phone-copy/copyDb', () => ({ currentCopy: () => ({}) }));
jest.mock('@/features/phone-copy/photoFolder', () => ({ photoDirectory: () => ({ exists: true }), erasePhotoFolder: async () => undefined }));
jest.mock('@/config/facilityCapabilities', () => ({ hasCapability: () => true }));
jest.mock('@/utils/alert', () => ({ askAlert: jest.fn(async () => 'continue'), showAlert: jest.fn() }));
let mockDraft: { state: unknown; startedAt: number; customer: string | null } | null = null;
jest.mock('@/features/unsent/formDrafts', () => ({
  loadFormDraft: async () => mockDraft,
  endFormDraft: async () => undefined,
  saveFormDraft: async () => true,
  formDraftEpoch: () => 0,
  isSessionEnding: () => false,
}));
let mockStore: ReturnType<typeof makeStore>;
function makeStore() {
  return configureStore({ reducer: { grnForm: grnFormReducer, dispatchForm: dispatchFormReducer } });
}
jest.mock('@/store/hooks', () => ({ useAppStore: () => mockStore }));

const endSession = () => runSessionScopedClears({ dispatch: () => undefined });

describe('save waits (saveWait)', () => {
  it('an open wait of the first person is gone after the session ends', async () => {
    openSaveWait('item-of-person-a', 60_000);
    expect(saveWaitLeft('item-of-person-a')).toBeGreaterThan(0);
    await endSession();
    expect(saveWaitLeft('item-of-person-a')).toBe(0);
  });
});

describe('the number box mode (formNumberMode)', () => {
  it('a kept or restored mode goes back to online, and a form that shows it is told', async () => {
    setFormNumberMode('grn', 'typed');
    restoreFormNumberMode('grn', 'pending');
    const shown = await renderHook(() => useFormNumberMode('grn'));
    expect(shown.result.current).toBe('pending');

    await act(async () => { await endSession(); });

    expect(getFormNumberMode('grn')).toBe('online');
    expect(shown.result.current).toBe('online');
  });
});

describe('one Save at a time (offlineNew)', () => {
  const form = { numberMode: 'online', ratesNotOnPhone: false } as unknown as NewRecordForm;
  const payload = { header: { gr_no: '', customer_name: 'asha Traders' }, items: [] } as never;

  it('a Save of the first person still running is not handed to the next person\'s Save', async () => {
    const first = saveNewGrn(payload, form);
    // Control: a second tap joins the Save that is running.
    expect(saveNewGrn(payload, form)).toBe(first);

    await endSession();

    expect(saveNewGrn(payload, form)).not.toBe(first);
  });
});

describe('photo downloads (photoStore)', () => {
  it('a download of the first person still running is not joined by the next person\'s ask for the same photo', async () => {
    const first = keepPhoto('held/h/p1.jpg', 'https://files.example.test/held/h/p1.jpg');
    expect(keepPhoto('held/h/p1.jpg', 'https://files.example.test/held/h/p1.jpg')).toBe(first);

    await endSession();

    expect(keepPhoto('held/h/p1.jpg', 'https://files.example.test/held/h/p1.jpg')).not.toBe(first);
  });
});

describe('the overlay of unsent work (unsentOverlay, UnsentMarkers)', () => {
  const row = {
    id: 'item-a', seq: 1, scope: mockScope, recorder_name: 'Ravi Fictional', kind: 'sessionProbe', request_key: 'k-a', body: '{}', depends_on: null,
    target_ref: null, what: 'GRN B1: Rack changed', customer: 'asha Traders', state: 'saved', attempts: 0, first_sent_at: null, last_sent_at: null,
    last_error: null, recorded_at: 1, recorded_tick: 1, result: null, sent_day: null,
  };
  beforeAll(() => {
    registerSendKind('sessionProbe', { lane: 'record', send: async () => ({ kind: 'sent' }) as never, overlay: () => ({ lot: { l03: { rack: 'Z-9' } } }) });
  });
  beforeEach(() => { mockRows = [row]; });

  it('the cached overlay of the first person is dropped: the next read is built again from the rows it is given', async () => {
    expect(getUnsentOverlay().lot('l03')).toEqual({ rack: 'Z-9' });
    // The rows are emptied in place: the same array, so only a dropped cache can show it (control below).
    mockRows.splice(0);
    expect(getUnsentOverlay().lot('l03')).toEqual({ rack: 'Z-9' });

    await endSession();

    expect(getUnsentOverlay().lot('l03')).toBeNull();
  });

  it('a screen showing the markers is drawn again with the next person\'s overlay', async () => {
    const shown = await renderHook(() => useUnsentOverlay());
    const before = shown.result.current;
    expect(before.lot('l03')).toEqual({ rack: 'Z-9' });
    mockRows.splice(0);

    await act(async () => { await endSession(); });

    expect(shown.result.current).not.toBe(before);
    expect(shown.result.current.lot('l03')).toBeNull();
  });
});

describe('"Not finished" opens the form to be continued (useFormDraft)', () => {
  const draftOf = () => ({ state: makeStore().getState().grnForm, startedAt: Date.parse('2026-11-27T09:00:00+05:30'), customer: 'asha Traders' });
  beforeEach(() => {
    mockStore = makeStore();
    mockDraft = draftOf();
    (askAlert as jest.Mock).mockClear();
  });

  it('control: a continue request of the person is honoured once, with no question', async () => {
    requestContinue('grn', null);
    const form = await renderHook(() => useFormDraft('grn', null, true, () => true));
    await waitFor(() => expect(form.result.current.ready).toBe(true));
    expect(askAlert).not.toHaveBeenCalled();
  });

  it('a continue request of the first person is forgotten: the next person is asked about the kept form', async () => {
    requestContinue('grn', null);
    await endSession();
    const form = await renderHook(() => useFormDraft('grn', null, true, () => true));
    await waitFor(() => expect(form.result.current.ready).toBe(true));
    expect(askAlert).toHaveBeenCalledTimes(1);
  });
});

describe('the facility\'s numbering rule (numberingCache, WH-391)', () => {
  it('one facility\'s rule is gone after the session ends: the next person starts at "not known yet"', async () => {
    // The offlineNew case above holds this module's fake; the real one is read here.
    const real = jest.requireActual('@/features/unsent/numberingCache') as typeof import('@/features/unsent/numberingCache');
    mockNumbering = { grn: { scheme: 'server', server_issues: true }, dispatch: { scheme: 'server', server_issues: true } };
    await real.refreshNumbering();
    expect(real.serverIssues('grn')).toBe(true);

    await endSession();

    expect([real.serverIssues('grn'), real.serverIssues('dispatch')]).toEqual([null, null]);
  });
});
