/**
 * F5: the 25 MB cap on a shared document must bound the download itself, not
 * only what is kept after the whole body has been read. A body with no length,
 * or with a length below what it really sends, is stopped as soon as it passes
 * the cap, and the part already written is deleted.
 *
 * One scripted server answers both ways a document could be read: through
 * `fetch` (the whole body handed to JavaScript by `arrayBuffer()`) and through
 * expo-file-system's native download (written to the file in chunks, with
 * progress events and an abort signal). The test counts what the server sent,
 * what reached JavaScript, and what was left on disk.
 */
import * as Sharing from 'expo-sharing';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { MAX_SHARED_DOCUMENT_BYTES, downloadAndSharePDF, downloadPDF } from '../shareDocument';

const MiB = 1024 * 1024;
/** The server sends the body in chunks of this size (a progress event follows each). */
const CHUNK = MiB;

interface Script {
  status?: number;
  /** The Content-Length header; null for none. */
  contentLength?: number | null;
  /** What the body really is. */
  bodyBytes: number;
  /** Called after each chunk the server has sent, with the chunk's number (1-based). */
  onChunk?: (count: number) => void;
}

const server = {
  script: { bodyBytes: 0 } as Script,
  /** Body bytes the server has sent. */
  sent: 0,
  /** Body bytes handed to JavaScript in one buffer. */
  bufferedInJs: 0,
  completed: false,
  reset(script: Script) {
    this.script = script;
    this.sent = 0;
    this.bufferedInJs = 0;
    this.completed = false;
  },
};

// In-memory file system, with the native download that writes into it chunk by chunk.
jest.mock('expo-file-system', () => {
  const entries = new Map<string, { kind: 'dir' | 'file'; size: number }>();
  const join = (parts: Array<string | { uri: string }>) =>
    parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/').replace(/\/+$/, '');
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return entries.get(this.uri)?.kind === 'dir'; }
    create() { entries.set(this.uri, { kind: 'dir', size: 0 }); }
    list() { return []; }
    delete() { entries.delete(this.uri); }
  }
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return entries.get(this.uri)?.kind === 'file'; }
    get size() { return entries.get(this.uri)?.size ?? 0; }
    write(bytes: { byteLength?: number; length?: number }) { entries.set(this.uri, { kind: 'file', size: bytes.byteLength ?? bytes.length ?? 0 }); }
    delete() { if (!entries.delete(this.uri)) throw new Error('File does not exist'); }
    static downloadFileAsync = jest.fn();
  }
  const Paths = { cache: new Directory('file:///cache') };
  return { Directory, File, Paths, __fs: { entries } };
});
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('@/config/nativeHandoff', () => ({
  withNativeHandoff: jest.fn((run: () => Promise<unknown>) => run()),
}));
// The session parts of the gated fetch: the identity gate, and a read fetch that refuses a body
// read after its session generation was replaced (as the real one does).
jest.mock('@/config/supabaseConfig', () => {
  const lifecycle = jest.requireActual('@/config/sessionLifecycle');
  return {
    REQUEST_TIME_LIMIT_MS: { read: 30000, write: 60000, transfer: 120000 },
    trackReadRequest: jest.fn(() => ({ started: true, release: () => {} })),
    awaitIdentityGate: jest.fn(async (generation: number) => {
      if (generation !== lifecycle.getSessionGeneration()) throw new Error('Session changed');
    }),
    createSessionReadFetch: () => {
      const generation = lifecycle.getSessionGeneration();
      return async (url: string) => {
        const response = await global.fetch(url);
        return {
          ...response,
          arrayBuffer: async () => {
            const body = await response.arrayBuffer();
            if (generation !== lifecycle.getSessionGeneration()) throw new Error('Session changed');
            return body;
          },
        };
      };
    },
  };
});

const { File: MockFile, __fs: fs } = jest.requireMock('expo-file-system') as {
  File: { downloadFileAsync: jest.Mock };
  __fs: { entries: Map<string, { kind: 'dir' | 'file'; size: number }> };
};
const sharedDir = 'file:///cache/shared-documents';
const signedUrl = 'https://warehouse.example.test/storage/v1/object/sign/documents/report/stock.pdf?token=fictional-private-link';
const originalFetch = global.fetch;
let logs: jest.SpyInstance[];

/** The server read through fetch: the whole body reaches JavaScript at once. */
function fetchFromServer(): Promise<unknown> {
  const { status = 200, contentLength = null, bodyBytes, onChunk } = server.script;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-length' && contentLength !== null ? String(contentLength) : null) },
    arrayBuffer: async () => {
      let count = 0;
      while (server.sent < bodyBytes) {
        server.sent += Math.min(CHUNK, bodyBytes - server.sent);
        onChunk?.(++count);
      }
      server.completed = true;
      server.bufferedInJs = bodyBytes;
      return { byteLength: bodyBytes };
    },
  });
}

/**
 * The server read by the native download (expo-file-system `File.downloadFileAsync`): each
 * chunk is written to the file, then a progress event; an aborted signal stops it and leaves
 * the part written, as the native code does.
 */
async function downloadFromServer(url: string, to: { uri: string }, options?: { onProgress?: (progress: { bytesWritten: number; totalBytes: number }) => void; signal?: AbortSignal }) {
  const { status = 200, contentLength = null, bodyBytes, onChunk } = server.script;
  const aborted = () => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  };
  if (options?.signal?.aborted) throw aborted();
  await Promise.resolve();
  if (status < 200 || status >= 300) throw new Error(`Unable to download a file: response has status: ${status}`);
  fs.entries.set(to.uri, { kind: 'file', size: 0 });
  let count = 0;
  while (server.sent < bodyBytes) {
    if (options?.signal?.aborted) throw aborted();
    server.sent += Math.min(CHUNK, bodyBytes - server.sent);
    fs.entries.set(to.uri, { kind: 'file', size: server.sent });
    onChunk?.(++count);
    options?.onProgress?.({ bytesWritten: server.sent, totalBytes: contentLength ?? -1 });
    await Promise.resolve();
  }
  if (options?.signal?.aborted) throw aborted();
  server.completed = true;
  return to;
}

const sharedPdfs = () => [...fs.entries.keys()].filter(uri => uri.startsWith(`${sharedDir}/`));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  fs.entries.clear();
  fs.entries.set('file:///cache', { kind: 'dir', size: 0 });
  global.fetch = jest.fn(fetchFromServer) as never;
  MockFile.downloadFileAsync.mockImplementation(downloadFromServer);
  logs = ['log', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
});
afterEach(() => {
  logs.forEach(log => log.mockRestore());
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('the 25 MB cap bounds the download', () => {
  it('stops a body with no Content-Length as soon as it passes the cap, and deletes the part written', async () => {
    server.reset({ contentLength: null, bodyBytes: 40 * MiB });
    const result = await downloadAndSharePDF(signedUrl, 'Stock summary.pdf');
    expect(result).toEqual({ success: false, error: 'This document is larger than 25 MB and cannot be shared from the app.' });
    // Not the whole 40 MB: at most the cap and the chunk that crossed it, and none of it in JavaScript.
    expect(server.completed).toBe(false);
    expect(server.sent).toBeLessThanOrEqual(MAX_SHARED_DOCUMENT_BYTES + CHUNK);
    expect(server.bufferedInJs).toBe(0);
    expect(sharedPdfs()).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('stops a body whose Content-Length is lower than what it sends once it passes the cap', async () => {
    server.reset({ contentLength: MiB, bodyBytes: 40 * MiB });
    const result = await downloadAndSharePDF(signedUrl, 'Stock summary.pdf');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/larger than 25 MB/);
    expect(server.completed).toBe(false);
    expect(server.sent).toBeLessThanOrEqual(MAX_SHARED_DOCUMENT_BYTES + CHUNK);
    expect(server.bufferedInJs).toBe(0);
    expect(sharedPdfs()).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('refuses a declared length over the cap on the first chunk', async () => {
    server.reset({ contentLength: 30 * MiB, bodyBytes: 30 * MiB });
    const result = await downloadAndSharePDF(signedUrl, 'Stock summary.pdf');
    expect(result.error).toMatch(/larger than 25 MB/);
    expect(server.sent).toBeLessThanOrEqual(CHUNK);
    expect(sharedPdfs()).toEqual([]);
  });

  it('downloads a 24 MB PDF into the shared-documents file, shares it, and removes it after the delay', async () => {
    server.reset({ contentLength: 24 * MiB, bodyBytes: 24 * MiB });
    expect(await downloadAndSharePDF(signedUrl, 'Stock summary.pdf')).toEqual({ success: true });
    expect(server.completed).toBe(true);
    // Written by the native download, not read into JavaScript and written from there.
    expect(server.bufferedInJs).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
    // The signed link carries the access: no other header is sent, as before.
    expect(MockFile.downloadFileAsync).toHaveBeenCalledTimes(1);
    const [url, destination, options] = MockFile.downloadFileAsync.mock.calls[0];
    expect(url).toBe(signedUrl);
    expect(destination.uri).toBe(`${sharedDir}/Stock_summary.pdf`);
    expect(options.headers).toBeUndefined();
    expect(fs.entries.get(`${sharedDir}/Stock_summary.pdf`)).toEqual({ kind: 'file', size: 24 * MiB });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(`${sharedDir}/Stock_summary.pdf`, expect.objectContaining({ mimeType: 'application/pdf' }));
    jest.advanceTimersByTime(60_000);
    expect(sharedPdfs()).toEqual([]);
    expect(JSON.stringify(logs.flatMap(log => log.mock.calls))).not.toContain('fictional-private-link');
  });

  it('refuses the file when the session changes during the download, and deletes the part written', async () => {
    server.reset({ contentLength: 20 * MiB, bodyBytes: 20 * MiB, onChunk: count => count === 3 && advanceSessionGeneration() });
    const result = await downloadAndSharePDF(signedUrl, 'Stock summary.pdf');
    expect(result).toEqual({ success: false, error: 'Session changed' });
    // Stopped at once, not read to the end.
    expect(server.completed).toBe(false);
    expect(server.sent).toBeLessThanOrEqual(4 * CHUNK);
    expect(sharedPdfs()).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('refuses the file when a server switch begins during the download (the tracked read is aborted)', async () => {
    const { trackReadRequest } = jest.requireMock('@/config/supabaseConfig') as { trackReadRequest: jest.Mock };
    let tracked: AbortController | undefined;
    trackReadRequest.mockImplementationOnce((controller: AbortController) => {
      tracked = controller;
      return { started: true, release: () => {} };
    });
    server.reset({ contentLength: 20 * MiB, bodyBytes: 20 * MiB, onChunk: count => count === 3 && tracked?.abort() });
    const result = await downloadAndSharePDF(signedUrl, 'Stock summary.pdf');
    expect(result).toEqual({ success: false, error: 'Session changed' });
    expect(server.completed).toBe(false);
    expect(sharedPdfs()).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('starts nothing while a server switch is running', async () => {
    const { trackReadRequest } = jest.requireMock('@/config/supabaseConfig') as { trackReadRequest: jest.Mock };
    trackReadRequest.mockReturnValueOnce({ started: false, release: () => {} });
    server.reset({ contentLength: MiB, bodyBytes: MiB });
    expect(await downloadPDF(signedUrl, 'Stock summary.pdf')).toEqual({ success: false, error: 'Session changed' });
    expect(server.sent).toBe(0);
    expect(sharedPdfs()).toEqual([]);
  });

  it('starts nothing for a session that changed before the download began', async () => {
    server.reset({ contentLength: MiB, bodyBytes: MiB });
    const { awaitIdentityGate } = jest.requireMock('@/config/supabaseConfig') as { awaitIdentityGate: jest.Mock };
    awaitIdentityGate.mockRejectedValueOnce(new Error('Session changed'));
    expect(await downloadPDF(signedUrl, 'Stock summary.pdf')).toEqual({ success: false, error: 'Session changed' });
    expect(server.sent).toBe(0);
    expect(sharedPdfs()).toEqual([]);
  });

  it('reports a refused download by its status and leaves no file', async () => {
    server.reset({ status: 403, bodyBytes: 0 });
    expect(await downloadAndSharePDF(signedUrl, 'Stock summary.pdf')).toEqual({ success: false, error: 'Failed to download PDF (status: 403)' });
    expect(sharedPdfs()).toEqual([]);
  });
});
