/**
 * HeroBanner - Item form header with title and save button
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 * Object-page style header on surface.card (docs/STYLE_GUIDE.md 13.8): a
 * footnote overline, the item number as the title, the packaging as a key
 * fact and the save action as the one brand-filled button.
 *
 * @module features/grn/components/item-form/HeroBanner
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount } from '@/utils/formatters';

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
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();

    const itemNumber = isEditing ? editingItemNumber : savedItemsCount + 1;
    const overline = isEditing ? 'Editing item' : 'New item';
    const canViewAll = savedItemsCount > 0 && !!onViewAll;

    return (
      <View style={styles.container}>
        <Pressable
          style={({ pressed }) => [styles.content, canViewAll && pressed && styles.contentPressed]}
          onPress={() => canViewAll && onViewAll?.()}
          disabled={!canViewAll}
          accessibilityRole={canViewAll ? 'button' : 'header'}
          accessibilityLabel={
            canViewAll
              ? `${overline} ${itemNumber}. View ${formatCount(savedItemsCount, 'saved item')}`
              : `${overline} ${itemNumber}`
          }
        >
          <Text style={styles.overline}>{overline}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Item {itemNumber}</Text>
            {canViewAll && (
              <View style={styles.viewAll}>
                <Text style={styles.viewAllText}>{savedItemsCount} saved</Text>
                <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
              </View>
            )}
          </View>
          {!!packaging && (
            <View style={styles.packagingBadge}>
              <Icon name="package-variant-closed" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.packagingText}>{packaging}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
            !isValid && styles.saveButtonDisabled,
          ]}
          onPress={onSave}
          disabled={!isValid}
          accessibilityRole="button"
          accessibilityLabel="Save receipt item"
          accessibilityState={{ disabled: !isValid }}
        >
          <Icon name="check" size={iconSize.lg} color={t.brand.onFill} />
        </Pressable>
      </View>
    );
  }
);

HeroBanner.displayName = 'HeroBanner';

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  content: {
    flex: 1,
    borderRadius: radius.button,
  },
  contentPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  overline: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
  },
  viewAll: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  viewAllText: {
    ...typography.subhead,
    color: t.brand.tint,
  },
  packagingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xxs,
    gap: space.xs,
  },
  packagingText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  saveButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  saveButtonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

export default HeroBanner;
