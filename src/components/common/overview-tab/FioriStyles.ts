/**
 * Shared FIORI Styles for Overview Tabs
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Extracted from GRN/Dispatch/Invoice OverviewTab components
 *
 * NOTE: This file now exports STATIC (non-color) styles only.
 * Color styles are applied dynamically via useOverviewColors() hook.
 */

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useMemo } from 'react';
import { FIORI } from './FioriTokens';
import { useListColors, ListColors } from '@/hooks/useListColors';

// Static styles - no colors, just layout/spacing
export const overviewStyles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: FIORI.spacing.lg,
    paddingTop: FIORI.spacing.md,
  },
  bottomSpacer: {
    height: 32,
  },

  // Section Header - Fiori Spec
  sectionHeader: {
    paddingTop: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.sm,
  },
  sectionHeaderText: {
    ...FIORI.typography.sectionHeader,
  },

  // Card - Fiori Card Spec
  card: {
    borderRadius: FIORI.dimensions.cardRadius,
    borderWidth: 1,
    marginBottom: FIORI.spacing.md,
    overflow: 'hidden',
    ...FIORI.shadows.card,
  },

  // Object Cell - Fiori Object Cell Spec
  objectCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: FIORI.dimensions.cardPadding,
  },
  avatar: {
    width: FIORI.dimensions.avatarSize,
    height: FIORI.dimensions.avatarSize,
    borderRadius: FIORI.dimensions.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI.spacing.md,
  },
  objectCellContent: {
    flex: 1,
  },
  objectCellLabel: {
    ...FIORI.typography.caption,
    marginBottom: 2,
  },
  objectCellHeadline: {
    ...FIORI.typography.headline,
  },
  objectCellSubheadline: {
    ...FIORI.typography.bodyMedium,
    marginTop: 2,
  },

  // Contact Actions
  contactActionsContainer: {
    borderTopWidth: 1,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.dimensions.cardPadding,
    paddingVertical: FIORI.spacing.md,
    minHeight: FIORI.dimensions.touchTarget,
  },
  contactActionBorder: {
    borderTopWidth: 1,
  },
  contactActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI.spacing.md,
  },
  contactActionText: {
    ...FIORI.typography.body,
    flex: 1,
  },

  // Info Chips Card
  chipsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI.spacing.sm,
    marginBottom: FIORI.spacing.md,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FIORI.spacing.md,
    paddingVertical: FIORI.spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    gap: FIORI.spacing.sm,
  },
  infoChipText: {
    ...FIORI.typography.bodyMedium,
  },

  // Notes
  notesContent: {
    flexDirection: 'row',
    padding: FIORI.dimensions.cardPadding,
  },
  notesIcon: {
    marginRight: FIORI.spacing.md,
    marginTop: 2,
  },
  notesText: {
    flex: 1,
    ...FIORI.typography.body,
    lineHeight: 22,
  },

  // Actions Container
  actionsContainer: {
    gap: FIORI.spacing.md,
    marginBottom: FIORI.spacing.lg,
  },

  // Primary Button - Fiori Primary Tint
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    paddingHorizontal: FIORI.spacing.lg,
    gap: FIORI.spacing.sm,
  },
  primaryButtonText: {
    ...FIORI.typography.button,
  },

  // Secondary Tint Button (Success variant for Share)
  secondaryTintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    paddingHorizontal: FIORI.spacing.lg,
    borderWidth: 1,
    gap: FIORI.spacing.sm,
  },
  secondaryTintButtonText: {
    ...FIORI.typography.button,
  },

  // Secondary Negative Button - Fiori Spec
  secondaryNegativeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    paddingHorizontal: FIORI.spacing.lg,
    borderWidth: 1,
    gap: FIORI.spacing.sm,
  },
  secondaryNegativeButtonText: {
    ...FIORI.typography.button,
  },

  // Disabled state
  buttonDisabled: {
    opacity: 0.5,
  },

  // Detail rows (used in invoice)
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: FIORI.spacing.sm,
    gap: FIORI.spacing.sm,
  },
  detailText: {
    flex: 1,
    ...FIORI.typography.body,
    lineHeight: 20,
  },
});

// Dynamic color styles hook
export function useOverviewColors() {
  const colors = useListColors();

  return useMemo(() => ({
    container: { backgroundColor: colors.gray50 } as ViewStyle,
    sectionHeaderText: { color: colors.gray600 } as TextStyle,
    card: { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider } as ViewStyle,
    cardPressed: { backgroundColor: colors.gray50 } as ViewStyle,
    objectCellLabel: { color: colors.gray600 } as TextStyle,
    objectCellHeadline: { color: colors.gray900 } as TextStyle,
    objectCellSubheadline: { color: colors.gray900 } as TextStyle,
    contactActionsContainer: { borderTopColor: colors.cellDivider } as ViewStyle,
    contactActionBorder: { borderTopColor: colors.cellDivider } as ViewStyle,
    contactActionPressed: { backgroundColor: colors.gray50 } as ViewStyle,
    contactActionIcon: { backgroundColor: colors.gray50 } as ViewStyle,
    contactActionText: { color: colors.gray900 } as TextStyle,
    infoChip: { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider } as ViewStyle,
    infoChipText: { color: colors.gray900 } as TextStyle,
    notesText: { color: colors.gray900 } as TextStyle,
    primaryButton: { backgroundColor: colors.primary } as ViewStyle,
    primaryButtonPressed: { backgroundColor: colors.primaryDark } as ViewStyle,
    primaryButtonText: { color: '#fff' } as TextStyle,
    secondaryTintButton: { borderColor: colors.success } as ViewStyle,
    secondaryTintButtonPressed: { backgroundColor: colors.successLight } as ViewStyle,
    secondaryTintButtonText: { color: colors.success } as TextStyle,
    secondaryNegativeButton: { borderColor: colors.error } as ViewStyle,
    secondaryNegativeButtonPressed: { backgroundColor: colors.errorLight } as ViewStyle,
    secondaryNegativeButtonText: { color: colors.error } as TextStyle,
    detailText: { color: colors.gray900 } as TextStyle,
    // Raw colors for icon usage
    iconTertiary: colors.gray500,
    iconSuccess: colors.success,
    iconInfo: colors.teal,
    iconError: colors.error,
  }), [colors]);
}
