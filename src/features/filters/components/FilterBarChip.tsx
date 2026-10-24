/**
 * One chip of the filter bar (docs/STYLE_GUIDE.md §13.5, §14.5).
 *
 *  - idle:   a fast filter that is off. Outlined; opens its editor.
 *  - active: a filter that is on. Filled with brand.subtle; the body opens its
 *            editor and a separate close target removes it.
 *  - action: the "Filters" button, the sort chip and "Clear all".
 *
 * Each pressable is a whole touch target (`touchTarget` tall, §11.2) with the
 * 36 high pill drawn behind it, centred. A hitSlop cannot do this: React Native
 * does not deliver touches outside the parent's bounds, so the target was 36.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { fontWeight, iconSize, radius, singleLineText, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatNumber } from '@/utils/formatters';

/** Height of the drawn pill. The pressable around it is `touchTarget` tall. */
export const CHIP_HEIGHT = 36;
/** Space above and below the pill inside the pressable. */
export const CHIP_INSET = (touchTarget - CHIP_HEIGHT) / 2;
const BORDER = 1;
const MAX_LABEL_WIDTH = 200;

export interface FilterBarChipProps {
  label: string;
  /** Leading icon (MaterialCommunityIcons name). */
  icon?: IconName;
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
  // The touch area: no colour of its own. The side padding keeps the content off the pill's border.
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    minHeight: touchTarget,
    paddingHorizontal: BORDER,
  },
  // The pill, drawn behind the pressables and centred in them; it grows with them.
  pill: {
    position: 'absolute' as const,
    top: CHIP_INSET,
    bottom: CHIP_INSET,
    left: 0,
    right: 0,
    borderRadius: radius.pill,
    borderWidth: BORDER,
    borderColor: t.border.button,
    backgroundColor: t.surface.card,
  },
  pillActive: { borderColor: t.brand.subtleStrong, backgroundColor: t.brand.subtle },
  pillText: { borderColor: 'transparent', backgroundColor: 'transparent' },
  body: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: CHIP_INSET + space.xs,
    paddingLeft: space.md,
    paddingRight: space.md,
    gap: space.xs,
  },
  bodyBeforeRemove: { paddingRight: space.xs },
  // Pressed feedback fills the inside of the pill only, not the space above and below it.
  pressed: {
    position: 'absolute' as const,
    top: CHIP_INSET + BORDER,
    bottom: CHIP_INSET + BORDER,
    left: 0,
    right: 0,
    borderRadius: radius.pill,
    backgroundColor: t.interaction.pressedOverlay,
  },
  pressedStart: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  pressedEnd: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  label: {
    ...typography.footnote,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    maxWidth: MAX_LABEL_WIDTH,
  },
  labelActive: { fontWeight: fontWeight.semibold, color: t.brand.tint },
  labelText: { fontWeight: fontWeight.semibold, color: t.brand.tint },
  // The close target is a whole touch target square (§11.2); the pill grows to hold it.
  remove: {
    width: touchTarget,
    minHeight: touchTarget,
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
    <View style={styles.chip}>
      <View style={[styles.pill, active && styles.pillActive, variant === 'text' && styles.pillText]} pointerEvents="none" />
      <Pressable
        style={[styles.body, onRemove && styles.bodyBeforeRemove]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected }}
      >
        {({ pressed }) => (
          <>
            {pressed ? <View style={[styles.pressed, onRemove && styles.pressedStart]} /> : null}
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
          </>
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          style={styles.remove}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={removeAccessibilityLabel ?? translate('filters.bar.removeFilter', { name: removeLabel ?? label })}
        >
          {({ pressed }) => (
            <>
              {pressed ? <View style={[styles.pressed, styles.pressedEnd]} /> : null}
              <Icon name="close" size={iconSize.sm} color={t.brand.tint} />
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default FilterBarChip;
