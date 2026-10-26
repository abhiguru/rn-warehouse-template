import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { REQUEST_TIME_LIMIT_MS, awaitIdentityGate, trackReadRequest } from '@/config/supabaseConfig';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { getConnectionPath, noteNativeReadFailed, viaCurrentPath } from '@/config/lanTransport';
import { withNativeHandoff } from '@/config/nativeHandoff';
import { AppError } from '@/utils/appError';
import { createLogger } from '@/utils/logger';
import { t } from '@/i18n';

const log = createLogger('share');

export interface ShareResult {
  success: boolean;
  error?: string;
}

/** Subdirectory of the app cache that holds documents handed to the share sheet. */
export const SHARED_DOCUMENTS_DIRECTORY = 'shared-documents';

/** Largest document the app downloads for sharing (25 MB). */
export const MAX_SHARED_DOCUMENT_BYTES = 25 * 1024 * 1024;

const MAX_FILENAME_STEM_LENGTH = 100;
// File systems allow 255 bytes per name; a Gujarati letter is 3 bytes in UTF-8,
// so the stem is also capped in bytes, leaving room for '.pdf' and a ' (1)'
// that a share target may add.
const MAX_FILENAME_STEM_BYTES = 200;
const CLEANUP_DELAY_MS = 60_000;
const tooLargeError = () => t('errors.pdf.tooLarge');

// Anything that is not a letter, a combining mark (Gujarati vowel signs and the
// virama are marks) or a digit of any script, nor '.', '_' or '-'. Control and
// format characters (including bidi overrides), white space, symbols, lone
// surrogates and every separator fall in here.
const NOT_FILENAME_CHARACTER = /[^\p{L}\p{M}\p{N}._-]+/gu;

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Cut the stem to the length and byte caps, never inside a surrogate pair. */
function capStem(stem: string): string {
  let units = 0;
  let bytes = 0;
  let capped = '';
  for (const character of stem) {
    const size = utf8Length(character.codePointAt(0) ?? 0);
    if (units + character.length > MAX_FILENAME_STEM_LENGTH || bytes + size > MAX_FILENAME_STEM_BYTES) break;
    units += character.length;
    bytes += size;
    capped += character;
  }
  return capped;
}

/**
 * Reduce a server- or caller-supplied document name to a safe file name inside
 * the shared-documents directory: path separators and traversal are dropped,
 * letters, combining marks and digits of any script are kept with '.', '_' and
 * '-' (names people type are never translated or stripped), every other run
 * becomes one '_', leading dots go (no hidden files), the stem is capped (100
 * UTF-16 units and 200 UTF-8 bytes) and the name always ends in '.pdf'.
 */
export function sanitizeDocumentFilename(filename: string, fallback = 'document.pdf'): string {
  const base = (typeof filename === 'string' ? filename : '').split(/[\\/]+/).pop() ?? '';
  const stem = base
    .replace(/\.pdf$/i, '')
    .replace(NOT_FILENAME_CHARACTER, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!stem) return fallback;
  return `${capStem(stem)}.pdf`;
}

function sharedDocumentsDirectory(): Directory {
  return new Directory(Paths.cache, SHARED_DOCUMENTS_DIRECTORY);
}

function ensureSharedDocumentsDirectory(): Directory {
  const directory = sharedDocumentsDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function deleteQuietly(file: File | undefined): void {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // A leftover is removed by the next sweep.
  }
}

// One pending cleanup per cached file: re-sharing the same document within the
// delay restarts the timer instead of letting the first one delete the file
// while the second share target is still reading it.
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleCleanup(file: File): void {
  const existing = pendingCleanups.get(file.uri);
  if (existing) clearTimeout(existing);
  pendingCleanups.set(
    file.uri,
    setTimeout(() => {
      pendingCleanups.delete(file.uri);
      deleteQuietly(file);
    }, CLEANUP_DELAY_MS)
  );
}

/**
 * Remove every document left in the shared-documents directory. Runs at app
 * start and from session teardown (clearSessionScopedState); never throws.
 */
export async function sweepSharedDocuments(): Promise<void> {
  try {
    const directory = sharedDocumentsDirectory();
    if (!directory.exists) return;
    let removed = 0;
    for (const entry of directory.list()) {
      try {
        entry.delete();
        removed += 1;
      } catch {
        // Keep sweeping; a locked file is retried on the next sweep.
      }
    }
    if (removed > 0) log.debug('Swept shared documents', { removed });
  } catch {
    // Local cleanup must never fail the caller.
  }
}

type DownloadOutcome =
  | { success: true; file: File; name: string }
  | { success: false; error: string };

/** Why a download was stopped from this side. */
type StopReason = 'too-large' | 'session' | 'timeout';

/** The HTTP status in the native download's error ("... response has status: 403"). */
const statusOf = (error: unknown): string | null =>
  /status:?\s*(\d{3})\b/i.exec(error instanceof Error ? error.message : String(error))?.[1] ?? null;

/**
 * Download a signed document into the shared-documents directory.
 *
 * The body goes from the network straight to the file (expo-file-system's native
 * download): it is never held in JavaScript, and nothing is written on the JS
 * thread. The 25 MB cap bounds the download itself (F5): each progress event
 * carries the bytes written and the declared Content-Length, and the download is
 * cancelled as soon as either passes the cap, so a body with no length, or with a
 * length lower than what it sends, stops within one progress step of the cap.
 *
 * It keeps the session rules of the read fetch it replaces (createSessionReadFetch):
 * the identity gate first, and a session generation replaced at any point (a
 * sign-out or a server change) cancels the download and refuses the file with the
 * same 'Session changed' signal. The signed URL carries the access, so, as before,
 * no header is sent. The read time limit applies to the whole download, as it did
 * to a fetch that resolves once its body has arrived. Whatever stops a download,
 * the part already written is deleted.
 */
async function downloadDocument(pdfUrl: string, filename: string): Promise<DownloadOutcome> {
  const name = sanitizeDocumentFilename(filename);
  const generation = getSessionGeneration();
  await awaitIdentityGate(generation);

  const directory = ensureSharedDocumentsDirectory();
  const file = new File(directory, name);
  // A file shared a moment ago under the same name is being replaced: its cleanup
  // must not delete the new download halfway through.
  const pendingCleanup = pendingCleanups.get(file.uri);
  if (pendingCleanup) {
    clearTimeout(pendingCleanup);
    pendingCleanups.delete(file.uri);
  }

  const controller = new AbortController();
  let stopped = null as StopReason | null;
  const stop = (reason: StopReason) => {
    if (stopped) return;
    stopped = reason;
    controller.abort();
  };
  const stopOnSessionChange = onSessionChange(() => stop('session'));
  // As a read through the gated fetch: refused while a server switch runs, aborted when one begins.
  const tracked = trackReadRequest(controller);
  if (!tracked.started) stop('session');
  controller.signal.addEventListener('abort', () => stop('session'), { once: true });
  const timer = setTimeout(() => stop('timeout'), REQUEST_TIME_LIMIT_MS.read);
  // Under Node (tests) a waiting download must not keep the process alive.
  (timer as { unref?: () => void }).unref?.();

  log.debug('Downloading document', { name });
  try {
    if (stopped || generation !== getSessionGeneration()) stop('session');
    else {
      const download = (url: string) =>
        File.downloadFileAsync(url, file, {
          idempotent: true,
          signal: controller.signal,
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (bytesWritten > MAX_SHARED_DOCUMENT_BYTES || totalBytes > MAX_SHARED_DOCUMENT_BYTES) stop('too-large');
          },
        });
      // The signed URL names the facility's public address; on the warehouse network path (WS-L,
      // src/config/lanTransport.ts) it is fetched from the LAN address instead. A download that fails
      // without an answer is a read: the other path is asked once, and the download is tried once more there.
      const startedOn = getConnectionPath();
      try {
        await download(viaCurrentPath(pdfUrl));
      } catch (error) {
        if (stopped || statusOf(error) || !(await noteNativeReadFailed(startedOn))) throw error;
        deleteQuietly(file);
        await download(viaCurrentPath(pdfUrl));
      }
      // The last progress event can be skipped; the file on disk has the final word.
      if (!stopped && (file.size ?? 0) > MAX_SHARED_DOCUMENT_BYTES) stop('too-large');
      if (!stopped && generation !== getSessionGeneration()) stop('session');
    }
  } catch (error) {
    if (!stopped) {
      deleteQuietly(file);
      const status = statusOf(error);
      log.error('Document download failed', status ? { status } : undefined);
      return {
        success: false,
        error: status ? t('errors.pdf.downloadFailedStatus', { status }) : t('errors.pdf.downloadFailed'),
      };
    }
  } finally {
    clearTimeout(timer);
    stopOnSessionChange();
    tracked.release();
  }

  if (stopped) {
    deleteQuietly(file);
    switch (stopped) {
      case 'too-large':
        log.warn('Document exceeds the share size cap');
        return { success: false, error: tooLargeError() };
      case 'session':
        // A signal, as from the gated fetch: the callers show their own words.
        throw new Error('Session changed');
      case 'timeout':
        throw new AppError('TIMEOUT', t('errors.network.requestTimedOut'));
    }
  }

  log.debug('Document downloaded', { name });
  return { success: true, file, name };
}

/**
 * Downloads a PDF from a signed URL and opens the native share sheet
 * Uses expo-file-system SDK 54+ API with File class
 * @param pdfUrl - Signed URL to download the PDF from
 * @param filename - Name for the downloaded file (e.g., "GRN_Z0797.pdf")
 * @returns Result indicating success or failure
 */
export async function downloadAndSharePDF(
  pdfUrl: string,
  filename: string
): Promise<ShareResult> {
  let downloadedFile: File | undefined;
  try {
    // Check if sharing is available on this device
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      log.warn('Sharing not available on this device');
      return {
        success: false,
        error: t('errors.pdf.sharingUnavailable'),
      };
    }

    const downloaded = await downloadDocument(pdfUrl, filename);
    if (!downloaded.success) {
      return { success: false, error: downloaded.error };
    }
    downloadedFile = downloaded.file;
    const shared = downloaded.file;

    // Open native share sheet. The hand-off keeps the share round trip from
    // suspending credentialed work when the app returns.
    await withNativeHandoff(() =>
      Sharing.shareAsync(shared.uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('errors.pdf.shareDialogTitle', { name: downloaded.name }),
        UTI: 'com.adobe.pdf', // iOS specific
      })
    );

    log.debug('Share sheet closed', { name: downloaded.name });

    // Clean up the cached file after a delay (give the share target time to
    // read it); the app-start and session sweeps remove anything left over.
    scheduleCleanup(shared);

    return { success: true };
  } catch (error) {
    log.error('Document share failed');
    deleteQuietly(downloadedFile);
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.shareFailed'),
    };
  }
}

/**
 * Downloads a PDF without sharing (save to device)
 * Note: This saves to the app's shared-documents cache directory, which the
 * app sweeps at start and on logout. For saving to a user-accessible
 * location, additional permissions and expo-media-library would be needed.
 * @param pdfUrl - Signed URL to download the PDF from
 * @param filename - Name for the downloaded file
 * @returns Result with local file path on success
 */
export async function downloadPDF(
  pdfUrl: string,
  filename: string
): Promise<ShareResult & { localUri?: string }> {
  try {
    const downloaded = await downloadDocument(pdfUrl, filename);
    if (!downloaded.success) {
      return { success: false, error: downloaded.error };
    }
    return {
      success: true,
      localUri: downloaded.file.uri,
    };
  } catch (error) {
    log.error('Document download failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : t('errors.pdf.downloadFailed'),
    };
  }
}
