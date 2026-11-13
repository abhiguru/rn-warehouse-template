/**
 * WH-158 (contract product/tech/accountant-pack.md section 7): shareFileBytes(bytes, fileName, { mimeType, UTI }) writes a file made
 * on the server (the accountant pack's zip) to the shared-documents cache, keeps its .zip name and opens the share sheet. A file over
 * 25 MB is refused with the `packTooLarge` text. Written BEFORE the build: fails today because shareFileBytes does not exist.
 */
import * as Sharing from 'expo-sharing';
import { setLanguage, t } from '@/i18n';
import { en } from '@/i18n/locales/en';
import { MAX_SHARED_DOCUMENT_BYTES, shareFileBytes } from '../shareDocument';

const mockFiles = new Map<string, Uint8Array | string>();
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
    write(content: Uint8Array | string) { mockFiles.set(this.uri, content); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: jest.fn((run: () => Promise<unknown>) => run()) }));

const ZIP = { mimeType: 'application/zip', UTI: 'public.zip-archive' };

beforeEach(() => {
  jest.useFakeTimers();
  mockFiles.clear();
  mockDirExists = false;
  jest.clearAllMocks();
  setLanguage('en');
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
  ['log', 'warn', 'error', 'debug'].forEach(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const bytesOf = (...numbers: number[]) => new Uint8Array(numbers).buffer;

it('[crit 15] writes the bytes under the file name with .zip kept and opens the share sheet as a zip', async () => {
  const result = await shareFileBytes(bytesOf(80, 75, 3, 4), 'demo-cold-storage-accountant-pack-2026-10.zip', ZIP);
  expect(result).toEqual({ success: true });
  const [uri, options] = jest.mocked(Sharing.shareAsync).mock.calls[0];
  expect(uri).toBe('file:///cache/shared-documents/demo-cold-storage-accountant-pack-2026-10.zip');
  expect(options).toMatchObject({ mimeType: 'application/zip', UTI: 'public.zip-archive' });
  const written = mockFiles.get(uri) as Uint8Array;
  expect([...new Uint8Array(written)]).toEqual([80, 75, 3, 4]);
});

it('a name with a path is cleaned like the other shared documents, and still ends in .zip', async () => {
  await shareFileBytes(bytesOf(1), '../../etc/pack 1.zip', ZIP);
  const [uri] = jest.mocked(Sharing.shareAsync).mock.calls[0];
  expect(uri.startsWith('file:///cache/shared-documents/')).toBe(true);
  expect(uri).not.toContain('..');
  expect(uri.endsWith('.zip')).toBe(true);
  expect(uri.endsWith('.pdf')).toBe(false);
});

it('[crit 15] a file of exactly 25 MB is shared; one byte more is refused with packTooLarge, nothing written and no share sheet', async () => {
  expect(MAX_SHARED_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  const ok = await shareFileBytes(new ArrayBuffer(MAX_SHARED_DOCUMENT_BYTES), 'ok.zip', ZIP);
  expect(ok).toEqual({ success: true });
  jest.mocked(Sharing.shareAsync).mockClear();
  mockFiles.clear();
  const refused = await shareFileBytes(new ArrayBuffer(MAX_SHARED_DOCUMENT_BYTES + 1), 'big.zip', ZIP);
  expect(refused.success).toBe(false);
  expect(refused.error).toBe(en.reports.accountantPack.packTooLarge);
  expect(refused.error).toBe('This pack is too large. Choose a shorter period.');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect([...mockFiles.keys()].some(uri => uri.endsWith('big.zip'))).toBe(false);
});

it('the refusal is worded in Gujarati when the app is', async () => {
  setLanguage('gu');
  const refused = await shareFileBytes(new ArrayBuffer(MAX_SHARED_DOCUMENT_BYTES + 1), 'big.zip', ZIP);
  expect(refused.error).toBe('આ ફાઇલો બહુ મોટી છે. ટૂંકો સમયગાળો પસંદ કરો.');
  expect(refused.error).toBe(t('reports.accountantPack.packTooLarge'));
});

it('no share sheet on the device: the existing text, no file', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  const result = await shareFileBytes(bytesOf(1), 'a.zip', ZIP);
  expect(result).toEqual({ success: false, error: t('errors.pdf.sharingUnavailable') });
  expect(mockFiles.size).toBe(0);
});

it('a share that throws leaves no file behind and says it failed', async () => {
  jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('share sheet closed badly'));
  const result = await shareFileBytes(bytesOf(1), 'a.zip', ZIP);
  expect(result.success).toBe(false);
  expect(typeof result.error).toBe('string');
  expect([...mockFiles.keys()].some(uri => uri.endsWith('a.zip'))).toBe(false);
});
