/**
 * WH-161 N5 (product/tech/app-offline-new-records.md section 4, Design 10.8): an unfinished GRN or dispatch form keeps the number
 * mode it was opened with. The mode goes into the kept form, and "Continue" after the phone is reachable again keeps "Given when
 * sent" (`pending`) or a typed number (`typed`) rather than switching to a number from the server.
 *
 * Real: useFormDraft, formDrafts, formNumberMode, offlineNew's mode decision, the unsent store, the phone copy, the Redux store.
 * Faked at the edge: the server's answers, expo-sqlite, files, NetInfo, AppState, the signed-in person (newRecordPhone.ts), and the
 * "Continue / Start new" alert (the person's answer).
 */
import { eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords } from '@/tests/unsent/newRecordPhone';

jest.mock('@/store/hooks', () => ({
  useAppStore: () => require('@/store').store,
  useAppDispatch: () => require('@/store').store.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(require('@/store').store.getState()),
}));
jest.mock('@/utils/alert', () => ({
  askAlert: async (_title: string, _message: string, buttons: { value: string }[]) => buttons[0].value, // "Continue"
  showAlert: jest.fn(),
}));

type Rtl = typeof import('@testing-library/react-native/pure');
type Modes = typeof import('@/features/unsent/formNumberMode');

/**
 * The modules the test drives, loaded after the phone boots (bootPhone resets the module registry, so the renderer and the hook
 * must come from the same fresh React). `pure` because a test cannot register hooks; each test unmounts what it rendered.
 */
function load() {
  return {
    rtl: require('@testing-library/react-native/pure') as Rtl,
    modes: require('@/features/unsent/formNumberMode') as Modes,
    drafts: require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts'),
    useFormDraft: (require('@/features/unsent/useFormDraft') as typeof import('@/features/unsent/useFormDraft')).useFormDraft,
    store: (require('@/store') as typeof import('@/store')).store,
    grnSlice: require('@/store/slices/grnFormSlice') as typeof import('@/store/slices/grnFormSlice'),
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('N5: an unfinished form keeps its number mode across a reconnect', () => {
  it('offline, the mode decided at open (pending) is written with the kept form', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    const { rtl, modes, drafts, useFormDraft, store, grnSlice } = load();
    expect(await modes.decideFormNumberMode('grn')).toBe('pending');

    const hook = await rtl.renderHook(() => useFormDraft('grn', null, true, () => true));
    await rtl.act(async () => {
      store.dispatch(grnSlice.updateHeader({ customer_id: 'c1', customer_name: 'asha Traders' }));
      await jest.advanceTimersByTimeAsync(1_500);
    });
    await hook.unmount();

    const kept = await drafts.loadFormDraft('grn', null);
    expect(kept).not.toBeNull();
    expect((kept!.state as { numberMode?: string }).numberMode).toBe('pending');
  });

  it.each(['pending', 'typed'] as const)('Continue when reachable again keeps %s; a fresh open would be online', async saved => {
    const phone = await bootNewRecords();
    const { rtl, modes, drafts, useFormDraft, store, grnSlice } = load();
    // The form was kept offline with its mode; the phone is reachable now with nothing unsent.
    const filled = grnSlice.default(undefined, grnSlice.updateHeader({ customer_id: 'c1', customer_name: 'asha Traders' }));
    expect(await drafts.saveFormDraft({ kind: 'grn', grnId: null, state: { ...filled, numberMode: saved }, customer: 'asha Traders' })).toBe(true);
    await phone.online();

    const hook = await rtl.renderHook(() => useFormDraft('grn', null, true, () => true));
    await rtl.act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(hook.result.current.ready).toBe(true);
    expect(store.getState().grnForm.header.customer_name).toBe('asha Traders');

    // The form's open decision runs now: the restored mode stands, though the phone would issue a number online.
    expect(await modes.decideFormNumberMode('grn')).toBe(saved);
    expect(modes.getFormNumberMode('grn')).toBe(saved);

    // Once the form closes, the next open decides afresh.
    await hook.unmount();
    expect(await modes.decideFormNumberMode('grn')).toBe('online');
  });
});
