/**
 * GCS Mobile App Theme System
 *
 * React Native adaptation of design tokens from docs/design-tokens.ts
 * Optimized for mobile with dp/pt values, platform-specific shadows, and LinearGradient configs
 *
 * @see docs/BRAND_GUIDELINES.md for usage guidelines
 * @see docs/design-tokens.ts for source design system
 */

import { Platform, TextStyle, ViewStyle } from 'react-native';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface SemanticColors {
  success: string;
  warning: string;
  error: string;
  info: string;
  successLight: string;
  warningLight: string;
  errorLight: string;
  infoLight: string;
}

// SAP Fiori Semantic Colors
export interface FioriSemanticColors {
  positive: string;
  positiveDark: string;
  positiveLight: string;
  positiveBorder: string;
  critical: string;
  criticalDark: string;
  criticalLight: string;
  criticalBorder: string;
  negative: string;
  negativeDark: string;
  negativeLight: string;
  negativeBorder: string;
  neutral: string;
  neutralDark: string;
  neutralLight: string;
  neutralBorder: string;
  none: string;
  noneLight: string;
}

export interface FioriObjectCell {
  background: string;
  backgroundPressed: string;
  backgroundSelected: string;
  selectedBorder: string;
  divider: string;
}

export interface FioriText {
  primary: string;
  secondary: string;
  tertiary: string;
  inverse: string;
}

export interface FioriColors {
  semantic: FioriSemanticColors;
  objectCell: FioriObjectCell;
  text: FioriText;
}

export interface Colors {
  primary: string;
  primarySecondary: string;
  orange: ColorScale;
  gray: ColorScale;
  blue: ColorScale;
  green: ColorScale;
  red: ColorScale;
  yellow: ColorScale;
  purple: ColorScale;
  indigo: ColorScale;
  semantic: SemanticColors;
  fiori: FioriColors;
  white: string;
  black: string;
  // Convenience aliases for semantic colors
  success: string;
  error: string;
  warning: string;
  info: string;
  background: string;
}

export interface Spacing {
  xs: number;   // 4
  sm: number;   // 8
  md: number;   // 16
  lg: number;   // 24
  xl: number;   // 32
  '2xl': number; // 40
  '3xl': number; // 48
  '4xl': number; // 64
}

export interface FontSize {
  xs: number;   // 12
  sm: number;   // 14
  base: number; // 16
  lg: number;   // 18
  xl: number;   // 20
  xxl: number;  // 22
  '2xl': number; // 24
  '3xl': number; // 30
  '4xl': number; // 36
}

export interface FontWeight {
  light: TextStyle['fontWeight'];
  normal: TextStyle['fontWeight'];
  medium: TextStyle['fontWeight'];
  semibold: TextStyle['fontWeight'];
  bold: TextStyle['fontWeight'];
  extrabold: TextStyle['fontWeight'];
}

export interface LineHeight {
  tight: number;    // 1.25
  normal: number;   // 1.5
  relaxed: number;  // 1.75
  loose: number;    // 2
}

export interface BorderRadius {
  none: number;  // 0
  sm: number;    // 4
  md: number;    // 8
  lg: number;    // 12
  xl: number;    // 16
  '2xl': number; // 24
  '3xl': number; // 32
  full: number;  // 9999
}

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number; // Android
}

export interface Shadows {
  none: Shadow;
  sm: Shadow;
  md: Shadow;
  lg: Shadow;
  xl: Shadow;
  '2xl': Shadow;
}

export interface GradientConfig {
  colors: readonly [string, string, ...string[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface Gradients {
  primary: GradientConfig;
  primaryHover: GradientConfig;
  warm: GradientConfig;
  cool: GradientConfig;
}

export interface TouchTargets {
  minimum: number;
  recommended: number;
}

// ============================================================================
// COLOR TOKENS
// ============================================================================

export const colors: Colors = {
  // Primary brand colors
  primary: '#f69000',
  primarySecondary: '#f6c624',

  // Orange scale (based on new primary #f69000)
  orange: {
    50: '#fff4e6',
    100: '#ffe4c0',
    200: '#ffd399',
    300: '#ffc172',
    400: '#ffb04b',
    500: '#f69000',
    600: '#dd8200',
    700: '#c47400',
    800: '#ab6600',
    900: '#924f00',
  },

  // Gray scale (incorporating dark navy #11222c)
  gray: {
    50: '#f7f9fa',
    100: '#e8ecef',
    200: '#d4dce2',
    300: '#b8c4cd',
    400: '#9ba9b5',
    500: '#7e8e9d',
    600: '#5f7181',
    700: '#425363',
    800: '#273844',
    900: '#11222c',
  },

  // Blue/Teal scale (based on #1c5858 and #53b1b1)
  blue: {
    50: '#e8f4f4',
    100: '#c7e5e5',
    200: '#a3d5d5',
    300: '#7ec5c5',
    400: '#53b1b1',
    500: '#1c5858',
    600: '#194e4e',
    700: '#164444',
    800: '#133a3a',
    900: '#0f2e2e',
  },

  // Green/Teal scale (based on #53b1b1)
  green: {
    50: '#e8f4f4',
    100: '#c7e5e5',
    200: '#a3d5d5',
    300: '#7ec5c5',
    400: '#69bcbc',
    500: '#53b1b1',
    600: '#4a9f9f',
    700: '#3d8585',
    800: '#316b6b',
    900: '#245151',
  },

  // Red scale
  red: {
    50: '#ffebee',
    100: '#ffcdd2',
    200: '#ef9a9a',
    300: '#e57373',
    400: '#ef5350',
    500: '#f44336',
    600: '#e53935',
    700: '#d32f2f',
    800: '#c62828',
    900: '#b71c1c',
  },

  // Yellow scale (based on #f6c624)
  yellow: {
    50: '#fefbf0',
    100: '#fdf5d9',
    200: '#fbefc2',
    300: '#f9e8ab',
    400: '#f8d767',
    500: '#f6c624',
    600: '#ddb220',
    700: '#c49e1c',
    800: '#ab8a18',
    900: '#927614',
  },

  // Purple scale
  purple: {
    50: '#f3e5f5',
    100: '#e1bee7',
    200: '#ce93d8',
    300: '#ba68c8',
    400: '#ab47bc',
    500: '#9c27b0',
    600: '#8e24aa',
    700: '#7b1fa2',
    800: '#6a1b9a',
    900: '#4a148c',
  },

  // Indigo scale
  indigo: {
    50: '#e8eaf6',
    100: '#c5cae9',
    200: '#9fa8da',
    300: '#7986cb',
    400: '#5c6bc0',
    500: '#3f51b5',
    600: '#3949ab',
    700: '#303f9f',
    800: '#283593',
    900: '#1a237e',
  },

  // Semantic colors
  semantic: {
    success: '#53b1b1',
    warning: '#f6c624',
    error: '#f44336',
    info: '#1c5858',
    successLight: '#e8f4f4',
    warningLight: '#fefbf0',
    errorLight: '#ffebee',
    infoLight: '#e8f4f4',
  },

  // SAP Fiori Design System Colors
  fiori: {
    // Semantic status colors (SAP Fiori Horizon theme)
    semantic: {
      // Positive (Success) - Green
      positive: '#36A41D',
      positiveDark: '#256F14',
      positiveLight: '#F5FAE5',
      positiveBorder: '#5DC122',

      // Critical (Warning) - Orange
      critical: '#E9730C',
      criticalDark: '#AA5808',
      criticalLight: '#FEF7F1',
      criticalBorder: '#F58B1F',

      // Negative (Error) - Red
      negative: '#D32030',
      negativeDark: '#AA161F',
      negativeLight: '#FFF4F2',
      negativeBorder: '#EE3939',

      // Neutral (Information) - Blue
      neutral: '#0057D2',
      neutralDark: '#0040B0',
      neutralLight: '#EBF8FF',
      neutralBorder: '#1B90FF',

      // None (Default/Gray)
      none: '#556B82',
      noneLight: '#EEF1F5',
    },

    // Object Cell specific colors
    objectCell: {
      background: '#FFFFFF',
      backgroundPressed: '#F5F6F7',
      backgroundSelected: '#EBF8FF',
      selectedBorder: '#0057D2',
      divider: '#E5E5E5',
    },

    // Typography colors
    text: {
      primary: '#1D2D3E',
      secondary: '#556B82',
      tertiary: '#6F7D8B',
      inverse: '#FFFFFF',
    },
  },

  white: '#ffffff',
  black: '#000000',

  // Convenience aliases for semantic colors
  success: '#53b1b1',
  error: '#f44336',
  warning: '#f6c624',
  info: '#1c5858',
  background: '#f7f9fa',
};

// ============================================================================
// SPACING TOKENS (dp/pt)
// ============================================================================

export const spacing: Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
  '4xl': 64,
};

// ============================================================================
// TYPOGRAPHY TOKENS
// ============================================================================

export const fontSize: FontSize = {
  xs: 12,
  sm: 14,
  base: Platform.OS === 'ios' ? 17 : 16, // iOS native default is 17pt
  lg: 18,
  xl: 20,
  xxl: 22,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

export const fontWeight: FontWeight = {
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

export const lineHeight: LineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
  loose: 2,
};

// ============================================================================
// BORDER RADIUS TOKENS (dp/pt)
// ============================================================================

export const borderRadius: BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
};

// ============================================================================
// SHADOW TOKENS (React Native)
// ============================================================================

export const shadows: Shadows = {
  none: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  '2xl': {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
};

// ============================================================================
// GRADIENT CONFIGS (for LinearGradient component)
// ============================================================================

export const gradients: Gradients = {
  primary: {
    colors: ['#f69000', '#f6c624'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  primaryHover: {
    colors: ['#dd8200', '#f69000'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  warm: {
    colors: ['#f6c624', '#ffd399'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  cool: {
    colors: ['#1c5858', '#53b1b1'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
};

// ============================================================================
// TOUCH TARGETS (Platform-specific)
// ============================================================================

export const touchTargets: TouchTargets = {
  minimum: Platform.OS === 'ios' ? 44 : 48,
  recommended: Platform.OS === 'ios' ? 48 : 56,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get spacing value
 * @param size - Spacing size key
 * @returns Numeric spacing value in dp/pt
 */
export function getSpacing(size: keyof Spacing): number {
  return spacing[size];
}

/**
 * Get multiple spacing values at once
 * @param sizes - Array of spacing size keys
 * @returns Array of numeric spacing values
 */
export function getSpacings(...sizes: (keyof Spacing)[]): number[] {
  return sizes.map((size) => spacing[size]);
}

/**
 * Get font size value
 * @param size - Font size key
 * @returns Numeric font size value in sp/pt
 */
export function getFontSize(size: keyof FontSize): number {
  return fontSize[size];
}

/**
 * Get shadow preset
 * @param size - Shadow size key
 * @returns Shadow style object for ViewStyle
 */
export function getShadow(size: keyof Shadows): Shadow {
  return shadows[size];
}

/**
 * Get border radius value
 * @param size - Border radius key
 * @returns Numeric border radius value in dp/pt
 */
export function getBorderRadius(size: keyof BorderRadius): number {
  return borderRadius[size];
}

/**
 * Get color from nested path (e.g., 'orange.500', 'semantic.success')
 * @param path - Dot-notation path to color
 * @returns Hex color string
 */
export function getColor(path: string): string {
  const keys = path.split('.');
  let value: any = colors;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`[Theme] Color path '${path}' not found`);
      return colors.black;
    }
  }

  return typeof value === 'string' ? value : colors.black;
}

/**
 * Get platform-specific value
 * @param ios - Value for iOS
 * @param android - Value for Android
 * @returns Platform-specific value
 */
export function getPlatformValue<T>(ios: T, android: T): T {
  return Platform.OS === 'ios' ? ios : android;
}

/**
 * Calculate line height based on font size and scale
 * @param size - Font size key
 * @param scale - Line height scale key
 * @returns Calculated line height value
 */
export function getLineHeight(
  size: keyof FontSize,
  scale: keyof LineHeight = 'normal'
): number {
  return Math.round(fontSize[size] * lineHeight[scale]);
}

/**
 * Create text style with theme typography
 * @param size - Font size key
 * @param weight - Font weight key
 * @param color - Text color (hex or path like 'gray.700')
 * @returns TextStyle object
 */
export function createTextStyle(
  size: keyof FontSize,
  weight: keyof FontWeight = 'normal',
  color: string = colors.gray[900]
): TextStyle {
  return {
    fontSize: fontSize[size],
    fontWeight: fontWeight[weight],
    color: color.startsWith('#') ? color : getColor(color),
    lineHeight: getLineHeight(size),
  };
}

/**
 * Create card style with theme values
 * @param padding - Padding variant
 * @param shadow - Shadow size
 * @returns ViewStyle object
 */
export function createCardStyle(
  padding: 'compact' | 'default' | 'comfortable' = 'default',
  shadow: keyof Shadows = 'md'
): ViewStyle {
  const paddingMap = {
    compact: spacing.md,
    default: spacing.lg,
    comfortable: spacing.xl,
  };

  return {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: paddingMap[padding],
    ...shadows[shadow],
  };
}

// ============================================================================
// DARK MODE COLORS
// ============================================================================

export type ThemeMode = 'light' | 'dark';

/**
 * Dark mode color overrides
 * Uses inverted semantic values for dark backgrounds
 */
export const darkColors: Colors = {
  // Primary brand colors (same in dark mode for brand consistency)
  primary: '#f69000',
  primarySecondary: '#f6c624',

  // Orange scale (slightly adjusted for dark mode visibility)
  orange: {
    50: '#2a1a0a',
    100: '#3d2510',
    200: '#4f3015',
    300: '#623b1a',
    400: '#75461f',
    500: '#f69000',
    600: '#ff9d1a',
    700: '#ffab33',
    800: '#ffb94d',
    900: '#ffc766',
  },

  // Gray scale (inverted for dark mode)
  gray: {
    50: '#11222c',
    100: '#1a2f3a',
    200: '#243d4a',
    300: '#2e4b5a',
    400: '#385969',
    500: '#6b7d8a',
    600: '#8c9aa5',
    700: '#adb7bf',
    800: '#ced5da',
    900: '#f0f2f4',
  },

  // Blue/Teal scale (adjusted for dark mode)
  blue: {
    50: '#0f2e2e',
    100: '#133a3a',
    200: '#164444',
    300: '#194e4e',
    400: '#1c5858',
    500: '#53b1b1',
    600: '#69bcbc',
    700: '#7ec5c5',
    800: '#a3d5d5',
    900: '#c7e5e5',
  },

  // Green/Teal scale (adjusted for dark mode)
  green: {
    50: '#0f2e2e',
    100: '#153838',
    200: '#1b4242',
    300: '#214c4c',
    400: '#275656',
    500: '#53b1b1',
    600: '#69bcbc',
    700: '#7ec5c5',
    800: '#a3d5d5',
    900: '#c7e5e5',
  },

  // Red scale (adjusted for dark mode)
  red: {
    50: '#2a1215',
    100: '#3d1a1f',
    200: '#4f2229',
    300: '#622a33',
    400: '#75323d',
    500: '#f44336',
    600: '#ff5252',
    700: '#ff6b6b',
    800: '#ff8484',
    900: '#ff9d9d',
  },

  // Yellow scale (adjusted for dark mode)
  yellow: {
    50: '#2a2210',
    100: '#3d3215',
    200: '#4f421a',
    300: '#62521f',
    400: '#756224',
    500: '#f6c624',
    600: '#ffd23d',
    700: '#ffde56',
    800: '#ffea6f',
    900: '#fff688',
  },

  // Purple scale (adjusted for dark mode)
  purple: {
    50: '#1f1225',
    100: '#2e1a35',
    200: '#3d2245',
    300: '#4c2a55',
    400: '#5b3265',
    500: '#9c27b0',
    600: '#ab47bc',
    700: '#ba68c8',
    800: '#ce93d8',
    900: '#e1bee7',
  },

  // Indigo scale (adjusted for dark mode)
  indigo: {
    50: '#121425',
    100: '#1a1d35',
    200: '#222645',
    300: '#2a2f55',
    400: '#323865',
    500: '#3f51b5',
    600: '#5c6bc0',
    700: '#7986cb',
    800: '#9fa8da',
    900: '#c5cae9',
  },

  // Semantic colors (adjusted for dark mode)
  semantic: {
    success: '#69bcbc',
    warning: '#ffd23d',
    error: '#ff5252',
    info: '#53b1b1',
    successLight: '#1a3030',
    warningLight: '#2a2210',
    errorLight: '#2a1215',
    infoLight: '#0f2e2e',
  },

  // SAP Fiori Design System Colors (dark mode)
  fiori: {
    semantic: {
      positive: '#4CAF50',
      positiveDark: '#81C784',
      positiveLight: '#1a2e1a',
      positiveBorder: '#66BB6A',

      critical: '#FF9800',
      criticalDark: '#FFB74D',
      criticalLight: '#2a2010',
      criticalBorder: '#FFA726',

      negative: '#EF5350',
      negativeDark: '#E57373',
      negativeLight: '#2a1515',
      negativeBorder: '#EF5350',

      neutral: '#42A5F5',
      neutralDark: '#64B5F6',
      neutralLight: '#0a1a2a',
      neutralBorder: '#42A5F5',

      none: '#90A4AE',
      noneLight: '#1a2228',
    },

    objectCell: {
      background: '#1e2a32', // Elevated surface - lighter for card visibility
      backgroundPressed: '#283840',
      backgroundSelected: '#0a1a2a',
      selectedBorder: '#42A5F5',
      divider: '#3a4850', // Slightly lighter divider for better visibility
    },

    text: {
      primary: '#f0f2f4',
      secondary: '#adb7bf',
      tertiary: '#8c9aa5',
      inverse: '#11222c',
    },
  },

  white: '#11222c', // Dark background
  black: '#f0f2f4', // Light text

  // Convenience aliases for semantic colors (dark mode)
  success: '#69bcbc',
  error: '#ff5252',
  warning: '#ffd23d',
  info: '#53b1b1',
  background: '#11222c',
};

/**
 * Get theme colors based on mode
 * @param mode - 'light' or 'dark'
 * @returns Colors object for the specified mode
 */
export function getThemeColors(mode: ThemeMode): Colors {
  return mode === 'dark' ? darkColors : colors;
}

/**
 * Get the full theme object for a specific mode
 * @param mode - 'light' or 'dark'
 * @returns Complete theme object with colors for the specified mode
 */
export function getTheme(mode: ThemeMode) {
  const themeColors = getThemeColors(mode);
  return {
    colors: themeColors,
    spacing,
    fontSize,
    fontWeight,
    lineHeight,
    borderRadius,
    shadows,
    gradients,
    touchTargets,
    touchTarget: touchTargets,
    getSpacing,
    getSpacings,
    getFontSize,
    getShadow,
    getBorderRadius,
    getColor: (path: string) => {
      const keys = path.split('.');
      let value: any = themeColors;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return themeColors.black;
        }
      }
      return typeof value === 'string' ? value : themeColors.black;
    },
    getPlatformValue,
    getLineHeight,
    createTextStyle: (
      size: keyof FontSize,
      weight: keyof FontWeight = 'normal',
      color: string = themeColors.gray[900]
    ): TextStyle => ({
      fontSize: fontSize[size],
      fontWeight: fontWeight[weight],
      color: color.startsWith('#') ? color : getTheme(mode).getColor(color),
      lineHeight: getLineHeight(size),
    }),
    createCardStyle: (
      padding: 'compact' | 'default' | 'comfortable' = 'default',
      shadow: keyof Shadows = 'md'
    ): ViewStyle => {
      const paddingMap = {
        compact: spacing.md,
        default: spacing.lg,
        comfortable: spacing.xl,
      };
      return {
        backgroundColor: mode === 'dark' ? '#1a2228' : colors.white,
        borderRadius: borderRadius.lg,
        padding: paddingMap[padding],
        ...shadows[shadow],
      };
    },
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const theme = {
  colors,
  darkColors,
  spacing,
  fontSize,
  fontWeight,
  lineHeight,
  borderRadius,
  shadows,
  gradients,
  touchTargets,
  touchTarget: touchTargets, // Alias for backwards compatibility
  // Utility functions
  getSpacing,
  getSpacings,
  getFontSize,
  getShadow,
  getBorderRadius,
  getColor,
  getPlatformValue,
  getLineHeight,
  createTextStyle,
  createCardStyle,
  // Theme mode functions
  getTheme,
  getThemeColors,
};

export default theme;
