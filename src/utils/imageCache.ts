/**
 * The image cache of expo-image, emptied when a session ends.
 *
 * Photos are cached by their address, not by account, so a photo seen in one
 * session would stay on the phone for the next account or facility. A cache
 * that cannot be emptied must not stop a sign-out.
 */
import { Image } from 'expo-image';

export async function clearImageCaches(): Promise<void> {
  await Image.clearDiskCache().catch(() => {});
  await Image.clearMemoryCache().catch(() => {});
}
