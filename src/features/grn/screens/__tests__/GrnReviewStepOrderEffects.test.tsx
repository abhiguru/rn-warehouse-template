/**
 * What a GRN edit does to customers' orders, told on the GRN review step: a note on the step and the lines under the
 * save question, from the server's preview; the lines again in the success dialog of the real save; nothing extra on
 * a server without the preview. A create never asks.
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
// The dialogs draw what a person reads while they are open (title, message, order notes) and the bar draws its Next
// button; each calls the real props.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(View, { accessible: true, accessibilityRole: 'alert' },
        createElement(Text, null, props.title),
        createElement(Text, null, props.message),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm }))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean; documentData: { orderNotes?: string[] } }) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.isVisible
      ? createElement(View, { accessible: true, accessibilityLabel: 'Success dialog' },
        ...(props.documentData.orderNotes ?? []).map((note) => createElement(Text, { key: note }, note)))
      : null;
  },
}));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard next', onPress: props.onNext }),
}));
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
  availableStock: 3, orderLinesLeft: 1, packaging: null, ...over,
});

async function show(mode: 'create' | 'edit') {
  mockForm = {
    header: mockHeader, items: LINES, grnId: mode === 'edit' ? GRN_ID : null, tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false, isCreateMode: mode === 'create', resetFormState: jest.fn(),
  };
  await render(<GrnReviewStep mode={mode} />);
}
const user = () => userEvent.setup({ delay: 0 });
const pressNext = () => user().press(screen.getByRole('button', { name: 'Wizard next' }));
// No role or text names the order-effects block, so the test id is the only way to the block itself.
const effectsBlock = () => screen.queryByTestId('grn-review-order-effects');

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
    await show('edit');
    expect(String(jest.mocked(previewUpdateGrn).mock.calls[0][0].p_grn_id)).toBe(GRN_ID);
    expect(within(effectsBlock()!).getByText("Leading Space Traders' order: Onions (T31-G5) asks for 5 bags, but only 3 bags will be in stock.", { exact: false })).toBeOnTheScreen();

    const calls = jest.mocked(previewUpdateGrn).mock.calls.length;
    await pressNext();
    expect(jest.mocked(previewUpdateGrn).mock.calls.length).toBe(calls + 1);
    const dialog = within(screen.getByRole('alert'));
    expect(dialog.getByText('This also changes orders:', { exact: false })).toBeOnTheScreen();
    expect(dialog.getByText("Garlic (T31-G5) is removed from Leading Space Traders' order. No line is left, so the order is removed.", { exact: false })).toBeOnTheScreen();
  });

  it('asks as before without a preview, and a create never asks the preview', async () => {
    await show('edit');
    expect(effectsBlock()).toBeNull();
    await pressNext();
    expect(within(screen.getByRole('alert')).queryByText(/orders/)).toBeNull();
    await act(async () => { screen.unmount(); });

    jest.mocked(previewUpdateGrn).mockClear();
    await show('create');
    await pressNext();
    expect(previewUpdateGrn).not.toHaveBeenCalled();
  });

  it('repeats the order lines of the real save in the success dialog', async () => {
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: {}, photos: { uploadedCount: 0, failed: [], removalFailures: 0 }, orderEffects: [effect({ change: 'reduced', oldQuantity: 5, newQuantity: 3 })] } });
    await show('edit');
    await pressNext();
    await user().press(screen.getByRole('button', { name: 'Confirm' }));
    const success = within(screen.getByLabelText('Success dialog'));
    expect(success.getAllByText(/order:/)).toHaveLength(1);
    expect(success.getByText("Leading Space Traders' order: Onions (T31-G5) 5 → 3 bags")).toBeOnTheScreen();
  });
});
