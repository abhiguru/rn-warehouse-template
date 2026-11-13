/**
 * WH-141: which brands a build has and which one it opens in. A build without a pack has only Orange; a saved
 * brand the build does not have (a phone moving to another build) opens in the default without an error;
 * EXPO_PUBLIC_DEFAULT_BRAND picks the default only among the build's brands.
 */
import { SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

type Slice = typeof import('@/store/slices/themeSlice');
type Packs = typeof import('@/theme/brandPack');

/** Loads the slice and the brand list fresh, as a build would at start-up, with the given env and brands. */
function load(options: { sample: boolean; defaultBrand?: string }): { slice: Slice; packs: Packs } {
  const saved = process.env.EXPO_PUBLIC_DEFAULT_BRAND;
  if (options.defaultBrand === undefined) delete process.env.EXPO_PUBLIC_DEFAULT_BRAND;
  else process.env.EXPO_PUBLIC_DEFAULT_BRAND = options.defaultBrand;
  let loaded: { slice: Slice; packs: Packs } | undefined;
  try {
    jest.isolateModules(() => {
      // The helper registers into the module registry it is loaded in, so it is loaded inside this one.
      if (options.sample) require('@/tests/helpers/sampleBrand').registerSampleBrand();
      loaded = { slice: require('@/store/slices/themeSlice'), packs: require('@/theme/brandPack') };
    });
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_DEFAULT_BRAND;
    else process.env.EXPO_PUBLIC_DEFAULT_BRAND = saved;
  }
  return loaded!;
}

describe('a build without a pack', () => {
  it('has only Orange, opens in it, and falls back to it for any saved brand', () => {
    const { slice, packs } = load({ sample: false });
    expect(packs.BRANDS).toEqual(['orange']);
    expect(slice.DEFAULT_BRAND).toBe('orange');
    expect(slice.selectBrand({ theme: { preference: 'system', brand: SAMPLE_BRAND } })).toBe('orange');
    expect(slice.selectBrand({ theme: { preference: 'system' } })).toBe('orange');
    const state = slice.default({ preference: 'system', brand: 'orange' }, slice.setBrand(SAMPLE_BRAND));
    expect(state.brand).toBe('orange');
  });

  it('ignores EXPO_PUBLIC_DEFAULT_BRAND naming a brand the build does not have', () => {
    expect(load({ sample: false, defaultBrand: SAMPLE_BRAND }).slice.DEFAULT_BRAND).toBe('orange');
  });
});

describe('a build with the sample pack', () => {
  it('knows the sample brand, accepts a saved or chosen one and opens in Orange unless told otherwise', () => {
    const { slice, packs } = load({ sample: true });
    expect(packs.BRANDS).toEqual(['orange', SAMPLE_BRAND]);
    expect(slice.DEFAULT_BRAND).toBe('orange');
    expect(slice.selectBrand({ theme: { preference: 'dark', brand: SAMPLE_BRAND } })).toBe(SAMPLE_BRAND);
    expect(slice.default({ preference: 'system', brand: 'orange' }, slice.setBrand(SAMPLE_BRAND)).brand).toBe(SAMPLE_BRAND);
  });

  it("EXPO_PUBLIC_DEFAULT_BRAND makes the pack's brand the default; an unknown saved brand then opens in it", () => {
    const { slice } = load({ sample: true, defaultBrand: SAMPLE_BRAND });
    expect(slice.DEFAULT_BRAND).toBe(SAMPLE_BRAND);
    expect(slice.selectBrand({ theme: { preference: 'system', brand: 'gone' } })).toBe(SAMPLE_BRAND);
    expect(slice.default({ preference: 'system', brand: 'orange' }, slice.setBrand('gone')).brand).toBe(SAMPLE_BRAND);
  });
});

describe('the sample pack supplies the colours', () => {
  it("the pack's fill is the brand fill in light and dark, and differs from Orange", () => {
    require('@/tests/helpers/sampleBrand').registerSampleBrand();
    const { getTokens } = require('@/theme/tokens');
    const pack = require('../../brand-packs/sample-teal/brand.json');
    for (const mode of ['light', 'dark'] as const) {
      expect(getTokens(SAMPLE_BRAND, mode).brand.fill).toBe(pack[mode].fill);
      expect(getTokens(SAMPLE_BRAND, mode).brand.fill).not.toBe(getTokens('orange', mode).brand.fill);
    }
  });
});
