/**
 * shareCsvFile: a CSV made on the phone is written to the shared-documents cache and handed to the share sheet; the
 * file name always ends in .csv, the text is UTF-8 with a byte order mark, and a failure leaves no file behind.
 */
import * as Sharing from 'expo-sharing';
import { shareCsvFile } from '../shareDocument';

const mockFiles = new Map<string, string>();
let mockDirExists = false;
jest.mock('expo-file-system', () => {
  const join = (parts: Array<string | { uri: string }>) => parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/').replace(/\/+$/, '');
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return mockDirExists; }
    create() { mockDirExists = true; }
  }
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) { this.uri = join(parts); }
    get exists() { return mockFiles.has(this.uri); }
    create() { mockFiles.set(this.uri, ''); }
    write(content: string) { mockFiles.set(this.uri, content); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

beforeEach(() => {
  // The file's cleanup is a timer of 60 s: faked, so none is left running.
  jest.useFakeTimers();
  mockFiles.clear();
  mockDirExists = false;
  jest.clearAllMocks();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('writes the CSV with a byte order mark under a .csv name and opens the share sheet for it', async () => {
  const result = await shareCsvFile('a,b\r\n1,2\r\n', 'Chamber 1_2026-10-01_2026-11-01.csv');
  expect(result).toEqual({ success: true });
  const [uri, options] = jest.mocked(Sharing.shareAsync).mock.calls[0];
  expect(uri).toBe('file:///cache/shared-documents/Chamber_1_2026-10-01_2026-11-01.csv');
  expect(options).toMatchObject({ mimeType: 'text/csv' });
  expect(mockFiles.get(uri)).toBe(`${String.fromCharCode(0xfeff)}a,b\r\n1,2\r\n`);
});

it('never ends in .pdf and never keeps a path from the name', async () => {
  await shareCsvFile('x', '../../evil/..\\name.csv');
  const uri = jest.mocked(Sharing.shareAsync).mock.calls[0][0];
  expect(uri.startsWith('file:///cache/shared-documents/')).toBe(true);
  expect(uri.endsWith('.csv')).toBe(true);
  expect(uri).not.toContain('..');
});

it('says so when sharing is not available, and writes nothing', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  const result = await shareCsvFile('x', 'a.csv');
  expect(result.success).toBe(false);
  expect(mockFiles.size).toBe(0);
});

it('removes the file when the share sheet fails', async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('cancelled'));
  const result = await shareCsvFile('x', 'a.csv');
  expect(result.success).toBe(false);
  expect(mockFiles.size).toBe(0);
});
