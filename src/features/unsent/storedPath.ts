/**
 * How a file address is kept on the phone (WH-301, Test's iPhone finding). On iOS the app's data container gets a new id with
 * every update, so a stored `file:///var/mobile/Containers/Data/Application/<id>/Documents/...` address points nowhere after
 * one although the file moved along. So nothing absolute is stored:
 * - a column holds the address relative to the documents folder: `unsent-work/photos/x.jpg`;
 * - inside a saved form's text it is written `app-doc:///unsent-work/photos/x.jpg`;
 * - every read joins it to the current documents folder, and callers only ever see full current `file://` addresses;
 * - a legacy absolute `.../Documents/unsent-work/...` address of any container is rebased onto the current documents folder when
 *   it is read, so what was stored before this change recovers without a migration step.
 * Only one of the app's own folders is rebased (`unsent-work` unless the caller names `phone-copy-photos`), and an address with
 * a `..` segment is never accepted.
 */
import { Paths } from 'expo-file-system';

/** The folders of the documents folder the app keeps its own files in. */
export type OwnFolder = 'unsent-work' | 'phone-copy-photos';

const FORM_SCHEME = 'app-doc:///';
const ADDRESS_IN_TEXT = /(?:app-doc|file):\/\/[^"\\]+/g;

const RELATIVE_IN_TEXT = /unsent-work\/[^"\\]+/g;

/** The current documents folder, with its closing slash. */
function documentsUri(): string {
  const uri = Paths.document.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

/** True when a path climbs out of its folder (also when written percent-encoded). */
function climbs(path: string): boolean {
  try {
    return decodeURIComponent(path).split('/').includes('..');
  } catch {
    return true;
  }
}

/** The part below the documents folder of an address inside `folder`, or null for any other address. */
function relativeOf(address: string, folder: OwnFolder): string | null {
  const relative = (rest: string): string | null => (rest.startsWith(`${folder}/`) && rest.length > folder.length + 1 && !/[?#]/.test(rest) && !climbs(rest) ? rest : null);
  if (address.startsWith(FORM_SCHEME)) return relative(address.slice(FORM_SCHEME.length));
  if (!address.startsWith('file://')) return relative(address);
  const documents = documentsUri();
  if (address.startsWith(documents)) return relative(address.slice(documents.length));
  // A legacy address: any container's Documents folder, then the app's folder. (Android's documents folder is not called
  // Documents, so its addresses are only ever matched by the current folder above.)
  const marker = address.lastIndexOf(`/Documents/${folder}/`);
  return marker < 0 ? null : relative(address.slice(marker + '/Documents/'.length));
}

/** The address as it is kept in a column, or null when it is not a file of the folder. */
export function toStoredOrNull(address: string, folder: OwnFolder = 'unsent-work'): string | null {
  return relativeOf(address, folder);
}

/** The address as it is kept in a column; throws for an address outside the folder, which must never be stored. */
export function toStored(address: string, folder: OwnFolder = 'unsent-work'): string {
  const stored = relativeOf(address, folder);
  if (stored === null) throw new RangeError('A file outside the app folder cannot be kept');
  return stored;
}

/**
 * The full current address of a stored one. A legacy absolute address of the folder is rebased; any other address is given
 * back as it is; an address that climbs out of its folder gives null.
 */
export function fromStored(value: string, folder: OwnFolder = 'unsent-work'): string | null {
  const own = relativeOf(value, folder);
  if (own !== null) return `${documentsUri()}${own}`;
  if (value.startsWith(FORM_SCHEME) || climbs(value)) return null;
  return value;
}

/** A stored column value as a full address; '' (a file that is not there) when it cannot be one. */
export function fileOfStored(value: string): string {
  return fromStored(value) ?? '';
}

/** A form's text with the addresses of the app's own files written as `app-doc:///...`. */
export function formTextToStored(text: string): string {
  return text.replace(ADDRESS_IN_TEXT, address => {
    const stored = relativeOf(address, 'unsent-work');
    return stored === null ? address : `${FORM_SCHEME}${stored}`;
  });
}

/**
 * Every file of the unsent-work folder a text names, as full current addresses: `app-doc:///...`, a legacy absolute address of
 * any container, or a bare relative `unsent-work/...`. Used to find the files a saved form's text still uses (WH-301).
 */
export function ownFilesInText(text: string): string[] {
  const found = new Set<string>();
  const addresses = [...(text.match(ADDRESS_IN_TEXT) ?? []), ...(text.match(RELATIVE_IN_TEXT) ?? [])];
  for (const address of addresses) {
    const own = relativeOf(address, 'unsent-work');
    if (own !== null) found.add(`${documentsUri()}${own}`);
  }
  return [...found];
}

/** A saved form's text with every `app-doc:///...` (and every legacy absolute own address) as a full current address. */
export function formTextFromStored(text: string): string {
  return text.replace(ADDRESS_IN_TEXT, address => {
    const own = relativeOf(address, 'unsent-work');
    return own === null ? address : `${documentsUri()}${own}`;
  });
}
