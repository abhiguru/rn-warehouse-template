/**
 * WH-301 (Design 4.2, 4.6, 4.10, 7.9 and 10.9; contract sections 3 and 10): the "Unsent items" screen. Sections in the order
 * Not finished, Not sent yet, Held, Sent today; a refused item shows its reason's tag ("Refused: Stock short"), the generic
 * sentence only for a code with no row; what follows a refused item sits under it with its own footnote; another person's items
 * are a strip, never rows; Send now and Delete.
 *
 * Real: `UnsentItemsScreen`, `UnsentRow`, `unsentList`, the queue, forms and the unsent file, i18n. Faked at the edge:
 * expo-sqlite, files, secure-store, NetInfo, the signed-in person, the router, the dialog (the person's answer), the list
 * component (as other screen tests do) and the theme store.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRows, rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { initUnsent } from '@/features/unsent/unsentStore';
import { saveFormDraft } from '@/features/unsent/formDrafts';
import { UnsentItemsScreen } from '@/features/unsent/UnsentItemsScreen';
import { saveOperatorServer } from '@/config/operatorServer';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { askAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('expo-router', () => {
  const Stack = { Screen: () => null };
  return { router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, Stack, useRouter: () => ({ push: jest.fn(), back: jest.fn() }) };
});
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/utils/alert', () => ({ askAlert: jest.fn(), showAlert: jest.fn() }));
jest.mock('@/store/hooks', () => {
  const state = { auth: { userProfile: { id: 'profile-1', role: 'staff' } }, theme: jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' }) };
  return { useAppSelector: (select: (s: unknown) => unknown) => select(state), useAppDispatch: () => () => undefined };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const scopeOf = (subject: string) => JSON.stringify([SERVER.origin, SERVER.instanceId, subject]);
const ask = jest.mocked(askAlert);

interface Seed {
  id: string;
  seq: number;
  state: 'saved' | 'sending' | 'sent' | 'refused' | 'waiting';
  what: string;
  subject?: string;
  recorder?: string;
  customer?: string | null;
  dependsOn?: string | null;
  lastError?: string | null;
  result?: unknown;
  sentDay?: string | null;
  recordedAt?: number;
  target?: unknown;
}
const insert = (seed: Seed) =>
  rawRun(
    `INSERT INTO items (id, seq, scope, recorder_name, kind, request_key, body, depends_on, target_ref, what, customer, state, attempts, first_sent_at, last_sent_at, last_error, recorded_at, recorded_tick, result, sent_day) VALUES ('${seed.id}', ${seed.seq}, '${scopeOf(seed.subject ?? 'user-1')}', '${seed.recorder ?? ''}', 'seeded', 'key-${seed.id}', '{}', ${seed.dependsOn ? `'${seed.dependsOn}'` : 'NULL'}, ${seed.target ? `'${JSON.stringify(seed.target)}'` : 'NULL'}, '${seed.what}', ${seed.customer ? `'${seed.customer}'` : 'NULL'}, '${seed.state}', 1, NULL, NULL, ${seed.lastError ? `'${seed.lastError}'` : 'NULL'}, ${seed.recordedAt ?? 1_795_663_800_000 + seed.seq}, 0, ${seed.result === undefined ? 'NULL' : `'${JSON.stringify(seed.result)}'`}, ${seed.sentDay ? `'${seed.sentDay}'` : 'NULL'})`
  );
const open = async () => {
  await initUnsent();
  await render(<GestureHandlerRootView><UnsentItemsScreen /></GestureHandlerRootView>);
  await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
};
const REFUSED_GENERIC = 'The server refused this. A supervisor will look at it.';
const user = () => userEvent.setup();

beforeAll(async () => { await saveOperatorServer(SERVER); await initUnsent(); });
beforeEach(async () => {
  jest.clearAllMocks();
  files.reset();
  mockOffline = false;
  env.subject = 'user-1';
  setFacilityCapabilities(SERVER, { sync: true });
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); }
});
afterEach(() => { setLanguage('en'); });

describe('sections and rows', () => {
  it('with nothing unsent it says so and offers no Send now', async () => {
    await open();
    expect(screen.getByTestId('unsent-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('unsent-send-now')).not.toBeOnTheScreen();
    expect(screen.getByTestId('unsent-last-sent')).toHaveTextContent('Nothing sent from this phone yet');
  });

  it('lists Not finished, Not sent yet, Held and Sent today, in that order, each with its rows', async () => {
    await saveFormDraft({ kind: 'grn', state: { header: { customer_name: 'Asha Fictional Traders' }, items: [] }, customer: 'Asha Fictional Traders', at: 1_000 });
    await insert({ id: 'u1', seq: 1, state: 'saved', what: 'Dispatch for Bina Fictional Stores' });
    await insert({ id: 'h1', seq: 2, state: 'refused', what: 'GRN 12: Rack changed', lastError: 'x', result: { code: 'LOT_NOT_FOUND' } });
    await insert({ id: 's1', seq: 3, state: 'sent', what: 'GRN 13 saved', sentDay: businessDate(Date.now()), result: { number: 'RV15013' } });
    await open();
    expect(screen.getAllByTestId(/^unsent-section-/).map(node => node.props.testID)).toEqual(['unsent-section-unfinished', 'unsent-section-unsent', 'unsent-section-held', 'unsent-section-sent']);
    expect(screen.getByTestId('unsent-section-unfinished')).toHaveTextContent(/Not finished/i);
    expect(screen.getByTestId('unsent-section-unsent')).toHaveTextContent(/Not sent yet/i);
    expect(screen.getByTestId('unsent-section-held')).toHaveTextContent(/Held/i);
    expect(screen.getByTestId('unsent-section-sent')).toHaveTextContent(/Sent today/i);
    expect(screen.getByText('GRN form')).toBeOnTheScreen();
    expect(screen.getByText('Dispatch for Bina Fictional Stores')).toBeOnTheScreen();
    expect(screen.getByText('GRN 12: Rack changed')).toBeOnTheScreen();
    expect(screen.getByText('Saved on phone')).toBeOnTheScreen();
    expect(screen.getByText('Sent · RV15013')).toBeOnTheScreen();
  });

  it('an item sent on an earlier day has left the list', async () => {
    await insert({ id: 's0', seq: 1, state: 'sent', what: 'GRN 9 saved', sentDay: '2020-01-01' });
    await open();
    expect(screen.queryByText('GRN 9 saved')).not.toBeOnTheScreen();
  });

  it('Send now shows with unsent work, and is disabled with the reason when offline', async () => {
    mockOffline = true;
    await insert({ id: 'u1', seq: 1, state: 'saved', what: 'Dispatch for Bina Fictional Stores' });
    await open();
    expect(screen.getByTestId('unsent-send-now')).toBeDisabled();
    expect(screen.getByTestId('unsent-send-now-needs-connection')).toBeOnTheScreen();
  });

  it('a refused item alone does not offer Send now (nothing there can be sent)', async () => {
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12: Rack changed', result: { code: 'LOT_NOT_FOUND' }, lastError: 'x' });
    await open();
    expect(screen.queryByTestId('unsent-send-now')).not.toBeOnTheScreen();
  });
});

describe('Not finished', () => {
  it('lists an unfinished GRN and edit with their words and no state tag', async () => {
    await saveFormDraft({ kind: 'grn', state: { header: { gr_no: 'RV1' }, items: [] }, customer: 'Asha Fictional Traders', at: 1_000 });
    await saveFormDraft({ kind: 'grnEdit', grnId: 'grn-9', state: { header: { gr_no: 'RV15009' }, items: [] }, at: 3_000 });
    await open();
    expect(screen.getByText('GRN form')).toBeOnTheScreen();
    expect(screen.getByText('Changes to GRN RV15009')).toBeOnTheScreen();
    expect(screen.getByText('Asha Fictional Traders')).toBeOnTheScreen();
    expect(screen.queryByText('Saved on phone')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('unsent-send-now')).not.toBeOnTheScreen();
  });

  it('a tap opens the form where it was left, without asking again, and an edit opens that GRN', async () => {
    await saveFormDraft({ kind: 'grn', state: { header: {}, items: [] }, at: 1_000 });
    await saveFormDraft({ kind: 'grnEdit', grnId: 'grn-9', state: { header: { gr_no: 'RV15009' }, items: [] }, at: 2_000 });
    await open();
    await user().press(screen.getByText('GRN form'));
    expect(router.push).toHaveBeenCalledWith('/grn-form/step1');
    await user().press(screen.getByText('Changes to GRN RV15009'));
    expect(router.push).toHaveBeenCalledWith('/grn-edit/grn-9/step1');
  });

  it('Delete asks today\'s discard question; Discard removes the form, Cancel keeps it', async () => {
    await saveFormDraft({ kind: 'grn', state: { header: {}, items: [] }, at: 1_000 });
    await open();
    const form = (await rawRows<{ id: string }>('forms'))[0];
    ask.mockResolvedValueOnce('keep');
    await act(async () => { screen.getByTestId(`unsent-form-${form.id}`).props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    expect(await rawRows('forms')).toHaveLength(1);
    ask.mockResolvedValueOnce('discard');
    await act(async () => { screen.getByTestId(`unsent-form-${form.id}`).props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }); });
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    expect(await rawRows('forms')).toEqual([]);
    expect(screen.queryByText('GRN form')).not.toBeOnTheScreen();
  });
});

describe('Held: a refused item, its tag, and what follows it', () => {
  it('a refused item with a known code shows "Refused: Below dispatched", never the server\'s own words or the generic sentence', async () => {
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12: Quantity changed', lastError: 'Lot L-9 has 10 dispatched; requested 4', result: { code: 'QTY_BELOW_DISPATCHED' } });
    await open();
    expect(screen.getByTestId('unsent-row-reason-h1')).toHaveTextContent('Refused: Below dispatched');
    expect(screen.queryByText(/Lot L-9/)).not.toBeOnTheScreen();
    expect(screen.queryByText(REFUSED_GENERIC)).not.toBeOnTheScreen();
    expect(screen.getByTestId('unsent-row-tag-h1')).toHaveTextContent('Held');
  });

  it.each([
    ['RATE_MISSING', 'No rate'],
    ['NUMBER_TAKEN', 'Number used'],
    ['LOT_NOT_FOUND', 'Deleted'],
    ['GRN_INVOICED', 'Locked'],
    ['POSSIBLE_DUPLICATE', 'Duplicate?'],
    ['QTY_BELOW_DISPATCHED', 'Below dispatched'],
    ['SERIES_FULL', 'Series full'],
    ['CUSTOMER_INACTIVE', 'Customer inactive'],
    ['42501', 'Not allowed'],
  ])('%s reads "Refused: %s"', async (code, tag) => {
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12: Rack changed', lastError: 'raw', result: { code } });
    await open();
    expect(screen.getByTestId('unsent-row-reason-h1')).toHaveTextContent(`Refused: ${tag}`);
  });

  it('a code with no row, or no code at all, shows the generic sentence', async () => {
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12: Rack changed', lastError: 'raw words', result: { code: 'SOMETHING_NEW' } });
    await insert({ id: 'h2', seq: 2, state: 'refused', what: 'GRN 13: Rack changed', lastError: 'raw words', result: null });
    await open();
    expect(screen.getByTestId('unsent-row-reason-h1')).toHaveTextContent(REFUSED_GENERIC);
    expect(screen.getByTestId('unsent-row-reason-h2')).toHaveTextContent(REFUSED_GENERIC);
    expect(screen.queryByText(/raw words/)).not.toBeOnTheScreen();
  });

  it('in Gujarati the tag is the Gujarati one', async () => {
    setLanguage('gu');
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12', lastError: 'raw', result: { code: 'QTY_BELOW_DISPATCHED' } });
    await open();
    expect(screen.getByTestId('unsent-row-reason-h1')).toHaveTextContent('નકાર્યું: જાવકથી ઓછું');
  });

  it('what follows a refused item sits directly under it with its own footnote, and a later unrelated held item comes after', async () => {
    await insert({ id: 'h-late', seq: 1, state: 'refused', what: 'GRN 20: Mark changed', lastError: 'raw', result: { code: 'LOT_NOT_FOUND' } });
    await insert({ id: 'h-root', seq: 2, state: 'refused', what: 'GRN 12: Rack changed', lastError: 'raw', result: { code: 'LOT_NOT_FOUND' } });
    await insert({ id: 'h-dep', seq: 3, state: 'refused', what: 'GRN 12: Mark changed', lastError: 'dependsOnRefused', dependsOn: 'h-root', result: null });
    await open();
    const titles = screen.getAllByText(/^GRN \d+: /).map(node => node.props.children);
    // Held items are grouped by the refused item they follow; the dependant is directly under its root.
    expect(titles.indexOf('GRN 12: Mark changed')).toBe(titles.indexOf('GRN 12: Rack changed') + 1);
    expect(screen.getByTestId('unsent-row-reason-h-dep')).toHaveTextContent('Not sent: the change before it was refused.');
    expect(screen.getByTestId('unsent-row-reason-h-root')).toHaveTextContent('Refused: Deleted');
    expect(screen.getByTestId('unsent-row-tag-h-dep')).toHaveTextContent('Held');
    expect(screen.getByTestId('unsent-section-held')).toHaveTextContent(/3/);
  });

  it('a held row cannot be deleted from here (only a not-yet-sent or unfinished row can)', async () => {
    await insert({ id: 'h1', seq: 1, state: 'refused', what: 'GRN 12: Rack changed', lastError: 'x', result: { code: 'LOT_NOT_FOUND' } });
    await insert({ id: 'u1', seq: 2, state: 'saved', what: 'GRN 14: Rack changed' });
    await open();
    expect(screen.getByTestId('unsent-row-h1').props.accessibilityActions).toBeUndefined();
    expect(screen.getByTestId('unsent-row-u1').props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
  });
});

describe("another person's items", () => {
  it('are a strip with the name and the count, never rows, and offer no Send now', async () => {
    await insert({ id: 'o1', seq: 1, state: 'saved', what: "Meena dispatch", subject: 'user-2', recorder: 'Meena Fictional' });
    await insert({ id: 'o2', seq: 2, state: 'saved', what: "Meena GRN", subject: 'user-2', recorder: 'Meena Fictional' });
    await open();
    expect(screen.getByTestId('unsent-other-person')).toHaveTextContent('This phone holds 2 unsent items recorded by Meena Fictional. They are sent when Meena Fictional signs in on this phone again.');
    expect(screen.queryByText("Meena dispatch")).not.toBeOnTheScreen();
    expect(screen.queryByText("Meena GRN")).not.toBeOnTheScreen();
    expect(screen.queryByTestId('unsent-send-now')).not.toBeOnTheScreen();
  });

  it('no strip when nobody else has unsent work (a sent item of theirs does not count)', async () => {
    await insert({ id: 'o1', seq: 1, state: 'sent', what: "Meena dispatch", subject: 'user-2', recorder: 'Meena Fictional', sentDay: businessDate(Date.now()) });
    await open();
    expect(screen.queryByTestId('unsent-other-person')).not.toBeOnTheScreen();
  });

  it('own work shows beside the strip, the other person\'s only in the strip', async () => {
    await insert({ id: 'o1', seq: 1, state: 'saved', what: "Meena dispatch", subject: 'user-2', recorder: 'Meena Fictional' });
    await insert({ id: 'u1', seq: 2, state: 'saved', what: 'Dispatch for Bina Fictional Stores' });
    await open();
    expect(screen.getByText('Dispatch for Bina Fictional Stores')).toBeOnTheScreen();
    expect(screen.getByTestId('unsent-other-person')).toBeOnTheScreen();
    expect(screen.getByTestId('unsent-send-now')).toBeOnTheScreen();
  });
});
