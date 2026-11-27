/// <reference types="jest" />
/**
 * An iOS app update (WH-301, WH-301p): the phone puts the app's data in a new container, so the documents folder has a new
 * address and every file moves with it. `moveDocumentRoot` does the same to the fake files: the files held under the old
 * documents folder are renamed under the new one, and `Paths.document` answers the new address from then on.
 * Call it after `bootUnsent()` (the boot makes the file system the app modules use).
 */
import { DOCUMENT_DIRECTORY, files } from '@/tests/phoneCopy/fakeFiles';

export const ROOT_A = DOCUMENT_DIRECTORY;
export const ROOT_B = 'file:///var/mobile/Containers/Data/Application/NEW-ID/Documents/';
/** The documents folder of a container the phone had before the update (its files are not there any more). */
export const LEGACY_ROOT = 'file:///var/mobile/Containers/Data/Application/OLD-ID/Documents/';

export function moveDocumentRoot(from: string, to: string): void {
  const system = require('expo-file-system') as { Paths: { document: unknown }; Directory: new (uri: string) => unknown };
  for (const [path, size] of [...files.held.entries()]) {
    if (!path.startsWith(from)) continue;
    files.held.delete(path);
    files.held.set(`${to}${path.slice(from.length)}`, size);
  }
  system.Paths.document = new system.Directory(to);
}
