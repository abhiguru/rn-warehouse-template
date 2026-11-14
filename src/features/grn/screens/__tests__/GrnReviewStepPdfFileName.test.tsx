/**
 * WH-185: after a GRN is created, Share PDF names the file with the whole number ("GRN/23-24/0042" gives
 * "GRN_GRN_23-24_0042.pdf"). The real step runs its real save and share handlers; only the server calls (create, PDF)
 * and the share call are faked.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN } from '@/features/grn/services/grnFormService';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { generateGRNPDF } from '@/services/pdf-service';
import { nameCases, expectSafeNames } from '@/tests/helpers/pdfFileNames';

const GRN_ID = '11111111-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      theme: { preference: 'light', brand: 'orange' },
      grnForm: { items: [], removedImages: [], submissionNonce: null, grNoTyped: false },
    }),
}));
jest.mock('@/utils/lostAnswer', () => ({
  checkSubmission: jest.fn(),
  waitForServer: jest.fn(),
  isLostAnswer: jest.fn(),
  useIsDisconnected: () => false,
}));

const mockHeader = {
  gr_no: 'GRN/23-24/0042',
  date: '2026-10-01',
  sender_name: 'Fictional Sender',
  customer_name: 'Fictional Traders',
  supervisor_name: 'Fictional Supervisor',
  registration: '',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [
    { id: 'aaaaaaaa-2222-4333-8444-555555555555', fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' },
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

const one = (tree: ReactTestRenderer, type: string) => tree.root.findByType(type as never);

/** Create the GRN for real (Create, confirm the question), the server answers with `grNo`; then press Share PDF. */
const createAndShare = async (grNo: string) => {
  mockForm = {
    header: { ...mockHeader, gr_no: grNo },
    items: mockItems,
    grnId: null,
    tempGrnId: 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: true,
    resetFormState: jest.fn(),
  };
  jest.mocked(createGRN).mockResolvedValue({ success: true, data: { id: GRN_ID, gr_no: grNo, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } } as never);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GrnReviewStep mode="create" />); });
  await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
  const saveDialog = tree.root.findAllByType('ConfirmDialog' as never).find((dialog) => dialog.props.title !== 'Photos not uploaded')!;
  await act(async () => { await saveDialog.props.onConfirm(); });
  const success = one(tree, 'DocumentSuccessDialog');
  expect(success.props.isVisible).toBe(true);
  await act(async () => { await success.props.onSharePDF(); });
  await act(async () => { tree.unmount(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(unpreparedGRNPhotos).mockReturnValue(null);
  jest.mocked(generateGRNPDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.invalid/doc.pdf' } as never);
  jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: true } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN review step: the PDF file name', () => {
  it.each(nameCases('GRN'))('$label gives the whole number in the name', async ({ number, expected }) => {
    await createAndShare(number);
    expect(generateGRNPDF).toHaveBeenCalledWith(number);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith('https://example.invalid/doc.pdf', expected);
  });

  it('two GRNs of different years get different names, and every name is a safe file name', async () => {
    const [first, second] = nameCases('GRN');
    await createAndShare(first.number);
    await createAndShare(second.number);
    const names = jest.mocked(downloadAndSharePDF).mock.calls.map((call) => call[1] as string);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expectSafeNames(names);
  });
});
