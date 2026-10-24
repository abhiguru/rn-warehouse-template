/**
 * GRN Review step and the duplicate warning (backend migration 124): a GRN that looks like one created in the last 30
 * minutes comes back as `duplicate`. Nothing was saved. The person is asked "Possible duplicate" [Cancel | Save anyway]:
 * Cancel leaves the form as it was on Review; Save anyway sends the same GRN again with the warning off.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, getNextGRNNumber } from '@/features/grn/services/grnFormService';
import { checkSubmission } from '@/utils/lostAnswer';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { showAlert } from '@/utils/alert';
import { pressAlertButton } from '@/tests/helpers/alertMock';

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
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  abandonLocalPhotoUpload: jest.fn(),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

async function render(header: typeof mockHeader = mockHeader) {
  mockForm = {
    header,
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

const duplicate = {
  kind: 'grn' as const,
  existingId: '77777777-2222-4333-8444-555555555555',
  existingNumber: 'Z0010',
  createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  createdBy: 'Ravi Example',
  customerName: 'Fictional Traders',
  items: [{ itemName: 'Example Potatoes', packaging: 'Bag' }],
  windowMinutes: 30,
};
const refusedAsDuplicate = { success: false, error: 'GRN Z0010 ...', duplicate };
const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
const questions = () => (showAlert as jest.Mock).mock.calls.filter(([title]) => title === 'Possible duplicate') as [string, string, { text: string }[]][];

describe('a GRN that looks like one created a moment ago', () => {
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

  it('asks "Possible duplicate" with the earlier GRN, and does not show the saved dialog', async () => {
    (createGRN as jest.Mock).mockResolvedValue(refusedAsDuplicate);
    const tree = await render();

    await save(tree);

    expect(createGRN).toHaveBeenCalledTimes(1);
    expect(questions()).toHaveLength(1);
    const [, message, buttons] = questions()[0];
    expect(message).toBe(
      'GRN Z0010 for Fictional Traders was created 3 minutes ago by Ravi Example with the same items (Example Potatoes · Bag). Save this as a new GRN anyway?'
    );
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Save anyway']);
    expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('the first save asks for the check (no override)', async () => {
    (createGRN as jest.Mock).mockResolvedValue(refusedAsDuplicate);
    const tree = await render();

    await save(tree);

    expect((createGRN as jest.Mock).mock.calls[0][0].warnDuplicate).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('Save anyway sends the same GRN again with the warning off, and its success is shown', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(refusedAsDuplicate).mockResolvedValueOnce(created);
    const tree = await render();
    await save(tree);

    await act(async () => { pressAlertButton(showAlert as never, 'Save anyway'); });

    expect(createGRN).toHaveBeenCalledTimes(2);
    const [first, second] = (createGRN as jest.Mock).mock.calls.map(([payload]) => payload);
    expect(second.warnDuplicate).toBe(false);
    // The same GRN: the same number, lines and the form's id.
    expect(second.header.gr_no).toBe(first.header.gr_no);
    expect(second.items).toEqual(first.items);
    expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('Save anyway repeats the same GRN: the number the first attempt fetched and its form id, not new ones', async () => {
    // The form had no number: the first attempt fetches one and makes the form's id. This render's header and nonce still
    // say "none" (the store is read at the next render), and the second attempt must not fetch another number or make
    // another id.
    (getNextGRNNumber as jest.Mock).mockResolvedValueOnce('Z0011').mockResolvedValueOnce('Z0012');
    (createGRN as jest.Mock).mockResolvedValueOnce(refusedAsDuplicate).mockResolvedValueOnce(created);
    const tree = await render({ ...mockHeader, gr_no: '' });
    await save(tree);

    await act(async () => { pressAlertButton(showAlert as never, 'Save anyway'); });

    expect(getNextGRNNumber).toHaveBeenCalledTimes(1);
    const [first, second] = (createGRN as jest.Mock).mock.calls.map(([payload]) => payload);
    expect(first.header.gr_no).toBe('Z0011');
    expect(second.header.gr_no).toBe('Z0011');
    expect(typeof first.nonce).toBe('string');
    expect(second.nonce).toBe(first.nonce);
    expect(first.warnDuplicate).toBe(true);
    expect(second.warnDuplicate).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('Save anyway sends nothing until the question\'s dialog has finished closing (iOS cannot open a Modal over one that is closing)', async () => {
    const alertModule = require('@/utils/alert');
    const original = alertModule.whenAlertsClosed;
    let closed!: () => void;
    alertModule.whenAlertsClosed = () => new Promise<void>((resolve) => { closed = resolve; });
    try {
      (createGRN as jest.Mock).mockResolvedValueOnce(refusedAsDuplicate).mockResolvedValueOnce(created);
      const tree = await render();
      await save(tree);

      await act(async () => { pressAlertButton(showAlert as never, 'Save anyway'); });
      expect(createGRN).toHaveBeenCalledTimes(1);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);

      await act(async () => { closed(); });
      expect(createGRN).toHaveBeenCalledTimes(2);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    } finally {
      alertModule.whenAlertsClosed = original;
    }
  });

  it('Cancel leaves the form as it was on Review: nothing is sent, and Create can be tried again', async () => {
    (createGRN as jest.Mock).mockResolvedValue(refusedAsDuplicate);
    const tree = await render();
    await save(tree);

    await act(async () => { pressAlertButton(showAlert as never, 'Cancel'); });

    expect(createGRN).toHaveBeenCalledTimes(1);
    expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
    // The busy flag is down: Create works, and asks the server again with the warning on.
    expect(one(tree, 'WizardBottomBar').props.isLoading).toBe(false);
    await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
    await act(async () => { void saveDialog(tree).props.onConfirm(); });
    expect(createGRN).toHaveBeenCalledTimes(2);
    expect((createGRN as jest.Mock).mock.calls[1][0].warnDuplicate).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('a refusal of the second send is told like any refusal, without a second warning', async () => {
    (createGRN as jest.Mock)
      .mockResolvedValueOnce(refusedAsDuplicate)
      .mockResolvedValueOnce({ success: false, error: 'This business is deactivated. Activate it in Customers to receive new goods.' });
    const tree = await render();
    await save(tree);

    await act(async () => { pressAlertButton(showAlert as never, 'Save anyway'); });

    expect(questions()).toHaveLength(1);
    expect(showAlert).toHaveBeenLastCalledWith(expect.any(String), expect.stringContaining('deactivated'));
    await act(async () => { tree.unmount(); });
  });

  it('the warning also answers a send that was repeated after a lost answer', async () => {
    const key = 'warehouse-grn-key-1';
    (createGRN as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: '', lostAnswer: { key, sentAt: Date.now() - 20_000, args: {} } })
      .mockResolvedValueOnce(refusedAsDuplicate);
    (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
    const tree = await render();

    await save(tree);

    expect(createGRN).toHaveBeenCalledTimes(2);
    expect((createGRN as jest.Mock).mock.calls[1][0].resend).toEqual({ key, sentAt: expect.any(Number), args: {} });
    expect(questions()).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });
});
