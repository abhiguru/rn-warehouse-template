/**
 * Photos in the GRN review step: nothing reaches the server before Save, and a
 * photo that does not upload after Save is named, with a retry.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })) }));
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

async function render(mode: 'create' | 'edit') {
  mockForm = {
    header: mockHeader,
    items: mockItems,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnReviewStep mode={mode} />);
  });
  return tree;
}

const one = (tree: ReactTestRenderer, type: string) => tree.root.findByType(type as never);
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never);
const photoDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title === 'Photos not uploaded')!;
const saveDialog = (tree: ReactTestRenderer) => dialogs(tree).find((dialog) => dialog.props.title !== 'Photos not uploaded')!;

/** Press Save/Create in the bottom bar, then confirm the "save this GRN?" question. */
async function save(tree: ReactTestRenderer) {
  await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
  await act(async () => { await saveDialog(tree).props.onConfirm(); });
}

describe('GRN review step photos', () => {
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

  describe('editing', () => {
    it('never hands the saved GRN id to the photo picker, so a picked photo is not uploaded before Save', async () => {
      const tree = await render('edit');

      expect(one(tree, 'ImageUploadButton').props.grnId).toBeUndefined();
      await act(async () => { tree.unmount(); });
    });

    it('takes a removed photo out of the form without deleting it on the server', async () => {
      const tree = await render('edit');
      const grid = one(tree, 'ImagePreviewGrid');

      expect(grid.props.removeFromServer).toBe(false);
      act(() => grid.props.onRemoveImage(SAVED_PHOTO));

      expect(mockDispatch).toHaveBeenCalledWith(removeHeaderImage(SAVED_PHOTO));
      expect(updateGRN).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('hands the removed photos to the save', async () => {
      mockRemovedImages = [{ id: 'cccccccc-2222-4333-8444-555555555555', storagePath: 'headers/g/old.webp' }];
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      const tree = await render('edit');

      await save(tree);

      expect(updateGRN).toHaveBeenCalledWith(GRN_ID, expect.any(Object), { removedImages: mockRemovedImages });
      expect(photoDialog(tree).props.visible).toBe(false);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });

    it('saves once when Confirm is tapped twice', async () => {
      let finish!: (value: unknown) => void;
      (updateGRN as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      const tree = await render('edit');
      await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
      const confirm = saveDialog(tree).props.onConfirm;

      await act(async () => {
        confirm();
        confirm();
        finish({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      });

      expect(updateGRN).toHaveBeenCalledTimes(1);
      await act(async () => { tree.unmount(); });
    });

    it('names the photos that did not upload and uploads them on "Try again"', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 2, failed: [] });
      const tree = await render('edit');

      await save(tree);

      // Not reported as a clean save.
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
      const dialog = photoDialog(tree);
      expect(dialog.props.visible).toBe(true);
      expect(dialog.props.message).toContain('A0010');
      expect(dialog.props.message).toContain('GRN photo 1');
      expect(dialog.props.message).toContain('Example Potatoes, photo 1');
      expect(dialog.props.confirmText).toBe('Try again');

      await act(async () => { await dialog.props.onConfirm(); });

      expect(uploadGRNPhotos).toHaveBeenCalledWith(GRN_ID, [failedHeaderPhoto, failedItemPhoto]);
      expect(photoDialog(tree).props.visible).toBe(false);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });

    it('asks again with only the photos still missing after a retry', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 1, failed: [failedItemPhoto] });
      const tree = await render('edit');
      await save(tree);

      await act(async () => { await photoDialog(tree).props.onConfirm(); });

      const dialog = photoDialog(tree);
      expect(dialog.props.visible).toBe(true);
      expect(dialog.props.message).not.toContain('GRN photo 1');
      expect(dialog.props.message).toContain('Example Potatoes, photo 1');
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);

      // The user may also go on without them.
      act(() => dialog.props.onCancel());
      expect(photoDialog(tree).props.visible).toBe(false);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });
  });

  // P2F-MEDIA-3: the files the app wrote for photos that leave the form are released.
  describe('local photo files', () => {
    it('releases the file of a removed photo that never reached the server, and only that one', async () => {
      mockHeader.gr_images.push({ id: 'temp_9', fileName: 'gate.webp', imageUrl: 'file:///cache/gate.webp', storagePath: '', uploadStatus: 'completed' });
      try {
        const tree = await render('create');
        const grid = one(tree, 'ImagePreviewGrid');

        act(() => grid.props.onRemoveImage(SAVED_PHOTO));
        expect(releaseLocalPhotos).not.toHaveBeenCalled();

        act(() => grid.props.onRemoveImage('temp_9'));
        expect(mockDispatch).toHaveBeenCalledWith(removeHeaderImage('temp_9'));
        expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
        expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/gate.webp']);
        await act(async () => { tree.unmount(); });
      } finally {
        mockHeader.gr_images.pop();
      }
    });

    it('gives up the retry of the photos left with "Continue without photos", then releases their files', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [failedHeaderPhoto, failedItemPhoto], removalFailures: 0 } },
      });
      const tree = await render('edit');
      await save(tree);
      expect(releaseLocalPhotos).not.toHaveBeenCalled();

      act(() => photoDialog(tree).props.onCancel());

      expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
      expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/new.webp', 'file:///cache/mark.webp']);
      // The awaiting-retry mark is cleared first, or the release would only be deferred.
      expect(jest.mocked(abandonLocalPhotoUpload).mock.calls.map(([uri]) => uri)).toEqual(['file:///cache/new.webp', 'file:///cache/mark.webp']);
      expect(Math.max(...jest.mocked(abandonLocalPhotoUpload).mock.invocationCallOrder))
        .toBeLessThan(jest.mocked(releaseLocalPhotos).mock.invocationCallOrder[0]);
      expect(uploadGRNPhotos).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });
  });

  describe('creating', () => {
    it('reports a photo that did not upload after the GRN was created', async () => {
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [failedHeaderPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockResolvedValue({ uploadedCount: 1, failed: [] });
      const tree = await render('create');

      await save(tree);

      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
      const dialog = photoDialog(tree);
      expect(dialog.props.visible).toBe(true);
      expect(dialog.props.message).toContain('GRN photo 1');

      await act(async () => { await dialog.props.onConfirm(); });

      expect(uploadGRNPhotos).toHaveBeenCalledWith(GRN_ID, [failedHeaderPhoto]);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });

    it('holds the form\'s saving flag while the photos upload again, so the Back key of the create route does nothing', async () => {
      let finish!: (value: unknown) => void;
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [failedHeaderPhoto], removalFailures: 0 } },
      });
      (uploadGRNPhotos as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      const tree = await render('create');
      await save(tree);
      mockDispatch.mockClear();

      let retried!: Promise<void>;
      await act(async () => { retried = photoDialog(tree).props.onConfirm(); });
      expect(mockDispatch).toHaveBeenCalledWith(setIsSaving(true));
      expect(mockDispatch).not.toHaveBeenCalledWith(setIsSaving(false));
      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(true);

      await act(async () => { finish({ uploadedCount: 1, failed: [] }); await retried; });
      expect(mockDispatch).toHaveBeenLastCalledWith(setIsSaving(false));
      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(false);
      await act(async () => { tree.unmount(); });
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
        const tree = await render(mode);
        await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
        expect(showAlert).toHaveBeenLastCalledWith(title, expect.any(String));
        expect(saveDialog(tree).props.visible).toBe(false);
        await act(async () => { tree.unmount(); });
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
      const tree = await render('create');

      await save(tree);

      expect(createGRN).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenLastCalledWith(expect.any(String), text);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringMatching(/reset/i) }));
      await act(async () => { tree.unmount(); });
    });
  });

  // RF-4: the form that created a GRN is not a form that can create it again.
  describe('after the GRN was created', () => {
    it('Print, then closing the print dialog, returns to the choices; Create does not create again', async () => {
      (createGRN as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 2, failed: [], removalFailures: 0 } },
      });
      const tree = await render('create');
      await save(tree);
      expect(createGRN).toHaveBeenCalledTimes(1);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);

      act(() => one(tree, 'DocumentSuccessDialog').props.onPrint());
      expect(one(tree, 'PrintRangeDialog').props.visible).toBe(true);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
      act(() => one(tree, 'PrintRangeDialog').props.onDismiss());
      expect(one(tree, 'PrintRangeDialog').props.visible).toBe(false);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);

      // The form in this test keeps its fields (the real one is reset): Create must still do nothing.
      await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
      expect(saveDialog(tree).props.visible).toBe(false);
      await act(async () => { await saveDialog(tree).props.onConfirm(); });
      expect(createGRN).toHaveBeenCalledTimes(1);
      await act(async () => { tree.unmount(); });
    });
  });

  // Owner rule D22: a save whose answer is lost locks the form and asks the server about that request's code before
  // anything is sent again. Nothing is looked up by the form's lines any more.
  describe('a save the server did not answer', () => {
    const LOST = { key: 'warehouse-grn-update-fictional-key', sentAt: 1_000 };
    const lost = { success: false, error: 'No answer from the server', lostAnswer: LOST };
    const updated = { success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
    const STORED = { success: true, gr_id: GRN_ID, grn: { images: [] } };
    const noticeText = (tree: ReactTestRenderer) =>
      tree.root
        .findAll((node) => typeof node.type === 'string' && node.props.testID === 'lost-answer-notice')
        .flatMap((node) => node.findAllByType(Text))
        .map((text) => text.props.children)
        .join(' | ');

    /** Presses Save and Confirm without waiting for the end of the save; returns that end. */
    async function startSave(tree: ReactTestRenderer) {
      await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
      let ended!: Promise<void>;
      await act(async () => { ended = saveDialog(tree).props.onConfirm(); });
      return ended;
    }

    it('locks the form, says what is checked, and asks the server about that request code and time', async () => {
      let answer!: (value: unknown) => void;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      const tree = await render('edit');
      const ended = await startSave(tree);

      expect(checkSubmission).toHaveBeenCalledWith(LOST.key, LOST.sentAt, expect.any(AbortSignal));
      expect(noticeText(tree)).toContain('Checking whether it was saved');
      expect(noticeText(tree)).not.toContain('Waiting for the connection');
      // Nothing can be changed or left: no edit, no Previous, no step circle, no Back; the X alone leaves, with its warning.
      const header = one(tree, 'GRNStepIndicator');
      expect(header.props.disabled).toBe(true);
      expect(header.props.leaveWarning).toContain('It may have been saved');
      expect(one(tree, 'ImageUploadButton').props.disabled).toBe(true);
      expect(one(tree, 'ImagePreviewGrid').props.editable).toBe(false);
      expect(one(tree, 'WizardBottomBar').props.isLoading).toBe(true);
      act(() => one(tree, 'WizardBottomBar').props.onPrevious());
      act(() => header.props.onStepPress(1));
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      expect(updateGRN).toHaveBeenCalledTimes(1);

      (updateGRN as jest.Mock).mockResolvedValueOnce(updated);
      await act(async () => { answer({ found: false }); await ended; });
      expect(noticeText(tree)).toBe('');
      await act(async () => { tree.unmount(); });
    });

    it('adds "Waiting for the connection" while the phone is offline', async () => {
      mockOffline = true;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockReturnValue(new Promise(() => {}));
      const tree = await render('edit');
      await startSave(tree);

      expect(noticeText(tree)).toContain('Checking whether it was saved');
      expect(noticeText(tree)).toContain('Waiting for the connection');
      await act(async () => { tree.unmount(); });
    });

    it('found: the stored answer is handled as the lost answer, and nothing is sent again', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValue({ found: true, response: STORED });
      const tree = await render('edit');
      await save(tree);

      expect(updateGRN).toHaveBeenCalledTimes(2);
      // The second call is told the answer; it sends nothing (the service skips the request).
      expect((updateGRN as jest.Mock).mock.calls[1][2]).toEqual({ removedImages: [], storedAnswer: STORED });
      expect((updateGRN as jest.Mock).mock.calls[1][1]).toBe((updateGRN as jest.Mock).mock.calls[0][1]);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      expect(showAlert).not.toHaveBeenCalled();
      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(false);
      await act(async () => { tree.unmount(); });
    });

    it('not found: the identical request is sent once more, and its answer is handled normally', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
      const tree = await render('edit');
      await save(tree);

      expect(updateGRN).toHaveBeenCalledTimes(2);
      // The same request object and no stored answer: the same body, sent again exactly as it was last sent (the lost
      // attempt, with its body and request code, is handed back to the service).
      expect((updateGRN as jest.Mock).mock.calls[1][1]).toBe((updateGRN as jest.Mock).mock.calls[0][1]);
      expect((updateGRN as jest.Mock).mock.calls[1][2]).toEqual({ removedImages: [], resend: LOST });
      expect(checkSubmission).toHaveBeenCalledTimes(1);
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });

    it('not found and the second send gets no answer either: the check starts again', async () => {
      const lostAgain = { success: false, error: 'No answer', lostAnswer: { key: LOST.key, sentAt: 2_000 } };
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(lostAgain).mockResolvedValueOnce(updated);
      (checkSubmission as jest.Mock).mockResolvedValueOnce({ found: false }).mockResolvedValueOnce({ found: true, response: STORED });
      const tree = await render('edit');
      await save(tree);

      expect((checkSubmission as jest.Mock).mock.calls.map(([, sentAt]) => sentAt)).toEqual([1_000, 2_000]);
      expect(updateGRN).toHaveBeenCalledTimes(3);
      expect((updateGRN as jest.Mock).mock.calls[2][2]).toEqual({ removedImages: [], storedAnswer: STORED });
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
      await act(async () => { tree.unmount(); });
    });

    it('a refusal the server answers after the second send is shown, and the form is unlocked', async () => {
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce({ success: false, error: 'GRN update failed' });
      (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
      const tree = await render('edit');
      await save(tree);

      expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", expect.any(String));
      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(false);
      expect(noticeText(tree)).toBe('');
      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('a refusal the server answered is not a lost answer: no check, no lock', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({ success: false, error: 'GRN number already exists: A0010' });
      const tree = await render('edit');
      await save(tree);
      expect(checkSubmission).not.toHaveBeenCalled();
      expect(updateGRN).toHaveBeenCalledTimes(1);
      await act(async () => { tree.unmount(); });
    });

    it('the X leaves while the answer is checked: the check is stopped and nothing is handled afterwards', async () => {
      let signal!: AbortSignal;
      (updateGRN as jest.Mock).mockResolvedValueOnce(lost);
      (checkSubmission as jest.Mock).mockImplementation((_key: string, _sentAt: number, abort: AbortSignal) => {
        signal = abort;
        return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('aborted'))));
      });
      const tree = await render('edit');
      const ended = await startSave(tree);

      await act(async () => { one(tree, 'GRNStepIndicator').props.onCancel(); await ended; });

      expect(signal.aborted).toBe(true);
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
      expect(updateGRN).toHaveBeenCalledTimes(1);
      expect(showAlert).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('does not look the lines up on the server: a form with a new line is sent as it is', async () => {
      const newLine = { ...mockItems[0], grn_trl_id: 'item-1700000000000-new', item_name: 'Example Onions' };
      (updateGRN as jest.Mock).mockResolvedValue(updated);
      const tree = await render('edit');
      mockForm = { ...mockForm, items: [mockItems[0], newLine] };
      await act(async () => { tree.update(<GrnReviewStep mode="edit" />); });
      await save(tree);

      expect((updateGRN as jest.Mock).mock.calls[0][1].items.map((item: { grn_trl_id: string }) => item.grn_trl_id)).toEqual([mockItems[0].grn_trl_id, newLine.grn_trl_id]);
      expect((updateGRN as jest.Mock).mock.calls[0][2]).toEqual({ removedImages: [] });
      await act(async () => { tree.unmount(); });
    });
  });

  // The X in the step header asks "Discard changes to this GRN?" itself and calls the
  // step only after "Discard". The step used to ask the same question a second time.
  describe('leaving with the X in the header', () => {
    it('gives the header the question to ask and does not ask again (editing)', async () => {
      const tree = await render('edit');
      const header = one(tree, 'GRNStepIndicator');
      expect(header.props.cancelMessage).toBe('1 item and your changes will be lost.');
      act(() => header.props.onCancel());
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
      await act(async () => { tree.unmount(); });
    });

    it('gives the header the question to ask and does not ask again (creating)', async () => {
      const tree = await render('create');
      const header = one(tree, 'GRNStepIndicator');
      expect(header.props.cancelMessage).toBe('1 item and the GRN details will be lost.');
      act(() => header.props.onCancel());
      expect(showAlert).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/grn');
      await act(async () => { tree.unmount(); });
    });
  });

  // Review 2026-10-20: G1/H1 (the number is fetched once and kept), G5 (a lost answer), G6/H2 (leaving during the save).
  describe('creating: a number, a lost answer, leaving during the save', () => {
    const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
    const withNumber = (tree: ReactTestRenderer, gr_no: string) => {
      mockForm = { ...mockForm, header: { ...mockHeader, gr_no } };
      return act(async () => { tree.update(<GrnReviewStep mode="create" />); });
    };

    it('an empty number is fetched once, stored in the form, and sent', async () => {
      (getNextGRNNumber as jest.Mock).mockResolvedValue('A0042');
      (createGRN as jest.Mock).mockResolvedValue(created);
      const tree = await render('create');
      await withNumber(tree, '');
      await save(tree);

      expect(getNextGRNNumber).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(updateHeader({ gr_no: 'A0042' }));
      expect((createGRN as jest.Mock).mock.calls[0][0].header.gr_no).toBe('A0042');
      await act(async () => { tree.unmount(); });
    });

    it('does not create when no number can be had, and says so', async () => {
      (getNextGRNNumber as jest.Mock).mockRejectedValue(new Error('offline'));
      const tree = await render('create');
      await withNumber(tree, '');
      await save(tree);

      expect(createGRN).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenLastCalledWith("Couldn't get a GRN number", expect.any(String));
      await act(async () => { tree.unmount(); });
    });

    it('a number already in the form is not fetched again', async () => {
      (createGRN as jest.Mock).mockResolvedValue(created);
      const tree = await render('create');
      await save(tree);
      expect(getNextGRNNumber).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('the first Create makes the form\'s nonce and keeps it in the form; a form that has one sends it', async () => {
      (createGRN as jest.Mock).mockResolvedValue(created);
      const first = await render('create');
      await save(first);
      const made = (createGRN as jest.Mock).mock.calls[0][0].nonce;
      expect(typeof made).toBe('string');
      expect(made.length).toBeGreaterThan(0);
      expect(mockDispatch).toHaveBeenCalledWith(setSubmissionNonce(made));
      await act(async () => { first.unmount(); });

      mockDispatch.mockClear();
      mockNonce = 'nonce-kept-from-the-first-press';
      const retry = await render('create');
      await save(retry);
      expect((createGRN as jest.Mock).mock.calls[1][0].nonce).toBe('nonce-kept-from-the-first-press');
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: setSubmissionNonce('x').type }));
      await act(async () => { retry.unmount(); });
    });

    describe('a Create the server did not answer', () => {
      const LOST = { key: 'warehouse-grn-fictional-key', sentAt: 1_000 };
      const lost = { success: false, error: 'No answer from the server', lostAnswer: LOST };
      const STORED = { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010' } };

      it('locks the form and asks about the request code; found: the stored answer is handled as the lost one (photos, success dialog)', async () => {
        let answer!: (value: unknown) => void;
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const tree = await render('create');
        await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
        let ended!: Promise<void>;
        await act(async () => { ended = saveDialog(tree).props.onConfirm(); });

        expect(checkSubmission).toHaveBeenCalledWith(LOST.key, LOST.sentAt, expect.any(AbortSignal));
        expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(true);
        expect(one(tree, 'GRNStepIndicator').props.leaveWarning).toContain('It may have been saved');
        expect(createGRN).toHaveBeenCalledTimes(1);

        await act(async () => { answer({ found: true, response: STORED }); await ended; });

        expect(createGRN).toHaveBeenCalledTimes(2);
        expect((createGRN as jest.Mock).mock.calls[1][0]).toEqual({ ...(createGRN as jest.Mock).mock.calls[0][0], storedAnswer: STORED });
        expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
        expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
        expect(showAlert).not.toHaveBeenCalled();
        await act(async () => { tree.unmount(); });
      });

      it('not found: the identical request (the same body, nonce and number) is sent once more, and its answer is handled normally', async () => {
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
        const tree = await render('create');
        await save(tree);

        expect(createGRN).toHaveBeenCalledTimes(2);
        // The same request, handed the lost attempt (its body and request code) to send exactly as it was.
        expect((createGRN as jest.Mock).mock.calls[1][0]).toEqual({ ...(createGRN as jest.Mock).mock.calls[0][0], resend: LOST });
        expect((createGRN as jest.Mock).mock.calls[1][0].storedAnswer).toBeUndefined();
        expect(getNextGRNNumber).not.toHaveBeenCalled();
        expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(true);
        await act(async () => { tree.unmount(); });
      });

      it('does not look the GRN up by its number, customer or lines', async () => {
        (createGRN as jest.Mock).mockResolvedValueOnce(lost).mockResolvedValueOnce(created);
        (checkSubmission as jest.Mock).mockResolvedValue({ found: false });
        const tree = await render('create');
        await save(tree);
        expect((createGRN as jest.Mock).mock.calls.every(([request]) => !('afterLostAnswer' in request))).toBe(true);
        await act(async () => { tree.unmount(); });
      });

      it('a refusal the server did answer does not lock the form', async () => {
        (createGRN as jest.Mock).mockResolvedValue({ success: false, error: 'Refused' });
        const tree = await render('create');
        await save(tree);
        expect(checkSubmission).not.toHaveBeenCalled();
        expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(false);
        await act(async () => { tree.unmount(); });
      });

      it('the X leaves while the answer is checked: the check is stopped, the form is reset, and nothing is handled afterwards', async () => {
        let signal!: AbortSignal;
        (createGRN as jest.Mock).mockResolvedValueOnce(lost);
        (checkSubmission as jest.Mock).mockImplementation((_key: string, _sentAt: number, abort: AbortSignal) => {
          signal = abort;
          return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('aborted'))));
        });
        const tree = await render('create');
        await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
        let ended!: Promise<void>;
        await act(async () => { ended = saveDialog(tree).props.onConfirm(); });

        await act(async () => { one(tree, 'GRNStepIndicator').props.onCancel(); await ended; });

        expect(signal.aborted).toBe(true);
        expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenCalledWith('/grn');
        expect(createGRN).toHaveBeenCalledTimes(1);
        expect(showAlert).not.toHaveBeenCalled();
        await act(async () => { tree.unmount(); });
      });
    });

    describe('another GRN holds the number at Create', () => {
      const taken = { success: false, error: 'GRN number already exists: A0010', numberTaken: { number: 'A0010' } };

      it('a number the form offered is replaced by the next free one, and the person is taken to the number step', async () => {
        (createGRN as jest.Mock).mockResolvedValue(taken);
        (getNextGRNNumber as jest.Mock).mockResolvedValue('A0011');
        const tree = await render('create');
        await save(tree);

        expect(mockDispatch).toHaveBeenCalledWith(updateHeader({ gr_no: 'A0011' }));
        expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", 'GRN number A0010 is already used. The next free number is A0011.', expect.any(Array));
        const [, , buttons] = (showAlert as jest.Mock).mock.calls.at(-1);
        act(() => buttons[0].onPress());
        expect(router.back).toHaveBeenCalled();
        expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
        expect(mockForm.resetFormState).not.toHaveBeenCalled();
        await act(async () => { tree.unmount(); });
      });

      it('a number the person typed is not replaced: step 1 refuses it until they change it', async () => {
        mockNumberTyped = true;
        (createGRN as jest.Mock).mockResolvedValue(taken);
        const tree = await render('create');
        await save(tree);

        expect(getNextGRNNumber).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalledWith(updateHeader({ gr_no: 'A0011' }));
        expect(mockDispatch).toHaveBeenCalledWith(setTakenNumberError('GRN A0010 already exists. Enter a different number.'));
        expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", 'GRN A0010 already exists. Enter a different number.', expect.any(Array));
        await act(async () => { tree.unmount(); });
      });

      it('when the next number cannot be had it is the taken-number message too', async () => {
        (createGRN as jest.Mock).mockResolvedValue(taken);
        (getNextGRNNumber as jest.Mock).mockRejectedValue(new Error('offline'));
        const tree = await render('create');
        await save(tree);

        expect(mockDispatch).toHaveBeenCalledWith(setTakenNumberError('GRN A0010 already exists. Enter a different number.'));
        await act(async () => { tree.unmount(); });
      });
    });

    it('while the save runs the header X and the step circles are disabled, and pressing a circle does nothing', async () => {
      let answer!: (value: unknown) => void;
      (createGRN as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      const tree = await render('create');
      await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); });
      let confirmed!: Promise<void>;
      await act(async () => { confirmed = saveDialog(tree).props.onConfirm(); });

      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(true);
      act(() => one(tree, 'GRNStepIndicator').props.onStepPress(1));
      act(() => one(tree, 'GRNStepIndicator').props.onCancel());
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      expect(mockForm.resetFormState).not.toHaveBeenCalled();

      await act(async () => { answer({ success: false, error: 'Refused' }); await confirmed; });
      expect(one(tree, 'GRNStepIndicator').props.disabled).toBe(false);
      await act(async () => { tree.unmount(); });
    });

    it('a save that answers after the form was left does not reset the form or open the success dialog; it says the GRN is saved', async () => {
      (createGRN as jest.Mock).mockImplementation(async () => {
        nextGrnFormSession();
        return created;
      });
      const tree = await render('create');
      await save(tree);

      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      expect(one(tree, 'DocumentSuccessDialog').props.isVisible).toBe(false);
      expect(showAlert).toHaveBeenLastCalledWith('GRN saved', 'GRN A0010 was saved before you left the form. Find it in the GRN list.');
      // The next form's saving flag is not touched by the save of the form that was left.
      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: expect.stringMatching(/setIsSaving/), payload: false }));
      await act(async () => { tree.unmount(); });
    });
  });
});
