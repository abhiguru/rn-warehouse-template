/**
 * One chip of the filter bar (docs/STYLE_GUIDE.md §13.5, §14.5).
 *
 *  - idle:   a fast filter that is off. Outlined; opens its editor.
 *  - active: a filter that is on. Filled with brand.subtle; the body opens its
 *            editor and a separate close target removes it.
 *  - action: the "Filters" button, the sort chip and "Clear all".
 */
import React from 'react';
import { Pressable, Text, View, type Insets } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { fontWeight, iconSize, radius, singleLineText, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatNumber } from '@/utils/formatters';

export const CHIP_HEIGHT = 36;
const HIT_SLOP: Insets = { top: (touchTarget - CHIP_HEIGHT) / 2, bottom: (touchTarget - CHIP_HEIGHT) / 2 };
const MAX_LABEL_WIDTH = 200;

export interface FilterBarChipProps {
  label: string;
  /** Leading icon (MaterialCommunityIcons name). */
  icon?: string;
  variant?: 'idle' | 'active' | 'action' | 'text';
  /** Show a chevron: the chip opens a sheet. */
  chevron?: boolean;
  /** Number shown in a badge after the label. */
  count?: number;
  onPress: () => void;
  /** Active chips: remove the filter. */
  onRemove?: () => void;
  accessibilityLabel: string;
  /** Spoken name used in the remove button's label ("Remove filter …"). Defaults to the label. */
  removeLabel?: string;
  /** The remove button's whole spoken label, when "Remove filter …" does not fit the sentence. */
  removeAccessibilityLabel?: string;
  selected?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: CHIP_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
    overflow: 'hidden' as const,
  },
  chipActive: { borderColor: t.brand.subtleStrong, backgroundColor: t.brand.subtle },
  chipText: { borderColor: 'transparent', backgroundColor: 'transparent' },
  body: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: CHIP_HEIGHT,
    paddingVertical: space.xs,
    paddingLeft: space.md,
    paddingRight: space.md,
    gap: space.xs,
  },
  bodyBeforeRemove: { paddingRight: space.xs },
  pressed: { backgroundColor: t.interaction.pressedOverlay },
  label: {
    ...typography.footnote,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    maxWidth: MAX_LABEL_WIDTH,
  },
  labelActive: { fontWeight: fontWeight.semibold, color: t.brand.tint },
  labelText: { fontWeight: fontWeight.semibold, color: t.brand.tint },
  remove: {
    width: CHIP_HEIGHT,
    minHeight: CHIP_HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  badgeText: { ...typography.caption2, fontWeight: fontWeight.bold, color: t.brand.onFill },
});

export function FilterBarChip({
  label,
  icon,
  variant = 'idle',
  chevron = false,
  count,
  onPress,
  onRemove,
  accessibilityLabel,
  removeLabel,
  removeAccessibilityLabel,
  selected,
}: FilterBarChipProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const active = variant === 'active';
  const tint = active || variant === 'text' ? t.brand.tint : t.icon.primary;

  return (
    <View style={[styles.chip, active && styles.chipActive, variant === 'text' && styles.chipText]}>
      <Pressable
        style={({ pressed }) => [styles.body, onRemove && styles.bodyBeforeRemove, pressed && styles.pressed]}
        onPress={onPress}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected }}
      >
        {icon ? <Icon name={icon} size={iconSize.sm} color={tint} /> : null}
        <Text
          style={[styles.label, active && styles.labelActive, variant === 'text' && styles.labelText]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          {...singleLineText(0.9)}
        >
          {label}
        </Text>
        {typeof count === 'number' && count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.6}>{formatNumber(count)}</Text>
          </View>
        ) : null}
        {chevron ? <Icon name="chevron-down" size={iconSize.sm} color={tint} /> : null}
      </Pressable>
      {onRemove ? (
        <Pressable
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          onPress={onRemove}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={removeAccessibilityLabel ?? translate('filters.bar.removeFilter', { name: removeLabel ?? label })}
        >
          <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default FilterBarChip;
