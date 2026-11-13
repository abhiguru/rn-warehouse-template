/**
 * Gives a test the build of an organisation with its own brand (WH-141): Orange plus the fictional
 * sample pack `sample-teal` (brand-packs/sample-teal). Call it once at the top of the test file,
 * after the imports and before anything reads BRANDS.
 */
import { registerBrandPack, type BrandPack } from '@/theme/brandPack';

export const SAMPLE_BRAND = 'sample-teal';

export function registerSampleBrand(): void {
  registerBrandPack(require('../../../brand-packs/sample-teal/brand.json') as BrandPack);
}
