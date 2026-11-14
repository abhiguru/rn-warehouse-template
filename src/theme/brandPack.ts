/**
 * The brand pack of this build (brand-packs/README.md).
 *
 * A build without a pack has one brand, Orange, named "Cold Storage". A pack adds a second brand
 * (its colours, wordmark and caption) and may name the organisation that provides the app. The pack
 * is read from the build's `extra.brandPack` by src/theme/builtBrandPack.ts, which app/_layout.tsx imports first (this
 * file does not import expo-constants, so tests that mock react-native need no expo-constants mock); app.config.js has
 * already checked it.
 */

export interface BrandColours {
  fill: string;
  onFill: string;
  fillPressed: string;
  tint: string;
  subtle: string;
  subtleStrong: string;
  secondary: string;
  secondaryText: string;
  /** The mark's colours when they differ from the defaults (a white panel in dark mode, for instance). */
  mark?: { panel: string; wordmark: string; rule: string; caption: string };
}

interface Localized {
  en: string;
  gu?: string;
}

export interface BrandPack {
  id: string;
  name: Localized;
  /** Wordmark lines, the same in every language. */
  wordmark: string[];
  caption?: Localized;
  /** The organisation that provides the app, named in the legal pages. */
  association?: { name: string };
  light: BrandColours;
  dark: BrandColours;
}

/** What a build without a pack shows: the Orange brand, no caption. */
export const NEUTRAL_WORDMARK: readonly string[] = ['COLD', 'STORAGE'];

/** The brands of this build; Orange first. A pack adds its id. */
export const BRANDS: string[] = ['orange'];

const packs = new Map<string, BrandPack>();

export function looksLikePack(value: unknown): value is BrandPack {
  const pack = value as BrandPack | null;
  return (
    !!pack &&
    typeof pack.id === 'string' &&
    typeof pack.name?.en === 'string' &&
    Array.isArray(pack.wordmark) &&
    typeof pack.light?.fill === 'string' &&
    typeof pack.dark?.fill === 'string'
  );
}

/** Adds a pack's brand to this build. Called once at start-up; tests call it with the sample pack. */
export function registerBrandPack(pack: BrandPack): void {
  if (!packs.has(pack.id)) BRANDS.push(pack.id);
  packs.set(pack.id, pack);
}

export function getBrandPack(brand: string): BrandPack | undefined {
  return packs.get(brand);
}

/** The pack of this build, if it has one. */
export function activeBrandPack(): BrandPack | undefined {
  return packs.values().next().value;
}

/** True when `brand` is one of this build's brands. */
export const isKnownBrand = (brand: unknown): brand is string => typeof brand === 'string' && BRANDS.includes(brand);

/** The pick for a brand's text in a language; Gujarati falls back to English. */
export const localized = (text: Localized | undefined, language: 'en' | 'gu'): string =>
  (language === 'gu' && text?.gu) || text?.en || '';
