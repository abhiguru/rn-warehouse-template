/**
 * GRN Review step and the facility's numbering (WS-8, backend migration 127):
 * - a create refused with NUMBER_FORMAT says which format the number must follow, flags the number on step 1 and
 *   takes the person there (nothing was saved);
 * - a form with no number, when the rule offers none to fill in (free text, a full series), is not sent: the person is
 *   asked to type the number.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, getNextGRNNumber } from '@/features/grn/services/grnFormService';
import { checkSubmission } from '@/utils/lostAnswer';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
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

async function render() {
  mockForm = {
    header: mockHeader,
    items: mockItems,
    grnId: null,
    tempGrnId: 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: true,
    resetFormState: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnReviewStep mode="create" />);
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


const formatRefusal = { reason: 'NUMBER_FORMAT', fields: { number: 'Q-1', document_type: 'grn', pattern: 'A####' }, text: 'x' };
const alerts = () => jest.mocked(showAlert).mock.calls;

describe('a GRN number outside the facility\'s numbering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemovedImages = [];
    mockNonce = null;
    mockNumberTyped = true;
    mockOffline = false;
    (unpreparedGRNPhotos as jest.Mock).mockReturnValue(null);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('is refused in words that name the format, and the number is flagged', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({ success: false, error: 'x', refusal: formatRefusal });
    const tree = await render();

    await save(tree);

    const message = "This number does not follow this facility's numbering (A####).";
    expect(createGRN).toHaveBeenCalledTimes(1);
    expect(alerts().at(-1)).toEqual([expect.any(String), message, [expect.objectContaining({ text: 'OK' })]]);
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringContaining('setTakenNumberError'), payload: message }));
    // Nothing is replaced by a next number: the person changes it.
    expect(getNextGRNNumber).not.toHaveBeenCalled();
  });

  it('is not sent with no number when the rule offers none; the person is asked to type one', async () => {
    mockNumberTyped = false;
    (getNextGRNNumber as jest.Mock).mockResolvedValueOnce('');
    const tree = await render();
    mockForm.header = { ...mockHeader, gr_no: '' };
    await act(async () => { tree.update(<GrnReviewStep mode="create" />); });

    await save(tree);

    expect(createGRN).not.toHaveBeenCalled();
    expect(alerts().at(-1)?.[1]).toBe('No GRN number is offered. Type the GRN number.');
  });
});
