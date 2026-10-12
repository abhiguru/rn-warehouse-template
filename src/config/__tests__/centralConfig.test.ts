/** The two build settings of central login (src/config/envConfig.ts). */
import { parseCentralOrigin, readCentralLoginConfig, isCentralLoginConfigured, getCentralLoginConfig, TERMS_VERSION } from '../envConfig';

describe('the central origin', () => {
  it.each([
    ['https://identity.example.test', 'https://identity.example.test'],
    ['https://identity.example.test/', 'https://identity.example.test'],
    ['  https://identity.example.test:8443 ', 'https://identity.example.test:8443'],
    ['https://Identity.Example.test', 'https://identity.example.test'],
  ])('%s is accepted in every build', (value, origin) => {
    expect(parseCentralOrigin(value, false)).toBe(origin);
    expect(parseCentralOrigin(value, true)).toBe(origin);
  });

  it.each(['http://localhost:18600', 'http://127.0.0.1:18600'])('%s is accepted in a development build only', value => {
    expect(parseCentralOrigin(value, true)).toBe(value);
    expect(parseCentralOrigin(value, false)).toBeNull();
  });

  it.each([
    undefined,
    '',
    '   ',
    'identity.example.test',
    'http://identity.example.test',
    'http://localhost',
    'http://192.168.1.10:18600',
    'https://identity.example.test/v1',
    'https://identity.example.test?x=1',
    'https://user:secret@identity.example.test',
    'ftp://identity.example.test',
  ])('%s is refused, also in a development build', value => {
    expect(parseCentralOrigin(value, true)).toBeNull();
  });
});

describe('central login configuration', () => {
  it('is on only when the origin is set, and the issuer defaults to it', () => {
    expect(readCentralLoginConfig(undefined, 'https://issuer.example.test', false)).toBeNull();
    expect(readCentralLoginConfig('http://identity.example.test', undefined, false)).toBeNull();
    expect(readCentralLoginConfig('https://identity.example.test', undefined, false)).toEqual({
      origin: 'https://identity.example.test',
      issuer: 'https://identity.example.test',
    });
    expect(readCentralLoginConfig('https://identity.example.test', '  ', false)?.issuer).toBe('https://identity.example.test');
  });

  it('keeps an issuer name that differs from the address the app calls', () => {
    expect(readCentralLoginConfig('http://localhost:18600', 'https://identity.example.test', true)).toEqual({
      origin: 'http://localhost:18600',
      issuer: 'https://identity.example.test',
    });
  });

  it('is off in a build that names no origin (this test run)', () => {
    expect(isCentralLoginConfigured()).toBe(false);
    expect(getCentralLoginConfig()).toBeNull();
  });

  it('sends a terms version the service accepts', () => {
    expect(TERMS_VERSION).toMatch(/^[A-Za-z0-9._-]{1,32}$/);
  });
});

describe("under React Native's own URL class, which does not validate", () => {
  // Jest runs on Node's URL; a phone runs this one. The checks must hold for both.
  const NodeURL = global.URL;
  beforeAll(() => {
    (global as { URL: unknown }).URL = require('react-native/Libraries/Blob/URL').URL;
  });
  afterAll(() => {
    (global as { URL: unknown }).URL = NodeURL;
  });

  it('accepts and refuses the same addresses', () => {
    expect(new URL('not a url').protocol).toBe('');
    expect(parseCentralOrigin('https://identity.example.test', false)).toBe('https://identity.example.test');
    expect(parseCentralOrigin('https://Identity.Example.test:8443/', false)).toBe('https://identity.example.test:8443');
    expect(parseCentralOrigin('http://localhost:18600', true)).toBe('http://localhost:18600');
    expect(parseCentralOrigin('http://localhost:18600', false)).toBeNull();
    for (const refused of [
      'identity.example.test',
      'http://identity.example.test',
      'http://localhost',
      'https://identity.example.test/v1',
      'https://identity.example.test?x=1',
      'https://identity.example.test#part',
      'https://user:secret@identity.example.test',
    ])
      expect([refused, parseCentralOrigin(refused, true)]).toEqual([refused, null]);
  });
});
