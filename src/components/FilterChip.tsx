/**
 * Applied filter chip (docs/STYLE_GUIDE.md §13.5).
 *
 * Pill in brand.subtle with the label in brand.tint (caption1, 600) and a close
 * icon. The whole chip removes the filter; its touch area is at least touchTarget.
 */
import React from 'react';
import { Pressable, Text, Insets } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

interface FilterChipProps {
  label: string;
  type?: string;
  onRemove: () => void;
}

const CHIP_HEIGHT = 32;
const CHIP_MIN_WIDTH = 64;
const CHIP_HIT_SLOP: Insets = {
  top: (touchTarget - CHIP_HEIGHT) / 2,
  bottom: (touchTarget - CHIP_HEIGHT) / 2,
};

const TYPE_ICON: Record<string, string> = {
  item: 'cube-outline',
  customer: 'account-outline',
  grn: 'package-down',
  date: 'calendar-outline',
  stock: 'warehouse',
  weight: 'scale-balance',
  package: 'tag-outline',
};

export default function FilterChip({ label, type, onRemove }: FilterChipProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const iconName = type ? TYPE_ICON[type] : undefined;

  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={onRemove}
      hitSlop={CHIP_HIT_SLOP}
      accessibilityLabel={`Remove filter ${label}`}
      accessibilityRole="button"
    >
      {iconName ? (
        <Icon name={iconName} size={iconSize.sm} color={t.brand.tint} style={styles.icon} />
      ) : null}
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
      <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
    </Pressable>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: CHIP_HEIGHT,
    minWidth: CHIP_MIN_WIDTH,
    paddingVertical: space.s6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    backgroundColor: t.brand.subtle,
    borderRadius: radius.pill,
    maxWidth: '100%' as const,
  },
  chipPressed: {
    backgroundColor: t.brand.subtleStrong,
  },
  icon: {
    marginRight: space.xs,
  },
  label: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    marginRight: space.xs,
    flexShrink: 1,
  },
});
