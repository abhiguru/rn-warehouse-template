/**
 * Shared FIORI Design Tokens for Overview Tabs
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Extracted from GRN/Dispatch/Invoice OverviewTab components
 *
 * NOTE: Colors are now dynamic and provided via useListColors() hook.
 * This file contains only static design tokens (spacing, typography, dimensions).
 */

import { Platform, ViewStyle } from 'react-native';

export const FIORI = {
  // NOTE: Components should prefer useListColors() hook for dark mode support.
  // These static colors are for backwards compatibility and icon props.
  colors: {
    // Backgrounds
    pageBackground: '#F7F9FA',
    cardBackground: '#FFFFFF',
    // Text
    textPrimary: '#1D2D3E',
    textSecondary: '#556B82',
    textTertiary: '#7e8e9d',
    // Brand
    primary: '#f69000',
    primaryDark: '#dd8200',
    primaryLight: '#fff4e6',
    // Semantic
    success: '#53b1b1',
    successDark: '#1c5858',
    successLight: '#e8f4f4',
    warning: '#f6c624',
    warningLight: '#fef3c7',
    negative: '#D32030',
    negativeDark: '#AA161F',
    negativeLight: '#FFF4F2',
    positive: '#36A41D',
    positiveLight: '#E6F4E1',
    // Other
    info: '#0057D2',
    infoLight: '#EBF8FF',
    // Borders
    divider: '#E5E5E5',
    cardBorder: '#E5E5E5',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  typography: {
    // Fiori iOS Typography
    headline: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    bodyMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    button: {
      fontSize: 17,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
  },
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
    buttonHeight: 44,
    buttonRadius: 8,
    touchTarget: 44,
    avatarSize: 48,
    iconSize: 20,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }) as ViewStyle,
  },
} as const;
