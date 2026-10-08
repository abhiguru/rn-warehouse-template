/**
 * List Component Color Mapping
 *
 * Maps the local color palette used in list components to theme colors.
 * This provides backward compatibility while allowing gradual migration to theme.
 *
 * Usage:
 * ```typescript
 * import { listColors } from '@/theme/listColors';
 * // Instead of: colors.primary
 * // Use: listColors.primary
 * ```
 *
 * The colors here match the original hardcoded values in list components
 * to avoid visual changes during the refactor.
 */

import theme from './index';

/**
 * Color palette compatible with existing list components
 * Maps to theme colors where possible, keeps original values where needed
 */
export const listColors = {
  // Primary colors - use theme primary
  primary: theme.colors.primary,
  primaryLight: theme.colors.orange[50],
  primaryDark: theme.colors.orange[700],

  // Secondary colors
  secondary: '#6366f1', // Indigo - not in theme
  secondaryLight: '#eef2ff',

  // Semantic colors
  success: theme.colors.semantic.success,
  successLight: theme.colors.semantic.successLight,
  warning: theme.colors.semantic.warning,
  warningLight: theme.colors.semantic.warningLight,
  error: theme.colors.semantic.error,
  errorLight: theme.colors.semantic.errorLight,

  // Gray scale - map to theme grays
  gray50: theme.colors.gray[50],
  gray100: theme.colors.gray[100],
  gray200: theme.colors.gray[200],
  gray300: theme.colors.gray[300],
  gray400: theme.colors.gray[400],
  gray500: theme.colors.gray[500],
  gray600: theme.colors.gray[600],
  gray700: theme.colors.gray[700],
  gray800: theme.colors.gray[800],
  gray900: theme.colors.gray[900],

  // Other colors
  white: theme.colors.white,
  black: theme.colors.black,

  // Accent colors - map to theme where possible
  teal: theme.colors.blue[500],
  tealLight: theme.colors.blue[50],
  blue: theme.colors.blue[400],
  blueLight: theme.colors.blue[50],
  purple: theme.colors.purple[500],
  purpleLight: theme.colors.purple[50],
  orange: theme.colors.orange[500],
  orangeLight: theme.colors.orange[50],

  // =========================================================================
  // SAP Fiori Semantic Colors (for GRNListFiori and future components)
  // =========================================================================

  // Status colors - Positive (Success/Full Stock)
  statusPositive: theme.colors.fiori.semantic.positive,
  statusPositiveLight: theme.colors.fiori.semantic.positiveLight,
  statusPositiveDark: theme.colors.fiori.semantic.positiveDark,
  statusPositiveBorder: theme.colors.fiori.semantic.positiveBorder,

  // Status colors - Critical (Warning/Partial Stock)
  statusCritical: theme.colors.fiori.semantic.critical,
  statusCriticalLight: theme.colors.fiori.semantic.criticalLight,
  statusCriticalDark: theme.colors.fiori.semantic.criticalDark,
  statusCriticalBorder: theme.colors.fiori.semantic.criticalBorder,

  // Status colors - Negative (Error/Empty Stock)
  statusNegative: theme.colors.fiori.semantic.negative,
  statusNegativeLight: theme.colors.fiori.semantic.negativeLight,
  statusNegativeDark: theme.colors.fiori.semantic.negativeDark,
  statusNegativeBorder: theme.colors.fiori.semantic.negativeBorder,

  // Status colors - Neutral (Information)
  statusNeutral: theme.colors.fiori.semantic.neutral,
  statusNeutralLight: theme.colors.fiori.semantic.neutralLight,
  statusNeutralDark: theme.colors.fiori.semantic.neutralDark,
  statusNeutralBorder: theme.colors.fiori.semantic.neutralBorder,

  // Status colors - None (Default/Gray)
  statusNone: theme.colors.fiori.semantic.none,
  statusNoneLight: theme.colors.fiori.semantic.noneLight,

  // Status colors - Warning (alias for Critical - used by Invoice list)
  // In SAP Fiori, "warning" maps to "critical" (amber/orange)
  statusWarning: theme.colors.fiori.semantic.critical,
  statusWarningLight: theme.colors.fiori.semantic.criticalLight,
  statusWarningDark: theme.colors.fiori.semantic.criticalDark,
  statusWarningBorder: theme.colors.fiori.semantic.criticalBorder,

  // Object Cell backgrounds
  cellBackground: theme.colors.fiori.objectCell.background,
  cellBackgroundPressed: theme.colors.fiori.objectCell.backgroundPressed,
  cellBackgroundSelected: theme.colors.fiori.objectCell.backgroundSelected,
  cellSelectedBorder: theme.colors.fiori.objectCell.selectedBorder,
  cellDivider: theme.colors.fiori.objectCell.divider,

  // Fiori typography colors
  textPrimary: theme.colors.fiori.text.primary,
  textSecondary: theme.colors.fiori.text.secondary,
  textTertiary: theme.colors.fiori.text.tertiary,
  textInverse: theme.colors.fiori.text.inverse,
} as const;

export type ListColors = typeof listColors;

export default listColors;
