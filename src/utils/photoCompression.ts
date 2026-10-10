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
 */
import * as ImageManipulator from 'expo-image-manipulator';

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

export const compressPhoto = async (
  source: { uri: string; width?: number; height?: number },
  settings: PhotoCompressionSettings
): Promise<CompressedPhoto> => {
  // A photo from the in-app camera arrives without its size (0 x 0). The size
  // is read first: limiting the width blindly leaves a portrait photo taller
  // than `maxEdge` and enlarges a small one.
  let { width, height } = source;
  if (!isKnownSize(width, height)) {
    try {
      const probe = await ImageManipulator.manipulateAsync(source.uri, [], {});
      width = probe.width;
      height = probe.height;
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
    try {
      const written = await ImageManipulator.manipulateAsync(source.uri, actions, {
        compress: settings.compress,
        format,
      });
      const response = await fetch(written.uri);
      const blob = await response.blob();
      return { uri: written.uri, fileSize: blob.size, ...describeFormat(format) };
    } catch {
      // Try the next format; the original file is not an acceptable substitute.
    }
  }
  throw new Error(PHOTO_PROCESSING_FAILED);
};
