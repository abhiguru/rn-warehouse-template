/**
 * GRN Review step and the unfinished-save notes (src/services/unfinishedSaves.ts):
 * - the identical request refused for the number twice after a lost answer ends with "may already have been saved": the
 *   person is told to check the list, so the note is removed;
 * - the person leaving while the lost answer is checked gives the note up (`releaseUnfinishedSave`): it stays stored and a
 *   later sign-in or start of the app may settle it;
 * - the stored answer found by the check settles the note.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN } from '@/features/grn/services/grnFormService';
import { checkSubmission } from '@/utils/lostAnswer';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { showAlert } from '@/utils/alert';
import { forgetUnfinishedSave, releaseUnfinishedSave } from '@/services/unfinishedSaves';

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

const KEY = 'warehouse-grn-key-1';
const lost = { success: false, error: '', lostAnswer: { key: KEY, sentAt: Date.now() - 20_000, args: {} } };
const takenOnResend = { success: false, error: 'GRN number already exists: A0010', numberTaken: { number: 'A0010' }, lostAnswer: { key: KEY, sentAt: Date.now(), args: {} } };

describe('the unfinished-save note of a GRN create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemovedImages = [];
    mockNonce = null;
    mockNumberTyped = false;
    mockOffline = false;
    (checkSubmission as jest.Mock).mockReset();
    (unpreparedGRNPhotos as jest.Mock).mockReturnValue(null);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('is removed when the number is refused twice after a lost answer and the person is told to check the list', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(takenOnResend).mockResolvedValueOnce(takenOnResend);
    (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
    const tree = await render();

    await save(tree);

    expect(createGRN).toHaveBeenCalledTimes(3);
    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
    expect(releaseUnfinishedSave).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenLastCalledWith(expect.any(String), expect.stringContaining('A0010'), expect.any(Array), { cancelable: false });
    await act(async () => { tree.unmount(); });
  });

  it('is handed back when the person leaves while the lost answer is checked', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(lost);
    (checkSubmission as jest.Mock).mockImplementation(
      (_key: string, _sentAt: number, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
        })
    );
    const tree = await render();
    await save(tree);
    // The check is running: the X leaves, after its warning.
    expect(one(tree, 'GRNStepIndicator').props.leaveWarning).toBeDefined();

    await act(async () => { one(tree, 'GRNStepIndicator').props.onCancel(); });

    expect(releaseUnfinishedSave).toHaveBeenCalledWith(KEY);
    expect(forgetUnfinishedSave).not.toHaveBeenCalled();
    expect(createGRN).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it('is removed when the check finds the stored answer', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    (checkSubmission as jest.Mock).mockResolvedValue({ found: true, response: { success: true } });
    const tree = await render();

    await save(tree);

    expect(forgetUnfinishedSave).toHaveBeenCalledWith(KEY);
    expect(releaseUnfinishedSave).not.toHaveBeenCalled();
    expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
    await act(async () => { tree.unmount(); });
  });
});
