/**
 * WH-304 A-4, a held new GRN corrected in the GRN form (route /grn-edit/held-<id>; contract
 * product/tech/app-offline-holding-list.md 5.2; Design offline-capture.md 7.9 DQ4): the review step's button reads "Accept with
 * changes", asks nothing first (no "Save GRN" question, no photo-required alert for photos that sit with the held item), and
 * its press is `decide_held_item` accept with the corrected body and this visit's decision key, never `save_grn`/`update_grn`.
 * A refusal is told in words and the item stays held; the held route never makes an unfinished-form draft.
 *
 * Real: GrnReviewStep, the form slice and store, the holding API and heldGrn/heldForm, i18n. Faked at the edge: the server's
 * RPC answers, native modules, navigation and the stand-in dialogs (as GrnReviewStepEditRequiredHeader.test.tsx).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { loadGRNData as loadIntoForm, updateItem } from '@/store/slices/grnFormSlice';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { grnFormOfBody } from '@/features/unsent/editUnsentGrn';
import type { NewGrnBody } from '@/features/unsent/newGrnKind';
import { formOfPath } from '@/features/unsent/FormDraftHost';
import { heldIdOfRoute, heldRouteId } from '@/features/holding/heldForm';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

const CUST = '77777777-2222-4333-8444-555555555555';
const ITEM = '66666666-2222-4333-8444-555555555555';
const LOT = '55555555-2222-4333-8444-555555555555';
const HELD = 'aaaaaaaa-2222-4333-8444-555555555555';
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const heldBody = (): NewGrnBody => ({
  v: 1,
  localId: '5f304000-0000-4000-8000-0000000000e1',
  lotLocalIds: [LOT],
  args: {
    p_gr_no: '',
    p_issue_number: true,
    p_recorded_at: '2026-11-27T09:00:00+05:30',
    p_date: '2026-11-27',
    p_customer_id: CUST,
    p_customer_name: 'asha Traders',
    p_sender_id: null,
    p_sender_name: 'Typed Sender',
    p_supervisor_id: '99999999-2222-4333-8444-555555555555',
    p_supervisor_name: 'Ravi Example',
    p_registration: null,
    p_note: null,
    p_leon: false,
    p_pricing_mode: 'MONTHLY',
    p_items: [{ item_id: ITEM, item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, weight: 50, rack: null, package_mark: null, pricing_mode: 'MONTHLY' }],
    p_warn_duplicate: true,
  } as NewGrnBody['args'],
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Example Potatoes', packaging: 'Bag' }] },
});

const makeStore = () => configureStore({
  reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: { role: 'supervisor' } }), theme: () => ({ preference: 'light', brand: 'orange' }) },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
});
let mockStore: ReturnType<typeof makeStore>;
const mockRpc = jest.fn();
const mockRate = {
  id: 'r1', item_id: ITEM, item_name: 'Example Potatoes', customer_id: null, customer_name: null, price_type: 'monthly',
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
  useLocalSearchParams: () => ({ id: 'held-aaaaaaaa-2222-4333-8444-555555555555' }),
  usePathname: () => '/grn-edit/held-aaaaaaaa-2222-4333-8444-555555555555/step3',
  useFocusEffect: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn(), TOAST_DURATION_MS: 4000, registerToastHost: () => () => undefined }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
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
// The bar draws what the step hands it as its button, so the label the person reads is the label checked.
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown; nextLabel?: string }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: props.nextLabel ?? 'Wizard next', onPress: props.onNext }),
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

/** `get_held_item`'s answer for the held GRN (contract 11.5). */
const heldAnswer = () => ({
  data: {
    success: true, id: HELD, kind: 'newGrn', state: 'held', reason: 'other', reason_data: {}, follows: null, needs_decision: true, can_accept: true,
    what: { key: 'offline.unsent.whatNewGrn' }, customer_name: 'asha Traders', recorded_by_name: 'Ravi Fictional', recorded_at: '2026-11-27T09:00:00+05:30',
    phone: 'Fictional Android phone', decided_by_name: null, decided_at: null, reject_reason: null, result: null,
    body: heldBody(), accepted_body: null, photos: [], followers: [], accept_possible: false, current: [],
  },
  error: null,
});
const decideCalls = () => mockRpc.mock.calls.filter(([name]) => name === 'decide_held_item');
const user = userEvent.setup({ delay: 0 });

async function openCorrection() {
  mockStore = makeStore();
  // The wizard's earlier steps fill the form from the held body; here the form is as they leave it, with no photo at all.
  await act(async () => { mockStore.dispatch(loadIntoForm({ ...grnFormOfBody(heldBody(), []), grnId: heldRouteId(HELD) } as never)); });
  await render(<GrnReviewStep mode="edit" />);
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_held_item') return heldAnswer();
    if (name === 'decide_held_item') return { data: { success: true, id: HELD, state: 'accepted', result: { grn_id: 'g-new', gr_no: 'A0044' }, now_acceptable: [] }, error: null };
    return { data: { success: true, data: { grn: { rates: [] } } }, error: null };
  });
  (showAlert as jest.Mock).mockClear();
  (showToast as jest.Mock).mockClear();
  for (const fn of Object.values(router)) (fn as jest.Mock).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('A-4: a held new GRN in the GRN form', () => {
  it('the button reads "Accept with changes"', async () => {
    await openCorrection();
    expect(screen.getByRole('button', { name: 'Accept with changes' })).toBeOnTheScreen();
  });

  it('press: no question, no photo alert, one decide_held_item accept with the corrected body and the decision key, then the Holding list', async () => {
    await openCorrection();
    await act(async () => { mockStore.dispatch(updateItem({ grn_trl_id: LOT, item: { qty: 12 } })); });
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    expect(screen.queryByText(/^Save changes to GRN/)).not.toBeOnTheScreen();
    expect((showAlert as jest.Mock).mock.calls.filter(([title]) => title === 'Photo required')).toHaveLength(0);
    expect(decideCalls()).toHaveLength(1);
    const [, args] = decideCalls()[0];
    expect(args).toMatchObject({ p_id: HELD, p_action: 'accept', p_decision_key: expect.stringMatching(KEY) });
    expect(args.p_body).toMatchObject({ localId: heldBody().localId, args: { p_issue_number: true, p_customer_id: CUST, p_items: [{ qty: 12 }] } });
    expect(mockRpc.mock.calls.map(([name]) => name)).not.toEqual(expect.arrayContaining(['save_grn', 'update_grn']));
    expect(showToast).toHaveBeenCalledWith('Accepted as A0044');
    expect(router.dismissTo).toHaveBeenCalledWith('/holding-list');
  });

  it('a held new GRN sends its rates, so a line with no rate is still stopped: "Add the missing rates", and nothing is decided (WH-304, savesNoRates)', async () => {
    await openCorrection();
    await act(async () => { mockStore.dispatch(updateItem({ grn_trl_id: LOT, item: { item_table_id: '66666666-2222-4333-8444-0000000000ff', item_name: 'Example Beans' } })); });
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(decideCalls()).toHaveLength(0);
  });

  it('a refused corrected accept shows the sentence and the hint, and goes nowhere (the item stays held)', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') {
        return { data: { success: false, error_code: 'WH409', reason: 'STOCK_SHORT', error: 'short', message: 'short', lines: [{ lot_id: 'l03', item_name: 'Beans', available: 4, requested: 6 }] }, error: null };
      }
      return { data: { success: true }, error: null };
    });
    await openCorrection();
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    const alert = (showAlert as jest.Mock).mock.calls.at(-1);
    expect(alert?.[1]).toContain('has 4 left; this dispatch takes 6.');
    expect(alert?.[1]).toContain('Correct the quantity, or reject.');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a held GRN\'s route makes no unfinished-form draft, a stored GRN\'s does', () => {
    expect(heldIdOfRoute(heldRouteId(HELD))).toBe(HELD);
    expect(formOfPath(`/grn-edit/${heldRouteId(HELD)}/step2`)).toBeNull();
    expect(formOfPath('/grn-edit/11111111-2222-4333-8444-555555555555/step2')).toEqual({ kind: 'grnEdit', grnId: '11111111-2222-4333-8444-555555555555' });
  });
});
