/**
 * Item photos while editing a saved GRN: picking a photo does not upload it,
 * and removing a saved photo does not delete it. Both wait for Save.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import { deleteGRNImage, uploadGRNItemImage } from '@/features/grn/services/imageUploadService';
import { removeItemImage } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'bbbbbbbb-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));

const mockLine = {
  grn_trl_id: LINE_ID,
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [
    { id: SAVED_PHOTO, fileName: 'mark.webp', imageUrl: 'https://example.invalid/mark', storagePath: 'items/g/l/mark.webp', uploadStatus: 'completed' },
  ],
};
const mockForm = {
  header: { gr_no: 'A0010' },
  items: [mockLine],
  grnId: GRN_ID,
  tempGrnId: null,
  isCreateMode: false,
  resetFormState: jest.fn(),
};
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));

// Children are stand-ins that keep their props, so the test can call their handlers.
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: object, _ref: unknown) =>
    require('react').createElement('HorizontalItemForm', props)),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({ __esModule: true, default: 'ItemsSummaryBottomSheet' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
  // Run the focus callback once, like a screen that has just been shown.
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  generateTempGRNId: () => 'temp_grn_generated',
  uploadGRNItemImage: jest.fn(),
  validateImageFile: () => ({ valid: true }),
}));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnItemsStep mode="edit" />);
  });
  return tree;
}
const form = (tree: ReactTestRenderer) => tree.root.findByType('HorizontalItemForm' as never);

/** Open the saved line in the item form, as "Edit" in the items sheet does. */
async function editSavedLine(tree: ReactTestRenderer) {
  const sheet = tree.root.findByType('ItemsSummaryBottomSheet' as never);
  await act(async () => { sheet.props.onEditItem(sheet.props.items[0]); });
}

describe('GRN items step photos while editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('removes a saved photo from the form only', async () => {
    const tree = await render();
    await editSavedLine(tree);
    expect(form(tree).props.currentItem.trl_images).toHaveLength(1);

    await act(async () => { await form(tree).props.onImageRemove(SAVED_PHOTO); });

    expect(deleteGRNImage).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(removeItemImage({ itemId: LINE_ID, imageId: SAVED_PHOTO }));
    expect(form(tree).props.currentItem.trl_images).toEqual([]);
    await act(async () => { tree.unmount(); });
  });

  it('keeps a picked photo on the device: no upload under the saved GRN id', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera/raw.jpg', fileName: 'raw.jpg', fileSize: 5000, mimeType: 'image/jpeg' }],
    });
    (uploadGRNItemImage as jest.Mock).mockResolvedValue({
      success: true,
      imageId: undefined,
      imageUrl: 'file:///cache/prepared.webp',
      metadata: { fileName: 'raw.webp', fileSize: 1200, mimeType: 'image/webp', uploadTimestamp: '2026-10-10T08:00:00.000Z', storagePath: undefined },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    // A line that is being added in this edit: it has only a local id.
    const newLineId = form(tree).props.currentItem.grn_trl_id;
    expect(newLineId).toMatch(/^item-/);
    act(() => form(tree).props.onImagePick());
    const chooseFromGallery = alert.mock.calls[0][2]![1];
    await act(async () => { await chooseFromGallery.onPress!(); });

    expect(uploadGRNItemImage).toHaveBeenCalledTimes(1);
    const [, uploadId, lineId] = (uploadGRNItemImage as jest.Mock).mock.calls[0];
    expect(uploadId).toBe('temp_grn_generated');
    expect(uploadId).not.toBe(GRN_ID);
    expect(lineId).toBe(newLineId);
    // The photo waits in the form as a local file, to be uploaded by the save.
    expect(form(tree).props.currentItem.trl_images).toEqual([
      expect.objectContaining({ imageUrl: 'file:///cache/prepared.webp', uploadStatus: 'completed', storagePath: undefined }),
    ]);
    expect(form(tree).props.currentItem.trl_images[0].id).toMatch(/^temp_/);
    await act(async () => { tree.unmount(); });
  });
});
