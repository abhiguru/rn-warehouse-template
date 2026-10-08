/**
 * Dynamic List Colors Hook
 *
 * Provides theme-aware colors for list components.
 * Replaces static listColors import with dynamic values that respond to dark mode.
 *
 * Usage:
 * ```typescript
 * import { useListColors } from '@/hooks/useListColors';
 *
 * const MyComponent = () => {
 *   const colors = useListColors();
 *   return <View style={{ backgroundColor: colors.cellBackground }} />;
 * };
 * ```
 */

import { useMemo } from 'react';
import { useTheme } from './useTheme';

/**
 * Hook that returns theme-aware list colors
 * Colors automatically update when theme changes
 */
export function useListColors() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return useMemo(() => {
    return {
      // Primary colors - use theme primary
      primary: themeColors.primary,
      primaryLight: themeColors.orange[50],
      primaryDark: themeColors.orange[700],

      // Secondary colors
      secondary: isDarkMode ? '#818cf8' : '#6366f1', // Indigo
      secondaryLight: isDarkMode ? '#312e81' : '#eef2ff',

      // Semantic colors
      success: themeColors.semantic.success,
      successLight: themeColors.semantic.successLight,
      warning: themeColors.semantic.warning,
      warningLight: themeColors.semantic.warningLight,
      error: themeColors.semantic.error,
      errorLight: themeColors.semantic.errorLight,
      info: themeColors.semantic.info,
      infoLight: themeColors.semantic.infoLight,

      // Gray scale - map to theme grays
      gray50: themeColors.gray[50],
      gray100: themeColors.gray[100],
      gray200: themeColors.gray[200],
      gray300: themeColors.gray[300],
      gray400: themeColors.gray[400],
      gray500: themeColors.gray[500],
      gray600: themeColors.gray[600],
      gray700: themeColors.gray[700],
      gray800: themeColors.gray[800],
      gray900: themeColors.gray[900],

      // Other colors
      white: themeColors.white,
      black: themeColors.black,

      // Accent colors - map to theme where possible
      teal: themeColors.blue[500],
      tealLight: themeColors.blue[50],
      blue: themeColors.blue[400],
      blueLight: themeColors.blue[50],
      purple: themeColors.purple[500],
      purpleLight: themeColors.purple[50],
      orange: themeColors.orange[500],
      orangeLight: themeColors.orange[50],

      // =========================================================================
      // SAP Fiori Semantic Colors (for GRNListFiori and future components)
      // =========================================================================

      // Status colors - Positive (Success/Full Stock)
      statusPositive: themeColors.fiori.semantic.positive,
      statusPositiveLight: themeColors.fiori.semantic.positiveLight,
      statusPositiveDark: themeColors.fiori.semantic.positiveDark,
      statusPositiveBorder: themeColors.fiori.semantic.positiveBorder,

      // Status colors - Critical (Warning/Partial Stock)
      statusCritical: themeColors.fiori.semantic.critical,
      statusCriticalLight: themeColors.fiori.semantic.criticalLight,
      statusCriticalDark: themeColors.fiori.semantic.criticalDark,
      statusCriticalBorder: themeColors.fiori.semantic.criticalBorder,

      // Status colors - Negative (Error/Empty Stock)
      statusNegative: themeColors.fiori.semantic.negative,
      statusNegativeLight: themeColors.fiori.semantic.negativeLight,
      statusNegativeDark: themeColors.fiori.semantic.negativeDark,
      statusNegativeBorder: themeColors.fiori.semantic.negativeBorder,

      // Status colors - Neutral (Information)
      statusNeutral: themeColors.fiori.semantic.neutral,
      statusNeutralLight: themeColors.fiori.semantic.neutralLight,
      statusNeutralDark: themeColors.fiori.semantic.neutralDark,
      statusNeutralBorder: themeColors.fiori.semantic.neutralBorder,

      // Status colors - None (Default/Gray)
      statusNone: themeColors.fiori.semantic.none,
      statusNoneLight: themeColors.fiori.semantic.noneLight,

      // Status colors - Warning (alias for Critical - used by Invoice list)
      statusWarning: themeColors.fiori.semantic.critical,
      statusWarningLight: themeColors.fiori.semantic.criticalLight,
      statusWarningDark: themeColors.fiori.semantic.criticalDark,
      statusWarningBorder: themeColors.fiori.semantic.criticalBorder,

      // Object Cell backgrounds
      cellBackground: themeColors.fiori.objectCell.background,
      cellBackgroundPressed: themeColors.fiori.objectCell.backgroundPressed,
      cellBackgroundSelected: themeColors.fiori.objectCell.backgroundSelected,
      cellSelectedBorder: themeColors.fiori.objectCell.selectedBorder,
      cellDivider: themeColors.fiori.objectCell.divider,

      // Fiori typography colors
      textPrimary: themeColors.fiori.text.primary,
      textSecondary: themeColors.fiori.text.secondary,
      textTertiary: themeColors.fiori.text.tertiary,
      textInverse: themeColors.fiori.text.inverse,
    };
  }, [themeColors, isDarkMode]);
}

export type ListColors = ReturnType<typeof useListColors>;

export default useListColors;
