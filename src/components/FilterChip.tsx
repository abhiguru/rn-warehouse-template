import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { listColors } from '@/theme/listColors';

interface FilterChipProps {
  label: string;
  type?: string;
  onRemove: () => void;
}

// ============================================================================
// SAP Fiori Chip Spec Constants (from 09-chip.md)
// Applied filter chips use "filled primary" style
// ============================================================================
const FIORI = {
  // Dimensions
  chipHeight: 32,
  chipMinWidth: 64,
  chipPaddingHorizontal: 12,
  chipBorderRadius: 16, // Pill shape
  touchTarget: 44,

  // Typography
  fontSize: 14,
  fontWeight: '500' as const,

  // Icons
  iconSize: 16,
  iconTextGap: 4,
  removeButtonSize: 18,

  // Colors - Filled Primary (for applied/active filters)
  colors: {
    background: listColors.primary,
    text: listColors.white,
    icon: listColors.white,
    removeButton: {
      background: 'rgba(255, 255, 255, 0.2)',
      icon: listColors.white,
    },
  },
};

export default function FilterChip({ label, type, onRemove }: FilterChipProps) {
  const getTypeIcon = (): string => {
    switch (type) {
      case 'item':
        return 'package-variant';
      case 'customer':
        return 'account';
      case 'grn':
        return 'clipboard-list';
      case 'date':
        return 'calendar';
      case 'stock':
        return 'chart-bar';
      case 'weight':
        return 'scale-balance';
      case 'package':
        return 'tag';
      default:
        return '';
    }
  };

  const iconName = getTypeIcon();

  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onRemove}
      accessibilityLabel={`Remove ${label} filter`}
      accessibilityRole="button"
      accessibilityHint="Double tap to remove this filter"
    >
      {iconName ? (
        <Icon
          name={iconName}
          size={FIORI.iconSize}
          color={FIORI.colors.icon}
          style={styles.icon}
        />
      ) : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.removeIconContainer}>
        <Icon name="close" size={12} color={FIORI.colors.removeButton.icon} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // SAP Fiori Chip - Filled Primary style (for applied filters)
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.chipHeight,
    minWidth: FIORI.chipMinWidth,
    paddingLeft: FIORI.chipPaddingHorizontal,
    paddingRight: 6, // Less padding on right due to remove button
    backgroundColor: FIORI.colors.background,
    borderRadius: FIORI.chipBorderRadius,
    maxWidth: '100%',
    // Ensure 44pt touch target
    minHeight: FIORI.touchTarget,
    justifyContent: 'center',
    // Platform-specific shadow
    ...Platform.select({
      ios: {
        shadowColor: listColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  icon: {
    marginRight: FIORI.iconTextGap,
  },
  label: {
    fontSize: FIORI.fontSize,
    fontWeight: FIORI.fontWeight,
    color: FIORI.colors.text,
    marginRight: FIORI.iconTextGap,
    flexShrink: 1,
  },
  // Circular remove button with semi-transparent background
  removeIconContainer: {
    width: FIORI.removeButtonSize,
    height: FIORI.removeButtonSize,
    borderRadius: FIORI.removeButtonSize / 2,
    backgroundColor: FIORI.colors.removeButton.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});