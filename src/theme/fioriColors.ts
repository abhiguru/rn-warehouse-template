/**
 * SAP Fiori Design Colors
 *
 * Provides theme-aware FIORI design colors for screens and components.
 * Use with useTheme() hook to get dynamic colors that respond to dark mode.
 *
 * Usage:
 * ```typescript
 * import { useFioriColors } from '@/theme/fioriColors';
 *
 * const MyScreen = () => {
 *   const FIORI = useFioriColors();
 *   return <View style={{ backgroundColor: FIORI.colors.background }} />;
 * };
 * ```
 */

import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import type { Colors } from './index';

/**
 * Get FIORI colors based on theme colors and dark mode state
 */
export function getFioriColors(themeColors: Colors, isDarkMode: boolean) {
  return {
    // Typography - these stay constant
    typography: {
      largeTitle: {
        fontSize: 34,
        lineHeight: 41,
        fontWeight: '700' as const,
        letterSpacing: 0.37,
      },
      title1: {
        fontSize: 28,
        lineHeight: 34,
        fontWeight: '700' as const,
        letterSpacing: 0.36,
      },
      title2: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '700' as const,
        letterSpacing: 0.35,
      },
      title3: {
        fontSize: 20,
        lineHeight: 25,
        fontWeight: '600' as const,
        letterSpacing: 0.38,
      },
      headline: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '600' as const,
        letterSpacing: -0.41,
      },
      body: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '400' as const,
        letterSpacing: -0.41,
      },
      callout: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '400' as const,
        letterSpacing: -0.32,
      },
      subhead: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '400' as const,
        letterSpacing: -0.24,
      },
      footnote: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '400' as const,
        letterSpacing: -0.08,
      },
      caption1: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '400' as const,
        letterSpacing: 0,
      },
    },
    // Dynamic colors based on theme
    // NOTE: In dark mode, gray scale is inverted:
    // - gray[50-200] = dark backgrounds
    // - gray[700-900] = light text/elements
    colors: {
      // Backgrounds (use low gray values for dark mode)
      background: isDarkMode ? themeColors.gray[50] : '#FFFFFF',
      backgroundGrouped: isDarkMode ? themeColors.gray[50] : '#F2F2F7',
      backgroundSecondary: isDarkMode ? themeColors.gray[100] : '#F5F6F7',
      backgroundElevated: isDarkMode ? themeColors.gray[100] : '#FFFFFF',

      // Text colors (use high gray values for dark mode - these are light)
      textPrimary: isDarkMode ? themeColors.gray[900] : '#1D2D3E',
      textSecondary: isDarkMode ? themeColors.gray[700] : '#556B82',
      textTertiary: isDarkMode ? themeColors.gray[600] : '#6F7D8B',
      textQuaternary: isDarkMode ? themeColors.gray[500] : '#8E9DAB',

      // Brand/Accent colors
      tint: themeColors.primary,
      tintLight: isDarkMode ? themeColors.orange[50] : '#FFF4E6',

      // Dividers and borders (use medium gray values for dark mode)
      divider: isDarkMode ? themeColors.gray[200] : '#E5E5E5',
      separator: isDarkMode ? themeColors.gray[300] : '#C6C6C8',
      border: isDarkMode ? themeColors.gray[300] : '#C6C6C8',

      // Semantic colors
      destructive: isDarkMode ? '#FF6B6B' : '#D32030',
      destructiveLight: isDarkMode ? 'rgba(211, 32, 48, 0.2)' : '#FFF4F2',
      success: isDarkMode ? '#4ADE80' : '#34C759',
      successLight: isDarkMode ? 'rgba(52, 199, 89, 0.2)' : '#E8FAF0',
      warning: isDarkMode ? '#FBBF24' : '#FF9500',
      warningLight: isDarkMode ? 'rgba(255, 149, 0, 0.2)' : '#FFF4E6',
      info: isDarkMode ? '#60A5FA' : '#0057D2',
      infoLight: isDarkMode ? 'rgba(0, 87, 210, 0.2)' : '#E8F4FF',

      // Switch colors
      switchTrack: '#34C759',
      switchTrackOff: isDarkMode ? themeColors.gray[300] : '#E5E5E5',

      // Input colors
      inputBorder: isDarkMode ? themeColors.gray[300] : '#C6C6C8',
      inputBorderFocus: isDarkMode ? '#60A5FA' : '#0057D2',
      inputBackground: isDarkMode ? themeColors.gray[100] : '#FFFFFF',

      // Card/Cell colors (elevated surface - slightly lighter than base)
      cardBackground: isDarkMode ? themeColors.gray[100] : '#FFFFFF',
      cardBackgroundPressed: isDarkMode ? themeColors.gray[200] : '#F5F6F7',

      // Overlay colors
      overlayBackground: isDarkMode
        ? 'rgba(0, 0, 0, 0.6)'
        : 'rgba(0, 0, 0, 0.4)',

      // Icon colors (for use on colored backgrounds)
      iconOnPrimary: '#FFFFFF',
      iconOnBackground: isDarkMode ? themeColors.gray[900] : '#1D2D3E',
    },
    // Spacing - constant
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    // Dimensions - constant
    dimensions: {
      rowHeight: 44,
      avatarSize: 60,
      iconSize: 22,
      borderRadius: 10,
      cardRadius: 12,
      modalRadius: 14,
      buttonHeight: 44,
    },
  };
}

/**
 * Hook that returns theme-aware FIORI design tokens
 */
export function useFioriColors() {
  const { colors: themeColors, isDarkMode } = useTheme();

  return useMemo(
    () => getFioriColors(themeColors, isDarkMode),
    [themeColors, isDarkMode]
  );
}

export type FioriColors = ReturnType<typeof getFioriColors>;

export default useFioriColors;
