/**
 * Item photos while editing a saved GRN: picking a photo does not upload it,
 * and removing a saved photo does not delete it. Both wait for Save.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import { deleteGRNImage, uploadGRNItemImage } from '@/features/grn/services/imageUploadService';
import { addItemImage, completeItemImageUpload, removeItemImage } from '@/store/slices/grnFormSlice';
import { registerLocalPhoto, releaseLocalPhotos } from '@/utils/localPhotoFiles';

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

// Children are stand-ins that draw what the step hands them (the item form's line and photos, the saved lines with
// their Edit) and call the real props, so the test taps them.
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: {
    currentItem: { grn_trl_id: string; trl_images: { id: string; imageUrl: string; uploadStatus: string; storagePath?: string }[] };
    onImagePick: () => void;
    onImageRemove: (id: string) => unknown;
  }, _ref: unknown) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Text, null, `Line ${props.currentItem.grn_trl_id}`),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Add photo', onPress: props.onImagePick }),
      props.currentItem.trl_images.map((photo) => createElement(
        View,
        { key: photo.id },
        createElement(Text, null, `Photo ${photo.id} ${photo.imageUrl} ${photo.uploadStatus} ${photo.storagePath ?? 'no path'}`),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: `Remove photo ${photo.id}`, onPress: () => props.onImageRemove(photo.id) })
      ))
    );
  }),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({
  __esModule: true,
  default: (props: { items: { grn_trl_id: string }[]; onEditItem: (item: unknown) => void }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      props.items.map((item) =>
        createElement(Pressable, { key: item.grn_trl_id, accessibilityRole: 'button', accessibilityLabel: `Edit ${item.grn_trl_id}`, onPress: () => props.onEditItem(item) }))
    );
  },
}));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: () => null }));
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

jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { grnForm: 'grn-form' },
  registerLocalPhoto: jest.fn(async () => true),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

const user = userEvent.setup({ delay: 0 });

const show = () => render(<GrnItemsStep mode="edit" />);
const press = (name: string | RegExp) => user.press(screen.getByRole('button', { name }));
/** The id of the line now in the form. */
const lineInForm = () => String(screen.getByText(/^Line /).props.children).slice('Line '.length);
const photosInForm = () => screen.queryAllByText(/^Photo /);

/** Open the saved line in the item form, as "Edit" in the items sheet does. */
const editSavedLine = () => press(`Edit ${LINE_ID}`);

describe('GRN items step photos while editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('removes a saved photo from the form only', async () => {
    await show();
    await editSavedLine();
    expect(photosInForm()).toHaveLength(1);

    await press(`Remove photo ${SAVED_PHOTO}`);

    expect(deleteGRNImage).not.toHaveBeenCalled();
    // A saved photo has no file of the app's on the phone to release.
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(removeItemImage({ itemId: LINE_ID, imageId: SAVED_PHOTO }));
    expect(photosInForm()).toHaveLength(0);
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
    await show();

    // A line that is being added in this edit: it has only a local id.
    const newLineId = lineInForm();
    expect(newLineId).toMatch(/^item-/);
    await press('Add photo');
    const chooseFromGallery = alert.mock.calls[0][2]![1];
    await act(async () => { await chooseFromGallery.onPress!(); });

    expect(uploadGRNItemImage).toHaveBeenCalledTimes(1);
    const [, uploadId, lineId] = (uploadGRNItemImage as jest.Mock).mock.calls[0];
    expect(uploadId).toBe('temp_grn_generated');
    expect(uploadId).not.toBe(GRN_ID);
    expect(lineId).toBe(newLineId);
    // The photo waits in the form as a local file, to be uploaded by the save.
    expect(photosInForm()).toHaveLength(1);
    expect(photosInForm()[0]).toHaveTextContent(/^Photo temp_\S+ file:\/\/\/cache\/prepared\.webp completed no path$/);
  });

  // P2F-MEDIA-3: removing a photo that never reached the server releases its prepared file.
  it('releases the local file of a picked photo when it is removed', async () => {
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
    await show();
    await press('Add photo');
    await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });
    // Only the picked original has gone, once the prepared copy took its place.
    expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///camera/raw.jpg']);

    await press(/^Remove photo temp_/);

    expect(photosInForm()).toHaveLength(0);
    expect(releaseLocalPhotos).toHaveBeenCalledTimes(2);
    expect(releaseLocalPhotos).toHaveBeenLastCalledWith(['file:///cache/prepared.webp']);
  });

  // F57: the picker writes the original into the app's cache; it is registered and released.
  it('registers the picked original and releases it once the prepared copy has replaced it', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/ImagePicker/shot.jpg', fileName: 'shot.jpg', fileSize: 5000, mimeType: 'image/jpeg' }],
    });
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (uploadGRNItemImage as jest.Mock).mockResolvedValue({
      success: true,
      imageUrl: 'file:///cache/prepared.webp',
      metadata: { fileName: 'shot.webp', fileSize: 1200, mimeType: 'image/webp', uploadTimestamp: '2026-10-10T08:00:00.000Z' },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await show();
    await press('Add photo');
    await act(async () => { await alert.mock.calls[0][2]![0].onPress!(); });

    expect(registerLocalPhoto).toHaveBeenCalledWith('file:///cache/ImagePicker/shot.jpg', 'grn-form', 'capture');
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/ImagePicker/shot.jpg']);
  });

  it('releases the picked original when the photo could not be prepared', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/ImagePicker/big.jpg', fileName: 'big.jpg', fileSize: 12000000, mimeType: 'image/jpeg' }],
    });
    (uploadGRNItemImage as jest.Mock).mockResolvedValue({ success: false, error: 'Too large' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await show();
    await press('Add photo');
    await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });

    expect(photosInForm()).toHaveLength(0);
    expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/ImagePicker/big.jpg']);
  });

  // F60: the photo is recorded under the item that is in the form when the picker returns.
  it('records the photo under the item now in the form, not the one the dialog was opened for', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/ImagePicker/raw.jpg', fileName: 'raw.jpg', fileSize: 5000, mimeType: 'image/jpeg' }],
    });
    (uploadGRNItemImage as jest.Mock).mockResolvedValue({
      success: true,
      imageUrl: 'file:///cache/prepared.webp',
      metadata: { fileName: 'raw.webp', fileSize: 1200, mimeType: 'image/webp', uploadTimestamp: '2026-10-10T08:00:00.000Z' },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await show();
    const freshItemId = lineInForm();
    expect(freshItemId).toMatch(/^item-/);
    // The dialog is opened for the new item ...
    await press('Add photo');
    // ... and while it is open the form moves to the saved line.
    await editSavedLine();
    expect(lineInForm()).toBe(LINE_ID);
    await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });

    const added = mockDispatch.mock.calls.map(([action]) => action).find((action) => action.type === addItemImage.type);
    expect(added.payload.itemId).toBe(LINE_ID);
    const completed = mockDispatch.mock.calls.map(([action]) => action).find((action) => action.type === completeItemImageUpload.type);
    expect(completed.payload.itemId).toBe(LINE_ID);
    expect((uploadGRNItemImage as jest.Mock).mock.calls[0][2]).toBe(LINE_ID);
  });
});
