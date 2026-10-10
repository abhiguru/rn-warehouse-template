/**
 * Non-colour tokens: typography, spacing, shape, sizes, layout and motion.
 * Brand- and mode-independent. See docs/STYLE_GUIDE.md.
 *
 * Typography follows SAP Fiori for iOS/Android, which maps its text styles
 * one-to-one onto the platform styles and uses the system font where SAP's
 * "72" typeface is not bundled (as here).
 */
import { getLanguage } from '@/i18n/language';
import { Platform, TextStyle } from 'react-native';

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;

const body = Platform.OS === 'ios' ? 17 : 16;

/** Text styles for Latin script, largest to smallest. Use `typography`, never raw fontSize values. */
const latinTypography = {
  /** Screen titles in large-title navigation bars. */
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  /** Hero numbers, sign-in title. */
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  /** Object page titles, dialog titles. */
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  /** Section titles, KPI values. */
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  /** Object cell titles, emphasized row text. */
  headline: { fontSize: body, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  /** Default reading text and field values. */
  body: { fontSize: body, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
  /** Buttons and controls. */
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '500', letterSpacing: -0.32 },
  /** Secondary row text, descriptions. */
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  /** Supporting text, helper and error text, section headers (uppercase). */
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  /** Captions, timestamps, chip and badge text. */
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
  /** Tab bar labels, smallest legible text. */
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400', letterSpacing: 0.07 },
  /** The GCSA wordmark in BrandMark only (the one weight above 700). */
  wordmark: { fontSize: 48, lineHeight: 52, fontWeight: '800', letterSpacing: 2 },
} as const satisfies Record<string, TypeStyle>;

/**
 * Gujarati has marks above and below its letters and no letter-spacing tuning:
 * the same sizes and weights, spacing 0, and a line at least 1.4 times the size
 * so the marks are not clipped.
 */
const GUJARATI_LINE_RATIO = 1.4;
const gujaratiTypography = Object.fromEntries(
  Object.entries(latinTypography).map(([name, style]) => [
    name,
    name === 'wordmark'
      ? style
      : { ...style, letterSpacing: 0, lineHeight: Math.max(style.lineHeight, Math.ceil(style.fontSize * GUJARATI_LINE_RATIO)) },
  ])
) as unknown as typeof latinTypography;

/**
 * Text styles, largest to smallest, for the app's language. Read a style when a
 * stylesheet is built (inside a `useThemedStyles` factory), not at module level,
 * so it follows the language.
 */
export const typography: typeof latinTypography = new Proxy(latinTypography, {
  get: (target, name: string) => (getLanguage() === 'gu' ? gujaratiTypography : target)[name as keyof typeof latinTypography],
});

export type TypographyStyle = keyof typeof latinTypography;

/**
 * Letter spacing for capitals-style headings. Spacing pulls Gujarati conjuncts
 * apart, so it is 0 there. Call it inside a `useThemedStyles` factory, never in
 * a module-level `StyleSheet.create`, so it follows the language.
 */
export const trackedText = (value: number): number => (getLanguage() === 'gu' ? 0 : value);

/**
 * Props for a short Gujarati text that must stay on one line (a date, a count, a
 * chip label, a table cell): one line, shrinking a little when the box is a
 * pixel too narrow. Gujarati text is laid out with line breaking even when it is
 * one line, so a box that is slightly short drops the last word to a second,
 * clipped line; Latin text does not. English gets no props: its layout stays as it is.
 *
 *   <Text style={styles.date} {...singleLineText()}>{date}</Text>
 */
/** A size that differs by script (Gujarati digits and words are wider). Call it inside a `useThemedStyles` factory. */
export const byLanguage = <T>(latin: T, gujarati: T): T => (getLanguage() === 'gu' ? gujarati : latin);

export const singleLineText = (minimumFontScale = 0.85) =>
  getLanguage() === 'gu' ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale } as const) : {};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Spacing scale in density-independent pixels. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  s6: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
  max: 64,
} as const;

/** Corner radii (Horizon: field 0.25rem, button 0.5rem, element 0.75rem). */
export const radius = {
  none: 0,
  field: 4,
  button: 8,
  card: 12,
  sheet: 16,
  pill: 9999,
} as const;

/** Minimum touch target: 44pt (iOS) and 48dp (Android). */
export const touchTarget = Platform.OS === 'ios' ? 44 : 48;

export const iconSize = {
  /** Inside caption-sized tags and badges. */
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 48,
} as const;

export const layout = {
  /** Horizontal screen margin on phones (Fiori compact width). */
  marginCompact: 16,
  /** Horizontal screen margin on tablets (Fiori regular width). */
  marginRegular: 20,
  /** Widest readable content column. */
  maxContentWidth: 672,
  /** Narrow forms such as sign-in. */
  maxFormWidth: 420,
  /** Object cell minimum height. */
  rowMinHeight: 44,
  objectCellMinHeight: 72,
  /** Fiori tab bar height (excluding the bottom safe area). */
  tabBarHeight: 49,
  avatar: { sm: 32, md: 44, lg: 60 },
} as const;

export const motion = {
  /** Press feedback, toggles. */
  fast: 100,
  /** Expanding sections, chips, snackbars. */
  standard: 200,
  /** Sheets and full-screen transitions. */
  slow: 300,
} as const;
