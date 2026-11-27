/**
 * WH-302 (quick-change contract section 5 and Design Part 5; cases S1 to S8, S11): the quick change of a lot's rack and mark.
 * Who gets the button, the sheet (opens filled, Save only for a changed value, a chamber chip alone), Save offline and
 * online, a refusal while the sheet is open (told at once, nothing kept) and after it closed (the item stays refused), the
 * 31-character rack, closing with changes, a double tap, and the 2-hour limit.
 *
 * Real: `useQuickChange`, `QuickChangeSheet`, `QuickChangeButton`, `saveLotChange`, the queue, the send engine and the unsent
 * file, i18n. Faked at the edge: expo-sqlite, files, NetInfo, the signed-in person, the facility's server (its answers to
 * `set_lot_rack_and_mark`), the toast and the dialog (what they were asked to show), and the backend version's feature switch.
 * Not here: where the button sits on GRN details and Find goods rows (S1 placement, S9, S10, S12).
 */
import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRows, rawRun, server, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { initUnsent, getUnsentSummary } from '@/features/unsent/unsentStore';
import { useQuickChange, type QuickChangeTarget } from '@/features/quick-change/useQuickChange';
import { QuickChangeButton } from '@/features/quick-change/QuickChangeButton';
import '@/features/unsent/lotChangeKind';
import { saveOperatorServer } from '@/config/operatorServer';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { setLanguage, t } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));
jest.mock('@/config/supabaseConfig', () => {
  const base = require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase();
  const client = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const unsent = require('@/tests/unsent/unsentPhone') as typeof import('@/tests/unsent/unsentPhone');
      unsent.server.calls.push({ name, args });
      return unsent.server.answers[name]?.(args) ?? unsent.NO_NETWORK;
    },
  });
  return { ...base, getAuthenticatedClient: client, getSupabaseClient: client };
});
let mockOfflineCopy = false;
jest.mock('@/features/phone-copy/syncEngine', () => ({ ...jest.requireActual('@/features/phone-copy/syncEngine'), isCopyOffline: () => mockOfflineCopy }));
let mockRole: string | undefined = 'staff';
jest.mock('@/store/hooks', () => {
  const theme = jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' });
  return {
    useAppSelector: (select: (s: unknown) => unknown) => select({ theme, auth: { userProfile: mockRole ? { role: mockRole } : null } }),
    useAppDispatch: () => () => undefined,
  };
});
let mockFeature = true;
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => mockFeature }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const RPC = 'set_lot_rack_and_mark';
const TARGET: QuickChangeTarget = { lotId: 'lot-0001', grnId: 'grn-0001', grnNumber: '12', customer: 'Asha Fictional Traders', itemName: 'Fictional Peas', shown: { rack: 'A-1', package_mark: 'M1' } };
const okAnswer = (rack: string) => ({
  data: { success: true, lot: { id: TARGET.lotId, gr_id: TARGET.grnId, rack, package_mark: 'M1' }, grn: { id: TARGET.grnId, gr_no: 12, updated_at: 'x' }, changed: ['rack'], replaced: [] },
  error: null,
});
const refusedAnswer = (code: string) => ({ data: { success: false, error: 'refused', code }, error: null });

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const Safe = ({ children }: { children: React.ReactNode }) => <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
let available = false;
function Probe({ target = TARGET }: { target?: QuickChangeTarget }) {
  const quick = useQuickChange();
  available = quick.available;
  return (
    <>
      <Text testID="available">{String(quick.available)}</Text>
      <Text testID="open" onPress={() => quick.open(target)}>open</Text>
      {quick.sheet}
    </>
  );
}
const items = () => rawRows<{ state: string; kind: string; body: string; what: string }>('items', 'ORDER BY seq');
const settle = () => act(async () => { for (let i = 0; i < 150; i += 1) await new Promise(resolve => setImmediate(resolve)); });
async function openSheet(target?: QuickChangeTarget) {
  await render(<Probe {...(target ? { target } : {})} />, { wrapper: Safe });
  await userEvent.press(screen.getByTestId('open'));
}
const typeRack = async (text: string) => { await userEvent.clear(screen.getByLabelText('Rack')); await userEvent.type(screen.getByLabelText('Rack'), text); };

beforeAll(async () => { await saveOperatorServer(SERVER); await initUnsent(); });
beforeEach(async () => {
  jest.clearAllMocks();
  files.reset();
  server.reset();
  env.subject = 'user-1';
  mockOfflineCopy = false;
  mockRole = 'staff';
  mockFeature = true;
  env.reachable = true;
  setFacilityCapabilities(SERVER, { sync: true });
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); }
  await initUnsent();
});
afterEach(() => { setLanguage('en'); });

describe('S1: who gets the button', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s', async role => {
    mockRole = role;
    await render(<Probe />);
    expect(screen.getByTestId('available')).toHaveTextContent('true');
  });

  it.each([
    ['a customer account', () => { mockRole = 'customer'; }],
    ['nobody signed in', () => { mockRole = undefined; }],
    ['a facility without the offline feature', () => setFacilityCapabilities(SERVER, { sync: false })],
    ['an older server that lacks the function', () => { mockFeature = false; }],
  ])('not for %s', async (_name, arrange) => {
    arrange();
    await render(<Probe />);
    expect(screen.getByTestId('available')).toHaveTextContent('false');
    expect(available).toBe(false);
  });
});

describe('S2: the sheet', () => {
  it('opens filled with the lot\'s values, titled with the item and GRN, Save disabled until a value differs', async () => {
    await openSheet();
    expect(screen.getByText('Fictional Peas · GRN 12')).toBeOnTheScreen();
    expect(screen.getByText('Asha Fictional Traders')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-change-mark')).toHaveDisplayValue('M1');
    expect(screen.getByTestId('quick-change-save')).toBeDisabled();
  });

  it('a changed mark enables Save, and putting it back disables it again', async () => {
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    expect(screen.getByTestId('quick-change-save')).toBeEnabled();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M1');
    expect(screen.getByTestId('quick-change-save')).toBeDisabled();
  });

  it('a chamber chip alone enables Save and is what is saved', async () => {
    mockOfflineCopy = true;
    await openSheet({ ...TARGET, shown: { rack: 'F1/C4', package_mark: 'M1' } });
    expect(screen.getByTestId('quick-change-save')).toBeDisabled();
    await userEvent.press(screen.getByRole('radio', { name: /C2/ }));
    expect(screen.getByTestId('quick-change-save')).toBeEnabled();
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(JSON.parse((await items())[0].body).changes).toEqual({ rack: { to: 'F1/C2', from: 'F1/C4' } });
  });
});

describe('S3: Save offline', () => {
  it('queues the change, tells "Saved on this phone", closes the sheet and calls no server', async () => {
    mockOfflineCopy = true;
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(showToast).toHaveBeenCalledWith(t('offline.quickChange.savedOnPhone'));
    expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
    const [row] = await items();
    expect(row).toMatchObject({ kind: 'lotChange', state: 'saved', what: 'GRN 12: Mark changed' });
    expect(server.calls).toEqual([]);
    expect(getUnsentSummary().count).toBe(1);
  });
});

describe('S4: Save with the server reachable', () => {
  it('waits for the answer and tells "Saved" once the item is sent', async () => {
    server.answers[RPC] = () => okAnswer('B-2');
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(showToast).toHaveBeenCalledWith(t('offline.quickChange.saved'));
    expect((await items())[0].state).toBe('sent');
    expect(server.calls.filter(c => c.name === RPC)).toHaveLength(1);
    expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
  });

  it('with no answer in 8 seconds it closes on "Saved on this phone" and the item stays queued', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      let answerWith: (value: { data: unknown; error: unknown }) => void = () => undefined;
      server.answers[RPC] = () => new Promise(resolve => { answerWith = resolve; });
      await openSheet();
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).clear(screen.getByTestId('quick-change-mark'));
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).type(screen.getByTestId('quick-change-mark'), 'M9');
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByTestId('quick-change-save'));
      expect(showToast).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(8_000); });
      await settle();
      expect(showToast).toHaveBeenCalledWith(t('offline.quickChange.savedOnPhone'));
      expect((await items())[0].state).not.toBe('sent');
      await act(async () => { answerWith(okAnswer('B-2')); }); // let the pass end, so it does not hold the next test
      await settle();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('S4b: a refusal', () => {
  it('while the sheet is open: the reason in the strip, the sheet keeps what was typed, and nothing is kept or counted', async () => {
    server.answers[RPC] = () => refusedAnswer('RACK_TOO_LONG');
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(screen.getByTestId('quick-change-refused')).toHaveTextContent(t('offline.quickChange.refused', { reason: t('grn.validation.rackMax') }));
    expect(screen.getByTestId('quick-change-mark')).toHaveDisplayValue('M9');
    expect(await items()).toEqual([]);
    expect(getUnsentSummary().count).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('with no reason of its own it says "Couldn\'t save. The server refused this change."', async () => {
    server.answers[RPC] = () => refusedAnswer('LOT_NOT_FOUND');
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(screen.getByTestId('quick-change-refused')).toHaveTextContent("Couldn't save. The server refused this change.");
  });

  it('typing again clears the strip', async () => {
    server.answers[RPC] = () => refusedAnswer('LOT_NOT_FOUND');
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    await userEvent.type(screen.getByTestId('quick-change-mark'), '0');
    expect(screen.queryByText(/Couldn't save/)).not.toBeOnTheScreen();
  });

  it('refused after the sheet closed: the item stays, refused, and still counts', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      let answerWith: (value: { data: unknown; error: unknown }) => void = () => undefined;
      server.answers[RPC] = () => new Promise(resolve => { answerWith = resolve; });
      await openSheet();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.clear(screen.getByTestId('quick-change-mark'));
      await user.type(screen.getByTestId('quick-change-mark'), 'M9');
      await user.press(screen.getByTestId('quick-change-save'));
      await act(async () => { jest.advanceTimersByTime(8_000); });
      await settle();
      expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
      await act(async () => { answerWith(refusedAnswer('LOT_NOT_FOUND')); });
      await settle();
      expect((await items())[0].state).toBe('refused');
      expect(getUnsentSummary().count).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('S5 to S7', () => {
  it('S5: a 31-character rack is told at Save, the sheet stays, nothing is queued', async () => {
    await openSheet();
    await userEvent.clear(screen.getByLabelText('Rack'));
    await userEvent.type(screen.getByLabelText('Rack'), 'R'.repeat(31));
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(screen.getByTestId('quick-change-rack-error')).toHaveTextContent(t('grn.validation.rackMax'));
    expect(screen.getByTestId('quick-change-sheet')).toBeOnTheScreen();
    expect(await items()).toEqual([]);
  });

  it('S5: a 30-character rack is accepted', async () => {
    mockOfflineCopy = true;
    await openSheet();
    await userEvent.clear(screen.getByLabelText('Rack'));
    await userEvent.type(screen.getByLabelText('Rack'), 'R'.repeat(30));
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(await items()).toHaveLength(1);
  });

  it('S6: closing with changes asks "discard?"; Keep editing leaves the sheet, Discard closes it', async () => {
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await userEvent.press(screen.getByTestId('quick-change-cancel'));
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = jest.mocked(showAlert).mock.calls[0] as unknown as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe(t('common.discardChangesTitle'));
    expect(screen.getByTestId('quick-change-sheet')).toBeOnTheScreen();
    await act(async () => { buttons.find(button => button.text === t('common.discard'))?.onPress?.(); });
    expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
    expect(await items()).toEqual([]);
  });

  it('S6: closing without changes just closes', async () => {
    await openSheet();
    await userEvent.press(screen.getByTestId('quick-change-cancel'));
    expect(showAlert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
  });

  it('S7: a double tap on Save while it is being saved makes one item and one call', async () => {
    let answerWith: (value: { data: unknown; error: unknown }) => void = () => undefined;
    server.answers[RPC] = () => new Promise(resolve => { answerWith = resolve; });
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    const save = screen.getByTestId('quick-change-save');
    await userEvent.press(save);
    await userEvent.press(save);
    await settle();
    expect(await items()).toHaveLength(1);
    expect(server.calls.filter(call => call.name === RPC)).toHaveLength(1);
    await act(async () => { answerWith(okAnswer('B-2')); });
    await settle();
    expect(await items()).toHaveLength(1);
  });
});

describe('S8: the 2-hour limit', () => {
  const overdue = () =>
    rawRun(
      `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, state, attempts, what, recorded_at, recorded_tick) VALUES ('old', 1, '${JSON.stringify([SERVER.origin, SERVER.instanceId, 'user-1'])}', '', 'seeded', 'k-old', '{}', 'saved', 0, 'GRN 5: Rack changed', ${Date.now() - 3 * 3_600_000}, 0)`
    );

  it('reached before opening: the limit dialog instead of the sheet', async () => {
    await overdue();
    await initUnsent();
    await openSheet();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe(t('offline.limit.title'));
    expect(screen.queryByTestId('quick-change-sheet')).not.toBeOnTheScreen();
  });

  it('reached while the sheet is open: the dialog at Save and nothing is queued', async () => {
    mockOfflineCopy = true;
    await openSheet();
    await userEvent.clear(screen.getByTestId('quick-change-mark'));
    await userEvent.type(screen.getByTestId('quick-change-mark'), 'M9');
    await overdue();
    await initUnsent();
    await userEvent.press(screen.getByTestId('quick-change-save'));
    await settle();
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe(t('offline.limit.title'));
    expect((await items()).map(row => row.what)).toEqual(['GRN 5: Rack changed']);
  });
});

describe('S11: the words', () => {
  it('the button in English and Gujarati, with a spoken label that names the lot', async () => {
    await render(<QuickChangeButton item="Fictional Peas" grn="12" onPress={() => undefined} testID="qc-button" />);
    expect(screen.getByText('Change rack or mark')).toBeOnTheScreen();
    expect(screen.getByTestId('qc-button')).toHaveAccessibleName('Change rack or mark of Fictional Peas, GRN 12');
  });

  it('in Gujarati the action reads "રેક કે માર્કો બદલો" and the GRN number keeps 0-9', async () => {
    setLanguage('gu');
    await render(<QuickChangeButton item="Fictional Peas" grn="12" onPress={() => undefined} testID="qc-button" />);
    expect(screen.getByText('રેક કે માર્કો બદલો')).toBeOnTheScreen();
    expect(screen.getByTestId('qc-button').props.accessibilityLabel).toContain('12');
  });
});
