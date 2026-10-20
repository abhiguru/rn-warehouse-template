/**
 * The GRN review step's item list: each line is a memoized cell, so a dialog
 * opening on the step, or one line changing, does not draw every line again
 * (review finding P2F-UI-1). The list stays a plain ScrollView.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { formatWeightEach } from '@/utils/formatters';
import { updateGRN } from '@/features/grn/services/grnFormService';
import { setLanguage } from '@/i18n/language';

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

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
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
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnReviewStep mode={mode} />);
  });
  return tree;
}
/** The line weights formatted since the last clear: one per line drawn. */
const linesDrawn = () => jest.mocked(formatWeightEach).mock.calls.map(([weight]) => weight).filter((weight) => WEIGHTS.has(weight as number));
const visibleDialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never).filter((dialog) => dialog.props.visible);

beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN review step lines', () => {
  it.each(['create', 'edit'] as const)('%s: opening the save dialog draws no line again', async (mode) => {
    const tree = await render(mode);
    // Every line was drawn, and once: a line formats its weight one time, for the tag and the label.
    expect(new Set(linesDrawn())).toEqual(WEIGHTS);
    expect(linesDrawn()).toHaveLength(LINES.length);
    jest.mocked(formatWeightEach).mockClear();
    expect(visibleDialogs(tree)).toHaveLength(0);

    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });

    expect(visibleDialogs(tree)).toHaveLength(1);
    expect(linesDrawn()).toEqual([]);
    await act(async () => { tree.unmount(); });
  });

  it('draws only the line that changed', async () => {
    const tree = await render('create');
    jest.mocked(formatWeightEach).mockClear();

    const changed = LINES.map((item, n) => (n === 7 ? { ...item, qty: 99, stock: 99 } : item));
    mockForm = { ...mockForm, items: changed };
    await act(async () => { tree.update(<GrnReviewStep mode="create" />); });

    expect(linesDrawn()).toEqual([LINES[7].weight]);
    await act(async () => { tree.unmount(); });
  });
});

// A lot stores the weight of one package; the review says so and shows no total (owner's decision of 2026-10-14).
describe('GRN review step weights', () => {
  const texts = (tree: ReactTestRenderer) =>
    tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => ([] as unknown[]).concat(node.props.children).join(''));
  const cells = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((node) => typeof node.type === 'string' && node.props.accessible === true && /^Item \d+, /.test(String(node.props.accessibilityLabel)))
      .map((node) => node.props.accessibilityLabel as string);
  const weightIcons = (tree: ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === 'Icon' && node.props.name === 'weight-kilogram');

  it('words a line\'s weight "50 kg each" on its tag and aloud, and shows no total weight', async () => {
    const tree = await render('create', [{ ...line(1), qty: 100, stock: 100, weight: 50 }]);

    expect(texts(tree)).toContain('50 kg each');
    expect(texts(tree)).not.toContain('50 kg');
    expect(cells(tree)).toEqual(['Item 1, Fictional item 1, Bag, quantity 100, 50 kg each, rack R1, mark M1']);
    // 100 bags at 50 kg: no "5,000 kg" and no total weight anywhere on the step.
    expect(texts(tree).filter((text) => /kg/i.test(text))).toEqual(['50 kg each']);
    expect(texts(tree).some((text) => /total weight/i.test(text))).toBe(false);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Total items', 'Total quantity']));
    await act(async () => { tree.unmount(); });
  });

  it.each([[0], [null], [undefined]])('shows no weight tag, and says no weight, for a line with weight %p', async (weight) => {
    const tree = await render('create', [{ ...line(1), qty: 100, stock: 100, weight: weight as unknown as number }]);

    expect(weightIcons(tree)).toHaveLength(0);
    expect(texts(tree).filter((text) => /kg/i.test(text))).toEqual([]);
    expect(cells(tree)).toEqual(['Item 1, Fictional item 1, Bag, quantity 100, rack R1, mark M1']);
    // The line's other tags are still drawn.
    expect(texts(tree)).toEqual(expect.arrayContaining(['Rack R1', 'Mark M1']));
    await act(async () => { tree.unmount(); });
  });
});

// P4-07: the server leaves the quantity of a dispatched line unchanged and reports it in stats.items_skipped_stock.
describe('GRN review step: save of an edit with lines the server did not change', () => {
  const NO_PHOTOS = { uploadedCount: 0, failed: [], removalFailures: 0 };
  // The submitted line has qty 10 (LINES[0]); the server kept 7, so the quantity really was left unchanged.
  const skipped = { grn_trl_item_id: LINES[0].grn_trl_id, item_name: 'Test Item Alpha', reason: 'Cannot update qty/stock - item has 3 units dispatched', current_qty: 7, current_stock: 7, dispatched_qty: 3 };
  afterEach(() => setLanguage('en'));

  async function saveEdit(skippedStock: unknown[]) {
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: { items_skipped_stock: skippedStock }, photos: NO_PHOTOS } });
    const tree = await render('edit');
    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    await act(async () => { await visibleDialogs(tree)[0].props.onConfirm(); });
    return tree;
  }
  const snackbarText = (tree: ReactTestRenderer) => String(tree.root.findByType('Snackbar' as never).props.children.props.children);
  const successShown = (tree: ReactTestRenderer) => tree.root.findByType('DocumentSuccessDialog' as never).props.isVisible;
  const photosDialogShown = (tree: ReactTestRenderer) => visibleDialogs(tree).some((dialog) => dialog.props.title === 'Photos not uploaded');
  const pressOk = async () => { await act(async () => { const asked = mockAsked[0]; asked.resolve(asked.ok); }); };
  beforeEach(() => { mockAsked.length = 0; });

  it('warns in its own dialog first, naming the item and its dispatched count, then shows the success dialog after OK', async () => {
    const tree = await saveEdit([skipped]);
    expect(mockAsked).toHaveLength(1);
    expect(mockAsked[0].title).toBe('Some quantities were not changed');
    const text = String(mockAsked[0].message);
    expect(text).toContain('Some quantities were not changed because those items are already dispatched');
    expect(text).toContain('• Test Item Alpha: 3 already dispatched');
    expect(text).not.toContain('Cannot update');
    expect(successShown(tree)).toBe(false);
    expect(tree.root.findByType('Snackbar' as never).props.visible).toBe(false);
    await pressOk();
    expect(successShown(tree)).toBe(true);
    expect(tree.root.findByType('Snackbar' as never).props.visible).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('shows the success dialog also when the warning dialog is dismissed without its button', async () => {
    const tree = await saveEdit([skipped]);
    expect(successShown(tree)).toBe(false);
    await act(async () => { mockAsked[0].resolve(mockAsked[0].dismissed); });
    expect(successShown(tree)).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('shows "Photos not uploaded" after the warning dialog, not the success dialog, when photos also failed', async () => {
    const failedPhoto = { kind: 'header', localUri: 'file:///x.jpg', error: 'Network request failed' };
    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: 'grn-1', message: 'ok', stats: { items_skipped_stock: [skipped] }, photos: { uploadedCount: 0, failed: [failedPhoto], removalFailures: 0 } } });
    const tree = await render('edit');
    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    await act(async () => { await visibleDialogs(tree)[0].props.onConfirm(); });
    expect(mockAsked).toHaveLength(1);
    expect(photosDialogShown(tree)).toBe(false);
    expect(successShown(tree)).toBe(false);
    await pressOk();
    expect(photosDialogShown(tree)).toBe(true);
    expect(successShown(tree)).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('shows just the item name when the entry has no numeric dispatched count', async () => {
    const tree = await saveEdit([{ ...skipped, dispatched_qty: undefined }]);
    expect(String(mockAsked[0].message)).toMatch(/dispatched:\n• Test Item Alpha$/);
    await act(async () => { tree.unmount(); });
  });

  it('writes the count in Gujarati digits in Gujarati', async () => {
    setLanguage('gu');
    const tree = await saveEdit([skipped]);
    const text = String(mockAsked[0].message);
    expect(text).toContain('Test Item Alpha');
    expect(text).toContain('૩');
    expect(text).not.toMatch(/3/);
    await act(async () => { tree.unmount(); });
  });

  it('does not warn for a dispatched line whose quantity was not changed (the server lists every dispatched line)', async () => {
    const tree = await saveEdit([{ ...skipped, current_qty: LINES[0].qty }]);
    expect(mockAsked).toHaveLength(0);
    expect(snackbarText(tree)).toBe('GRN A0010 saved.');
    expect(successShown(tree)).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('control: an empty skipped list gives the plain saved message', async () => {
    const tree = await saveEdit([]);
    expect(mockAsked).toHaveLength(0);
    expect(snackbarText(tree)).toBe('GRN A0010 saved.');
    await act(async () => { tree.unmount(); });
  });
});
