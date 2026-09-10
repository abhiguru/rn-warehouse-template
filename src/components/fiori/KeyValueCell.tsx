/**
 * SAP Fiori Key Value Table View Cell
 * @see design/sap-fiori-specs/21-key-value-table-view-cell.md
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';

type KeyValueLayout = 'inline' | 'stacked';

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
  const { colors: themeColors } = useTheme();
  const isStacked = layout === 'stacked';
  const formattedValue = `${valuePrefix || ''}${value}${valueSuffix || ''}`;

  const content = (
    <View style={[styles.container, isStacked && styles.containerStacked, { backgroundColor: themeColors.fiori.objectCell.background }]}>
      <Text style={[styles.keyLabel, { color: themeColors.fiori.text.secondary }]}>{keyLabel}</Text>
      <View style={isStacked ? styles.valueContainerStacked : styles.valueContainer}>
        <Text
          style={[
            styles.value,
            { color: themeColors.fiori.text.primary },
            actionable && [styles.valueActionable, { color: themeColors.primary }],
            emphasized && styles.valueEmphasized,
          ]}
        >
          {formattedValue}
        </Text>
      </View>
    </View>
  );

  if (actionable && onPress) {
    return (
      <>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
        {showDivider && <View style={[styles.divider, { backgroundColor: themeColors.fiori.objectCell.divider }]} />}
      </>
    );
  }

  return (
    <>
      {content}
      {showDivider && <View style={[styles.divider, { backgroundColor: themeColors.fiori.objectCell.divider }]} />}
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
  const { colors: themeColors } = useTheme();

  return (
    <View style={[groupStyles.container, { backgroundColor: themeColors.fiori.objectCell.background }]}>
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

const styles = StyleSheet.create({
  // Fiori: Inline layout - key and value on same row
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 44,
    // backgroundColor applied dynamically for dark mode
  },
  // Fiori: Stacked layout - key above value
  containerStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  // Fiori: Key label - 13pt, secondary color
  keyLabel: {
    fontSize: 13,
    fontWeight: '400',
    // color applied dynamically for dark mode
    lineHeight: 18,
  },
  valueContainer: {
    flexShrink: 1,
    marginLeft: 8,
  },
  valueContainerStacked: {
    marginTop: 4,
    marginLeft: 0,
  },
  // Fiori: Value - 17pt, primary color, right-aligned
  value: {
    fontSize: theme.fontSize.base,
    fontWeight: '400',
    // color applied dynamically for dark mode
    lineHeight: 22,
    textAlign: 'right',
  },
  // Fiori: Actionable value - tint color, semibold
  valueActionable: {
    // color applied dynamically for dark mode
    fontWeight: '600',
  },
  // Fiori: Emphasized value - semibold
  valueEmphasized: {
    fontWeight: '600',
  },
  // Fiori: Divider - indent from left
  divider: {
    height: 1,
    // backgroundColor applied dynamically for dark mode
    marginLeft: 16,
  },
});

const groupStyles = StyleSheet.create({
  container: {
    // backgroundColor applied dynamically for dark mode
    borderRadius: 12,
    overflow: 'hidden',
  },
});

export default KeyValueCell;
