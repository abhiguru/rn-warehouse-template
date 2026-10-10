/**
 * Photos in the GRN review step: nothing reaches the server before Save, and a
 * photo that does not upload after Save is named, with a retry.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { uploadGRNPhotos } from '@/features/grn/services/imageUploadService';
import { removeHeaderImage } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: mockRemovedImages } }),
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
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

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
});
