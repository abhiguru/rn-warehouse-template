/**
 * Non-colour tokens: typography, spacing, shape, sizes, layout and motion.
 * Brand- and mode-independent. See docs/STYLE_GUIDE.md.
 *
 * Typography follows SAP Fiori for iOS/Android, which maps its text styles
 * one-to-one onto the platform styles and uses the system font where SAP's
 * "72" typeface is not bundled (as here).
 */
import { Platform, TextStyle } from 'react-native';

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;

const body = Platform.OS === 'ios' ? 17 : 16;

/** Text styles, largest to smallest. Use these, never raw fontSize values. */
export const typography = {
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
} as const satisfies Record<string, TypeStyle>;

export type TypographyStyle = keyof typeof typography;

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
