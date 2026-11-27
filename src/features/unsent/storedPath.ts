/**
 * How a file address is kept on the phone (WH-301, Test's iPhone finding). On iOS the app's data container gets a new id with
 * every update, so a stored `file:///var/mobile/Containers/Data/Application/<id>/Documents/...` address points nowhere after
 * one although the file moved along. So nothing absolute is stored:
 * - a column holds the address relative to the documents folder: `unsent-work/photos/x.jpg`;
 * - inside a saved form's text it is written `app-doc:///unsent-work/photos/x.jpg`;
 * - every read joins it to the current documents folder, and callers only ever see full current `file://` addresses;
 * - a legacy absolute `.../Documents/unsent-work/...` address of any container is rebased onto the current documents folder when
 *   it is read, so what was stored before this change recovers without a migration step.
 * Only the app's own folders below are rebased, and an address with a `..` segment is never accepted.
 */
import { Paths } from 'expo-file-system';

/** The folders of the documents folder the app keeps its own files in. */
const OWN_FOLDERS = ['unsent-work', 'phone-copy-photos'] as const;
const OWN_FOLDER_PATTERN = OWN_FOLDERS.join('|');

const FORM_SCHEME = 'app-doc:///';
// A legacy address: any container's Documents folder, then one of the app's folders. (Android's documents folder is not called
// Documents, so its addresses are only ever matched by the current folder below.)
const LEGACY = new RegExp(`^file://[^?#]*?/Documents/((?:${OWN_FOLDER_PATTERN})/[^?#]+)$`);
const RELATIVE = new RegExp(`^(?:${OWN_FOLDER_PATTERN})/[^?#]+$`);
const ADDRESS_IN_TEXT = /(?:app-doc|file):\/\/[^"\\]+/g;

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

/** The part below the documents folder of an address of the app's own folders, or null for any other address. */
function relativeOf(address: string): string | null {
  if (address.startsWith(FORM_SCHEME)) {
    const rest = address.slice(FORM_SCHEME.length);
    return RELATIVE.test(rest) && !climbs(rest) ? rest : null;
  }
  if (RELATIVE.test(address)) return climbs(address) ? null : address;
  if (!address.startsWith('file://')) return null;
  const documents = documentsUri();
  if (address.startsWith(documents)) {
    const rest = address.slice(documents.length);
    return RELATIVE.test(rest) && !climbs(rest) ? rest : null;
  }
  const legacy = LEGACY.exec(address)?.[1];
  return legacy !== undefined && !climbs(legacy) ? legacy : null;
}

/** The address as it is kept in a column, or null when it is not a file of the app's own folders. */
export function toStoredOrNull(address: string): string | null {
  return relativeOf(address);
}

/** The address as it is kept in a column; throws for an address outside the app's own folders, which must never be stored. */
export function toStored(address: string): string {
  const stored = relativeOf(address);
  if (stored === null) throw new RangeError('A file outside the app folders cannot be kept');
  return stored;
}

/**
 * The full current address of a stored one. A legacy absolute address of the app's folders is rebased; an address outside them
 * is given back as it is; an address that climbs out of its folder gives null.
 */
export function fromStored(value: string): string | null {
  const own = relativeOf(value);
  if (own !== null) return `${documentsUri()}${own}`;
  if (value.startsWith(FORM_SCHEME) || RELATIVE.test(value) || climbs(value)) return null;
  return value;
}

/** A stored column value as a full address; '' (a file that is not there) when it cannot be one. */
export function fileOfStored(value: string): string {
  return fromStored(value) ?? '';
}

/** A form's text with the addresses of the app's own files written as `app-doc:///...`. */
export function formTextToStored(text: string): string {
  return text.replace(ADDRESS_IN_TEXT, address => {
    const stored = relativeOf(address);
    return stored === null ? address : `${FORM_SCHEME}${stored}`;
  });
}

/** A saved form's text with every `app-doc:///...` (and every legacy absolute own address) as a full current address. */
export function formTextFromStored(text: string): string {
  return text.replace(ADDRESS_IN_TEXT, address => {
    const own = relativeOf(address);
    return own === null ? address : `${documentsUri()}${own}`;
  });
}
