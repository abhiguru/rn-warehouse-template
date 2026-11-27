/// <reference types="jest" />
/**
 * The phone's files for the kept photos (WH-299): `expo-file-system`, both its File/Directory API and the legacy one,
 * over one map in memory. A download is answered at the edge: it fails when the phone is offline (`env.reachable`).
 */
import { env } from './phoneEnv';

export const DOCUMENT_DIRECTORY = 'file:///phone/documents/';
export const files = {
  /** Path to size in bytes. */
  held: new Map<string, number>(),
  downloads: [] as { url: string; to: string }[],
  reset() {
    files.held.clear();
    files.downloads = [];
  },
  /** The files under the kept-photo folder. */
  photos: () => [...files.held.keys()].filter(path => path.includes('phone-copy-photos/')),
};

const join = (parts: unknown[]) =>
  parts.map(part => (typeof part === 'string' ? part : (part as { uri: string }).uri))
    .reduce((path, part) => (path ? `${path.replace(/\/+$/, '')}/${part.replace(/^\/+/, '')}` : part), '');

async function download(url: string, to: string) {
  if (!env.reachable) throw new Error('Network request failed');
  files.downloads.push({ url, to });
  files.held.set(to, 1200);
}

class FakeFile {
  uri: string;
  constructor(...parts: unknown[]) { this.uri = join(parts); }
  get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
  get exists() { return files.held.has(this.uri); }
  get size() { return files.held.get(this.uri) ?? 0; }
  async arrayBuffer() { return new ArrayBuffer(this.size); }
  create() { files.held.set(this.uri, 0); }
  write(data: { length: number }) { files.held.set(this.uri, data.length); }
  delete() { files.held.delete(this.uri); }
  move(to: { uri: string }) {
    const target = to instanceof FakeDirectory ? join([to.uri, this.name]) : to.uri;
    files.held.set(target, this.size);
    files.held.delete(this.uri);
    this.uri = target;
  }
  /** A copy: the source stays, the target holds the same bytes. */
  copy(to: { uri: string }) {
    const target = to instanceof FakeDirectory ? join([to.uri, this.name]) : to.uri;
    files.held.set(target, this.size);
  }
  static async downloadFileAsync(url: string, to: { uri: string }) {
    const target = to instanceof FakeDirectory ? join([to.uri, url.split('?')[0].split('/').pop()]) : to.uri;
    await download(url, target);
    return new FakeFile(target);
  }
}
class FakeDirectory {
  uri: string;
  constructor(...parts: unknown[]) { this.uri = join(parts); }
  private get prefix() { return `${this.uri.replace(/\/+$/, '')}/`; }
  private get inside() { return [...files.held.keys()].filter(path => path.startsWith(this.prefix)); }
  get exists() { return true; }
  create() { /* a folder holds nothing by itself */ }
  list() { return this.inside.map(path => new FakeFile(path)); }
  delete() { for (const path of this.inside) files.held.delete(path); }
}

export const fileSystemModule = () => ({
  Paths: {
    document: new FakeDirectory(DOCUMENT_DIRECTORY),
    cache: new FakeDirectory('file:///phone/cache/'),
    get availableDiskSpace() { return env.freeBytes; },
    get totalDiskSpace() { return 64_000_000_000; },
  },
  File: FakeFile,
  Directory: FakeDirectory,
  documentDirectory: DOCUMENT_DIRECTORY,
  getFreeDiskStorageAsync: async () => env.freeBytes,
  getInfoAsync: async (path: string) => ({ exists: files.held.has(path), size: files.held.get(path) ?? 1_000_000 }),
  makeDirectoryAsync: async () => undefined,
  downloadAsync: async (url: string, to: string) => {
    await download(url, to);
    return { uri: to, status: 200 };
  },
  deleteAsync: async (path: string) => {
    for (const held of [...files.held.keys()]) {
      if (held === path || held.startsWith(`${path.replace(/\/+$/, '')}/`)) files.held.delete(held);
    }
  },
});
