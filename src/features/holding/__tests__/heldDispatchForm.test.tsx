/**
 * WH-304 A-4, a held new dispatch corrected in the dispatch form (route /dispatch-edit/held-<id>; contract
 * product/tech/app-offline-holding-list.md 5.2; Design offline-capture.md 7.9 DQ4): the review step's button reads "Accept with
 * changes", its press is `decide_held_item` accept with the corrected body and the visit's decision key, never a dispatch save,
 * and asks nothing first. A refusal is told in words and the item stays held.
 *
 * Real: DispatchReviewStep, the holding API, heldDispatch/heldForm, i18n. Faked at the edge: the server (RPC answers and the
 * lot reads), the form hook (a fixed form, as DispatchReviewStepLostAnswer.test.tsx does), native modules, navigation.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import type { NewDispatchBody } from '@/features/unsent/newDispatchKind';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

const HELD = 'bbbbbbbb-2222-4333-8444-555555555555';
const LOT = 'lot-0000-0000-0000-000000000003';
const mockRpc = jest.fn();
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const heldBody = (): NewDispatchBody => ({
  v: 1,
  localId: '5f304000-0000-4000-8000-0000000000f1',
  args: {
    p_dispatch_data: { disp_no: '', issue_number: true, customer_id: 'c1', customer_name: 'asha Traders', disp_date: '2026-11-27', warn_duplicate: true } as never,
    p_dispatch_items: [{ gr_trl_id: LOT, disp_qty: 6 }],
    p_generate_invoice: true,
    p_retry_count: 0,
  } as NewDispatchBody['args'],
  show: { customerName: 'asha Traders' },
});

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
const mockReset = jest.fn();
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: '', disp_date: '2026-11-27', customer_id: 'c1', customer_name: 'asha Traders', registration: '', note: '', supervisor_id: '', supervisor_name: '' },
    items: [{ unique_id: 'lot-0000-0000-0000-000000000003', grns_id: 'g1', grnItems_id: 'lot-0000-0000-0000-000000000003', grnItems_item_name: 'Beans', grnItems_quantity: 10, grnItems_stock: 10, disp_quantity: 5, original_disp_quantity: 0 }],
    images: [],
    isSaving: false,
    isCheckingAnswer: false,
    isCreateMode: false,
    dispatchId: null,
    submitForm: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: mockReset,
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));
jest.mock('@/config/supabaseConfig', () => {
  const lots = [{ id: 'lot-0000-0000-0000-000000000003', gr_id: 'g1', item_id: 'i1', item_name: 'Beans', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: 'A-1', package_mark: '' }];
  const grns = [{ id: 'g1', gr_no: 'A0010', date: '2026-11-01', customer_name: 'asha Traders', customer_id: 'c1' }];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain, in: () => chain, eq: () => chain,
      then: (resolve: (a: unknown) => unknown, reject: (r: unknown) => unknown) =>
        Promise.resolve({ data: table === 'goodsreceived_trl' ? lots : table === 'goodsreceived' ? grns : [], error: null }).then(resolve, reject),
    };
    return chain;
  };
  return {
    beginOperatorMutation: () => jest.fn(),
    getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
    getAuthenticatedClient: async () => ({ from: builder, rpc: (...args: unknown[]) => mockRpc(...args) }),
  };
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'held-bbbbbbbb-2222-4333-8444-555555555555' }),
}));
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string }) =>
    props.visible ? require('react').createElement(require('react-native').Text, null, props.title) : null,
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: () => null }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: () => null }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(), unpreparedDispatchPhotos: () => 'ready', generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(), prepareDispatchImageForDeferredUpload: jest.fn(), uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const heldAnswer = () => ({
  data: {
    success: true, id: HELD, kind: 'newDispatch', state: 'held', reason: 'stockShort', reason_data: {}, follows: null, needs_decision: true, can_accept: true,
    what: { key: 'offline.unsent.whatNewDispatch' }, customer_name: 'asha Traders', recorded_by_name: 'Ravi Fictional', recorded_at: '2026-11-27T09:00:00+05:30',
    phone: 'Fictional Android phone', decided_by_name: null, decided_at: null, reject_reason: null, result: null,
    body: heldBody(), accepted_body: null, photos: [], followers: [], accept_possible: false, current: [],
  },
  error: null,
});
const decideCalls = () => mockRpc.mock.calls.filter(([name]) => name === 'decide_held_item');
const user = userEvent.setup({ delay: 0 });

beforeEach(() => {
  mockRpc.mockReset();
  mockReset.mockClear();
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_held_item') return heldAnswer();
    if (name === 'decide_held_item') return { data: { success: true, id: HELD, state: 'accepted', result: { dispatch_id: 'd-9', disp_no: 'D-9' }, now_acceptable: [] }, error: null };
    return { data: { success: true }, error: null };
  });
  (showAlert as jest.Mock).mockClear();
  (showToast as jest.Mock).mockClear();
  for (const fn of Object.values(router)) (fn as jest.Mock).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('A-4: a held new dispatch in the dispatch form', () => {
  it('the button reads "Accept with changes"', async () => {
    await render(<DispatchReviewStep mode="edit" />);
    expect(screen.getByRole('button', { name: 'Accept with changes' })).toBeOnTheScreen();
  });

  it('press: no question, one decide_held_item accept with the corrected lines and the decision key, then the Holding list', async () => {
    await render(<DispatchReviewStep mode="edit" />);
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    expect(screen.queryByText(/^Save changes to dispatch/)).not.toBeOnTheScreen();
    expect(decideCalls()).toHaveLength(1);
    const [, args] = decideCalls()[0];
    expect(args).toMatchObject({ p_id: HELD, p_action: 'accept', p_decision_key: expect.stringMatching(KEY) });
    expect(args.p_body).toMatchObject({ localId: heldBody().localId, args: { p_dispatch_items: [{ gr_trl_id: LOT, disp_qty: 5 }], p_dispatch_data: { customer_id: 'c1', warn_duplicate: true } } });
    expect(mockRpc.mock.calls.map(([name]) => name)).not.toEqual(expect.arrayContaining(['create_dispatch_with_stock_check', 'update_dispatch']));
    expect(showToast).toHaveBeenCalledWith('Accepted as D-9');
    expect(router.dismissTo).toHaveBeenCalledWith('/holding-list');
  });

  it('a refused corrected accept shows the sentence and the hint and the item stays held', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') {
        return { data: { success: false, error_code: 'WH409', reason: 'STOCK_SHORT', error: 'short', message: 'short', lines: [{ lot_id: LOT, item_name: 'Beans', available: 4, requested: 5 }] }, error: null };
      }
      return { data: { success: true }, error: null };
    });
    await render(<DispatchReviewStep mode="edit" />);
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));

    const alert = (showAlert as jest.Mock).mock.calls.at(-1);
    expect(alert?.[1]).toContain('has 4 left; this dispatch takes 5.');
    expect(alert?.[1]).toContain('Correct the quantity, or reject.');
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('a second press after a refusal is the same decision: it carries the same key', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_held_item') return heldAnswer();
      if (name === 'decide_held_item') return { data: { success: false, error_code: 'WH409', reason: 'STOCK_SHORT', error: 'short', message: 'short' }, error: null };
      return { data: { success: true }, error: null };
    });
    await render(<DispatchReviewStep mode="edit" />);
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    await user.press(screen.getByRole('button', { name: 'Accept with changes' }));
    expect(decideCalls()).toHaveLength(2);
    expect(decideCalls()[1][1].p_decision_key).toBe(decideCalls()[0][1].p_decision_key);
  });
});
