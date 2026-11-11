/**
 * Photos on the warehouse network (WH-133). A native image view cannot sign a request or check an answer, so on the LAN
 * path a photo is fetched by `transportFetch` (signed, and its answer verified over the whole body), written to a file in
 * the cache directory, and the file is shown. On the internet path nothing here is used: the link is shown as it is.
 *
 * The files are private photos: the whole directory is removed when the session ends and when the app starts
 * (src/store/sessionScopedState.ts), and a file is never kept under a name that tells what it shows.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { getLanContext, isFacilityUrl, toCanonicalUrl, transportFetch } from './lanTransport';
import { sha256Hex } from './lanSigner';

export const LAN_PHOTOS_DIRECTORY = 'lan-photos';
/** A photo larger than this is not fetched into memory (the upload limit is 50 MB; photos are compressed first). */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const directory = (): Directory => new Directory(Paths.cache, LAN_PHOTOS_DIRECTORY);
const settled = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/**
 * The file that shows the photo at `url`, fetched with a signed request and checked, or null when it could not be fetched
 * (the caller then shows the link as it is, which fails quietly when the internet is down). Several asks for one photo share
 * one fetch.
 */
export function resolveLanPhoto(url: string): Promise<string | null> {
  const known = settled.get(url);
  if (known) return Promise.resolve(known);
  const running = pending.get(url);
  if (running) return running;
  const ctx = getLanContext();
  const run = (async (): Promise<string | null> => {
    try {
      const response = await transportFetch(toCanonicalUrl(url), { headers: { accept: 'image/*' } }, { read: true });
      if (!response.ok) return null;
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) return null;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return null;
      // Another facility or session may be selected by now: the photo is not kept for it.
      if (getLanContext() !== ctx) return null;
      const dir = directory();
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const file = new File(dir, `${await sha256Hex(new Uint8Array(bytes))}.${EXTENSIONS[type] ?? 'jpg'}`);
      if (!file.exists) file.create();
      await file.write(bytes);
      settled.set(url, file.uri);
      return file.uri;
    } catch {
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, run);
  return run;
}

/** True for a link to the facility's server, which on the LAN path must be fetched by `resolveLanPhoto`. */
export const isLanPhotoUrl = (url: string | undefined | null): url is string =>
  typeof url === 'string' && url.length > 0 && isFacilityUrl(toCanonicalUrl(url));

/** Removes every photo file written for the warehouse network. Never throws. */
export async function sweepLanPhotos(): Promise<void> {
  settled.clear();
  try {
    const dir = directory();
    if (dir.exists) dir.delete();
  } catch {
    // Local cleanup must never fail the caller; the next sweep tries again.
  }
}
