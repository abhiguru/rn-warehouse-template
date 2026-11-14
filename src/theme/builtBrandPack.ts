/**
 * Registers the brand pack this build carries (`extra.brandPack` in the build config), if any. A side-effect module:
 * app/_layout.tsx imports it before anything that reads the brands (the theme slice reads them at load). Kept apart
 * from brandPack.ts so the theme does not load expo-constants.
 */
import Constants from 'expo-constants';
import { looksLikePack, registerBrandPack } from './brandPack';

const built: unknown = Constants.expoConfig?.extra?.brandPack;
if (looksLikePack(built)) registerBrandPack(built);
