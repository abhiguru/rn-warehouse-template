/**
 * Photos in the GRN review step: nothing reaches the server before Save, and a
 * photo that does not upload after Save is named, with a retry.
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN, getNextGRNNumber } from '@/features/grn/services/grnFormService';
import { checkSubmission } from '@/utils/lostAnswer';
import { nextGrnFormSession } from '@/features/grn/utils/grnFormSession';
import { uploadGRNPhotos, unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { removeHeaderImage, setIsSaving, setSubmissionNonce, setTakenNumberError, updateHeader } from '@/store/slices/grnFormSlice';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { setLanguage } from '@/i18n/language';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';

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

// Children are stand-ins that draw what the step hands them (the dialogs' texts and buttons, the step header's state,
// the photo picker and grid) and call the real props, so the test reads and presses what a person would. A closed
// dialog is drawn hidden (display none), so one test can still reach the handler behind it.
let mockConfirmEnded: unknown;
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; confirmText?: string; cancelText?: string; onConfirm: () => unknown; onCancel: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      { accessible: true, accessibilityRole: 'alert', accessibilityLabel: props.title, style: props.visible ? undefined : { display: 'none' } },
      createElement(Text, null, props.title),
      createElement(Text, null, props.message),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: () => { mockConfirmEnded = props.onConfirm(); } }, createElement(Text, null, props.confirmText)),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Cancel', onPress: props.onCancel }, createElement(Text, null, props.cancelText))
    );
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean; onPrint: () => void }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return props.isVisible
      ? createElement(View, { accessible: true, accessibilityLabel: 'Success dialog' },
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Print', onPress: props.onPrint }))
      : null;
  },
}));
jest.mock('@/components/PrintRangeDialog', () => ({
  PrintRangeDialog: (props: { visible: boolean; onDismiss: () => void }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(View, { accessible: true, accessibilityLabel: 'Print dialog' },
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Close print dialog', onPress: props.onDismiss }))
      : null;
  },
}));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown; onPrevious?: () => unknown; isLoading?: boolean }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard next', onPress: props.onNext }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard previous', onPress: props.onPrevious }),
      createElement(Text, null, `Wizard loading: ${Boolean(props.isLoading)}`)
    );
  },
}));
// Neither the header nor the buttons are given a disabled state here: the step's own guards are what the tests press against.
jest.mock('@/components/GRNStepIndicator', () => ({
  GRNStepIndicator: (props: { disabled?: boolean; leaveWarning?: string; cancelMessage?: string; onCancel: () => void; onStepPress: (step: number) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Text, null, `Header locked: ${Boolean(props.disabled)}`),
      props.leaveWarning === undefined ? null : createElement(Text, null, props.leaveWarning),
      createElement(Text, null, props.cancelMessage),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Header X', onPress: props.onCancel }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Header step 1', onPress: () => props.onStepPress(1) })
    );
  },
}));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({
  ImageUploadButton: (props: { grnId?: string; disabled?: boolean }) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Text, null, `Photo picker GRN id: ${props.grnId ?? 'none'}`),
      createElement(Text, null, `Photo picker locked: ${Boolean(props.disabled)}`)
    );
  },
}));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({
  ImagePreviewGrid: (props: { imageData: Array<{ id: string }>; removeFromServer?: boolean; editable?: boolean; onRemoveImage: (id: string) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Text, null, `Photo grid editable: ${Boolean(props.editable)}`),
      createElement(Text, null, `Photo grid deletes on the server: ${Boolean(props.removeFromServer)}`),
      ...props.imageData.map((image) =>
        createElement(Pressable, { key: image.id, accessibilityRole: 'button', accessibilityLabel: `Remove photo ${image.id}`, onPress: () => props.onRemoveImage(image.id) }))
    );
  },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// WH-299 / WH-394: the bounded wait for the sync after a saved edit is held by the test, so the screen can be looked at while it waits.
let mockWait: () => Promise<void> = () => Promise.resolve();
jest.mock('@/features/phone-copy/syncEngine', () => ({ ...jest.requireActual('@/features/phone-copy/syncEngine'), waitForSyncAfterWrite: () => mockWait() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  abandonLocalPhotoUpload: jest.fn(),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

const failedHeaderPhoto = {
  image: { id: 'temp_1', fileName: 'new.webp', imageUrl: 'file:///cache/new.webp', uploadStatus: 'completed' },
  imageType: 'header' as const,
  position: 1,
  error: 'Network request failed',
};
const failedItemPhoto = {
  image: { id: 'temp_2', fileName: 'mark.webp', imageUrl: 'file:///cache/mark.webp', uploadStatus: 'completed' },
  imageType: 'item' as const,
  itemId: '55555555-2222-4333-8444-555555555555',
  itemName: 'Example Potatoes',
  position: 1,
  error: 'Network request failed',
};


async function show(mode: 'create' | 'edit') {
  mockForm = {
    header: mockHeader,
    items: mockItems,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  await render(<GrnReviewStep mode={mode} />);
  // The photos section is closed when the step opens (its body is mounted but hidden): open it, as a person would. Its
  // heading is in the language of the test, so the section's test id is the way to it.
  await userEvent.setup({ delay: 0 }).press(screen.getByTestId('grn-review-section-photos'));
}
/** Draws the step again with `mockForm` as the test has changed it. */
const redraw = (mode: 'create' | 'edit') => screen.rerender(<GrnReviewStep mode={mode} />);
/** Takes the step off the screen inside the test, where a second one is drawn after it. */
const leave = () => act(async () => { screen.unmount(); });

const user = () => userEvent.setup({ delay: 0 });
// The save question is the dialog that is not the photos one (its title is Gujarati in one test).
const SAVE_TITLE = /^(?!Photos not uploaded$)/;
const dialog = (title: string | RegExp, hidden = false) => screen.queryByRole('alert', { name: title, includeHiddenElements: hidden });
const photoDialog = () => dialog('Photos not uploaded');
const saveDialog = (hidden = false) => screen.queryAllByRole('alert', { name: SAVE_TITLE, includeHiddenElements: hidden })[0] ?? null;
const confirmOf = (alert: NonNullable<ReturnType<typeof dialog>>, hidden = false) => within(alert).getByRole('button', { name: 'Confirm', includeHiddenElements: hidden });
const cancelOf = (alert: NonNullable<ReturnType<typeof dialog>>) => within(alert).getByRole('button', { name: 'Cancel' });
const successDialog = () => screen.queryByLabelText('Success dialog');
const stepHeaderLocked = (locked: boolean) => screen.queryByText(`Header locked: ${locked}`);
const pressNext = () => user().press(screen.getByRole('button', { name: 'Wizard next' }));
const lostNotice = () => screen.queryByText(/Checking whether it was saved/);

/** Press Save/Create in the bottom bar and confirm the "save this GRN?" question; returns when the save has ended. */
async function save() {
  await pressNext();
  await user().press(confirmOf(saveDialog()!));
  await act(async () => { await mockConfirmEnded; });
}

describe('GRN review step photos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmEnded = undefined;
    mockRemovedImages = [];
    mockNonce = null;
    mockNumberTyped = false;
    mockOffline = false;
    mockWait = () => Promise.resolve();
    (checkSubmission as jest.Mock).mockReset();
    (unpreparedGRNPhotos as jest.Mock).mockReturnValue(null);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('editing', () => {
    it('never hands the saved GRN id to the photo picker, so a picked photo is not uploaded before Save', async () => {
      await show('edit');

      expect(screen.getByText('Photo picker GRN id: none')).toBeOnTheScreen();
    });

    it('takes a removed photo out of the form without deleting it on the server', async () => {
      await show('edit');

      expect(screen.getByText('Photo grid deletes on the server: false')).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: `Remove photo ${SAVED_PHOTO}` }));

      expect(mockDispatch).toHaveBeenCalledWith(removeHeaderImage(SAVED_PHOTO));
      expect(updateGRN).not.toHaveBeenCalled();
    });

    it('hands the removed photos to the save', async () => {
      mockRemovedImages = [{ id: 'cccccccc-2222-4333-8444-555555555555', storagePath: 'headers/g/old.webp' }];
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      await show('edit');

      await save();

      expect(updateGRN).toHaveBeenCalledWith(GRN_ID, expect.any(Object), { removedImages: mockRemovedImages });
      expect(photoDialog()).toBeNull();
      expect(successDialog()).toBeOnTheScreen();
    });

    it('saves once when Confirm is tapped twice', async () => {
      let finish!: (value: unknown) => void;
      (updateGRN as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      await show('edit');
      await pressNext();
      // Two taps reach Confirm in one go, before React has drawn the closed dialog: a Pressable answers its host's click with its onPress.
      const click = confirmOf(saveDialog()!).props.onClick as (event: unknown) => void;

      await act(async () => {
        click({});
        click({});
        finish({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      });

      expect(updateGRN).toHaveBeenCalledTimes(1);
    });

    it('names the photos that did not upload and uploads them on "Try again"', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 2, failed: [] });
      await show('edit');

      await save();

      // Not reported as a clean save.
      expect(successDialog()).toBeNull();
      const retry = within(photoDialog()!);
      expect(retry.getByText(/A0010/)).toBeOnTheScreen();
      expect(retry.getByText(/GRN photo 1/)).toBeOnTheScreen();
      expect(retry.getByText(/Example Potatoes, photo 1/)).toBeOnTheScreen();
      expect(retry.getByText('Try again')).toBeOnTheScreen();

      await user().press(confirmOf(photoDialog()!));
      await act(async () => { await mockConfirmEnded; });

      expect(uploadGRNPhotos).toHaveBeenCalledWith(GRN_ID, [failedHeaderPhoto, failedItemPhoto]);
      expect(photoDialog()).toBeNull();
      expect(successDialog()).toBeOnTheScreen();
    });

    it('asks again with only the photos still missing after a retry', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 1, failed: [failedItemPhoto] });
      await show('edit');
      await save();

      await user().press(confirmOf(photoDialog()!));
      await act(async () => { await mockConfirmEnded; });

      const again = within(photoDialog()!);
      expect(again.queryByText(/GRN photo 1/)).toBeNull();
      expect(again.getByText(/Example Potatoes, photo 1/)).toBeOnTheScreen();
      expect(successDialog()).toBeNull();

      // The user may also go on without them.
      await user().press(cancelOf(photoDialog()!));
      expect(photoDialog()).toBeNull();
      expect(successDialog()).toBeOnTheScreen();
    });
  });

  // P2F-MEDIA-3: the files the app wrote for photos that leave the form are released.
  describe('local photo files', () => {
    it('releases the file of a removed photo that never reached the server, and only that one', async () => {
      mockHeader.gr_images.push({ id: 'temp_9', fileName: 'gate.webp', imageUrl: 'file:///cache/gate.webp', storagePath: '', uploadStatus: 'completed' });
      try {
        await show('create');

        await user().press(screen.getByRole('button', { name: `Remove photo ${SAVED_PHOTO}` }));
        expect(releaseLocalPhotos).not.toHaveBeenCalled();

        await user().press(screen.getByRole('button', { name: 'Remove photo temp_9' }));
        expect(mockDispatch).toHaveBeenCalledWith(removeHeaderImage('temp_9'));
        expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
        expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/gate.webp']);
      } finally {
        mockHeader.gr_images.pop();
      }
    });

    it('gives up the retry of the photos left with "Continue without photos", then releases their files', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      await show('edit');
      await save();
      expect(releaseLocalPhotos).not.toHaveBeenCalled();

      await user().press(cancelOf(photoDialog()!));

      expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
      expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/new.webp', 'file:///cache/mark.webp']);
      // The awaiting-retry mark is cleared first, or the release would only be deferred.
      expect(jest.mocked(abandonLocalPhotoUpload).mock.calls.map(([uri]) => uri)).toEqual(['file:///cache/new.webp', 'file:///cache/mark.webp']);
      expect(Math.max(...jest.mocked(abandonLocalPhotoUpload).mock.invocationCallOrder))
        .toBeLessThan(jest.mocked(releaseLocalPhotos).mock.invocationCallOrder[0]);
      expect(uploadGRNPhotos).not.toHaveBeenCalled();
    });
  });

  describe('creating', () => {
    it('reports a photo that did not upload after the GRN was created', async () => {
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [failedHeaderPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 1, failed: [] });
      await show('create');

      await save();

      expect(successDialog()).toBeNull();
      expect(within(photoDialog()!).getByText(/GRN photo 1/)).toBeOnTheScreen();

      await user().press(confirmOf(photoDialog()!));
      await act(async () => { await mockConfirmEnded; });

      expect(uploadGRNPhotos).toHaveBeenCalledWith(GRN_ID, [failedHeaderPhoto]);
      expect(successDialog()).toBeOnTheScreen();
    });

    it('holds the form\'s saving flag while the photos upload again, so the Back key of the create route does nothing', async () => {
      let finish!: (value: unknown) => void;
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [failedHeaderPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      await show('create');
      await save();
      mockDispatch.mockClear();

      await user().press(confirmOf(photoDialog()!));
      expect(mockDispatch).toHaveBeenCalledWith(setIsSaving(true));
      expect(mockDispatch).not.toHaveBeenCalledWith(setIsSaving(false));
      expect(stepHeaderLocked(true)).toBeOnTheScreen();

      await act(async () => { finish({ uploadedCount: 1, failed: [] }); await mockConfirmEnded; });
      expect(mockDispatch).toHaveBeenLastCalledWith(setIsSaving(false));
      expect(stepHeaderLocked(false)).toBeOnTheScreen();
    });
  });
  // RF-1 (M5-11): Save waits for the prepared copy of every photo; the original file is never sent.
  describe('photos that are not ready', () => {
    it.each([
      ['preparing', 'Photos are still being prepared'],
      ['failed', "A photo couldn't be prepared"],
    ])('a photo that is %s holds the save: no question, no request', async (state, title) => {
      (unpreparedGRNPhotos as jest.Mock).mockReturnValue(state);
      for (const mode of ['create', 'edit'] as const) {
        await show(mode);
        await pressNext();
        expect(showAlert).toHaveBeenLastCalledWith(title, expect.any(String));
        expect(saveDialog()).toBeNull();
        await leave();
      }
      expect(unpreparedGRNPhotos).toHaveBeenCalledWith(mockHeader.gr_images, [{ images: [] }]);
      expect(createGRN).not.toHaveBeenCalled();
      expect(updateGRN).not.toHaveBeenCalled();
    });
  });

  // Migration 83: a business deactivated while the form was open. The user keeps the form to save after activation.
  describe('a deactivated business', () => {
    afterEach(() => setLanguage('en'));
    it.each([
      ['en', 'This business is deactivated. Activate it in Customers to receive new goods.'],
      ['gu', 'આ વેપારી નિષ્ક્રિય છે. નવો માલ લેવા માટે વેપારીઓમાં તેને સક્રિય કરો.'],
    ])('shows the translated refusal (%s) and keeps the form', async (language, text) => {
      setLanguage(language as 'en' | 'gu');
      (createGRN as jest.Mock).mockResolvedValue({
        success: false,
        error: 'This business is deactivated. Activate it in Customers to receive new goods.',
      });
      await show('create');

      await save();

      expect(createGRN).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenLastCalledWith(expect.any(String), text);
      expect(successDialog()).toBeNull();
      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringMatching(/reset/i) }));
    });
  });

  // WH-394 (WH-299 review): an edit that was saved locks the review until the screen is left.
  describe('after a GRN edit was saved', () => {
    const saved = { success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };

    it('locks the form, and a second Save does not ask or send update_grn again', async () => {
      (updateGRN as jest.Mock).mockResolvedValue(saved);
      await show('edit');
      await save();
      expect(updateGRN).toHaveBeenCalledTimes(1);
      expect(stepHeaderLocked(true)).toBeOnTheScreen();

      await pressNext();
      expect(saveDialog()).toBeNull();
      expect(updateGRN).toHaveBeenCalledTimes(1);
    });

    it('a second tap on Confirm made while the wait for the sync is open sends nothing', async () => {
      let release!: () => void;
      mockWait = () => new Promise<void>(resolve => { release = resolve; });
      (updateGRN as jest.Mock).mockResolvedValue(saved);
      await show('edit');
      await pressNext();
      const click = confirmOf(saveDialog()!).props.onClick as (event: unknown) => void;
      await act(async () => { click({}); await mockConfirmEnded; });
      expect(updateGRN).toHaveBeenCalledTimes(1);
      // the old Confirm answers again (the dialog was still drawn): no second update
      await act(async () => { click({}); });
      expect(updateGRN).toHaveBeenCalledTimes(1);
      await act(async () => { release?.(); });
    });

    it('closing the print dialog waits for the sync first and resets the form only then, so no empty review shows meanwhile', async () => {
      let release!: () => void;
      mockWait = () => new Promise<void>(resolve => { release = resolve; });
      (updateGRN as jest.Mock).mockResolvedValue(saved);
      await show('edit');
      await save();
      await user().press(screen.getByRole('button', { name: 'Print' }));
      expect(screen.getByLabelText('Print dialog')).toBeOnTheScreen();

      await user().press(screen.getByRole('button', { name: 'Close print dialog' }));
      expect(mockForm.resetFormState).not.toHaveBeenCalled();         // still waiting: the form shows what was saved
      expect(router.replace).not.toHaveBeenCalled();
      await act(async () => { release(); });
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
    });

    it('a GRN create is unchanged: closing the print dialog returns to the choices with no wait and no reset', async () => {
      let waited = false;
      mockWait = () => { waited = true; return Promise.resolve(); };
      (createGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      await show('create');
      await save();
      await user().press(screen.getByRole('button', { name: 'Print' }));
      const resetsBefore = (mockForm.resetFormState as jest.Mock).mock.calls.length;
      await user().press(screen.getByRole('button', { name: 'Close print dialog' }));
      expect(successDialog()).toBeOnTheScreen();
      expect(waited).toBe(false);
      expect((mockForm.resetFormState as jest.Mock).mock.calls.length).toBe(resetsBefore);
    });
  });

  // RF-4: the form that created a GRN is not a form that can create it again.
  describe('after the GRN was created', () => {
    it('Print, then closing the print dialog, returns to the choices; Create does not create again', async () => {
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 2, failed: [], removalFailures: 0 } },
      });
      await show('create');
      await save();
      expect(createGRN).toHaveBeenCalledTimes(1);
      expect(successDialog()).toBeOnTheScreen();

      await user().press(screen.getByRole('button', { name: 'Print' }));
      expect(screen.getByLabelText('Print dialog')).toBeOnTheScreen();
      expect(successDialog()).toBeNull();
      await user().press(screen.getByRole('button', { name: 'Close print dialog' }));
      expect(screen.queryByLabelText('Print dialog')).toBeNull();
      expect(successDialog()).toBeOnTheScreen();

      // The form in this test keeps its fields (the real one is reset): Create must still do nothing.
      await pressNext();
      expect(saveDialog()).toBeNull();
      // The question is not open, so its Confirm is reached past the closed dialog (drawn hidden): the step's own guard must hold.
      await user().press(confirmOf(saveDialog(true)!, true));
      await act(async () => { await mockConfirmEnded; });
      expect(createGRN).toHaveBeenCalledTimes(1);
    });
  });

  // Owner rule D22: a save whose answer is lost locks the form and asks the server about that request's code before
  // anything is sent again. Nothing is looked up by the form's lines any more.
  describe('a save the server did not answer', () => {
    const LOST = { key: 'warehouse-grn-update-fictional-key', sentAt: 1_000 };
    const lost = { success: false, error: 'No answer from the server', lostAnswer: LOST };
    const updated = { success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
    const STORED = { success: true, gr_id: GRN_ID, grn: { images: [] } };

    /** Presses Save and Confirm without waiting for the end of the save; returns that end. */
    async function startSave() {
      await pressNext();
      await user().press(confirmOf(saveDialog()!));
      return { ended: mockConfirmEnded as Promise<void> }; // wrapped: an async function would otherwise wait for the pending save
    }

    it('locks the form, says what is checked, and asks the server about that request code and time', async () => {
      let answer!: (value: unknown) => void;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      await show('edit');
      const { ended } = await startSave();

      expect(checkSubmission).toHaveBeenCalledWith(LOST.key, LOST.sentAt, expect.any(AbortSignal));
      expect(lostNotice()).toBeOnTheScreen();
      expect(screen.queryByText(/Waiting for the connection/)).toBeNull();
      // Nothing can be changed or left: no edit, no Previous, no step circle, no Back; the X alone leaves, with its warning.
      // The store is mocked here: the form's isSaving, which the save sets with setIsSaving(true), is set by hand.
      expect(mockDispatch).toHaveBeenCalledWith(setIsSaving(true));
      mockForm.isSaving = true;
      await redraw('edit');
      expect(stepHeaderLocked(true)).toBeOnTheScreen();
      expect(screen.getByText(/It may have been saved/)).toBeOnTheScreen();
      expect(screen.getByText('Photo picker locked: true')).toBeOnTheScreen();
      expect(screen.getByText('Photo grid editable: false')).toBeOnTheScreen();
      expect(screen.getByText('Wizard loading: true')).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Wizard previous' }));
      await user().press(screen.getByRole('button', { name: 'Header step 1' }));
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      expect(updateGRN).toHaveBeenCalledTimes(1);

      (updateGRN as jest.Mock).mockResolvedValueOnce(updated);
      await act(async () => { answer({ found: false }); await ended; });
      expect(lostNotice()).toBeNull();
    });

    it('adds "Waiting for the connection" while the phone is offline', async () => {
      mockOffline = true;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockReturnValue(new Promise(() => {}));
      await show('edit');
      await startSave();

      expect(lostNotice()).toBeOnTheScreen();
      expect(screen.getByText(/Waiting for the connection/)).toBeOnTheScreen();
    });

    it('found: the stored answer is handled as the lost answer, and nothing is sent again', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValue({ found: true, response: STORED });
      await show('edit');
      await save();

      expect(updateGRN).toHaveBeenCalledTimes(2);
      // The second call is told the answer; it sends nothing (the service skips the request).
      expect((updateGRN as jest.Mock).mock.calls[1][2]).toEqual({ removedImages: [], storedAnswer: STORED });
      expect((updateGRN as jest.Mock).mock.calls[1][1]).toBe((updateGRN as jest.Mock).mock.calls[0][1]);
      expect(successDialog()).toBeOnTheScreen();
      expect(showAlert).not.toHaveBeenCalled();
      // WH-394: a saved edit stays locked (Save and the header's X) until the screen is left, by design.
      expect(stepHeaderLocked(true)).toBeOnTheScreen();
    });

    it('not found: the identical request is sent once more, and its answer is handled normally', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
      await show('edit');
      await save();

      expect(updateGRN).toHaveBeenCalledTimes(2);
      // The same request object and no stored answer: the same body, sent again exactly as it was last sent (the lost
      // attempt, with its body and request code, is handed back to the service).
      expect((updateGRN as jest.Mock).mock.calls[1][1]).toBe((updateGRN as jest.Mock).mock.calls[0][1]);
      expect((updateGRN as jest.Mock).mock.calls[1][2]).toEqual({ removedImages: [], resend: LOST });
      expect(checkSubmission).toHaveBeenCalledTimes(1);
      expect(successDialog()).toBeOnTheScreen();
    });

    it('not found and the second send gets no answer either: the check starts again', async () => {
      const lostAgain = { success: false, error: 'No answer', lostAnswer: { key: LOST.key, sentAt: 2_000 } };
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(lostAgain).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValueOnce({ found: false }).mockResolvedValueOnce({ found: true, response: STORED });
      await show('edit');
      await save();

      expect((checkSubmission as jest.Mock).mock.calls.map(([, sentAt]) => sentAt)).toEqual([1_000, 2_000]);
      expect(updateGRN).toHaveBeenCalledTimes(3);
      expect((updateGRN as jest.Mock).mock.calls[2][2]).toEqual({ removedImages: [], storedAnswer: STORED });
      expect(successDialog()).toBeOnTheScreen();
    });

    it('a refusal the server answers after the second send is shown, and the form is unlocked', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce({ success: false, error: 'GRN update failed' });
      (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
      await show('edit');
      await save();

      expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", expect.any(String));
      expect(stepHeaderLocked(false)).toBeOnTheScreen();
      expect(lostNotice()).toBeNull();
      expect(mockForm.resetFormState).not.toHaveBeenCalled();
    });

    it('a refusal the server answered is not a lost answer: no check, no lock', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({ success: false, error: 'GRN number already exists: A0010' });
      await show('edit');
      await save();
      expect(checkSubmission).not.toHaveBeenCalled();
      expect(updateGRN).toHaveBeenCalledTimes(1);
    });

    it('the X leaves while the answer is checked: the check is stopped and nothing is handled afterwards', async () => {
      let signal!: AbortSignal;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockImplementation((_key: string, _sentAt: number, abort: AbortSignal) => {
        signal = abort;
        return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('aborted'))));
      });
      await show('edit');
      const { ended } = await startSave();

      await user().press(screen.getByRole('button', { name: 'Header X' }));
      await act(async () => { await ended; });

      expect(signal.aborted).toBe(true);
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
      expect(updateGRN).toHaveBeenCalledTimes(1);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('does not look the lines up on the server: a form with a new line is sent as it is', async () => {
      const newLine = { ...mockItems[0], grn_trl_id: 'item-1700000000000-new', item_name: 'Example Onions' };
      (updateGRN as jest.Mock).mockResolvedValue(updated);
      await show('edit');
      mockForm = { ...mockForm, items: [mockItems[0], newLine] };
      await redraw('edit');
      await save();

      expect((updateGRN as jest.Mock).mock.calls[0][1].items.map((item: { grn_trl_id: string }) => item.grn_trl_id)).toEqual([mockItems[0].grn_trl_id, newLine.grn_trl_id]);
      expect((updateGRN as jest.Mock).mock.calls[0][2]).toEqual({ removedImages: [] });
    });
  });

  // The X in the step header asks "Discard changes to this GRN?" itself and calls the
  // step only after "Discard". The step used to ask the same question a second time.
  describe('leaving with the X in the header', () => {
    it('gives the header the question to ask and does not ask again (editing)', async () => {
      await show('edit');
      expect(screen.getByText('1 item and your changes will be lost.')).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Header X' }));
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
    });

    it('gives the header the question to ask and does not ask again (creating)', async () => {
      await show('create');
      expect(screen.getByText('1 item and the GRN details will be lost.')).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Header X' }));
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
    });
  });

  // Review 2026-10-20: G1/H1 (the number is fetched once and kept), G5 (a lost answer), G6/H2 (leaving during the save).
  describe('creating: a number, a lost answer, leaving during the save', () => {
    const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
    const withNumber = (gr_no: string) => {
      mockForm = { ...mockForm, header: { ...mockHeader, gr_no } };
      return redraw('create');
    };

    it('an empty number is fetched once, stored in the form, and sent', async () => {
      (getNextGRNNumber as jest.Mock).mockResolvedValue('A0042');
      (createGRN as jest.Mock).mockResolvedValue(created);
      await show('create');
      await withNumber('');
      await save();

      expect(getNextGRNNumber).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(updateHeader({ gr_no: 'A0042' }));
      expect((createGRN as jest.Mock).mock.calls[0][0].header.gr_no).toBe('A0042');
    });

    it('does not create when no number can be had, and says so', async () => {
      (getNextGRNNumber as jest.Mock).mockRejectedValue(new Error('offline'));
      await show('create');
      await withNumber('');
      await save();

      expect(createGRN).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenLastCalledWith("Couldn't get a GRN number", expect.any(String));
    });

    it('a number already in the form is not fetched again', async () => {
      (createGRN as jest.Mock).mockResolvedValue(created);
      await show('create');
      await save();
      expect(getNextGRNNumber).not.toHaveBeenCalled();
    });

    it('the first Create makes the form\'s nonce and keeps it in the form; a form that has one sends it', async () => {
      (createGRN as jest.Mock).mockResolvedValue(created);
      await show('create');
      await save();
      const made = (createGRN as jest.Mock).mock.calls[0][0].nonce;
      expect(typeof made).toBe('string');
      expect(made.length).toBeGreaterThan(0);
      expect(mockDispatch).toHaveBeenCalledWith(setSubmissionNonce(made));
      await leave();

      mockDispatch.mockClear();
      mockNonce = 'nonce-kept-from-the-first-press';
      await show('create');
      await save();
      expect((createGRN as jest.Mock).mock.calls[1][0].nonce).toBe('nonce-kept-from-the-first-press');
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: setSubmissionNonce('x').type }));
    });

    describe('a Create the server did not answer', () => {
      const LOST = { key: 'warehouse-grn-fictional-key', sentAt: 1_000 };
      const lost = { success: false, error: 'No answer from the server', lostAnswer: LOST };
      const STORED = { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010' } };

      it('locks the form and asks about the request code; found: the stored answer is handled as the lost one (photos, success dialog)', async () => {
        let answer!: (value: unknown) => void;
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        await show('create');
        await pressNext();
        await user().press(confirmOf(saveDialog()!));
        const ended = mockConfirmEnded;

        expect(checkSubmission).toHaveBeenCalledWith(LOST.key, LOST.sentAt, expect.any(AbortSignal));
        expect(stepHeaderLocked(true)).toBeOnTheScreen();
        expect(screen.getByText(/It may have been saved/)).toBeOnTheScreen();
        expect(createGRN).toHaveBeenCalledTimes(1);

        await act(async () => { answer({ found: true, response: STORED }); await ended; });

        expect(createGRN).toHaveBeenCalledTimes(2);
        expect((createGRN as jest.Mock).mock.calls[1][0]).toEqual({ ...(createGRN as jest.Mock).mock.calls[0][0], storedAnswer: STORED });
        expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
        expect(successDialog()).toBeOnTheScreen();
        expect(showAlert).not.toHaveBeenCalled();
      });

      it('not found: the identical request (the same body, nonce and number) is sent once more, and its answer is handled normally', async () => {
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
        await show('create');
        await save();

        expect(createGRN).toHaveBeenCalledTimes(2);
        // The same request, handed the lost attempt (its body and request code) to send exactly as it was.
        expect((createGRN as jest.Mock).mock.calls[1][0]).toEqual({ ...(createGRN as jest.Mock).mock.calls[0][0], resend: LOST });
        expect((createGRN as jest.Mock).mock.calls[1][0].storedAnswer).toBeUndefined();
        expect(getNextGRNNumber).not.toHaveBeenCalled();
        expect(successDialog()).toBeOnTheScreen();
      });

      it('does not look the GRN up by its number, customer or lines', async () => {
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
        await show('create');
        await save();
        expect((createGRN as jest.Mock).mock.calls.every(([request]) => !('afterLostAnswer' in request))).toBe(true);
      });

      it('a refusal the server did answer does not lock the form', async () => {
        (createGRN as jest.Mock).mockResolvedValue({ success: false, error: 'Refused' });
        await show('create');
        await save();
        expect(checkSubmission).not.toHaveBeenCalled();
        expect(stepHeaderLocked(false)).toBeOnTheScreen();
      });

      it('the X leaves while the answer is checked: the check is stopped, the form is reset, and nothing is handled afterwards', async () => {
        let signal!: AbortSignal;
        (createGRN as jest.Mock).mockResolvedValueOnce(lost);
        (checkSubmission as jest.Mock).mockImplementation((_key: string, _sentAt: number, abort: AbortSignal) => {
          signal = abort;
          return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('aborted'))));
        });
        await show('create');
        await pressNext();
        await user().press(confirmOf(saveDialog()!));
        const ended = mockConfirmEnded;

        await user().press(screen.getByRole('button', { name: 'Header X' }));
        await act(async () => { await ended; });

        expect(signal.aborted).toBe(true);
        expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenCalledWith('/grn');
        expect(createGRN).toHaveBeenCalledTimes(1);
        expect(showAlert).not.toHaveBeenCalled();
      });
    });

    describe('another GRN holds the number at Create', () => {
      const taken = { success: false, error: 'GRN number already exists: A0010', numberTaken: { number: 'A0010' } };

      it('a number the form offered is replaced by the next free one, and the person is taken to the number step', async () => {
        (createGRN as jest.Mock).mockResolvedValue(taken);
        (getNextGRNNumber as jest.Mock).mockResolvedValue('A0011');
        await show('create');
        await save();

        expect(mockDispatch).toHaveBeenCalledWith(updateHeader({ gr_no: 'A0011' }));
        expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", 'GRN number A0010 is already used. The next free number is A0011.', expect.any(Array));
        const [, , buttons] = (showAlert as jest.Mock).mock.calls.at(-1);
        await act(async () => { buttons[0].onPress(); });
        expect(router.back).toHaveBeenCalled();
        expect(successDialog()).toBeNull();
        expect(mockForm.resetFormState).not.toHaveBeenCalled();
      });

      it('a number the person typed is not replaced: step 1 refuses it until they change it', async () => {
        mockNumberTyped = true;
        (createGRN as jest.Mock).mockResolvedValue(taken);
        await show('create');
        await save();

        expect(getNextGRNNumber).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalledWith(updateHeader({ gr_no: 'A0011' }));
        expect(mockDispatch).toHaveBeenCalledWith(setTakenNumberError('GRN A0010 already exists. Enter a different number.'));
        expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", 'GRN A0010 already exists. Enter a different number.', expect.any(Array));
      });

      it('when the next number cannot be had it is the taken-number message too', async () => {
        (createGRN as jest.Mock).mockResolvedValue(taken);
        (getNextGRNNumber as jest.Mock).mockRejectedValue(new Error('offline'));
        await show('create');
        await save();

        expect(mockDispatch).toHaveBeenCalledWith(setTakenNumberError('GRN A0010 already exists. Enter a different number.'));
      });
    });

    it('while the save runs the header X and the step circles are disabled, and pressing a circle does nothing', async () => {
      let answer!: (value: unknown) => void;
      (createGRN as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      await show('create');
      await pressNext();
      await user().press(confirmOf(saveDialog()!));
      const confirmed = mockConfirmEnded;

      expect(stepHeaderLocked(true)).toBeOnTheScreen();
      await user().press(screen.getByRole('button', { name: 'Header step 1' }));
      await user().press(screen.getByRole('button', { name: 'Header X' }));
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).not.toHaveBeenCalled();

      await act(async () => { answer({ success: false, error: 'Refused' }); await confirmed; });
      expect(stepHeaderLocked(false)).toBeOnTheScreen();
    });

    it('a save that answers after the form was left does not reset the form or open the success dialog; it says the GRN is saved', async () => {
      (createGRN as jest.Mock).mockImplementation(async () => {
        nextGrnFormSession();
        return created;
      });
      await show('create');
      await save();

      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      expect(successDialog()).toBeNull();
      expect(showAlert).toHaveBeenLastCalledWith('GRN saved', 'GRN A0010 was saved before you left the form. Find it in the GRN list.');
      // The next form's saving flag is not touched by the save of the form that was left.
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringMatching(/setIsSaving/), payload: false }));
    });
  });
});
