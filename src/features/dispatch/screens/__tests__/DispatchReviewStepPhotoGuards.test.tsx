/**
 * Dispatch review step, photos: Create is held while a photo is still being prepared or
 * its preparation failed (the raw camera file is never uploaded), and 'Continue without
 * photos' gives the failed photos up so their files on the phone go.
 */
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { uploadDeferredDispatchImages, giveUpDispatchPhotos } from '@/features/dispatch/services/dispatchImageService';
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
// A stand-in that draws only what the test uses: while visible, the dialog (named by its title) with its confirm and
// cancel buttons; nothing while it is closed. Like the real dialog on iOS it says `onDismissed` once it has closed.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    visible: boolean;
    title: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    onDismissed?: () => void;
  }) => {
    const React = require('react');
    const { View, Pressable } = require('react-native');
    const wasVisible = React.useRef(false);
    React.useEffect(() => {
      if (wasVisible.current && !props.visible) props.onDismissed?.();
      wasVisible.current = props.visible;
    });
    return props.visible ? (
      <View accessible role="alertdialog" accessibilityLabel={props.title}>
        <Pressable role="button" accessibilityLabel={props.confirmText} onPress={props.onConfirm} />
        <Pressable role="button" accessibilityLabel={props.cancelText} onPress={props.onCancel} />
      </View>
    ) : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  unpreparedDispatchPhotos: jest.requireActual('@/features/dispatch/services/dispatchImageService').unpreparedDispatchPhotos,
  uploadDeferredDispatchImages: jest.fn(),
  giveUpDispatchPhotos: jest.fn(),
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

const photo = (id: string, status: string) => ({ id, file_name: `${id}.webp`, image_url: `file:///cache/${id}.webp`, upload_status: status });
const user = () => userEvent.setup({ delay: 0 });
const confirmDialog = () => screen.getByRole('alertdialog', { name: 'Create dispatch I0042?' });
const pressCreate = async (u: ReturnType<typeof user>) => {
  await u.press(screen.getByRole('button', { name: 'Create dispatch' }));
};

beforeEach(() => { jest.clearAllMocks(); });

it('holds Create while a photo is still being prepared, and opens no confirm dialog', async () => {
  mockImages = [photo('temp_a', 'completed'), photo('temp_b', 'uploading')];
  await render(<DispatchReviewStep mode="create" />);
  await pressCreate(user());
  expect(showAlert).toHaveBeenCalledWith('Photos are still being prepared', 'Wait a moment for the photos to finish, then save again.');
  expect(screen.queryByRole('alertdialog')).not.toBeOnTheScreen();
});

it('holds Create for a photo whose preparation failed (an over-size file is not sent)', async () => {
  mockImages = [photo('temp_a', 'completed'), photo('temp_b', 'failed')];
  await render(<DispatchReviewStep mode="create" />);
  await pressCreate(user());
  expect(showAlert).toHaveBeenCalledWith("A photo couldn't be prepared", 'Remove the photo marked as failed, or add it again, then save.');
  expect(screen.queryByRole('alertdialog')).not.toBeOnTheScreen();
});

it('opens the confirm dialog when every photo is prepared', async () => {
  mockImages = [photo('temp_a', 'completed')];
  await render(<DispatchReviewStep mode="create" />);
  await pressCreate(user());
  expect(showAlert).not.toHaveBeenCalled();
  expect(confirmDialog()).toBeOnTheScreen();
});

it('Continue without photos abandons the failed uploads and releases their files', async () => {
  const failed = [photo('temp_a', 'completed'), photo('temp_b', 'completed')];
  mockImages = failed;
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: 'd1', failedPhotos: failed });
  const u = user();
  await render(<DispatchReviewStep mode="create" />);
  await pressCreate(u);
  await u.press(within(confirmDialog()).getByRole('button', { name: 'Create dispatch' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Photos not uploaded' });
  expect(releaseLocalPhotos).not.toHaveBeenCalled();
  await u.press(within(dialog).getByRole('button', { name: 'Continue without them' }));
  expect(abandonLocalPhotoUpload).toHaveBeenCalledWith('file:///cache/temp_a.webp');
  expect(abandonLocalPhotoUpload).toHaveBeenCalledWith('file:///cache/temp_b.webp');
  expect(giveUpDispatchPhotos).toHaveBeenCalledWith('d1', failed);
  expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/temp_a.webp', 'file:///cache/temp_b.webp']);
  expect(uploadDeferredDispatchImages).not.toHaveBeenCalled();
});
