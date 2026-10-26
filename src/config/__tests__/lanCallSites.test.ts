// The warehouse network path (WS-L) rewrites the host of canonical-origin URLs at the places that send
// or follow one, and nowhere else. This file lists those places. It fails when one of them loses its
// call, and when a new place appears: a new `fetch`, native download, signed-URL builder or cleartext URL
// has to be looked at against src/config/lanTransport.ts before it is added here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getConnectionPath, resetLanTransport, setLanContext, transportFetch } from '../lanTransport';

let mockSignedFails = false;
jest.mock('@/config/supabaseConfig', () => {
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) =>
          mockSignedFails
            ? { data: null, error: new Error('no') }
            : { data: { signedUrl: `https://facility.invalid/storage/v1/object/sign/${bucket}/${path}?token=abc` }, error: null },
      }),
    },
  };
  return {
    beginOperatorMutation: () => jest.fn(),
    getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
    getAuthenticatedClient: async () => client,
    getSupabaseWithJWT: async () => client,
    getSupabaseClient: () => client,
  };
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: jest.fn(), randomUUID: jest.fn() }));

const root = join(__dirname, '..', '..', '..');
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'tests' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
const sources = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))].map(path => ({
  file: relative(root, path),
  text: readFileSync(path, 'utf8'),
}));
/** The code of a file: block comments and whole-line or trailing `//` comments removed (`http://` is not one). */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const filesWith = (pattern: RegExp) => sources.filter(({ text }) => pattern.test(code(text))).map(({ file }) => file).sort();
const countIn = (file: string, pattern: RegExp) =>
  (code(sources.find(source => source.file === file)?.text ?? '').match(pattern) ?? []).length;

describe('the places the host is rewritten', () => {
  it('the gated fetch, discovery and the configuration fetch send through the transport, and no one else does', () => {
    expect(filesWith(/\btransportFetch\(/)).toEqual(
      ['src/config/lanTransport.ts', 'src/config/operatorServer.ts', 'src/config/supabaseConfig.ts', 'src/services/configService.ts'].sort()
    );
  });

  it('the share download and the signed-URL builders rewrite, and no one else does', () => {
    expect(filesWith(/\bviaCurrentPath\(/)).toEqual(
      [
        'src/config/lanTransport.ts',
        'src/features/dispatch/services/dispatchImageService.ts',
        'src/features/grn/services/grnFormService.ts',
        'src/features/grn/services/imageUploadService.ts',
        'src/services/dispatch-detail-service.ts',
        'src/services/grn-detail-service.ts',
        'src/utils/shareDocument.ts',
      ].sort()
    );
  });

  it('the eight signed-URL sites are the only createSignedUrl calls, and each hands its URL to viaCurrentPath', () => {
    const expected: Record<string, number> = {
      'src/features/dispatch/services/dispatchImageService.ts': 2,
      'src/features/grn/services/imageUploadService.ts': 2,
      'src/features/grn/services/grnFormService.ts': 2,
      'src/services/dispatch-detail-service.ts': 1,
      'src/services/grn-detail-service.ts': 1,
    };
    expect(filesWith(/\.createSignedUrl\(/)).toEqual(Object.keys(expected).sort());
    for (const [file, sites] of Object.entries(expected)) {
      expect(countIn(file, /\.createSignedUrl\(/g)).toBe(sites);
      // Each call is followed, in the same function, by the rewrite of what it returned.
      const lines = code(sources.find(source => source.file === file)?.text ?? '').split('\n');
      lines.forEach((line, index) => {
        if (line.includes('.createSignedUrl(')) expect(lines.slice(index, index + 40).join('\n')).toContain('viaCurrentPath(');
      });
    }
    // Direct storage URLs built from the client URL (the fallbacks of the two photo services) are rewritten too.
    for (const file of ['src/features/dispatch/services/dispatchImageService.ts', 'src/features/grn/services/imageUploadService.ts'])
      expect(countIn(file, /viaCurrentPath\(`\$\{getCurrentConfig\(\)\.url\}\/storage/g)).toBe(2);
  });

  it('the share download is the only native download', () => {
    expect(filesWith(/\.downloadFileAsync\(/)).toEqual(['src/utils/shareDocument.ts']);
    expect(filesWith(/\bnoteNativeReadFailed\(/)).toEqual(['src/config/lanTransport.ts', 'src/utils/shareDocument.ts']);
  });

  it('no other module calls fetch by itself: the central service, local photo files and the transport are the only ones', () => {
    expect(filesWith(/(^|[^.\w])fetch\(/)).toEqual(
      [
        'src/config/centralSession.ts', // the association service, not a facility
        'src/config/lanTransport.ts',
        'src/features/dispatch/services/dispatchImageService.ts', // `fetch(uri)` of a file on the phone
        'src/features/grn/services/imageUploadService.ts', // the same
        'src/features/reports/useReportQuery.ts', // a callback named fetch, not the network
      ].sort()
    );
  });

  it('the one cleartext URL the app builds comes from lanAddress.ts', () => {
    expect(filesWith(/['"`]http:\/\//)).toEqual(
      [
        'src/config/envConfig.ts', // the development-only http://localhost default and its validation
        'src/config/lanAddress.ts',
        'src/config/sentryConfig.ts', // a base for parsing a relative URL, never requested
      ].sort()
    );
  });
});

describe('the signed-URL helpers on the warehouse network path', () => {
  const PUBLIC = 'https://facility.invalid';
  const LAN = 'http://192.168.1.20:8080';
  const originalFetch = global.fetch;
  const mockSigned = (path: string) => `${PUBLIC}/storage/v1/object/sign/${path}?token=abc`;

  beforeEach(async () => {
    mockSignedFails = false;
    resetLanTransport();
    setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: 'instance-0001' });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const answer = (path: 'lan' | 'public', body: unknown) =>
        ({ ok: true, status: 200, headers: { get: () => path }, json: async () => body, clone: () => answer(path, body) }) as unknown as Response;
      if (url.startsWith(PUBLIC)) throw new TypeError('Network request failed');
      return answer('lan', url.endsWith('/get-public-config') ? { success: true, data: { instanceId: 'instance-0001' } } : 'Hello');
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    resetLanTransport();
  });

  it('give a link on the public address while the phone is on that path, and on the LAN address after it moves', async () => {
    const { getImageSignedUrl } = require('@/features/grn/services/imageUploadService');
    const { getDispatchImageSignedUrl } = require('@/features/dispatch/services/dispatchImageService');
    expect(await getImageSignedUrl('a/b.jpg')).toBe(mockSigned('grn-images/a/b.jpg'));
    await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true });
    expect(getConnectionPath()).toBe('lan');
    const lan = (path: string) => mockSigned(path).replace(PUBLIC, LAN);
    expect(await getImageSignedUrl('a/b.jpg')).toBe(lan('grn-images/a/b.jpg'));
    expect(await getDispatchImageSignedUrl('c/d.jpg')).toBe(lan('dispatch-images/c/d.jpg'));
    // A link already signed on the public address is moved too, and one already on the LAN address is left as it is.
    expect(await getImageSignedUrl(mockSigned('grn-images/x.jpg'))).toBe(lan('grn-images/x.jpg'));
    expect(await getImageSignedUrl(lan('grn-images/x.jpg'))).toBe(lan('grn-images/x.jpg'));
    // The fallbacks that build a storage URL from the client URL follow the path as well.
    mockSignedFails = true;
    const quiet = ['log', 'warn', 'error'].map(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
    jest.useFakeTimers();
    try {
      const grn = getImageSignedUrl('a/b.jpg'); // three attempts, half a second and one second apart
      await jest.advanceTimersByTimeAsync(2000);
      expect(await grn).toBe(`${LAN}/storage/v1/object/grn-images/a/b.jpg`);
      expect(await getDispatchImageSignedUrl('c/d.jpg')).toBe(`${LAN}/storage/v1/object/dispatch-images/c/d.jpg`);
    } finally {
      jest.useRealTimers();
      quiet.forEach(spy => spy.mockRestore());
    }
  });
});
