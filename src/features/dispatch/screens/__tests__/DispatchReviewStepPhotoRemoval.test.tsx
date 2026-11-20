/**
 * Removing an uploaded photo in the dispatch review step: when the server refuses or the
 * request fails, the photo stays in the form and the reason is shown. It used to be
 * dropped from the form although it was still on the dispatch, and nothing was said.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { deleteDispatchImage } from '@/features/dispatch/services/dispatchImageService';
import { showAlert } from '@/utils/alert';
import { releaseLocalPhotos } from '@/utils/localPhotoFiles';

const mockRemoveImageFromForm = jest.fn();
const mockGrnRemoveFromServer = jest.fn();
const mockImages = [
  { id: 'image-1', file_name: 'truck.webp', image_url: 'https://files.example/truck', upload_status: 'completed' as const, storage_path: 'd1/truck.webp' },
  { id: 'temp_load', file_name: 'load.webp', image_url: 'file:///cache/load.webp', upload_status: 'pending' as const },
];

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
    submitForm: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: mockRemoveImageFromForm,
    validationErrors: {},
  }),
}));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
// A stand-in grid: a Remove button per photo. Like the real grid, a saved photo is deleted on the server through the
// GRN photo call unless `removeFromServer` is false; then it calls `onRemoveImage` (the real one asks first).
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({
  ImagePreviewGrid: (props: {
    imageData: Array<{ id: string; fileName: string; uploadStatus: string }>;
    onRemoveImage: (id: string) => Promise<void>;
    removeFromServer?: boolean;
  }) => {
    const { Pressable } = require('react-native');
    const removeFromServer = props.removeFromServer ?? true;
    return props.imageData.map((image) => (
      <Pressable
        key={image.id}
        role="button"
        accessibilityLabel={`Remove ${image.fileName}`}
        onPress={async () => {
          if (removeFromServer && image.uploadStatus === 'completed') mockGrnRemoveFromServer(image.id);
          await props.onRemoveImage(image.id);
        }}
      />
    ));
  },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
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
jest.mock('@/utils/localPhotoFiles', () => ({ releaseLocalPhotos: jest.fn(async () => 0) }));

const remove = async (fileName: string) => {
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: `Remove ${fileName}` }));
};

beforeEach(async () => {
  jest.clearAllMocks();
  await render(<DispatchReviewStep mode="create" />);
  // The photos sit in a section that starts closed.
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Photos, 2, 2 photos' }));
});

it('leaves the grid to this screen: the grid does not call the GRN photo RPC for a dispatch photo', async () => {
  jest.mocked(deleteDispatchImage).mockResolvedValue({ success: true });
  await remove('truck.webp');
  expect(mockGrnRemoveFromServer).not.toHaveBeenCalled();
  expect(deleteDispatchImage).toHaveBeenCalledTimes(1);
});

it('keeps the photo and shows the reason when the server refuses the removal', async () => {
  jest.mocked(deleteDispatchImage).mockResolvedValue({ success: false, error: 'You do not have permission to do this.' });
  await remove('truck.webp');
  expect(deleteDispatchImage).toHaveBeenCalledWith('image-1', 'https://files.example/truck');
  expect(mockRemoveImageFromForm).not.toHaveBeenCalled();
  expect(releaseLocalPhotos).not.toHaveBeenCalled();
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(showAlert).toHaveBeenCalledWith("Couldn't remove the photo", 'You do not have permission to do this.');
});

it('keeps the photo and reports it when the removal request throws', async () => {
  jest.mocked(deleteDispatchImage).mockRejectedValue(new Error('Network request failed'));
  await remove('truck.webp');
  expect(mockRemoveImageFromForm).not.toHaveBeenCalled();
  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't remove the photo");
});

it('removes the photo from the form once the server has removed it', async () => {
  jest.mocked(deleteDispatchImage).mockResolvedValue({ success: true });
  await remove('truck.webp');
  expect(mockRemoveImageFromForm).toHaveBeenCalledWith('image-1');
  expect(showAlert).not.toHaveBeenCalled();
});

it('removes the photo and says so when only the stored file could not be confirmed deleted', async () => {
  jest.mocked(deleteDispatchImage).mockResolvedValue({ success: true, partial: true, error: 'The photo was removed from this dispatch, but its stored file could not be confirmed deleted.' });
  await remove('truck.webp');
  expect(mockRemoveImageFromForm).toHaveBeenCalledWith('image-1');
  expect(showAlert).toHaveBeenCalledTimes(1);
});

it('removes a photo that was never uploaded without asking the server', async () => {
  await remove('load.webp');
  expect(deleteDispatchImage).not.toHaveBeenCalled();
  expect(mockRemoveImageFromForm).toHaveBeenCalledWith('temp_load');
  // P2F-MEDIA-3: the file the app wrote for it goes with it.
  expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
  expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/load.webp']);
});
