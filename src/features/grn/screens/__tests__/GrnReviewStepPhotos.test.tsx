/**
 * Photos in the GRN review step: nothing reaches the server before Save, and a
 * photo that does not upload after Save is named, with a retry.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN, findLinesSavedByLostUpdate } from '@/features/grn/services/grnFormService';
import { uploadGRNPhotos, unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { removeHeaderImage, adoptSavedLines, setSaveUnconfirmed } from '@/store/slices/grnFormSlice';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { abandonLocalPhotoUpload, releaseLocalPhotos } from '@/utils/localPhotoFiles';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
let mockSaveUnconfirmed = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: mockRemovedImages, saveUnconfirmed: mockSaveUnconfirmed } }),
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

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), findLinesSavedByLostUpdate: jest.fn() }));
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
    mockSaveUnconfirmed = false;
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

      expect(updateGRN).toHaveBeenCalledWith(GRN_ID, expect.any(Object), { removedImages: mockRemovedImages, adoptedLineIds: {} });
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

  // RF-3: update_grn has no idempotency key, so a lost answer is not followed by a blind second Save.
  describe('an update the server did not answer', () => {
    const NEW_LINE = { ...mockItems[0], grn_trl_id: 'item-1700000000000-new', item_name: 'Example Onions' };
    const SAVED_ID = '99999999-2222-4333-8444-555555555555';
    const withNewLine = (tree: ReactTestRenderer) => {
      mockForm = { ...mockForm, items: [mockItems[0], NEW_LINE] };
      return act(async () => { tree.update(<GrnReviewStep mode="edit" />); });
    };

    it('marks the form, keeps it, and says the save may have arrived', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({ success: false, error: 'Request timeout', outcomeUnknown: true });
      const tree = await render('edit');
      await save(tree);
      expect(mockDispatch).toHaveBeenCalledWith(setSaveUnconfirmed(true));
      expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", expect.stringContaining('may or may not be saved'));
      expect(mockForm.resetFormState).not.toHaveBeenCalled();
      await act(async () => { tree.unmount(); });
    });

    it('a refusal the server did answer does not mark the form', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({ success: false, error: 'GRN number already exists: A0010', outcomeUnknown: false });
      const tree = await render('edit');
      await save(tree);
      expect(mockDispatch).not.toHaveBeenCalledWith(setSaveUnconfirmed(true));
      await act(async () => { tree.unmount(); });
    });

    it('the next Save first asks the server, and sends the line it already holds as an update', async () => {
      mockSaveUnconfirmed = true;
      (findLinesSavedByLostUpdate as jest.Mock).mockResolvedValue({ success: true, adopted: { [NEW_LINE.grn_trl_id]: SAVED_ID } });
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      const tree = await render('edit');
      await withNewLine(tree);
      await save(tree);

      expect(findLinesSavedByLostUpdate).toHaveBeenCalledWith(GRN_ID, [mockItems[0], NEW_LINE]);
      // The form's lines go as they are; the service puts the saved id in the request and
      // keeps the idempotency key of the Save that got no answer.
      expect((updateGRN as jest.Mock).mock.calls[0][1].items.map((item: { grn_trl_id: string }) => item.grn_trl_id)).toEqual([mockItems[0].grn_trl_id, NEW_LINE.grn_trl_id]);
      expect((updateGRN as jest.Mock).mock.calls[0][2].adoptedLineIds).toEqual({ [NEW_LINE.grn_trl_id]: SAVED_ID });
      expect(mockDispatch).toHaveBeenCalledWith(adoptSavedLines({ [NEW_LINE.grn_trl_id]: SAVED_ID }));
      expect(mockDispatch).toHaveBeenCalledWith(setSaveUnconfirmed(false));
      await act(async () => { tree.unmount(); });
    });

    it('does not save while the server cannot be asked', async () => {
      mockSaveUnconfirmed = true;
      (findLinesSavedByLostUpdate as jest.Mock).mockResolvedValue({ success: false, error: 'not reachable' });
      const tree = await render('edit');
      await withNewLine(tree);
      await save(tree);

      expect(updateGRN).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenLastCalledWith("Couldn't save the GRN", 'not reachable');
      expect(mockDispatch).not.toHaveBeenCalledWith(setSaveUnconfirmed(false));
      await act(async () => { tree.unmount(); });
    });

    it('a form that is not marked saves without asking', async () => {
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      const tree = await render('edit');
      await save(tree);
      expect(findLinesSavedByLostUpdate).not.toHaveBeenCalled();
      expect(updateGRN).toHaveBeenCalledTimes(1);
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
});
