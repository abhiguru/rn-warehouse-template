/**
 * WH-304 grnEdit Correct (contract product/tech/app-offline-holding-list.md 5.2, 11.4; edit body product/tech/app-offline-edit-grn.md
 * 3.2; Design offline-capture.md 7.11d): a held edit of a GRN opens the GRN edit form on `/grn-edit/held-<id>` with the held field
 * changes put over the values the SERVER holds now (the server's values stay the baseline), and its last button, "Accept with
 * changes", is `decide_held_item` accept with the form's field changes against that baseline (only changed fields, each
 * `{ from, to }`) and this visit's decision key. Never `update_grn`, `apply_grn_changes`, `save_grn` or a queue entry. A refusal is
 * told in words and the item stays held; a form equal to the server's values cannot be accepted (the button is off, with
 * "Same as on the server now…"); the held route makes no unfinished-form draft.
 *
 * Real: GrnReviewStep, the form slice and store, the holding API, heldGrnEdit / heldForm, i18n. Faked at the edge: the server's
 * RPC answers, the one server read of the GRN (`loadGRNData` of grnFormService, a many-table read), native modules, navigation and
 * the stand-in dialogs (as heldGrnForm.test.tsx).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { loadGRNData as loadIntoForm, updateItem, updateHeader } from '@/store/slices/grnFormSlice';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { loadHeldGrnEditOf, applyGrnEdit } from '@/features/holding/heldGrnEdit';
import { getHeldItem } from '@/features/holding/holdingApi';
import { formOfPath } from '@/features/unsent/FormDraftHost';
import { heldRouteId } from '@/features/holding/heldForm';
import { setLanguage } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

const GRN = '11111111-2222-4333-8444-555555555555';
const HELD = 'aaaaaaaa-2222-4333-8444-555555555555';
const CUST_A = { id: '77777777-2222-4333-8444-555555555555', name: 'asha Traders' };
const CUST_B = { id: '77777777-2222-4333-8444-666666666666', name: 'Beta Traders' };
const LOT1 = '55555555-2222-4333-8444-000000000001';
const LOT2 = '55555555-2222-4333-8444-000000000002';
const ITEM_POTATO = '66666666-2222-4333-8444-000000000001';
const ITEM_RICE = '66666666-2222-4333-8444-000000000002';
const TOKEN = '2026-11-27T10:30:00.000Z';
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The GRN as the server holds it NOW (its Note and the quantity of the first lot differ from what the recorder saw). */
const serverGrn = () => ({
  header: {
    gr_no: 'B1', registration: '', date: '2026-11-20', sender_id: '', sender_name: 'Typed Sender',
    customer_id: CUST_A.id, customer_name: CUST_A.name, supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example',
    note: 'Server note', leon: false, pricing_mode: 'MONTHLY' as const, gr_images: [],
  },
  items: [
    { grn_trl_id: LOT1, item_table_id: ITEM_POTATO, item_name: 'Example Potatoes', packaging: 'Bag', qty: 35, stock: 35, weight: 50, rack: 'D-4', package_mark: '', trl_images: [] },
    { grn_trl_id: LOT2, item_table_id: ITEM_RICE, item_name: 'Example Rice', packaging: 'Bag', qty: 30, stock: 30, weight: 40, rack: '', package_mark: '', trl_images: [] },
  ],
  grnRates: [],
  grnInvoiced: false,
  grnImported: false,
  updatedAt: TOKEN,
  invoice: null,
  firstDispatchDate: null,
});

/** What the recorder's phone held: it saw qty 30 and no note, and changed qty to 40, the note, the customer; removed lot 2; added a line. */
const heldBody = () => ({
  v: 1 as const,
  grnId: GRN,
  loadedAt: '2026-11-27T08:00:00.000Z',
  recordedAt: '2026-11-27T09:00:00+05:30',
  header: {
    note: { from: null, to: 'Recorder note' },
    customer_id: { from: CUST_A, to: CUST_B },
  },
  lots: { [LOT1]: { qty: { from: 30, to: 40 } } },
  linesRemoved: [{ lotId: LOT2, item_name: 'Example Rice', qty: 30 }],
  linesAdded: [{ clientLineId: '5f304000-0000-4000-8000-0000000000a1', item_id: '66666666-2222-4333-8444-000000000009', item_name: 'Example Beans', packaging: 'Bag', qty: 12, weight: 0, rack: null, package_mark: null }],
});

const makeStore = () => configureStore({
  reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: { role: 'supervisor' } }), theme: () => ({ preference: 'light', brand: 'orange' }) },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
});
let mockStore: ReturnType<typeof makeStore>;
const mockRpc = jest.fn();
let mockRouteId = 'held-aaaaaaaa-2222-4333-8444-555555555555';
let mockFieldChanges = false;
const mockFieldChangeSave = jest.fn();
const mockServerRead = jest.fn();
const mockRate = {
  id: 'r1', item_id: ITEM_POTATO, item_name: 'Example Potatoes', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: 2, weight_min: 0, weight_max: 100, labour_rate: 1.5, tax_percent: 5, effective_from: '2026-01-01', effective_to: null, created_at: '', created_by: '',
};

jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('react-redux', () => ({ useStore: () => mockStore, useDispatch: () => mockStore.dispatch, useSelector: (s: (st: unknown) => unknown) => s(mockStore.getState()) }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: mockRouteId }),
  usePathname: () => '/grn-edit/held-aaaaaaaa-2222-4333-8444-555555555555/step3',
  useFocusEffect: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn(), TOAST_DURATION_MS: 4000, registerToastHost: () => () => undefined }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/features/grn/services/grnFormService', () => ({
  ...jest.requireActual('@/features/grn/services/grnFormService'),
  loadGRNData: (...args: unknown[]) => mockServerRead(...args),
}));
// A field-change save (WH-303) needs the facility's capability and release; the one case that checks its rates is not
// blocked turns them on, and the save itself (the unsent queue's own, tested with WH-303) is the one stand-in.
jest.mock('@/config/facilityCapabilities', () => {
  const actual = jest.requireActual('@/config/facilityCapabilities');
  return { ...actual, hasCapability: (name: string) => (mockFieldChanges && name === 'sync' ? true : actual.hasCapability(name)) };
});
jest.mock('@/config/backendFeatures', () => {
  const actual = jest.requireActual('@/config/backendFeatures');
  return { ...actual, backendHasFeature: (name: string) => (mockFieldChanges && name === 'grnFieldChanges' ? true : actual.backendHasFeature(name)) };
});
jest.mock('@/features/grn/offline-edit/grnEditKind', () => ({
  ...jest.requireActual('@/features/grn/offline-edit/grnEditKind'),
  saveGrnEditAndWait: (...args: unknown[]) => mockFieldChangeSave(...args),
  saveGrnEditOffline: (...args: unknown[]) => mockFieldChangeSave(...args),
}));
jest.mock('@/config/supabaseConfig', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {
      select: () => chain, order: () => chain, range: () => chain, eq: () => chain, in: () => chain, single: () => chain,
      then: (resolve: (a: unknown) => unknown, reject: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return chain;
  };
  return {
    beginOperatorMutation: () => jest.fn(),
    getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
    getAuthenticatedClient: async () => ({
      from: builder,
      rpc: (...args: unknown[]) => mockRpc(...args),
      storage: { from: () => ({ remove: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: null, error: null }) }) },
    }),
  };
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex'),
    randomUUID: () => randomUUID(),
  };
});
jest.mock('@/features/grn/rates/useGrnRates', () => ({
  // Only the potatoes have a rate: the added "Example Beans" line has none, as a recorder's added line may not.
  useGrnRates: () => ({ rates: [mockRate], status: 'ready', offline: false, refresh: jest.fn(async () => {}) }),
}));
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(View, null, createElement(Text, null, props.title), createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm }))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
// The bar draws what the step hands it as its button, so the label and the disabled state the person gets are the ones checked.
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown; nextLabel?: string; nextDisabled?: boolean; nextAccessibilityLabel?: string }) =>
    require('react').createElement(require('react-native').Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: props.nextAccessibilityLabel ?? props.nextLabel ?? 'Wizard next',
      accessibilityState: { disabled: props.nextDisabled === true },
      onPress: props.nextDisabled === true ? undefined : props.onNext,
    }),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/services/orderEffects', () => ({ ...jest.requireActual('@/services/orderEffects'), previewUpdateGrn: jest.fn(async () => []) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({ ...jest.requireActual('@/utils/localPhotoFiles'), abandonLocalPhotoUpload: jest.fn(), releaseLocalPhotos: jest.fn(async () => 0) }));

/** `get_held_item`'s answer for the held GRN edit (contract 11.5). */
const heldAnswer = () => ({
  data: {
    success: true, id: HELD, kind: 'grnEdit', state: 'held', reason: 'other', reason_data: {}, follows: null, needs_decision: true, can_accept: true,
    what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['note'] } }, customer_name: CUST_A.name, recorded_by_name: 'Ravi Fictional',
    recorded_at: '2026-11-27T09:00:00+05:30', phone: 'Fictional Android phone', decided_by_name: null, decided_at: null, reject_reason: null, result: null,
    body: heldBody(), accepted_body: null, photos: [], followers: [], accept_possible: true, current: [],
  },
  error: null,
});
const decideCalls = () => mockRpc.mock.calls.filter(([name]) => name === 'decide_held_item');
const user = userEvent.setup({ delay: 0 });

/** What the edit layout does for `/grn-edit/held-<id>`: read the item, read the GRN, put the held changes on top, fill the form. */
async function openCorrection() {
  mockStore = makeStore();
  const edit = await loadHeldGrnEditOf(await getHeldItem(HELD));
  if (edit.kind !== 'loaded') throw new Error('the held edit did not load');
  await act(async () => {
    mockStore.dispatch(loadIntoForm({ ...edit.server, header: edit.header, items: edit.items, baseline: edit.baseline, source: 'heldEdit', grnId: heldRouteId(HELD) } as never));
  });
  await render(<GrnReviewStep mode="edit" />);
  return edit;
}
/** The form put back to exactly what the server holds. */
const backToServer = async () => {
  const server = serverGrn();
  await act(async () => {
    mockStore.dispatch(updateHeader({ note: server.header.note, customer_id: CUST_A.id, customer_name: CUST_A.name } as never));
    mockStore.dispatch(loadIntoForm({ ...server, header: server.header, items: server.items, baseline: undefined, source: 'heldEdit', grnId: heldRouteId(HELD) } as never));
  });
};

beforeEach(() => {
  mockRouteId = heldRouteId(HELD);
  mockFieldChanges = false;
  mockFieldChangeSave.mockReset();
  mockRpc.mockReset();
  mockServerRead.mockReset();
  mockServerRead.mockImplementation(async () => ({ success: true, data: serverGrn() }));
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_held_item') return heldAnswer();
    if (name === 'decide_held_item') return { data: { success: true, id: HELD, state: 'accepted', result: { grn_id: GRN, gr_no: 'B1' }, now_acceptable: [] }, error: null };
    return { data: { success: true, data: { grn: { rates: [] } } }, error: null };
  });
  (showAlert as jest.Mock).mockClear();
  (showToast as jest.Mock).mockClear();
  for (const fn of Object.values(router)) (fn as jest.Mock).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await setLanguage('en');
  jest.restoreAllMocks();
});

describe('the form opens with the held changes over the server\'s present values', () => {
  it('the header and lines are the server\'s with the held changes on top; the baseline is the server\'s own values', async () => {
    const edit = await openCorrection();
    expect(mockServerRead).toHaveBeenCalledWith(GRN);
    // Held changes applied: customer and note from the recorder, lot 1's quantity 40, lot 2 gone, the added line there.
    expect(edit.header).toMatchObject({ customer_id: CUST_B.id, customer_name: CUST_B.name, note: 'Recorder note', sender_name: 'Typed Sender', date: '2026-11-20' });
    expect(edit.items.map(line => [line.grn_trl_id, line.qty])).toEqual([[LOT1, 40], ['5f304000-0000-4000-8000-0000000000a1', 12]]);
    // What the held change did NOT touch stays what the server holds now (rack D-4, not what the recorder saw).
    expect(edit.items[0]).toMatchObject({ rack: 'D-4', weight: 50, item_name: 'Example Potatoes' });
    // The baseline is the server's values: qty 35 (not the recorder's 30), the server's note, both lines.
    expect(edit.baseline.header).toMatchObject({ customer_id: CUST_A.id, note: 'Server note' });
    expect(edit.baseline.items.map(line => [line.grn_trl_id, line.qty])).toEqual([[LOT1, 35], [LOT2, 30]]);
    // The form in the store is what the layout loaded.
    const form = mockStore.getState().grnForm;
    expect(form.header.note).toBe('Recorder note');
    expect(form.items.map(line => line.qty)).toEqual([40, 12]);
  });

  it('applyGrnEdit alone: a lot change whose lot the server no longer has changes nothing and adds nothing', () => {
    const server = serverGrn();
    const body = { ...heldBody(), lots: { 'no-such-lot': { qty: { from: 1, to: 2 } } }, linesAdded: undefined, linesRemoved: undefined, header: undefined };
    const applied = applyGrnEdit(body, server);
    expect(applied.items.map(line => line.qty)).toEqual([35, 30]);
    expect(applied.header).toEqual(server.header);
  });

  it('an item that is not a held GRN edit, or a GRN the server cannot read, does not load as one', async () => {
    mockServerRead.mockImplementation(async () => ({ success: false, error: 'No internet connection' }));
    const item = await getHeldItem(HELD);
    expect(await loadHeldGrnEditOf(item)).toEqual({ kind: 'failed', message: 'No internet connection' });
    expect(await loadHeldGrnEditOf({ ...item, kind: 'newGrn' })).toEqual({ kind: 'unavailable' });
    expect(await loadHeldGrnEditOf({ ...item, state: 'accepted' })).toEqual({ kind: 'unavailable' });
  });
});

describe('Accept with changes', () => {
  it('the button reads "Accept with changes" and is on while the form differs from the server', async () => {
    await openCorrection();
    const button = screen.getByRole('button', { name: 'Accept with changes' });
    expect(button).toBeEnabled();
    expect(screen.queryByTestId('held-same-as-server')).not.toBeOnTheScreen();
  });

  it('press: no question, one decide_held_item accept with the field changes against the server, the decision key and the server\'s version token', async () => {
    await openCorrection();
    await act(async () => { mockStore.dispatch(updateItem({ grn_trl_id: LOT1, item: { qty: 41 } })); });
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    expect(screen.queryByText(/^Save changes to GRN/)).not.toBeOnTheScreen();
    expect(decideCalls()).toHaveLength(1);
    const [, args] = decideCalls()[0];
    expect(args).toMatchObject({ p_id: HELD, p_action: 'accept', p_decision_key: expect.stringMatching(KEY) });
    // Only what changed against the SERVER, each as from/to: the server's own values are the `from`s (35, not the recorder's 30).
    expect(args.p_body).toEqual({
      v: 1,
      grnId: GRN,
      loadedAt: TOKEN,
      recordedAt: '2026-11-27T09:00:00+05:30',
      header: {
        customer_id: { from: CUST_A, to: CUST_B },
        note: { from: 'Server note', to: 'Recorder note' },
      },
      lots: { [LOT1]: { qty: { from: 35, to: 41 } } },
      linesAdded: [expect.objectContaining({ clientLineId: '5f304000-0000-4000-8000-0000000000a1', item_name: 'Example Beans', qty: 12 })],
      linesRemoved: [{ lotId: LOT2, item_name: 'Example Rice', qty: 30 }],
    });
    // Never a direct save, never the queue.
    const names = mockRpc.mock.calls.map(([name]) => name);
    expect(names).not.toEqual(expect.arrayContaining(['update_grn']));
    expect(names).not.toEqual(expect.arrayContaining(['apply_grn_changes']));
    expect(names).not.toEqual(expect.arrayContaining(['save_grn']));
    expect(showToast).toHaveBeenCalledWith('Accepted: GRN B1 updated');
    expect(router.dismissTo).toHaveBeenCalledWith('/holding-list');
  });

  const decideAnswering = (result: Record<string, unknown>) =>
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') return { data: { success: true, id: HELD, state: 'accepted', result, now_acceptable: [] }, error: null };
      return { data: { success: true }, error: null };
    });
  const REPLACED = [{ field: 'note', newer: 'Server note', sent: 'Recorder note' }];

  it('a result that lists replaced entries says so, for 8 seconds, and leaves for the Holding list', async () => {
    decideAnswering({ grn_id: GRN, gr_no: 'B1', replaced: REPLACED });
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    expect(decideCalls()).toHaveLength(1);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Accepted: GRN B1 updated. It replaced a newer entry. Check the GRN.', { durationMs: 8000 });
    expect(router.dismissTo).toHaveBeenCalledWith('/holding-list');
  });

  it('Gujarati: the same toast in Design\'s words', async () => {
    await setLanguage('gu');
    decideAnswering({ grn_id: GRN, gr_no: 'B1', replaced: REPLACED });
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'ફેરફાર સાથે સ્વીકારો' }));
    expect(showToast).toHaveBeenCalledWith('સ્વીકાર્યું: આવક પાવતી B1 અપડેટ થઈ. તેનાથી એક નવી એન્ટ્રી બદલાઈ. આવક પાવતી તપાસો.', { durationMs: 8000 });
  });

  it.each([
    ['an empty replaced list', { grn_id: GRN, gr_no: 'B1', replaced: [] }],
    ['no replaced list', { grn_id: GRN, gr_no: 'B1' }],
  ])('%s gives the normal accepted toast, with the normal time', async (_name, result) => {
    decideAnswering(result);
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Accepted: GRN B1 updated');
    expect((showToast as jest.Mock).mock.calls[0]).toHaveLength(1);
  });

  it('a refused corrected accept shows the reason\'s sentence and hint, and goes nowhere (the item stays held)', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') {
        return { data: { success: false, error_code: 'WH409', reason: 'LOT_NOT_FOUND', error: 'gone', message: 'gone', lot_ids: [LOT1] }, error: null };
      }
      return { data: { success: true }, error: null };
    });
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    expect(decideCalls()).toHaveLength(1);
    const alert = (showAlert as jest.Mock).mock.calls.at(-1);
    expect(alert?.[1]).toContain('GRN B1 was deleted.');
    expect(alert?.[1]).toContain('Reject.');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('rates: a corrected edit sends none, so a line with no rate does not stop it (WH-304, aa1d283e)', () => {
  it('a held edit that adds a line with no rate is not stopped by "Add the missing rates": it reaches decide_held_item', async () => {
    const edit = await openCorrection();
    expect(edit.items.some(line => line.item_name === 'Example Beans')).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    const titles = (showAlert as jest.Mock).mock.calls.map(([title]) => title);
    expect(titles).not.toContain('Add the missing rates');
    expect(titles).not.toContain("The rates couldn't be loaded");
    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0][1].p_body.linesAdded).toEqual([expect.objectContaining({ item_name: 'Example Beans' })]);
  });

  it('a refusal for a missing rate shows the reason\'s sentence and hint, and the item stays held', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') return { data: { success: false, error_code: 'WH409', reason: 'RATE_MISSING', error: 'no rate', message: 'no rate' }, error: null };
      return { data: { success: true }, error: null };
    });
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    expect(decideCalls()).toHaveLength(1);
    const alert = (showAlert as jest.Mock).mock.calls.at(-1);
    expect(alert?.[1]).toMatch(/rate/i);
    expect(String(alert?.[1]).length).toBeGreaterThan('rate'.length + 10);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a field-change save of an ordinary edit (WH-303) is not stopped by a line with no rate either', async () => {
    mockFieldChanges = true;
    mockRouteId = GRN;
    mockFieldChangeSave.mockResolvedValue({ id: 'u1', outcome: 'sent', reason: null });
    mockStore = makeStore();
    const server = serverGrn();
    await act(async () => {
      mockStore.dispatch(loadIntoForm({ ...server, header: { ...server.header, gr_images: [{ id: 'img-1', fileName: 'book.jpg', imageUrl: 'file:///book.jpg', uploadStatus: 'completed' }] }, grnId: GRN, source: 'copy' } as never));
      mockStore.dispatch(updateItem({ grn_trl_id: LOT2, item: { item_table_id: '66666666-2222-4333-8444-000000000009', item_name: 'Example Beans' } }));
    });
    await render(<GrnReviewStep mode="edit" />);
    await user.press(screen.getByRole('button', { name: 'Save GRN' }));
    await user.press(await screen.findByRole('button', { name: 'Confirm' }));
    const titles = (showAlert as jest.Mock).mock.calls.map(([title]) => title);
    expect(titles).not.toContain('Add the missing rates');
    expect(mockFieldChangeSave).toHaveBeenCalledTimes(1);
  });
});

describe('Design 7.11d (b): the form equals what the server holds now', () => {
  it('"Accept with changes" is off, with the line "Same as on the server now. Nothing would change. To drop this item, go back and reject it."', async () => {
    await openCorrection();
    await backToServer();
    expect(screen.getByTestId('held-same-as-server')).toHaveTextContent('Same as on the server now. Nothing would change. To drop this item, go back and reject it.');
    const button = screen.getByRole('button', { name: /^Accept with changes, Same as on the server now/ });
    expect(button).toBeDisabled();
    await user.press(button);
    expect(decideCalls()).toHaveLength(0);
  });

  it('the button is on again as soon as a value differs', async () => {
    await openCorrection();
    await backToServer();
    await act(async () => { mockStore.dispatch(updateItem({ grn_trl_id: LOT1, item: { qty: 36 } })); });
    expect(screen.queryByTestId('held-same-as-server')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept with changes' })).toBeEnabled();
  });

  it('Gujarati: the line and the button read Design\'s words', async () => {
    await setLanguage('gu');
    await openCorrection();
    await backToServer();
    expect(screen.getByTestId('held-same-as-server')).toHaveTextContent('હાલ સર્વર પર છે તેવું જ છે. કંઈ બદલાશે નહીં. આ એન્ટ્રી ન જોઈએ તો પાછા જઈને નકારો.');
  });
});

describe('the held route', () => {
  it('makes no unfinished-form draft, for the GRN edit steps too; a stored GRN\'s edit does', () => {
    for (const step of ['step1', 'step2', 'step3']) expect(formOfPath(`/grn-edit/${heldRouteId(HELD)}/${step}`)).toBeNull();
    expect(formOfPath(`/grn-edit/${GRN}/step2`)).toEqual({ kind: 'grnEdit', grnId: GRN });
  });
});
