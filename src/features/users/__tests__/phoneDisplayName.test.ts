/**
 * WH-410: the name a phone gives itself, sent with a held item: maker and model, then a mark that stays the same for the
 * installation, in brackets (design 7.11f). Real: phoneDisplayName. Faked at the edge: `Platform`, AsyncStorage (one map
 * that outlives an app start) and the random id.
 */
import { Platform } from 'react-native';

const mockKept = new Map<string, string>();
const mockGetItem = jest.fn(async (key: string) => mockKept.get(key) ?? null);
const mockUuid = jest.fn<string, []>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockGetItem(key),
    setItem: async (key: string, value: string) => { mockKept.set(key, value); },
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockUuid() }));

const ID_A = '7f3a0c11-0000-4000-8000-000000000001';
const ID_B = 'b2c40c11-0000-4000-8000-000000000002';

/** The module afresh, as after an app start (nothing in flight), on a phone with these constants. */
function started(constants: Record<string, unknown>, os = 'android') {
  let module!: typeof import('../phoneDisplayName');
  // React Native's own Platform, which the module reads when the name is asked for.
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'constants', { configurable: true, get: () => constants });
  jest.isolateModules(() => {
    module = require('../phoneDisplayName');
  });
  return module;
}
const samsung = { Manufacturer: 'samsung', Brand: 'samsung', Model: 'SM-A156E' };

beforeEach(() => {
  mockKept.clear();
  mockGetItem.mockClear();
  mockUuid.mockReset().mockReturnValueOnce(ID_A).mockReturnValue(ID_B);
});

describe('the maker and model', () => {
  it.each([
    ['a lower-case maker', samsung, 'Samsung SM-A156E (7F3A)'],
    ['an upper-case maker', { Manufacturer: 'NOKIA', Model: 'G21' }, 'Nokia G21 (7F3A)'],
    ['a maker written in mixed case', { Manufacturer: 'OnePlus', Model: 'CPH2467' }, 'OnePlus CPH2467 (7F3A)'],
    ['a model that already names its maker', { Manufacturer: 'motorola', Model: 'Motorola Edge 40' }, 'Motorola Edge 40 (7F3A)'],
    ['only a brand', { Brand: 'redmi', Model: '13C' }, 'Redmi 13C (7F3A)'],
    ['only a model', { Model: 'Pixel 8' }, 'Pixel 8 (7F3A)'],
  ])('%s', async (_what, constants, expected) => {
    expect(await started(constants).phoneDisplayName()).toBe(expected);
  });

  it.each([
    ['no model', { Manufacturer: 'samsung' }, 'android'],
    ['a blank model', { Manufacturer: 'samsung', Model: '  ' }, 'android'],
    ['iOS', samsung, 'ios'],
  ])('%s gives no name, and makes no mark', async (_what, constants, os) => {
    expect(await started(constants, os).phoneDisplayName()).toBeNull();
    expect([...mockKept.keys()]).toEqual([]);
  });
});

describe('the install mark', () => {
  it('is made once, kept on the phone under install_mark_v1, and read again after an app start', async () => {
    expect(await started(samsung).phoneDisplayName()).toBe('Samsung SM-A156E (7F3A)');
    expect(mockKept.get('install_mark_v1')).toBe(ID_A);
    expect(await started(samsung).phoneDisplayName()).toBe('Samsung SM-A156E (7F3A)');
    expect(mockUuid).toHaveBeenCalledTimes(1);
  });

  it('concurrent first calls share one id', async () => {
    const { phoneDisplayName } = started(samsung);
    expect(await Promise.all([phoneDisplayName(), phoneDisplayName(), phoneDisplayName()]))
      .toEqual(Array(3).fill('Samsung SM-A156E (7F3A)'));
    expect(mockUuid).toHaveBeenCalledTimes(1);
    expect(mockKept.get('install_mark_v1')).toBe(ID_A);
  });

  it('a storage failure gives the name without a mark, and the next call tries again', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('disk I/O error'));
    const { phoneDisplayName } = started(samsung);
    expect(await phoneDisplayName()).toBe('Samsung SM-A156E');
    expect(await phoneDisplayName()).toBe('Samsung SM-A156E (7F3A)');
  });
});
