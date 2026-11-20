/**
 * The GRN review step's item list: each line is a memoized cell, so a dialog
 * opening on the step, or one line changing, does not draw every line again
 * (review finding P2F-UI-1). The list stays a plain ScrollView.
 */
import React from 'react';
import { act, render as renderScreen, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { formatWeightEach } from '@/utils/formatters';
import { updateGRN } from '@/features/grn/services/grnFormService';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';

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
const LINES = Array.from({ length: 30 }, (_, n) => line(n));
const WEIGHTS = new Set(LINES.map((item) => item.weight));
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
// These tests are about the item list; the Rates section has its own tests (GrnReviewStepRates).
jest.mock('@/features/grn/rates/GrnRatesSection', () => ({ GrnRatesSection: () => null }));
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
// A line words its weight with formatWeightEach ("40 kg each"). That helper calls formatWeight
// inside its own module, where a stand-in for the export is not seen, so it is the one watched.
jest.mock('@/utils/formatters', () => {
  const actual = jest.requireActual('@/utils/formatters');
  return { ...actual, formatWeightEach: jest.fn(actual.formatWeightEach) };
});

// Children are stand-ins that draw what the test needs: the bottom bar's primary button, an open confirm dialog (title,
// message and its Confirm button, which calls the step's own onConfirm) and the success dialog.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(
          View,
          { accessible: true, accessibilityRole: 'alert' },
          createElement(Text, null, props.title),
          createElement(Text, null, props.message),
          createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm })
        )
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean }) =>
    props.isVisible ? require('react').createElement(require('react-native').View, { accessible: true, accessibilityLabel: 'Success dialog' }) : null,
}));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { nextLabel?: string; onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: props.nextLabel, onPress: props.onNext }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
// An icon is drawn as an empty view that carries its name, so the test can tell which icons a line shows.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: (props: { name: string }) => require('react').createElement(require('react-native').View, { testID: `icon-${props.name}` }),
}));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
import { showToast } from '@/utils/toast';
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
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


async function render(mode: 'create' | 'edit', items = LINES) {
  mockForm = {
    header: mockHeader,
    items,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  return renderScreen(<GrnReviewStep mode={mode} />);
}
/** The line weights formatted since the last clear: one per line drawn. */
const linesDrawn = () => jest.mocked(formatWeightEach).mock.calls.map(([weight]) => weight).filter((weight) => WEIGHTS.has(weight as number));
const openDialogs = () => screen.queryAllByRole('alert');
/** The step's primary button (Create GRN / Save GRN): it asks the save question. */
const pressNext = async (user: ReturnType<typeof userEvent.setup>, mode: 'create' | 'edit') => {
  await user.press(screen.getByRole('button', { name: t(mode === 'create' ? 'grn.review.createGrn' : 'grn.review.saveGrn') }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN review step lines', () => {
  it.each(['create', 'edit'] as const)('%s: opening the save dialog draws no line again', async (mode) => {
    const user = userEvent.setup({ delay: 0 });
    await render(mode);
    // Every line was drawn, and once: a line formats its weight one time, for the tag and the label.
    expect(new Set(linesDrawn())).toEqual(WEIGHTS);
    expect(linesDrawn()).toHaveLength(LINES.length);
    jest.mocked(formatWeightEach).mockClear();
    expect(openDialogs()).toHaveLength(0);

    await pressNext(user, mode);

    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(linesDrawn()).toEqual([]);
  });

  it('draws only the line that changed', async () => {
    const { rerender } = await render('create');
    jest.mocked(formatWeightEach).mockClear();

    const changed = LINES.map((item, n) => (n === 7 ? { ...item, qty: 99, stock: 99 } : item));
    mockForm = { ...mockForm, items: changed };
    await rerender(<GrnReviewStep mode="create" />);

    expect(linesDrawn()).toEqual([LINES[7].weight]);
  });
});

// A lot stores the weight of one package; the review says so and shows no total (owner's decision of 2026-10-14).
describe('GRN review step weights', () => {
  // No query lists every text in reading order, so the texts are read from the rendered tree (container.queryAll).
  const texts = () => screen.container.queryAll((node) => (node.type as unknown) === 'Text').map((node) => ([] as unknown[]).concat(node.props.children).join(''));
  const cells = () => screen.getAllByLabelText(/^Item \d+, /).map((node) => node.props.accessibilityLabel as string);
  const weightIcons = () => screen.queryAllByTestId('icon-weight-kilogram');

  it('words a line\'s weight "50 kg each" on its tag and aloud, and shows no total weight', async () => {
    await render('create', [{ ...line(1), qty: 100, stock: 100, weight: 50 }]);

    expect(screen.getByText('50 kg each')).toBeOnTheScreen();
    expect(screen.queryByText('50 kg')).not.toBeOnTheScreen();
    expect(cells()).toEqual(['Item 1, Fictional item 1, Bag, quantity 100, 50 kg each, rack R1, mark M1']);
    // 100 bags at 50 kg: no "5,000 kg" and no total weight anywhere on the step.
    expect(texts().filter((text) => /kg/i.test(text))).toEqual(['50 kg each']);
    expect(texts().some((text) => /total weight/i.test(text))).toBe(false);
    // The totals sit in the DETAILS section, which is closed when the step opens on ITEMS (so they are hidden).
    expect(screen.getByText('Total items', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Total quantity', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it.each([[0], [null], [undefined]])('shows no weight tag, and says no weight, for a line with weight %p', async (weight) => {
    await render('create', [{ ...line(1), qty: 100, stock: 100, weight: weight as unknown as number }]);

    expect(weightIcons()).toHaveLength(0);
    expect(texts().filter((text) => /kg/i.test(text))).toEqual([]);
    expect(cells()).toEqual(['Item 1, Fictional item 1, Bag, quantity 100, rack R1, mark M1']);
    // The line's other tags are still drawn.
    expect(screen.getByText('R1')).toBeOnTheScreen();
    expect(screen.getByText('M1')).toBeOnTheScreen();
  });
});

// P4-07: the server leaves the quantity of a dispatched line unchanged and reports it in stats.items_skipped_stock.
describe('GRN review step: save of an edit with lines the server did not change', () => {
  const NO_PHOTOS = { uploadedCount: 0, failed: [], removalFailures: 0 };
  // The submitted line has qty 10 (LINES[0]); the server kept 7, so the quantity really was left unchanged.
  const skipped = { grn_trl_item_id: LINES[0].grn_trl_id, item_name: 'Test Item Alpha', reason: 'Cannot update qty/stock - item has 3 units dispatched', current_qty: 7, current_stock: 7, dispatched_qty: 3 };
  afterEach(() => setLanguage('en'));

  /** Opens the save question and answers it; the save runs as far as the server's answer is handled. */
  async function saveEdit(skippedStock: unknown[]) {
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: { items_skipped_stock: skippedStock }, photos: NO_PHOTOS } });
    await render('edit');
    await answerSaveQuestion();
  }
  async function answerSaveQuestion() {
    const user = userEvent.setup({ delay: 0 });
    await pressNext(user, 'edit');
    await user.press(await screen.findByRole('button', { name: 'Confirm' }));
  }
  const toastText = () => String((showToast as jest.Mock).mock.calls.at(-1)?.[0]);
  const successShown = () => screen.queryByLabelText('Success dialog') !== null;
  const photosDialogShown = () => screen.queryByText('Photos not uploaded') !== null;
  const pressOk = async () => { await act(async () => { const asked = mockAsked[0]; asked.resolve(asked.ok); }); };
  beforeEach(() => { mockAsked.length = 0; (showToast as jest.Mock).mockClear(); });

  it('warns in its own dialog first, naming the item and its dispatched count, then shows the success dialog after OK', async () => {
    await saveEdit([skipped]);
    await waitFor(() => expect(mockAsked).toHaveLength(1));
    expect(mockAsked[0].title).toBe('Some quantities were not changed');
    const text = String(mockAsked[0].message);
    expect(text).toContain('Some quantities were not changed because those items are already dispatched');
    expect(text).toContain('• Test Item Alpha: 3 already dispatched');
    expect(text).not.toContain('Cannot update');
    expect(successShown()).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    await pressOk();
    expect(successShown()).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows the success dialog also when the warning dialog is dismissed without its button', async () => {
    await saveEdit([skipped]);
    await waitFor(() => expect(mockAsked).toHaveLength(1));
    expect(successShown()).toBe(false);
    await act(async () => { mockAsked[0].resolve(mockAsked[0].dismissed); });
    expect(successShown()).toBe(true);
  });

  it('shows "Photos not uploaded" after the warning dialog, not the success dialog, when photos also failed', async () => {
    const failedPhoto = { kind: 'header', localUri: 'file:///x.jpg', error: 'Network request failed' };
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: { items_skipped_stock: [skipped] }, photos: { uploadedCount: 0, failed: [failedPhoto], removalFailures: 0 } } });
    await render('edit');
    await answerSaveQuestion();
    await waitFor(() => expect(mockAsked).toHaveLength(1));
    expect(photosDialogShown()).toBe(false);
    expect(successShown()).toBe(false);
    await pressOk();
    expect(photosDialogShown()).toBe(true);
    expect(successShown()).toBe(false);
  });

  it('shows just the item name when the entry has no numeric dispatched count', async () => {
    await saveEdit([{ ...skipped, dispatched_qty: undefined }]);
    await waitFor(() => expect(mockAsked).toHaveLength(1));
    expect(String(mockAsked[0].message)).toMatch(/dispatched:\n• Test Item Alpha$/);
  });

  it('writes the count in Gujarati digits in Gujarati', async () => {
    setLanguage('gu');
    await saveEdit([skipped]);
    await waitFor(() => expect(mockAsked).toHaveLength(1));
    const text = String(mockAsked[0].message);
    expect(text).toContain('Test Item Alpha');
    expect(text).toContain('૩');
    expect(text).not.toMatch(/3/);
  });

  it('does not warn for a dispatched line whose quantity was not changed (the server lists every dispatched line)', async () => {
    await saveEdit([{ ...skipped, current_qty: LINES[0].qty }]);
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(mockAsked).toHaveLength(0);
    expect(toastText()).toBe('GRN A0010 saved.');
    expect(successShown()).toBe(true);
  });

  it('control: an empty skipped list gives the plain saved message', async () => {
    await saveEdit([]);
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(mockAsked).toHaveLength(0);
    expect(toastText()).toBe('GRN A0010 saved.');
  });
});
