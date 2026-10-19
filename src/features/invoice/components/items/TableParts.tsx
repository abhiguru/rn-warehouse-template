/**
 * The total row, the toggle that opens a group's dispatch lines, and the column headings (with the hint
 * under them) of an open group's card. The card's bottom edge is drawn by the last part: the toggle while
 * the group is closed, the last line while it is open. The headings of the editable columns leave room at the right for the
 * + above − beside each line figure (LINE_STEPPER).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { iconSize } from '@/theme/tokens';
import { formatCount, formatNumber } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { CELL_CHROME, LINE_STEPPER } from './itemsLayout';
import type { LineColumn } from './lineColumns';
import type { ItemsActions } from './itemsModel';
import type { ItemsStyles } from './itemsStyles';

interface ColumnsProps {
  groupKey: string;
  /** The columns of the line table (TanStack column model, lineColumns.ts). */
  columns: readonly LineColumn[];
  styles: ItemsStyles;
}

export const ColumnHeadings = React.memo(function ColumnHeadings({ groupKey, columns, styles }: ColumnsProps) {
  return (
    <View style={styles.side} testID={`cols-${groupKey}`}>
      <View style={styles.headerRow}>
        {columns.map((column) =>
          column.width === 'grow' ? (
            <Text key={column.id} style={[styles.headerText, styles.grow]} numberOfLines={1}>{column.header}</Text>
          ) : (
            <Text
              key={column.id}
              style={[styles.headerNumber, { width: column.width, paddingRight: column.id === 'amount' ? 0 : CELL_CHROME / 2 + LINE_STEPPER }]}
              numberOfLines={1}
            >
              {column.header}
            </Text>
          )
        )}
      </View>
      <Text style={styles.hint}>{tr('invoice.items.hint')}</Text>
    </View>
  );
});

interface TotalProps {
  groupKey: string;
  lines: number;
  total: number;
  styles: ItemsStyles;
}

export const GroupTotal = React.memo(function GroupTotal({ groupKey, lines, total, styles }: TotalProps) {
  const dispatches = formatCount(lines, 'dispatch', 'dispatches');
  const totalText = formatInvoiceAmount(total);
  return (
    <View style={styles.side} testID={`group-total-${groupKey}`}>
      <View
        style={styles.totalRow}
        accessible
        accessibilityLabel={tr('invoice.items.groupTotalA11y', { dispatches, total: totalText })}
      >
        <Text style={styles.totalLabel}>{tr('invoice.items.groupTotal', { dispatches })}</Text>
        <Text style={styles.totalValue} numberOfLines={1}>{totalText}</Text>
      </View>
    </View>
  );
});

interface ToggleProps {
  groupKey: string;
  /** The item's name and mark, as the screen reader says them. */
  spokenItem: string;
  /** The number of lines the table shows when open. */
  lines: number;
  open: boolean;
  /** Figures of the lines with refused text, said under a closed toggle. */
  refused: number;
  actions: ItemsActions;
  styles: ItemsStyles;
}

/** "Show dispatch details (N)" / "Hide dispatch details": the last part of a closed card, the one before the lines of an open one. */
export const GroupToggle = React.memo(function GroupToggle({ groupKey, spokenItem, lines, open, refused, actions, styles }: ToggleProps) {
  const t = useTokens();
  const count = formatNumber(lines);
  const label = open ? tr('invoice.items.hideLines') : tr('invoice.items.showLines', { lines: count });
  const refusedText = !open && refused > 0 ? tr('invoice.items.linesToFix', { count: refused }) : null;
  const base = tr(open ? 'invoice.items.hideLinesA11y' : 'invoice.items.showLinesA11y', { item: spokenItem, dispatches: formatCount(lines, 'dispatch', 'dispatches') });
  const spoken = refusedText ? `${base}, ${refusedText}` : base;
  return (
    <View style={open ? styles.side : styles.bottomGap} testID={`group-toggle-${groupKey}`}>
      <View style={open ? null : styles.bottom}>
        <Pressable
          style={({ pressed }) => [styles.toggleRow, pressed && styles.togglePressed]}
          onPress={() => actions.toggle(groupKey)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={spoken}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={iconSize.md} color={t.table.accent} />
          <Text style={styles.toggleText} numberOfLines={2}>{label}</Text>
        </Pressable>
        {refusedText ? <Text style={styles.toggleError}>{refusedText}</Text> : null}
      </View>
    </View>
  );
});
