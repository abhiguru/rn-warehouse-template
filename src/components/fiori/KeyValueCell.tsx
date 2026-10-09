/**
 * SAP Fiori key-value cell (docs/STYLE_GUIDE.md §13.6).
 *
 * Key in subhead / text.secondary, value in body / text.primary (600 when
 * emphasized). Actionable values use brand.tint and a chevron. The inline layout
 * switches to stacked at large text sizes.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout as layoutTokens,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

type KeyValueLayout = 'inline' | 'stacked';

/** Above this system font scale inline rows stack. */
const STACK_FONT_SCALE = 1.3;

interface KeyValueCellProps {
  keyLabel: string;
  value: string | number;
  layout?: KeyValueLayout;
  actionable?: boolean;
  onPress?: () => void;
  emphasized?: boolean;
  valuePrefix?: string;
  valueSuffix?: string;
  showDivider?: boolean;
}

export const KeyValueCell: React.FC<KeyValueCellProps> = ({
  keyLabel,
  value,
  layout = 'inline',
  actionable = false,
  onPress,
  emphasized = false,
  valuePrefix,
  valueSuffix,
  showDivider = false,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const isStacked = layout === 'stacked' || fontScale > STACK_FONT_SCALE;
  const formattedValue = `${valuePrefix || ''}${value}${valueSuffix || ''}`;
  const isPressable = actionable && !!onPress;

  const renderContent = (pressed: boolean) => (
    <View
      style={[
        styles.container,
        isStacked && styles.containerStacked,
        pressed && styles.containerPressed,
      ]}
    >
      <Text style={styles.keyLabel}>{keyLabel}</Text>
      <View style={isStacked ? styles.valueContainerStacked : styles.valueContainer}>
        <Text
          style={[
            styles.value,
            isStacked && styles.valueStacked,
            actionable && styles.valueActionable,
            emphasized && styles.valueEmphasized,
          ]}
        >
          {formattedValue}
        </Text>
        {isPressable && (
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        )}
      </View>
    </View>
  );

  return (
    <>
      {isPressable ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${keyLabel}, ${formattedValue}`}
        >
          {({ pressed }) => renderContent(pressed)}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${keyLabel}, ${formattedValue}`}>
          {renderContent(false)}
        </View>
      )}
      {showDivider && <View style={styles.divider} />}
    </>
  );
};

// Key Value Group for displaying multiple key-value pairs
interface KeyValueGroupProps {
  items: Array<{
    key: string;
    value: string | number;
    emphasized?: boolean;
    actionable?: boolean;
    onPress?: () => void;
    valuePrefix?: string;
    valueSuffix?: string;
  }>;
  showDividers?: boolean;
  layout?: KeyValueLayout;
}

export const KeyValueGroup: React.FC<KeyValueGroupProps> = ({
  items,
  showDividers = true,
  layout = 'inline',
}) => {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.group}>
      {items.map((item, index) => (
        <KeyValueCell
          key={item.key}
          keyLabel={item.key}
          value={item.value}
          layout={layout}
          emphasized={item.emphasized}
          actionable={item.actionable}
          onPress={item.onPress}
          valuePrefix={item.valuePrefix}
          valueSuffix={item.valueSuffix}
          showDivider={showDividers && index < items.length - 1}
        />
      ))}
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  // Inline layout - key and value on same row
  container: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md - 1,
    minHeight: layoutTokens.rowMinHeight,
    backgroundColor: t.surface.card,
  },
  // Stacked layout - key above value
  containerStacked: {
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
  },
  containerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  keyLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  valueContainer: {
    flexShrink: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: space.sm,
  },
  valueContainerStacked: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    marginLeft: 0,
  },
  value: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    flexShrink: 1,
    fontVariant: ['tabular-nums' as const],
  },
  valueStacked: {
    textAlign: 'left' as const,
  },
  valueActionable: {
    color: t.brand.tint,
  },
  valueEmphasized: {
    fontWeight: fontWeight.semibold,
  },
  // Divider - inset from the left
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginLeft: space.lg,
  },
  group: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
  },
});

export default KeyValueCell;
