/**
 * Shrinks and re-encodes a picked photo before it is uploaded.
 *
 * Two rules the GRN and dispatch photo services share:
 * - The photo keeps its shape. Only the longer side is given to the resizer,
 *   so the other side follows; a photo that is already small is not enlarged.
 * - What is uploaded is always a re-encoded copy. Re-encoding drops the EXIF
 *   block (GPS position, device) of the original, and the reported type is
 *   the format that was really written. If the photo cannot be re-encoded the
 *   upload fails; the original file is never sent in its place.
 *
 * The photo is encoded once. Its size comes with it (the camera and the
 * picker both report it); only a photo whose size is not known is decoded
 * first to learn it, and that probe copy is deleted at once. The size of the
 * written file is read from the file system, not by reading the file back.
 * The written copy is registered as an app file (localPhotoFiles), so it is
 * deleted once nothing needs it.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { discardLocalPhoto, registerLocalPhoto, releaseLocalPhotos } from '@/utils/localPhotoFiles';

export interface PhotoCompressionSettings {
  compress: number;
  format: ImageManipulator.SaveFormat;
  /** Longest side of the uploaded photo, in pixels. */
  maxEdge: number;
  /** Tried once when `format` cannot be written on this device. */
  fallbackFormat?: ImageManipulator.SaveFormat;
}

export interface CompressedPhoto {
  uri: string;
  fileSize: number;
  mimeType: string;
  /** File extension for `mimeType`, with the dot. */
  extension: string;
}

/** The message the upload services turn into "could not process this photo". */
export const PHOTO_PROCESSING_FAILED = 'Failed to process image file';

const describeFormat = (format: ImageManipulator.SaveFormat): { mimeType: string; extension: string } => {
  switch (format) {
    case ImageManipulator.SaveFormat.WEBP:
      return { mimeType: 'image/webp', extension: '.webp' };
    case ImageManipulator.SaveFormat.PNG:
      return { mimeType: 'image/png', extension: '.png' };
    default:
      return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
};

const isKnownSize = (width: number | undefined, height: number | undefined): boolean =>
  Number.isFinite(width) && Number.isFinite(height) && width! > 0 && height! > 0;

/**
 * The resize step for a photo of the given size: the longer side becomes
 * `maxEdge` and the other follows. No step when the photo already fits. When
 * the size is not known the width is limited, which still keeps the shape.
 */
export const resizeToFit = (
  width: number | undefined,
  height: number | undefined,
  maxEdge: number
): ImageManipulator.Action[] => {
  if (!isKnownSize(width, height)) return [{ resize: { width: maxEdge } }];
  if (Math.max(width!, height!) <= maxEdge) return [];
  return width! >= height! ? [{ resize: { width: maxEdge } }] : [{ resize: { height: maxEdge } }];
};

/**
 * Bytes of a written file, from its metadata; the file is not read. 0 when the
 * file system does not say: the upload then measures the file itself.
 */
const writtenFileSize = (uri: string): number => {
  const size = new File(uri).size;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0;
};

/**
 * @param owner who the written copy belongs to (see LOCAL_PHOTO_OWNERS); it is
 *   registered under that name.
 */
export const compressPhoto = async (
  source: { uri: string; width?: number; height?: number },
  settings: PhotoCompressionSettings,
  owner = 'photo'
): Promise<CompressedPhoto> => {
  // A photo whose size is not known has it read first: limiting the width
  // blindly leaves a portrait photo taller than `maxEdge` and enlarges a small
  // one. The camera passes its size, so this happens only for a photo from
  // elsewhere that came without one.
  let { width, height } = source;
  if (!isKnownSize(width, height)) {
    try {
      const probe = await ImageManipulator.manipulateAsync(source.uri, [], {});
      width = probe.width;
      height = probe.height;
      // The probe wrote a full-size copy that nothing uses.
      if (probe.uri !== source.uri) await discardLocalPhoto(probe.uri);
    } catch {
      // The size stays unknown; the width is limited, which keeps the shape.
    }
  }
  const actions = resizeToFit(width, height, settings.maxEdge);
  const formats = [settings.format];
  if (settings.fallbackFormat && settings.fallbackFormat !== settings.format) {
    formats.push(settings.fallbackFormat);
  }

  for (const format of formats) {
    let writtenUri: string | undefined;
    try {
      const written = await ImageManipulator.manipulateAsync(source.uri, actions, {
        compress: settings.compress,
        format,
      });
      // Never the original: a "copy" at the same address would still carry its EXIF block.
      if (!written?.uri || written.uri === source.uri) throw new Error('no re-encoded copy');
      writtenUri = written.uri;
      await registerLocalPhoto(written.uri, owner, 'prepared');
      return { uri: written.uri, fileSize: writtenFileSize(written.uri), ...describeFormat(format) };
    } catch {
      // A copy that cannot be used is not left behind.
      if (writtenUri) await releaseLocalPhotos([writtenUri]);
      // Try the next format; the original file is not an acceptable substitute.
    }
  }
  throw new Error(PHOTO_PROCESSING_FAILED);
};
