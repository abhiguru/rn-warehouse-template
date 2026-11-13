/**
 * WH-185: after a dispatch is created, Share PDF names the file with the whole number ("DSP/23-24/0042" gives
 * "Dispatch_DSP-23-24-0042.pdf"). The real step runs its real save and share handlers; only the form's save call,
 * the PDF service and the share call are faked.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { generateDispatchPDF } from '@/services/pdf-service';
import { nameCases, expectSafeNames } from '@/tests/helpers/pdfFileNames';

let mockDispNo = 'DSP/23-24/0042';
const mockSubmitForm = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: mockDispNo, disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: '', note: '' },
    items: [],
    images: [],
    isSaving: false,
    isCheckingAnswer: false,
    isCreateMode: true,
    dispatchId: null,
    submitForm: mockSubmitForm,
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));

// Children are stand-ins that keep their props, so the test can read and press them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({
  DispatchStepIndicator: (props: object) => require('react').createElement('DispatchStepIndicator', props),
  dispatchSteps: () => [],
}));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: 'LostAnswerStrip' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const submitButton = (tree: ReactTestRenderer) =>
  tree.root.find((n) => n.props.testID === 'dispatch-review-submit' && typeof n.props.onPress === 'function');

/** Create the dispatch for real (Create, confirm), then press Share PDF on the success dialog. */
const createAndShare = async (dispNo: string) => {
  mockDispNo = dispNo;
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: '88888888-2222-4333-8444-555555555555', orderLinesLeft: null, failedPhotos: [] });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<DispatchReviewStep mode="create" />); });
  await act(async () => { submitButton(tree).props.onPress(); });
  await act(async () => { await tree.root.findAllByType('ConfirmDialog' as never)[0].props.onConfirm(); });
  const success = tree.root.findByType('DocumentSuccessDialog' as never);
  expect(success.props.isVisible).toBe(true);
  await act(async () => { await success.props.onSharePDF(); });
  await act(async () => { tree.unmount(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(generateDispatchPDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.invalid/doc.pdf' } as never);
  jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: true } as never);
});
afterEach(() => jest.restoreAllMocks());

describe('Dispatch review step: the PDF file name', () => {
  it.each(nameCases('Dispatch'))('$label gives the whole number in the name', async ({ number, expected }) => {
    await createAndShare(number);
    expect(generateDispatchPDF).toHaveBeenCalledWith(number);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith('https://example.invalid/doc.pdf', expected);
  });

  it('two dispatches of different years get different names, and every name is a safe file name', async () => {
    const [first, second] = nameCases('Dispatch');
    await createAndShare(first.number);
    await createAndShare(second.number);
    const names = jest.mocked(downloadAndSharePDF).mock.calls.map((call) => call[1] as string);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expectSafeNames(names);
  });
});
