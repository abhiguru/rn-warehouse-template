/**
 * GRN Review step: small behaviours of the batch of 2026-10-31 (staff notice for items without a rate, the section the
 * step opens on, the success dialog's total, the server's refusals for the date and the number).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, getNextGRNNumber, updateGRN } from '@/features/grn/services/grnFormService';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { getGrnItemRates } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
let mockNonce: string | null = null;
let mockNumberTyped = false;
let mockOffline = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      theme: { preference: 'light', brand: 'orange' },
      grnForm: { items: [], removedImages: mockRemovedImages, submissionNonce: mockNonce, grNoTyped: mockNumberTyped },
    }),
}));
// The server is asked about the request code by this (utils/lostAnswer); the tests say what it answers and when. The
// strip shown while a lost answer is checked reads the connection with the same online test the wait uses.
jest.mock('@/utils/lostAnswer', () => ({
  checkSubmission: jest.fn(),
  waitForServer: jest.fn(),
  isLostAnswer: jest.fn(),
  useIsDisconnected: () => mockOffline,
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
const mockItems = [
  { grn_trl_id: '55555555-2222-4333-8444-555555555555', item_table_id: 'i1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '', trl_images: [] },
];
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn() }));
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
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
// The notes of unfinished creates (src/services/unfinishedSaves.ts): this test reads what the screen does with them.
jest.mock('@/services/unfinishedSaves', () => ({
  forgetUnfinishedSave: jest.fn(async () => {}),
  releaseUnfinishedSave: jest.fn(),
  rememberUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  abandonLocalPhotoUpload: jest.fn(),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

async function render(mode: 'create' | 'edit' = 'create', header: Record<string, unknown> = mockHeader) {
  mockForm = {
    header,
    items: mockItems,
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

const one = (tree: ReactTestRenderer, type: string) => tree.root.findByType(type as never);
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never);
const photoDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title === 'Photos not uploaded')!;
const saveDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title !== 'Photos not uploaded')!;

/**
 * Press Create in the bottom bar, then confirm the "save this GRN?" question. The confirm's handler runs until the person
 * has answered the duplicate warning, so it is not awaited here.
 */
async function save(tree: ReactTestRenderer) {
  await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
  await act(async () => { void saveDialog(tree).props.onConfirm(); });
}



const alerts = () => jest.mocked(showAlert).mock.calls;
const successData = (tree: ReactTestRenderer) => one(tree, 'DocumentSuccessDialog').props.documentData;

beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  mockNonce = null;
  mockNumberTyped = true;
  mockOffline = false;
  (unpreparedGRNPhotos as jest.Mock).mockReturnValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('staff and an item with no rate (owner decision D11)', () => {
  const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { failed: [], removalFailures: 0 } } };

  it('saves, then tells staff which items have no rate yet', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(created);
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({
      rates: [
        { item_name: 'Example Potatoes', source: null },
        { item_name: 'Example Onions', source: 'item' },
        { item_name: 'Example Potatoes', source: null },
      ],
    });
    const tree = await render();

    await save(tree);

    expect(getGrnItemRates).toHaveBeenCalledWith(GRN_ID);
    expect(successData(tree).notices).toEqual(['No rate yet for Example Potatoes. An administrator adds it before invoicing.']);
  });

  it('says nothing when every item has a rate, or when the rates cannot be read', async () => {
    (createGRN as jest.Mock).mockResolvedValue(created);
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({ rates: [{ item_name: 'Example Potatoes', source: 'item' }] });
    let tree = await render();
    await save(tree);
    expect(successData(tree).notices).toBeUndefined();

    (getGrnItemRates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    tree = await render();
    await save(tree);
    expect(successData(tree).notices).toBeUndefined();
  });
});

describe('the server\'s refusals for the date and the number (migration 130)', () => {
  it('words a date in the future in the app\'s text and takes the person to step 1', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_DATE_FUTURE', fields: { date: '2026-12-01', today: '2026-10-31' }, text: 'x' },
    });
    const tree = await render();
    await save(tree);
    expect(alerts().at(-1)).toEqual([expect.any(String), "A GRN can't be dated in the future. Today is 31/10/26.", [expect.objectContaining({ text: 'OK' })]]);
  });

  it('words a number with a space', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_NUMBER_SPACES', fields: { gr_no: 'A 1' }, text: 'x' },
    });
    const tree = await render();
    await save(tree);
    expect(alerts().at(-1)?.[1]).toBe("A GRN number can't contain spaces.");
  });
});

describe('an edit refused for the last photo (migration 130)', () => {
  it('says a GRN needs at least one photo', async () => {
    (updateGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_PHOTO_REQUIRED', fields: { gr_no: 'A0010' }, text: 'x' },
    });
    const tree = await render('edit');
    await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
    await act(async () => { await saveDialog(tree).props.onConfirm(); });
    expect(alerts().at(-1)?.[1]).toBe('A GRN needs at least one photo. Add another before deleting this one.');
  });
});

describe('the success dialog', () => {
  it('carries the total quantity saved (created)', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { failed: [], removalFailures: 0 } } });
    const tree = await render();
    await save(tree);
    expect(successData(tree)).toMatchObject({ itemCount: 1, totalQuantity: 10 });
  });
});

describe('the section the step opens on', () => {
  // No Rates section here: the fixture's role cannot set rates.
  const SECTIONS = ['details', 'photos', 'items'] as const;
  const body = (tree: ReactTestRenderer, section: string) => tree.root.find((n) => n.props.testID === `grn-review-body-${section}` && typeof n.type === 'string');
  const openOnes = (tree: ReactTestRenderer) =>
    SECTIONS.filter((section) => [body(tree, section).props.style].flat(Infinity).every((st: any) => st?.display !== 'none'));
  const noPhotos = { ...mockHeader, gr_images: [] };

  it('is the GRN photos on a new GRN that has no photo yet', async () => {
    expect(openOnes(await render('create', noPhotos))).toEqual(['photos']);
  });

  it('is the items once a photo is attached, and on an edit', async () => {
    expect(openOnes(await render('create'))).toEqual(['items']);
    expect(openOnes(await render('edit', noPhotos))).toEqual(['items']);
  });
});
