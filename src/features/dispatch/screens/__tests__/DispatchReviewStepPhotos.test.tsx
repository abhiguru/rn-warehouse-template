/**
 * Photos in the dispatch review step: a photo that does not upload after the
 * dispatch is created is named, with a retry, before the success dialog. It
 * used to be logged only, and the screen reported a clean save. (The dispatch
 * twin of the GRN fix, GrnReviewStepPhotos.test.tsx.)
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { uploadDeferredDispatchImages, giveUpDispatchPhotos } from '@/features/dispatch/services/dispatchImageService';
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


// Children are stand-ins that draw what a person sees (an open dialog's title and message, the success dialog and its
// buttons) and keep the confirm's props, so the test can answer where the real component answers through a Modal event.
interface MockDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  busy?: boolean;
  dismissible?: boolean;
  ignoreBack?: boolean;
  onConfirm: () => unknown;
  onCancel: () => void;
  onDismissed?: () => void;
}
let mockDialogs: Record<string, MockDialogProps> = {};
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: MockDialogProps) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    mockDialogs[props.title] = props;
    return props.visible
      ? createElement(
          View,
          { accessible: true, accessibilityRole: 'alert', accessibilityLabel: props.title, accessibilityState: { busy: props.busy } },
          createElement(Text, null, props.title),
          createElement(Text, null, props.message)
        )
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean; onViewList: () => void; onCreateAnother: () => void; onSharePDF: () => void; shareError?: string | null }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    const button = (name: string, onPress: () => void) => createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: name, onPress }, createElement(Text, null, name));
    return props.isVisible
      ? createElement(
          View,
          { accessible: false, accessibilityLabel: 'Success dialog' },
          button('View list', props.onViewList),
          button('Create another', props.onCreateAnother),
          button('Share PDF', props.onSharePDF),
          props.shareError ? createElement(Text, null, props.shareError) : null
        )
      : null;
  },
}));
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
  uploadDeferredDispatchImages: jest.fn(),
  giveUpDispatchPhotos: jest.fn(),
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


const PHOTO_TITLE = 'Photos not uploaded';
const CREATE_TITLE = 'Create dispatch I0042?';
const photoDialog = () => mockDialogs[PHOTO_TITLE];
const createDialog = () => mockDialogs[CREATE_TITLE];
const photoOnScreen = () => screen.queryByRole('alert', { name: PHOTO_TITLE });
const createOnScreen = () => screen.queryByRole('alert', { name: CREATE_TITLE });
const successDialog = () => screen.queryByLabelText('Success dialog');
const press = async (name: string) => { await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name })); };
/** A dialog has finished closing (iOS `onDismissed`): what waited for it is drawn now. */
const dismissed = async () => {
  await act(async () => { Object.values(mockDialogs).forEach((dialog) => dialog.onDismissed?.()); });
};
const create_ = async () => {
  await act(async () => { await createDialog().onConfirm(); });
  await dismissed();
};
const show = () => render(<DispatchReviewStep mode="create" />);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockDialogs = {};
});
afterEach(() => jest.restoreAllMocks());

it('shows the success dialog at once when every photo uploaded', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
  await show();
  await create_();
  expect(photoOnScreen()).not.toBeOnTheScreen();
  expect(successDialog()).toBeOnTheScreen();
});

it('names the photos that did not upload and holds the success dialog back', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1], mockImages[2]] });
  await show();
  await create_();
  expect(photoOnScreen()).toBeOnTheScreen();
  // The list is on lines: keep them as they are.
  expect(screen.getByText('Dispatch I0042 is saved, but these photos were not uploaded:\n• Photo 2\n• Photo 3', { normalizer: (text) => text })).toBeOnTheScreen();
  // What the dialog is asked to do (a stand-in draws neither): it cannot be dismissed from outside.
  expect(photoDialog().dismissible).toBe(false);
  expect(successDialog()).not.toBeOnTheScreen();
});

it('"Try again" uploads only the failed photos to the created dispatch', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1], mockImages[2]] });
  jest.mocked(uploadDeferredDispatchImages)
    .mockResolvedValueOnce({ success: false, uploadedCount: 1, errors: ['seal.webp: Network request failed'], failed: [mockImages[2]] })
    .mockResolvedValueOnce({ success: true, uploadedCount: 1, errors: [], failed: [] });
  await show();
  await create_();

  await act(async () => { await photoDialog().onConfirm(); });
  expect(uploadDeferredDispatchImages).toHaveBeenLastCalledWith(DISPATCH_ID, [mockImages[1], mockImages[2]]);
  // One still missing: asked again, for that photo only.
  expect(photoOnScreen()).toBeOnTheScreen();
  expect(photoDialog().message).toContain('• Photo 3');
  expect(photoDialog().message).not.toContain('Photo 2');
  expect(screen.getByText(/• Photo 3/)).toBeOnTheScreen();
  expect(screen.queryByText(/Photo 2/)).not.toBeOnTheScreen();
  expect(successDialog()).not.toBeOnTheScreen();

  await act(async () => { await photoDialog().onConfirm(); });
  expect(uploadDeferredDispatchImages).toHaveBeenLastCalledWith(DISPATCH_ID, [mockImages[2]]);
  expect(photoOnScreen()).not.toBeOnTheScreen();
  // The photo dialog is closing: the success dialog waits for it (a second Modal would never show on iOS).
  expect(giveUpDispatchPhotos).not.toHaveBeenCalled();
  expect(successDialog()).not.toBeOnTheScreen();
  await dismissed();
  expect(successDialog()).toBeOnTheScreen();
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);
});

// A held retry or save that a failing test leaves open would hang Jest.
let finishRetry: ((outcome: Awaited<ReturnType<typeof uploadDeferredDispatchImages>>) => void) | undefined;
let finishSave: ((value: unknown) => void) | undefined;
afterEach(() => {
  finishRetry?.({ success: true, uploadedCount: 1, errors: [], failed: [] });
  finishSave?.({ success: false });
  finishRetry = undefined;
  finishSave = undefined;
});

it('the question stays on screen, busy, while the retry runs, and the Back key does nothing on it', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1]] });
  jest.mocked(uploadDeferredDispatchImages).mockReturnValue(new Promise((resolve) => { finishRetry = resolve; }));
  await show();
  await create_();
  // Not busy until the person asks, and the Back key never answers the question for them.
  // Exactly `busy: false`, not a missing key.
  expect(screen.getByRole('alert', { name: PHOTO_TITLE }).props.accessibilityState).toEqual({ busy: false });
  expect(photoDialog().ignoreBack).toBe(true);

  let retry!: Promise<unknown>;
  await act(async () => { retry = Promise.resolve(photoDialog().onConfirm()); });

  // The dialog is still there and busy: nothing to leave the screen by while the photos go.
  expect(photoOnScreen()).toBeOnTheScreen();
  expect(photoOnScreen()).toBeBusy();
  expect(successDialog()).not.toBeOnTheScreen();

  await act(async () => { finishRetry!({ success: true, uploadedCount: 1, errors: [], failed: [] }); await retry; });
  expect(photoOnScreen()).not.toBeOnTheScreen();
  expect(photoDialog().busy).toBe(false);
  await dismissed();
  expect(successDialog()).toBeOnTheScreen();
});

it('"Continue without them" goes on to the success dialog without uploading', async () => {
  mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[0]] });
  await show();
  await create_();
  await act(async () => { photoDialog().onCancel(); });
  expect(uploadDeferredDispatchImages).not.toHaveBeenCalled();
  expect(giveUpDispatchPhotos).toHaveBeenCalledWith(DISPATCH_ID, [mockImages[0]]);
  // The photo dialog is closing: the success dialog waits for it (a second Modal would never show on iOS).
  expect(successDialog()).not.toBeOnTheScreen();
  await dismissed();
  expect(successDialog()).toBeOnTheScreen();
});

describe('toasts wait for the dialog to go', () => {
  it('"Order fulfilled" is said once the success dialog is left, after the step is left', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft: 0 });
    await show();
    await create_();
    expect(successDialog()).toBeOnTheScreen();
    // The dialog is a modal: a toast now would sit under it.
    expect(showToast).not.toHaveBeenCalled();

    await press('View list');
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Order fulfilled and removed from the queue.');
  });

  it('"Photos uploaded" after a successful retry is said once, with the order, when the dialog is left', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [mockImages[1]], orderLinesLeft: 0 });
    jest.mocked(uploadDeferredDispatchImages).mockResolvedValue({ success: true, uploadedCount: 1, errors: [], failed: [] });
    await show();
    await create_();
    await act(async () => { await photoDialog().onConfirm(); });
    await dismissed();
    expect(successDialog()).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();

    await press('Create another');
    expect(router.replace).toHaveBeenCalledWith('/dispatch-form/step1');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Order fulfilled and removed from the queue. Photos uploaded.');
  });

  it('an order with lines left says how many, not that it is fulfilled', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft: 2 });
    await show();
    await create_();
    await press('View list');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('2 lines are still open on the order.');
  });

  it('one line left is said in the singular', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft: 1 });
    await show();
    await create_();
    await press('View list');
    expect(showToast).toHaveBeenCalledWith('1 line is still open on the order.');
  });

  it.each([[null], [undefined]])('says nothing about the order when the server does not (%s)', async (orderLinesLeft) => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft });
    await show();
    await create_();
    await press('View list');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a save that cleared no order and lost no photo says nothing', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    await show();
    await create_();
    await press('View list');
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('a failed share is said inside the success dialog', () => {
  it('shows the reason as shareError, and clears it when the next try starts', async () => {
    mockSubmitForm.mockResolvedValue({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [] });
    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: false } as never);
    await show();
    await create_();
    expect(screen.queryByText(/Couldn't/)).not.toBeOnTheScreen();

    await press('Share PDF');
    expect(await screen.findByText("Couldn't create the PDF. Check your connection and try again.")).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();

    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: true, pdfUrl: 'https://example.invalid/d.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: false } as never);
    await press('Share PDF');
    expect(await screen.findByText("Couldn't share the PDF. Try again.")).toBeOnTheScreen();
    expect(screen.queryByText(/create the PDF/)).not.toBeOnTheScreen();

    jest.mocked(generateDispatchPDF).mockResolvedValueOnce({ success: true, pdfUrl: 'https://example.invalid/d.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: true } as never);
    await press('Share PDF');
    await waitFor(() => expect(downloadAndSharePDF).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Couldn't/)).not.toBeOnTheScreen();
  });
});
it('the confirm dialog stays open and busy until the save answers', async () => {
  mockSubmitForm.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
  await show();
  await press('Create dispatch');
  expect(createOnScreen()).toBeOnTheScreen();
  // Exactly `busy: false`, not a missing key.
  expect(screen.getByRole('alert', { name: CREATE_TITLE }).props.accessibilityState).toEqual({ busy: false });

  await act(async () => { createDialog().onConfirm(); });
  expect(createOnScreen()).toBeOnTheScreen();
  expect(createOnScreen()).toBeBusy();
  // A second tap while it runs saves nothing twice.
  await act(async () => { createDialog().onConfirm(); });
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);

  await act(async () => { finishSave!({ success: false }); });
  expect(createOnScreen()).not.toBeOnTheScreen();
  expect(createDialog().busy).toBe(false);
});
