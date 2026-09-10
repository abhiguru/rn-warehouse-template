/**
 * HeroBanner - Item form header with title and save button
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/HeroBanner
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// TYPES
// ============================================================================

export interface HeroBannerProps {
  isEditing: boolean;
  editingItemNumber: number;
  savedItemsCount: number;
  packaging?: string;
  isValid: boolean;
  onSave: () => void;
  onViewAll?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const HeroBanner: React.FC<HeroBannerProps> = React.memo(
  ({
    isEditing,
    editingItemNumber,
    savedItemsCount,
    packaging,
    isValid,
    onSave,
    onViewAll,
  }) => {
    // Theme colors for dark mode support
    const colors = useListColors();

    // Dynamic styles based on theme
    const dynamicStyles = useMemo(() => StyleSheet.create({
      container: {
        backgroundColor: colors.primary,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 56,
      },
      containerEditing: {
        backgroundColor: colors.statusNeutral,
      },
    }), [colors]);

    const title = isEditing
      ? `Editing Item ${editingItemNumber}`
      : savedItemsCount === 0
        ? 'Adding Item 1'
        : `Adding Item ${savedItemsCount + 1}`;

    const canViewAll = savedItemsCount > 0 && onViewAll;

    return (
      <View style={[dynamicStyles.container, isEditing && dynamicStyles.containerEditing]}>
        <TouchableOpacity
          style={styles.content}
          onPress={() => canViewAll && onViewAll?.()}
          activeOpacity={canViewAll ? 0.7 : 1}
        >
          <Text style={styles.title}>{title}</Text>
          {packaging && (
            <View style={styles.packagingBadge}>
              <Icon name="package-variant-closed" size={14} color={colors.white} />
              <Text style={styles.packagingText}>{packaging}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={!isValid}
          activeOpacity={0.7}
        >
          <Icon name="check" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>
    );
  }
);

HeroBanner.displayName = 'HeroBanner';

// ============================================================================
// STYLES (Static layout only - container colors are in dynamicStyles)
// ============================================================================

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.white,
  },
  packagingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
  packagingText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.white,
    marginLeft: 4,
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.3,
  },
});

export default HeroBanner;
