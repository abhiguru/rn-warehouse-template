import * as Sharing from 'expo-sharing';
import { withNativeHandoff } from '@/config/nativeHandoff';
import {
  MAX_SHARED_DOCUMENT_BYTES,
  downloadAndSharePDF,
  downloadPDF,
  sanitizeDocumentFilename,
  sweepSharedDocuments,
} from '../shareDocument';

// In-memory stand-in for the expo-file-system 19 Paths/Directory/File API.
jest.mock('expo-file-system', () => {
  const entries = new Map<string, { kind: 'dir' | 'file'; bytes?: Uint8Array }>();
  const failing = new Set<string>();
  const join = (parts: Array<string | { uri: string }>) =>
    parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/').replace(/\/+$/, '');
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return entries.get(this.uri)?.kind === 'dir'; }
    create() { entries.set(this.uri, { kind: 'dir' }); }
    list() {
      if (!this.exists) throw new Error('Directory does not exist');
      return [...entries.keys()]
        .filter(uri => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/'))
        .map(uri => (entries.get(uri)!.kind === 'dir' ? new Directory(uri) : new File(uri)));
    }
    delete() {
      if (failing.has(this.uri)) throw new Error('locked');
      for (const uri of [...entries.keys()]) if (uri === this.uri || uri.startsWith(`${this.uri}/`)) entries.delete(uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return entries.get(this.uri)?.kind === 'file'; }
    write(bytes: Uint8Array) { entries.set(this.uri, { kind: 'file', bytes }); }
    delete() {
      if (failing.has(this.uri)) throw new Error('locked');
      if (!entries.delete(this.uri)) throw new Error('File does not exist');
    }
  }
  const Paths = { cache: new Directory('file:///cache') };
  return { Directory, File, Paths, __fs: { entries, failing } };
});
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('@/config/supabaseConfig', () => ({
  createSessionReadFetch: () => (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));
jest.mock('@/config/nativeHandoff', () => ({
  withNativeHandoff: jest.fn((run: () => Promise<unknown>) => run()),
}));

const fs = jest.requireMock('expo-file-system').__fs as {
  entries: Map<string, { kind: 'dir' | 'file'; bytes?: Uint8Array }>;
  failing: Set<string>;
};
const sharedDir = 'file:///cache/shared-documents';
const signedUrl = 'https://warehouse.example.test/storage/v1/object/sign/documents/grn.pdf?token=fictional-private-link';
const originalFetch = global.fetch;
let logs: jest.SpyInstance[];

function response(options: { ok?: boolean; status?: number; contentLength?: string | null; byteLength?: number } = {}) {
  const { ok = true, status = 200, contentLength = null, byteLength = 1024 } = options;
  const arrayBuffer = jest.fn(async () => ({ byteLength }) as ArrayBuffer);
  return {
    body: { ok, status, headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? contentLength : null) }, arrayBuffer },
    arrayBuffer,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  fs.entries.clear();
  fs.failing.clear();
  fs.entries.set('file:///cache', { kind: 'dir' });
  fs.entries.set('file:///cache/unrelated.tmp', { kind: 'file' });
  global.fetch = jest.fn();
  logs = ['log', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('sanitizeDocumentFilename', () => {
  it.each([
    ['GRN_Z0797.pdf', 'GRN_Z0797.pdf'],
    ['Invoice_123_2026.PDF', 'Invoice_123_2026.pdf'],
    ['../../etc/passwd', 'passwd.pdf'],
    ['..\\..\\secret.pdf', 'secret.pdf'],
    ['reports/stock summary (Oct).pdf', 'stock_summary_Oct.pdf'],
    ['.hidden.pdf', 'hidden.pdf'],
    ['..', 'document.pdf'],
    ['', 'document.pdf'],
    ['   ', 'document.pdf'],
    ['con\u0000trol\u001fchars.pdf', 'con_trol_chars.pdf'],
    ['notes.txt', 'notes.txt.pdf'],
    ['Ünïcode Näme.pdf', 'Ünïcode_Näme.pdf'],
  ])('maps %p to %p', (input, expected) => {
    expect(sanitizeDocumentFilename(input)).toBe(expected);
  });

  it('caps an overlong stem and keeps the extension', () => {
    const name = sanitizeDocumentFilename(`${'a'.repeat(400)}.pdf`);
    expect(name).toHaveLength(104);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('never yields a separator or a leading dot', () => {
    for (const input of ['/', '\\', '/./', 'a/../b', '...', '-.-']) {
      const name = sanitizeDocumentFilename(input);
      expect(name).not.toMatch(/[\\/]/);
      expect(name).not.toMatch(/^\./);
      expect(name.endsWith('.pdf')).toBe(true);
    }
  });

  describe('names in any script', () => {
    // UTF-8 length; encodeURIComponent also throws on a lone surrogate.
    const utf8Bytes = (text: string) => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, 'x').length;

    it.each([
      // Letters, the virama (U+0ACD) and the vowel signs ૉ ી ે are kept; the space becomes '_'.
      ['સ્ટૉક_ગ્રીન વેલી.pdf', 'સ્ટૉક_ગ્રીન_વેલી.pdf'],
      ['રમેશ ટ્રેડર્સ', 'રમેશ_ટ્રેડર્સ.pdf'],
      ['ગ્રીન.PDF', 'ગ્રીન.pdf'],
      // Mixed scripts, ASCII and Gujarati digits; each run of anything else is one '_'.
      ['GRN_ગ્રીન વેલી (Oct) #12 — ૧૨.pdf', 'GRN_ગ્રીન_વેલી_Oct_12_૧૨.pdf'],
      ['Stock summary: Patel & Sons / રમેશ.pdf', 'રમેશ.pdf'],
      ['Ünïcode Näme', 'Ünïcode_Näme.pdf'],
    ])('keeps %p as %p', (input, expected) => {
      expect(sanitizeDocumentFilename(input)).toBe(expected);
    });

    it.each([
      ['../../ગ્રીન/વેલી.pdf', 'વેલી.pdf'],
      ['..\\ગ્રીન\\..\\વેલી', 'વેલી.pdf'],
      ['.ગ્રીન.pdf', 'ગ્રીન.pdf'],
      ['..ગ્રીન', 'ગ્રીન.pdf'],
      ['ગ્રીન\u0000વેલી\u001f\u007f.pdf', 'ગ્રીન_વેલી.pdf'],
      // A bidi override cannot make the name read as another extension.
      ['invoice‮fdp.exe', 'invoice_fdp.exe.pdf'],
      // A lone surrogate is not a letter.
      ['ગ્રીન\uD800વેલી', 'ગ્રીન_વેલી.pdf'],
      // Look-alike slashes are not letters either.
      ['ગ્રીન∕વેલી／x', 'ગ્રીન_વેલી_x.pdf'],
    ])('neutralises %p as %p', (input, expected) => {
      expect(sanitizeDocumentFilename(input)).toBe(expected);
    });

    it.each(['!!! ### ***.pdf', ' . _ - ', '\u0000\u001f', '‮‍', '…—“”.pdf', '🙂🙂'])(
      'falls back when %p has no letter or digit',
      input => {
        expect(sanitizeDocumentFilename(input)).toBe('document.pdf');
        expect(sanitizeDocumentFilename(input, 'Stock.pdf')).toBe('Stock.pdf');
      }
    );

    it('caps an overlong Gujarati stem in bytes and keeps the extension', () => {
      const name = sanitizeDocumentFilename(`${'ગ્રીન વેલી '.repeat(40)}.pdf`);
      const stem = name.slice(0, -'.pdf'.length);
      expect(name.endsWith('.pdf')).toBe(true);
      expect(utf8Bytes(stem)).toBeLessThanOrEqual(200);
      expect(utf8Bytes(stem)).toBeGreaterThan(195);
      expect(utf8Bytes(name)).toBeLessThan(255);
      expect(stem.startsWith('ગ્રીન_વેલી_ગ્રીન')).toBe(true);
      expect(name).not.toMatch(/[\\/]|^\./);
    });

    it('never cuts a letter outside the BMP in half', () => {
      // U+20000 is a letter (Lo) written as a surrogate pair.
      const name = sanitizeDocumentFilename(`x${'\u{20000}'.repeat(80)}`);
      expect(() => encodeURIComponent(name)).not.toThrow();
      expect(utf8Bytes(name.slice(0, -'.pdf'.length))).toBe(1 + 4 * 49);
      expect(name.endsWith('\u{20000}.pdf')).toBe(true);
    });
  });
});

describe('downloadAndSharePDF', () => {
  it('stores the document under the shared-documents directory with a sanitized name and shares that file', async () => {
    const { body } = response({ contentLength: '1024' });
    jest.mocked(fetch).mockResolvedValue(body as never);
    expect(await downloadAndSharePDF(signedUrl, '../GRN Z0797.pdf')).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(signedUrl);
    expect(fs.entries.get(`${sharedDir}/GRN_Z0797.pdf`)?.kind).toBe('file');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(`${sharedDir}/GRN_Z0797.pdf`, expect.objectContaining({ mimeType: 'application/pdf', dialogTitle: 'Share GRN_Z0797.pdf' }));
    expect(withNativeHandoff).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain('fictional-private-link');
  });

  it('removes the shared file after the cleanup delay', async () => {
    jest.mocked(fetch).mockResolvedValue(response().body as never);
    await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf');
    expect(fs.entries.has(`${sharedDir}/GRN_Z0797.pdf`)).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(fs.entries.has(`${sharedDir}/GRN_Z0797.pdf`)).toBe(false);
  });

  it('refuses a document whose Content-Length exceeds 25 MB before reading the body', async () => {
    const { body, arrayBuffer } = response({ contentLength: String(MAX_SHARED_DOCUMENT_BYTES + 1) });
    jest.mocked(fetch).mockResolvedValue(body as never);
    const result = await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/larger than 25 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect([...fs.entries.keys()].some(uri => uri.startsWith(sharedDir))).toBe(false);
  });

  it('refuses a document whose received bytes exceed 25 MB when no length was declared', async () => {
    jest.mocked(fetch).mockResolvedValue(response({ byteLength: MAX_SHARED_DOCUMENT_BYTES + 1 }).body as never);
    const result = await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/larger than 25 MB/);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect([...fs.entries.keys()].some(uri => uri.endsWith('.pdf'))).toBe(false);
  });

  it('accepts a document of exactly 25 MB', async () => {
    jest.mocked(fetch).mockResolvedValue(response({ contentLength: String(MAX_SHARED_DOCUMENT_BYTES), byteLength: MAX_SHARED_DOCUMENT_BYTES }).body as never);
    expect(await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf')).toEqual({ success: true });
  });

  it('reports a failed download status without sharing', async () => {
    jest.mocked(fetch).mockResolvedValue(response({ ok: false, status: 403 }).body as never);
    expect(await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf')).toEqual({ success: false, error: 'Failed to download PDF (status: 403)' });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('does not download when sharing is unavailable', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    expect((await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf')).success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes the downloaded file when the share sheet throws', async () => {
    jest.mocked(fetch).mockResolvedValue(response().body as never);
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Share cancelled by system'));
    expect(await downloadAndSharePDF(signedUrl, 'GRN_Z0797.pdf')).toEqual({ success: false, error: 'Share cancelled by system' });
    expect(fs.entries.has(`${sharedDir}/GRN_Z0797.pdf`)).toBe(false);
  });
});

describe('downloadPDF', () => {
  it('returns the shared-documents path of the sanitized file', async () => {
    jest.mocked(fetch).mockResolvedValue(response().body as never);
    expect(await downloadPDF(signedUrl, 'Invoice 12/2026.pdf')).toEqual({ success: true, localUri: `${sharedDir}/2026.pdf` });
  });

  it('applies the same size cap', async () => {
    jest.mocked(fetch).mockResolvedValue(response({ contentLength: String(MAX_SHARED_DOCUMENT_BYTES + 1) }).body as never);
    expect((await downloadPDF(signedUrl, 'Invoice.pdf')).success).toBe(false);
  });
});

describe('sweepSharedDocuments', () => {
  it('deletes every entry in the shared-documents directory and nothing else', async () => {
    fs.entries.set(sharedDir, { kind: 'dir' });
    fs.entries.set(`${sharedDir}/GRN_Z0797.pdf`, { kind: 'file' });
    fs.entries.set(`${sharedDir}/Invoice_1.pdf`, { kind: 'file' });
    fs.entries.set(`${sharedDir}/nested`, { kind: 'dir' });
    fs.entries.set(`${sharedDir}/nested/deep.pdf`, { kind: 'file' });
    await expect(sweepSharedDocuments()).resolves.toBeUndefined();
    expect([...fs.entries.keys()].sort()).toEqual(['file:///cache', 'file:///cache/unrelated.tmp', sharedDir].sort());
  });

  it('does nothing when the directory does not exist', async () => {
    await expect(sweepSharedDocuments()).resolves.toBeUndefined();
    expect(fs.entries.has(sharedDir)).toBe(false);
  });

  it('keeps sweeping past an entry that cannot be deleted and never throws', async () => {
    fs.entries.set(sharedDir, { kind: 'dir' });
    fs.entries.set(`${sharedDir}/locked.pdf`, { kind: 'file' });
    fs.entries.set(`${sharedDir}/free.pdf`, { kind: 'file' });
    fs.failing.add(`${sharedDir}/locked.pdf`);
    await expect(sweepSharedDocuments()).resolves.toBeUndefined();
    expect(fs.entries.has(`${sharedDir}/free.pdf`)).toBe(false);
    expect(fs.entries.has(`${sharedDir}/locked.pdf`)).toBe(true);
  });

  it('never throws when the directory cannot be listed', async () => {
    fs.entries.set(sharedDir, { kind: 'dir' });
    fs.failing.add(sharedDir);
    const listSpy = jest.spyOn(jest.requireMock('expo-file-system').Directory.prototype, 'list').mockImplementation(() => { throw new Error('EACCES'); });
    try {
      await expect(sweepSharedDocuments()).resolves.toBeUndefined();
    } finally {
      listSpy.mockRestore();
    }
  });
});
