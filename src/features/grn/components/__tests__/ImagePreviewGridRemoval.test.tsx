/**
 * Removing a photo in the grid. A form that applies its changes on Save passes
 * removeFromServer={false}: the photo only leaves the form.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ImagePreviewGrid } from '../ImagePreviewGrid';
import { deleteGRNImage } from '../../services/imageUploadService';
import type { GRNImageData } from '@/store/slices/grnFormSlice';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/config/supabaseConfig', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../../services/imageUploadService', () => ({ deleteGRNImage: jest.fn(async () => ({ success: true })) }));

const savedPhoto: GRNImageData = {
  id: 'aaaaaaaa-2222-4333-8444-555555555555',
  fileName: 'book.webp',
  imageUrl: 'https://example.invalid/book',
  storagePath: 'headers/g/book.webp',
  uploadStatus: 'completed',
};

/** Press the photo's remove button and confirm the "Remove photo?" question. */
async function removeFirstPhoto(tree: ReactTestRenderer) {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    tree.root.findByProps({ testID: 'remove-image-0' }).props.onPress();
  });
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => {
    await buttons.find((button) => button.style === 'destructive')!.onPress!();
  });
}

describe('ImagePreviewGrid photo removal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('only tells the form when removeFromServer is false', async () => {
    const onRemoveImage = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ImagePreviewGrid imageData={[savedPhoto]} onRemoveImage={onRemoveImage} removeFromServer={false} />);
    });

    await removeFirstPhoto(tree);

    expect(deleteGRNImage).not.toHaveBeenCalled();
    expect(onRemoveImage).toHaveBeenCalledWith(savedPhoto.id);
  });

  it('deletes a saved photo at once by default', async () => {
    const onRemoveImage = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ImagePreviewGrid imageData={[savedPhoto]} onRemoveImage={onRemoveImage} />);
    });

    await removeFirstPhoto(tree);

    expect(deleteGRNImage).toHaveBeenCalledWith(savedPhoto.id, savedPhoto.imageUrl);
    expect(onRemoveImage).toHaveBeenCalledWith(savedPhoto.id);
  });
});
