/**
 * What a GRN edit does to customers' orders, told on the GRN review step: a note on the step and the lines under the
 * save question, from the server's preview; the lines again in the success dialog of the real save; nothing extra on
 * a server without the preview. A create never asks.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { previewUpdateGrn, type OrderEffect } from '@/services/orderEffects';
import { updateGRN } from '@/features/grn/services/grnFormService';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: mockRemovedImages } }),
}));

const mockHeader = {
  gr_no: 'A0010',
  date: '2026-10-01',
  sender_name: 'Fictional Sender',
  customer_name: 'Fictional Traders',
  supervisor_name: 'Fictional Supervisor',
  registration: '',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [
    { id: SAVED_PHOTO, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' },
  ],
};
/** 30 lines, each with its own weight, so a drawn line can be told by the weight it formats. */
const line = (n: number) => ({
  grn_trl_id: `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`, item_table_id: `i${n}`, item_name: `Fictional item ${n}`,
  packaging: 'Bag', qty: 10 + n, stock: 10 + n, weight: 40 + n / 4, rack: `R${n}`, package_mark: `M${n}`, trl_images: [],
});
const LINES = Array.from({ length: 2 }, (_, n) => line(n));
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
// These tests are about the item list; the Rates section has its own tests (GrnReviewStepRates).
jest.mock('@/features/grn/rates/GrnRatesSection', () => ({ GrnRatesSection: () => null }));
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({
  createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn(),
  buildUpdateGRNRequest: jest.fn((id: string) => ({ rpcRequest: { p_grn_id: id } })),
}));
jest.mock('@/services/orderEffects', () => ({ ...jest.requireActual('@/services/orderEffects'), previewUpdateGrn: jest.fn() }));
// The server is asked about a lost answer by this (utils/lostAnswer); none of these tests loses one.
jest.mock('@/utils/lostAnswer', () => ({ checkSubmission: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
// askAlert never answers by itself: a test presses OK (the button's value) or dismisses (the `dismissed` value).
const mockAsked: Array<{ title: string; message?: string; ok: unknown; dismissed: unknown; resolve: (value: unknown) => void }> = [];
jest.mock('@/utils/alert', () => ({
  showAlert: jest.fn(),
  askAlert: jest.fn((title: string, message: string | undefined, choices: Array<{ value: unknown }>, dismissed: unknown) =>
    new Promise((resolve) => { mockAsked.push({ title, message, ok: choices[0].value, dismissed, resolve }); })),
}));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));



const effect = (over: Partial<OrderEffect>): OrderEffect => ({
  customerId: 'c1', customerName: 'Leading Space Traders', orderId: 'o1', orderNo: 'ORD-1', orderItemId: 'oi1', grnItemId: 'l1',
  itemName: 'Onions', packageMark: null, grnNo: 'T31-G5', oldQuantity: 5, newQuantity: 5, removed: false, change: 'exceeds_stock',
  availableStock: 3, orderLinesLeft: 1, ...over,
});

async function render(mode: 'create' | 'edit') {
  mockForm = {
    header: mockHeader, items: LINES, grnId: mode === 'edit' ? GRN_ID : null, tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false, isCreateMode: mode === 'create', resetFormState: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GrnReviewStep mode={mode} />); });
  return tree;
}
const visibleDialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never).filter((dialog) => dialog.props.visible);
const texts = (node: { findAll: ReactTestRenderer['root']['findAll'] }) =>
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => ([] as unknown[]).concat(n.props.children).join('')).join('\n');
const byTestId = (tree: ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id);

beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  mockAsked.length = 0;
  jest.mocked(previewUpdateGrn).mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN edit', () => {
  it('names the order lines on the step and in the save question, asking the preview again when Save is tapped', async () => {
    jest.mocked(previewUpdateGrn).mockResolvedValue([effect({}), effect({ itemName: 'Garlic', change: 'removed', removed: true, newQuantity: 0, orderLinesLeft: 0 })]);
    const tree = await render('edit');
    expect(String(jest.mocked(previewUpdateGrn).mock.calls[0][0].p_grn_id)).toBe(GRN_ID);
    expect(texts(byTestId(tree, 'grn-review-order-effects')[0])).toContain("Leading Space Traders' order: Onions (T31-G5) asks for 5 bags, but only 3 bags will be in stock.");

    const calls = jest.mocked(previewUpdateGrn).mock.calls.length;
    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    expect(jest.mocked(previewUpdateGrn).mock.calls.length).toBe(calls + 1);
    const message = String(visibleDialogs(tree)[0].props.message);
    expect(message).toContain('This also changes orders:');
    expect(message).toContain("Garlic (T31-G5) is removed from Leading Space Traders' order. No line is left, so the order is removed.");
    await act(async () => { tree.unmount(); });
  });

  it('asks as before without a preview, and a create never asks the preview', async () => {
    const edit = await render('edit');
    expect(byTestId(edit, 'grn-review-order-effects')).toHaveLength(0);
    await act(async () => { await edit.root.findByType('WizardBottomBar' as never).props.onNext(); });
    expect(String(visibleDialogs(edit)[0].props.message)).not.toContain('orders');
    await act(async () => { edit.unmount(); });

    jest.mocked(previewUpdateGrn).mockClear();
    const create_ = await render('create');
    await act(async () => { await create_.root.findByType('WizardBottomBar' as never).props.onNext(); });
    expect(previewUpdateGrn).not.toHaveBeenCalled();
    await act(async () => { create_.unmount(); });
  });

  it('repeats the order lines of the real save in the success dialog', async () => {
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: {}, photos: { uploadedCount: 0, failed: [], removalFailures: 0 }, orderEffects: [effect({ change: 'reduced', oldQuantity: 5, newQuantity: 3 })] } });
    const tree = await render('edit');
    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    await act(async () => { await visibleDialogs(tree)[0].props.onConfirm(); });
    expect(tree.root.findByType('DocumentSuccessDialog' as never).props.documentData.orderNotes).toEqual(["Leading Space Traders' order: Onions (T31-G5) 5 → 3 bags"]);
    await act(async () => { tree.unmount(); });
  });
});
