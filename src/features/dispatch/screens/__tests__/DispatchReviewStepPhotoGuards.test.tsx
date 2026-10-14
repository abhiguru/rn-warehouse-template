/**
 * Dispatch review step, photos: Create is held while a photo is still being prepared or
 * its preparation failed (the raw camera file is never uploaded), and 'Continue without
 * photos' gives the failed photos up so their files on the phone go.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { uploadDeferredDispatchImages } from '@/features/dispatch/services/dispatchImageService';
import { showAlert } from '@/utils/alert';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';

const mockSubmitForm = jest.fn();
let mockImages: Array<Record<string, unknown>> = [];

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
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
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  unpreparedDispatchPhotos: jest.requireActual('@/features/dispatch/services/dispatchImageService').unpreparedDispatchPhotos,
  uploadDeferredDispatchImages: jest.fn(),
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({ releaseLocalPhotos: jest.fn(async () => 0), abandonLocalPhotoUpload: jest.fn() }));

let tree: ReactTestRenderer;
const photo = (id: string, status: string) => ({ id, file_name: `${id}.webp`, image_url: `file:///cache/${id}.webp`, upload_status: status });
const confirmDialogs = () => tree.root.findAllByType('ConfirmDialog' as never);
const render = async () => { await act(async () => { tree = create(<DispatchReviewStep mode="create" />); }); };
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');
const pressCreate = async () => {
  const button = tree.root.findAll(
    (node) => typeof node.props.onPress === 'function' && textOf(node) === 'Create dispatch'
  )[0];
  await act(async () => { button.props.onPress(); });
};

beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { await act(async () => tree.unmount()); });

it('holds Create while a photo is still being prepared, and opens no confirm dialog', async () => {
  mockImages = [photo('temp_a', 'completed'), photo('temp_b', 'uploading')];
  await render();
  await pressCreate();
  expect(showAlert).toHaveBeenCalledWith('Photos are still being prepared', 'Wait a moment for the photos to finish, then save again.');
  expect(confirmDialogs()[0].props.visible).toBe(false);
});

it('holds Create for a photo whose preparation failed (an over-size file is not sent)', async () => {
  mockImages = [photo('temp_a', 'completed'), photo('temp_b', 'failed')];
  await render();
  await pressCreate();
  expect(showAlert).toHaveBeenCalledWith("A photo couldn't be prepared", 'Remove the photo marked as failed, or add it again, then save.');
  expect(confirmDialogs()[0].props.visible).toBe(false);
});

it('opens the confirm dialog when every photo is prepared', async () => {
  mockImages = [photo('temp_a', 'completed')];
  await render();
  await pressCreate();
  expect(showAlert).not.toHaveBeenCalled();
  expect(confirmDialogs()[0].props.visible).toBe(true);
});

it('Continue without photos abandons the failed uploads and releases their files', async () => {
  const failed = [photo('temp_a', 'completed'), photo('temp_b', 'completed')];
  mockImages = failed;
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: 'd1', failedPhotos: failed });
  await render();
  await pressCreate();
  await act(async () => { confirmDialogs()[0].props.onConfirm(); });
  await act(async () => { await Promise.resolve(); });
  const dialog = confirmDialogs()[1];
  expect(dialog.props.visible).toBe(true);
  expect(releaseLocalPhotos).not.toHaveBeenCalled();
  await act(async () => { dialog.props.onCancel(); });
  expect(abandonLocalPhotoUpload).toHaveBeenCalledWith('file:///cache/temp_a.webp');
  expect(abandonLocalPhotoUpload).toHaveBeenCalledWith('file:///cache/temp_b.webp');
  expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/temp_a.webp', 'file:///cache/temp_b.webp']);
  expect(uploadDeferredDispatchImages).not.toHaveBeenCalled();
});
