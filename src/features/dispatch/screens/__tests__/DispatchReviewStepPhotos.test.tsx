/**
 * Photos in the dispatch review step: a photo that does not upload after the
 * dispatch is created is named, with a retry, before the success dialog. It
 * used to be logged only, and the screen reported a clean save. (The dispatch
 * twin of the GRN fix, GrnReviewStepPhotos.test.tsx.)
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { uploadDeferredDispatchImages } from '@/features/dispatch/services/dispatchImageService';
import { generateDispatchPDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const photo = (name: string) => ({ id: `temp_${name}`, file_name: `${name}.webp`, image_url: `file:///cache/${name}.webp`, upload_status: 'completed' as const });
const mockImages = [photo('truck'), photo('load'), photo('seal')];

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const mockSubmitForm = jest.fn();
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: '', note: '' },
    items: [],
    images: mockImages,
    isSaving: false,
    isLoading: false,
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

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<DispatchReviewStep mode="create" />);
  });
  return tree;
}
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never);
const photoDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title === 'Photos not uploaded')!;
const createDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title !== 'Photos not uploaded')!;
const successShown = (tree: ReactTestRenderer) => tree.root.findByType('DocumentSuccessDialog' as never).props.isVisible;
/** A dialog has finished closing (iOS `onDismissed`): what waited for it is drawn now. */
const dismissed = async (tree: ReactTestRenderer) => {
  await act(async () => { dialogs(tree).forEach((dialog) => dialog.props.onDismissed?.()); });
};
const create_ = async (tree: ReactTestRenderer) => {
  await act(async () => { await createDialog(tree).props.onConfirm(); });
  await dismissed(tree);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('shows the success dialog at once when every photo uploaded', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
  const tree = await render();
  await create_(tree);
  expect(photoDialog(tree).props.visible).toBe(false);
  expect(successShown(tree)).toBe(true);
});

it('names the photos that did not upload and holds the success dialog back', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1], mockImages[2]] });
  const tree = await render();
  await create_(tree);
  const dialog = photoDialog(tree);
  expect(dialog.props.visible).toBe(true);
  expect(dialog.props.message).toBe('Dispatch I0042 is saved, but these photos were not uploaded:\n• Photo 2\n• Photo 3');
  expect(dialog.props.dismissible).toBe(false);
  expect(successShown(tree)).toBe(false);
});

it('"Try again" uploads only the failed photos to the created dispatch', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1], mockImages[2]] });
  jest.mocked(uploadDeferredDispatchImages)
    .mockResolvedValueOnce({ success: false, uploadedCount: 1, errors: ['seal.webp: Network request failed'], failed: [mockImages[2]] })
    .mockResolvedValueOnce({ success: true, uploadedCount: 1, errors: [], failed: [] });
  const tree = await render();
  await create_(tree);

  await act(async () => { await photoDialog(tree).props.onConfirm(); });
  expect(uploadDeferredDispatchImages).toHaveBeenLastCalledWith(DISPATCH_ID, [mockImages[1], mockImages[2]]);
  // One still missing: asked again, for that photo only.
  expect(photoDialog(tree).props.visible).toBe(true);
  expect(photoDialog(tree).props.message).toContain('• Photo 3');
  expect(photoDialog(tree).props.message).not.toContain('Photo 2');
  expect(successShown(tree)).toBe(false);

  await act(async () => { await photoDialog(tree).props.onConfirm(); });
  expect(uploadDeferredDispatchImages).toHaveBeenLastCalledWith(DISPATCH_ID, [mockImages[2]]);
  expect(photoDialog(tree).props.visible).toBe(false);
  expect(successShown(tree)).toBe(true);
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);
});

it('"Continue without them" goes on to the success dialog without uploading', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[0]] });
  const tree = await render();
  await create_(tree);
  await act(async () => { photoDialog(tree).props.onCancel(); });
  expect(uploadDeferredDispatchImages).not.toHaveBeenCalled();
  // The photo dialog is closing: the success dialog waits for it (a second Modal would never show on iOS).
  expect(successShown(tree)).toBe(false);
  await dismissed(tree);
  expect(successShown(tree)).toBe(true);
});

const successDialog = (tree: ReactTestRenderer) => tree.root.findByType('DocumentSuccessDialog' as never);

describe('toasts wait for the dialog to go', () => {
  it('"Order fulfilled" is said once the success dialog is left, after the step is left', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], sourceOrderCleared: true });
    const tree = await render();
    await create_(tree);
    expect(successShown(tree)).toBe(true);
    // The dialog is a modal: a toast now would sit under it.
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => { successDialog(tree).props.onViewList(); });
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Order fulfilled and removed from the queue.');
  });

  it('"Photos uploaded" after a successful retry is said once, with the order, when the dialog is left', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1]], sourceOrderCleared: true });
    jest.mocked(uploadDeferredDispatchImages).mockResolvedValue({ success: true, uploadedCount: 1, errors: [], failed: [] });
    const tree = await render();
    await create_(tree);
    await act(async () => { await photoDialog(tree).props.onConfirm(); });
    expect(successShown(tree)).toBe(true);
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => { successDialog(tree).props.onCreateAnother(); });
    expect(router.replace).toHaveBeenCalledWith('/dispatch-form/step1');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Order fulfilled and removed from the queue. Photos uploaded.');
  });

  it('a save that cleared no order and lost no photo says nothing', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    const tree = await render();
    await create_(tree);
    await act(async () => { successDialog(tree).props.onViewList(); });
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('a failed share is said inside the success dialog', () => {
  it('shows the reason as shareError, and clears it when the next try starts', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: false } as never);
    const tree = await render();
    await create_(tree);
    expect(successDialog(tree).props.shareError).toBeNull();

    await act(async () => { await successDialog(tree).props.onSharePDF(); });
    expect(successDialog(tree).props.shareError).toBe("Couldn't create the PDF. Check your connection and try again.");
    expect(showToast).not.toHaveBeenCalled();

    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: true, pdfUrl: 'https://example.invalid/d.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: false } as never);
    await act(async () => { await successDialog(tree).props.onSharePDF(); });
    expect(successDialog(tree).props.shareError).toBe("Couldn't share the PDF. Try again.");

    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: true, pdfUrl: 'https://example.invalid/d.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: true } as never);
    await act(async () => { await successDialog(tree).props.onSharePDF(); });
    expect(successDialog(tree).props.shareError).toBeNull();
  });
});

it('the confirm dialog stays open and busy until the save answers', async () => {
  let finish!: (value: unknown) => void;
  mockSubmitForm.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const tree = await render();
  await act(async () => { tree.root.find((node) => node.props.testID === 'dispatch-review-submit' && typeof node.props.onPress === 'function').props.onPress(); });
  expect(createDialog(tree).props.visible).toBe(true);
  expect(createDialog(tree).props.busy).toBe(false);

  await act(async () => { createDialog(tree).props.onConfirm(); });
  expect(createDialog(tree).props.visible).toBe(true);
  expect(createDialog(tree).props.busy).toBe(true);
  // A second tap while it runs saves nothing twice.
  await act(async () => { createDialog(tree).props.onConfirm(); });
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);

  await act(async () => { finish({ success: false }); });
  expect(createDialog(tree).props.visible).toBe(false);
  expect(createDialog(tree).props.busy).toBe(false);
});
