/**
 * ListEmptyState - Reusable empty state component for list views
 *
 * SAP Fiori Design System - Empty State Component
 * Spec: design/sap-fiori-specs/12-empty-state.md
 *
 * Used by GRNListFiori, DispatchListFiori, OrderListFiori, InvoiceListFiori
 * Provides consistent empty state UI across the app.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listColors } from '@/theme/listColors';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/12-empty-state.md
// ============================================================================
const FIORI = {
  // Container
  container: {
    padding: 24,
  },
  // Illustration
  illustration: {
    size: 120,
    containerSize: 120,
    iconSize: 64,
  },
  // Typography
  typography: {
    title: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    description: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  },
  // Spacing
  spacing: {
    illustrationToTitle: 24,
    titleToDescription: 8,
    descriptionToAction: 24,
  },
  // Button
  button: {
    height: 44,
    borderRadius: 8,
    minWidth: 160,
    fontSize: 15,
    fontWeight: '600' as const,
  },
} as const;

// Icon mapping from MaterialCommunityIcons to Ionicons
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  'package-variant-closed': 'cube-outline',
  'package-variant': 'cube-outline',
  'filter-remove-outline': 'filter-outline',
  'clipboard-outline': 'clipboard-outline',
  'truck-delivery': 'car-outline',
  'receipt': 'receipt-outline',
  'package': 'cube-outline',
  'cloud-off-outline': 'cloud-offline-outline',
  'magnify': 'search-outline',
  'lock-outline': 'lock-closed-outline',
  'plus': 'add',
  'alert-circle-outline': 'alert-circle-outline',
  'account': 'person-outline',
  'account-group-outline': 'people-outline',
  'file-document': 'document-outline',
  'file-document-outline': 'document-outline',
};

export interface ListEmptyStateProps {
  /** Number of active filters (affects messaging) */
  activeFilterCount: number;
  /** Icon to show when no filters applied (Ionicons name or MaterialCommunityIcons name for compat) */
  emptyIcon?: string;
  /** Icon to show when filters are active but no results */
  filteredIcon?: string;
  /** Title when no items and no filters */
  emptyTitle?: string;
  /** Title when filters active but no results */
  filteredTitle?: string;
  /** Subtitle when no items and no filters */
  emptySubtitle?: string;
  /** Subtitle when filters active but no results */
  filteredSubtitle?: string;
  /** Whether to show create button */
  showCreateButton?: boolean;
  /** Create button label */
  createButtonLabel?: string;
  /** Create button icon (Ionicons name) */
  createButtonIcon?: string;
  /** Called when create button pressed */
  onCreatePress?: () => void;
}

export const ListEmptyState = memo<ListEmptyStateProps>(({
  activeFilterCount,
  emptyIcon = 'package-variant-closed',
  filteredIcon = 'filter-remove-outline',
  emptyTitle = 'No items yet',
  filteredTitle = 'No matching items',
  emptySubtitle = 'Create your first item to get started',
  filteredSubtitle = 'Try adjusting your filters to see more results',
  showCreateButton = false,
  createButtonLabel = 'Create',
  createButtonIcon = 'plus',
  onCreatePress,
}) => {
  const hasFilters = activeFilterCount > 0;

  // Map icon name to Ionicons if needed
  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    return (ICON_MAP[icon] || icon) as keyof typeof Ionicons.glyphMap;
  };

  const iconName = getIconName(hasFilters ? filteredIcon : emptyIcon);
  const buttonIconName = getIconName(createButtonIcon);

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel={`${hasFilters ? filteredTitle : emptyTitle}. ${hasFilters ? filteredSubtitle : emptySubtitle}`}
    >
      {/* Illustration - Decorative, hidden from screen readers */}
      <View style={styles.iconContainer} accessible={false}>
        <Ionicons
          name={iconName}
          size={FIORI.illustration.iconSize}
          color={listColors.textSecondary}
        />
      </View>

      {/* Title */}
      <Text style={styles.title} accessibilityRole="header">
        {hasFilters ? filteredTitle : emptyTitle}
      </Text>

      {/* Description */}
      <Text style={styles.description}>
        {hasFilters ? filteredSubtitle : emptySubtitle}
      </Text>

      {/* Action Button - Fiori Primary style */}
      {showCreateButton && !hasFilters && onCreatePress && (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={onCreatePress}
          accessibilityRole="button"
          accessibilityLabel={createButtonLabel}
          accessibilityHint={`Tap to ${createButtonLabel.toLowerCase()}`}
        >
          <Ionicons
            name={buttonIconName}
            size={20}
            color={listColors.white}
            style={styles.buttonIcon}
          />
          <Text style={styles.buttonText}>{createButtonLabel}</Text>
        </Pressable>
      )}
    </View>
  );
});

ListEmptyState.displayName = 'ListEmptyState';

// ============================================================================
// Styles - SAP Fiori Design System
// ============================================================================
const styles = StyleSheet.create({
  // Container - Fiori Empty State layout
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: FIORI.container.padding,
  },

  // Illustration Container - 120x120pt per spec
  iconContainer: {
    width: FIORI.illustration.containerSize,
    height: FIORI.illustration.containerSize,
    borderRadius: FIORI.illustration.containerSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: listColors.gray100,
    marginBottom: FIORI.spacing.illustrationToTitle,
  },

  // Title - 20pt Semibold
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    color: listColors.textPrimary,
    textAlign: 'center',
    marginBottom: FIORI.spacing.titleToDescription,
  },

  // Description - 14pt Regular
  description: {
    fontSize: FIORI.typography.description.fontSize,
    fontWeight: FIORI.typography.description.fontWeight,
    lineHeight: FIORI.typography.description.lineHeight,
    color: listColors.textSecondary,
    textAlign: 'center',
    marginBottom: FIORI.spacing.descriptionToAction,
    maxWidth: 320, // Constrain for readability
  },

  // Button - Fiori Primary Tint style
  button: {
    height: FIORI.button.height,
    minWidth: FIORI.button.minWidth,
    borderRadius: FIORI.button.borderRadius,
    backgroundColor: listColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: listColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
    color: listColors.white,
  },
});

export default ListEmptyState;
