/**
 * A photo keeps its shape when it is shrunk, and the original file (with its
 * EXIF block) is never uploaded in place of the re-encoded copy.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { compressPhoto, resizeToFit, PHOTO_PROCESSING_FAILED } from '../photoCompression';
import { discardLocalPhoto, registerLocalPhoto, releaseLocalPhotos } from '../localPhotoFiles';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { WEBP: 'webp', JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: jest.fn(),
}));
/** Sizes the file system reports, by address. */
const mockFileSizes = new Map<string, number>();
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get size() {
      return mockFileSizes.get(this.uri) ?? 4321;
    }
  },
}));
jest.mock('../localPhotoFiles', () => ({
  registerLocalPhoto: jest.fn(async () => true),
  releaseLocalPhotos: jest.fn(async () => 0),
  discardLocalPhoto: jest.fn(async () => {}),
}));

const manipulate = ImageManipulator.manipulateAsync as jest.Mock;
const WEBP = { compress: 0.6, format: ImageManipulator.SaveFormat.WEBP, maxEdge: 1280 };

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSizes.clear();
  manipulate.mockReset();
  manipulate.mockImplementation(async (_uri: string, _actions: unknown, options: { format: string }) => ({
    uri: `file:///cache/out.${options.format}`,
  }));
  // The written file is never read back: its size comes from the file system.
  (global as any).fetch = jest.fn(async () => {
    throw new Error('fetch must not be used to size a photo');
  });
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

  // RF-10: the in-app camera hands over the photo as 0 x 0.
  describe('a photo that arrives without its size', () => {
    const sized = (width: number, height: number) =>
      manipulate.mockImplementation(async (_uri: string, actions: unknown[], options: { format?: string }) =>
        actions.length === 0 && !options.format ? { uri: 'file:///cache/probe.jpg', width, height } : { uri: `file:///cache/out.${options.format}` });

    it('has its size read first, so a portrait photo is limited by its height', async () => {
      sized(3000, 4000);
      await compressPhoto({ uri: 'file:///cache/camera.jpg', width: 0, height: 0 }, WEBP);
      expect(manipulate.mock.calls.map(([uri, actions]) => [uri, actions])).toEqual([
        ['file:///cache/camera.jpg', []],
        // The original is re-encoded, not the probe copy.
        ['file:///cache/camera.jpg', [{ resize: { height: 1280 } }]],
      ]);
      // The full-size probe copy is deleted at once.
      expect(discardLocalPhoto).toHaveBeenCalledWith('file:///cache/probe.jpg');
    });

    it('is not enlarged when it is small', async () => {
      sized(800, 600);
      await compressPhoto({ uri: 'file:///cache/camera.jpg' }, WEBP);
      expect(manipulate.mock.calls[1][1]).toEqual([]);
    });

    it('falls back to limiting the width when the size cannot be read', async () => {
      manipulate.mockRejectedValueOnce(new Error('cannot read'));
      const photo = await compressPhoto({ uri: 'file:///cache/camera.jpg', width: 0, height: 0 }, WEBP);
      expect(manipulate.mock.calls[1][1]).toEqual([{ resize: { width: 1280 } }]);
      expect(photo.mimeType).toBe('image/webp');
    });

    it('a photo that carries its size is not read twice', async () => {
      await compressPhoto({ uri: 'file:///cache/in.jpg', width: 4000, height: 3000 }, WEBP);
      expect(manipulate).toHaveBeenCalledTimes(1);
    });
  });

  // P2F-MEDIA-1: the in-app camera now passes the size it reports, so a camera
  // photo is encoded once, and the written file is not read back for its size.
  describe('a camera photo that comes with its size', () => {
    const camera = 'file:///data/user/0/org.example.warehouse/cache/Camera/shot-1.jpg';

    it.each([
      ['portrait', 3024, 4032, [{ resize: { height: 1280 } }]],
      ['landscape', 4032, 3024, [{ resize: { width: 1280 } }]],
      ['small', 800, 600, []],
    ])('%s: is encoded exactly once, with the right resize', async (_shape, width, height, actions) => {
      const photo = await compressPhoto({ uri: camera, width, height }, WEBP, 'grn-form');

      expect(manipulate).toHaveBeenCalledTimes(1);
      expect(manipulate).toHaveBeenCalledWith(camera, actions, { compress: 0.6, format: 'webp' });
      expect(photo.uri).toBe('file:///cache/out.webp');
      expect(photo.uri).not.toBe(camera);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(discardLocalPhoto).not.toHaveBeenCalled();
    });

    it('reports the size the file system gives for the written copy', async () => {
      mockFileSizes.set('file:///cache/out.webp', 98765);
      const photo = await compressPhoto({ uri: camera, width: 3024, height: 4032 }, WEBP, 'grn-form');
      expect(photo.fileSize).toBe(98765);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('registers the written copy as a prepared file of its form', async () => {
      await compressPhoto({ uri: camera, width: 3024, height: 4032 }, WEBP, 'dispatch-form');
      expect(registerLocalPhoto).toHaveBeenCalledWith('file:///cache/out.webp', 'dispatch-form', 'prepared');
      expect(registerLocalPhoto).toHaveBeenCalledTimes(1);
    });

    it('never returns the original when the encoder hands back the same address', async () => {
      manipulate.mockImplementation(async (uri: string) => ({ uri }));
      await expect(compressPhoto({ uri: camera, width: 3024, height: 4032 }, WEBP)).rejects.toThrow(PHOTO_PROCESSING_FAILED);
      expect(registerLocalPhoto).not.toHaveBeenCalled();
      expect(releaseLocalPhotos).not.toHaveBeenCalled();
    });

    it('a copy whose size cannot be read is released before the fallback format is tried', async () => {
      const sizeOf = jest.spyOn(require('expo-file-system').File.prototype, 'size', 'get');
      sizeOf.mockImplementationOnce(() => {
        throw new Error('file system unavailable');
      });
      const photo = await compressPhoto(
        { uri: camera, width: 3024, height: 4032 },
        { ...WEBP, fallbackFormat: ImageManipulator.SaveFormat.JPEG }
      );
      expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/out.webp']);
      expect(photo.uri).toBe('file:///cache/out.jpeg');
      sizeOf.mockRestore();
    });
  });
});
