/**
 * Dispatch review step, dialog sequencing (R1-01, R1-10): the busy confirm stays open until the save answers. The next
 * dialog (the success dialog, "Photos not uploaded", "Dispatch saved") and the alert for a refused save open only
 * after the confirm has finished closing: `ConfirmDialog.onDismissed` on iOS (a Modal cannot be presented over another
 * that is still closing), once it is hidden on Android. After a failed print the queued toast waits for the alert.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { printDispatchRange } from '@/services/print-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const failedPhoto = { id: 'temp_seal', file_name: 'seal.webp', image_url: 'file:///cache/seal.webp', upload_status: 'completed' as const };

let mockCreateMode = true;
const mockSubmitForm = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: '', note: '' },
    items: [],
    images: [failedPhoto],
    isSaving: false,
    isLoading: false,
    isCreateMode: mockCreateMode,
    dispatchId: mockCreateMode ? null : 'd1',
    submitForm: mockSubmitForm,
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));

// Children are stand-ins that keep their props, so the test can answer them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
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

let tree: ReactTestRenderer;
const dialogs = () => tree.root.findAllByType('ConfirmDialog' as never);
const visibleDialogs = () => dialogs().filter((dialog) => dialog.props.visible);
const confirm = () => dialogs()[0];
const photoDialog = () => dialogs().find((dialog) => dialog.props.title === 'Photos not uploaded')!;
const savedDialog = () => dialogs().find((dialog) => String(dialog.props.title).endsWith('saved'))!;
const success = () => tree.root.findByType('DocumentSuccessDialog' as never);
/** A dialog has finished closing (iOS `onDismissed`). */
const dismissed = async () => {
  await act(async () => { dialogs().forEach((dialog) => dialog.props.onDismissed?.()); });
};
/** Create / Save: opens the confirm, answers it, and leaves it closing. */
const saveAndAnswer = async () => {
  await act(async () => { tree.root.find((n) => n.props.testID === 'dispatch-review-submit' && typeof n.props.onPress === 'function').props.onPress(); });
  expect(confirm().props.visible).toBe(true);
  await act(async () => { await confirm().props.onConfirm(); });
};

const setPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockCreateMode = true;
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});
const render = async (mode: 'create' | 'edit' = 'create') => {
  mockCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
};

describe('on iOS', () => {
  beforeEach(() => setPlatform('ios'));

  it('opens the success dialog only after the busy confirm has finished closing', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    await render();
    await saveAndAnswer();
    // The confirm is hidden but still closing: a Modal now would never show.
    expect(visibleDialogs()).toHaveLength(0);
    expect(success().props.isVisible).toBe(false);

    await dismissed();
    expect(success().props.isVisible).toBe(true);
  });

  it('holds "Photos not uploaded" back the same way, and then the success dialog behind it', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [failedPhoto] });
    await render();
    await saveAndAnswer();
    expect(photoDialog().props.visible).toBe(false);

    await dismissed();
    expect(photoDialog().props.visible).toBe(true);
    expect(success().props.isVisible).toBe(false);

    // Continue without them: the success dialog waits for the photo dialog to close.
    await act(async () => { photoDialog().props.onCancel(); });
    expect(success().props.isVisible).toBe(false);
    await dismissed();
    expect(success().props.isVisible).toBe(true);
  });

  it('holds "Dispatch saved" (edit) back until the confirm has finished closing', async () => {
    mockSubmitForm.mockResolvedValue({ success: true });
    await render('edit');
    await saveAndAnswer();
    expect(savedDialog().props.visible).toBe(false);

    await dismissed();
    expect(savedDialog().props.visible).toBe(true);
  });

  it('holds the alert of a refused save back until the confirm has finished closing, then shows it once', async () => {
    mockSubmitForm.mockImplementation(async (_generateInvoice: boolean, onFailure: (title: string, message: string) => void) => {
      onFailure('Could not save', 'No number left');
      return { success: false, error: 'No number left' };
    });
    await render();
    await saveAndAnswer();
    expect(visibleDialogs()).toHaveLength(0);
    expect(showAlert).not.toHaveBeenCalled();

    await dismissed();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Could not save', 'No number left');
    expect(success().props.isVisible).toBe(false);

    // A later dismissal (another dialog) shows nothing more.
    await dismissed();
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});

describe('on Android', () => {
  beforeEach(() => setPlatform('android'));

  it('opens the success dialog as soon as the confirm is hidden (there is no dismissal event)', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    await render();
    await saveAndAnswer();
    expect(visibleDialogs()).toHaveLength(0);
    expect(success().props.isVisible).toBe(true);
  });

  it('shows the alert of a refused save once the confirm is hidden', async () => {
    mockSubmitForm.mockImplementation(async (_generateInvoice: boolean, onFailure: (title: string, message: string) => void) => {
      onFailure('Could not save', 'No number left');
      return { success: false, error: 'No number left' };
    });
    await render();
    await saveAndAnswer();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Could not save', 'No number left');
  });
});

describe('after a failed print', () => {
  it('"Order fulfilled" is said when the person closes the print error, not under it', async () => {
    setPlatform('ios');
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], sourceOrderCleared: true });
    jest.mocked(printDispatchRange).mockResolvedValue({ success: false } as never);
    await render();
    await saveAndAnswer();
    await dismissed();

    const printDialog = () => tree.root.findByType('PrintRangeDialog' as never);
    await act(async () => { success().props.onPrint(); });
    await act(async () => {
      await printDialog().props.onConfirm('I0042', 'I0042');
      printDialog().props.onDismiss();
    });

    // The step is left, the alert is on screen, and the toast has not run under it.
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();

    // OK on the alert: now the toast.
    const buttons = jest.mocked(showAlert).mock.calls[0][2]!;
    await act(async () => { buttons[0].onPress?.(); });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Order fulfilled and removed from the queue.');
  });
});
