/**
 * The folder of photos kept on the phone (WH-299, product/tech/app-offline-read-from-copy.md section 9). Apart from
 * `photoStore.ts` so the copy's erase can empty it without a cycle.
 */
import { Directory, Paths } from 'expo-file-system';

export const PHOTO_FOLDER = 'phone-copy-photos';

export const photoDirectory = (): Directory => new Directory(Paths.document, PHOTO_FOLDER);

/** Removes every kept photo. Never throws. */
export function erasePhotoFolder(): Promise<void> {
  try {
    const directory = photoDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Teardown must not fail; a photo left behind is only a file nothing lists.
  }
  return Promise.resolve();
}
