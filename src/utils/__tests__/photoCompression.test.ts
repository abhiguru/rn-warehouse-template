/**
 * A photo keeps its shape when it is shrunk, and the original file (with its
 * EXIF block) is never uploaded in place of the re-encoded copy.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { compressPhoto, resizeToFit, PHOTO_PROCESSING_FAILED } from '../photoCompression';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { WEBP: 'webp', JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: jest.fn(),
}));

const manipulate = ImageManipulator.manipulateAsync as jest.Mock;
const WEBP = { compress: 0.6, format: ImageManipulator.SaveFormat.WEBP, maxEdge: 1280 };

beforeEach(() => {
  manipulate.mockReset();
  manipulate.mockImplementation(async (_uri: string, _actions: unknown, options: { format: string }) => ({
    uri: `file:///cache/out.${options.format}`,
  }));
  (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 4321 }) }));
});

describe('resizeToFit', () => {
  it('limits the width of a landscape photo and leaves the height to follow', () => {
    expect(resizeToFit(4000, 3000, 1280)).toEqual([{ resize: { width: 1280 } }]);
  });

  it('limits the height of a portrait photo and leaves the width to follow', () => {
    expect(resizeToFit(3000, 4000, 1280)).toEqual([{ resize: { height: 1280 } }]);
  });

  it('does not enlarge a photo that already fits', () => {
    expect(resizeToFit(800, 600, 1280)).toEqual([]);
    expect(resizeToFit(1280, 720, 1280)).toEqual([]);
  });

  it('limits one side only when the size is not known', () => {
    expect(resizeToFit(undefined, undefined, 1280)).toEqual([{ resize: { width: 1280 } }]);
    expect(resizeToFit(0, 0, 1280)).toEqual([{ resize: { width: 1280 } }]);
  });
});

describe('compressPhoto', () => {
  it('never asks for both sides, so a 4:3 photo is not stretched to a square', async () => {
    const photo = await compressPhoto({ uri: 'file:///cache/in.jpg', width: 4000, height: 3000 }, WEBP);

    expect(manipulate).toHaveBeenCalledWith(
      'file:///cache/in.jpg',
      [{ resize: { width: 1280 } }],
      { compress: 0.6, format: 'webp' }
    );
    expect(photo).toEqual({ uri: 'file:///cache/out.webp', fileSize: 4321, mimeType: 'image/webp', extension: '.webp' });
  });

  it('writes the fallback format when the first cannot be written, and reports that format', async () => {
    manipulate.mockRejectedValueOnce(new Error('webp encoder missing'));

    const photo = await compressPhoto(
      { uri: 'file:///cache/in.heic', width: 3000, height: 4000 },
      { ...WEBP, fallbackFormat: ImageManipulator.SaveFormat.JPEG }
    );

    expect(manipulate).toHaveBeenCalledTimes(2);
    expect(photo).toEqual({ uri: 'file:///cache/out.jpeg', fileSize: 4321, mimeType: 'image/jpeg', extension: '.jpg' });
  });

  it('fails when the photo cannot be re-encoded; the original is not returned', async () => {
    manipulate.mockRejectedValue(new Error('cannot decode'));

    await expect(
      compressPhoto(
        { uri: 'file:///cache/in.heic', width: 3000, height: 4000 },
        { ...WEBP, fallbackFormat: ImageManipulator.SaveFormat.JPEG }
      )
    ).rejects.toThrow(PHOTO_PROCESSING_FAILED);
    expect(global.fetch).not.toHaveBeenCalledWith('file:///cache/in.heic');
  });
});
