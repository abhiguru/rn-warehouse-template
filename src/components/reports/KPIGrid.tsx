/**
 * KPIGrid: a grid of KPI tiles for report screens.
 *
 * Per docs/STYLE_GUIDE.md §5.2 and §13.11, KPI tiles are cards (`shadow[2]`) laid
 * out two per row on phones and four per row on tablets. Compact mode shows three
 * per row on phones and no section header. The grid itself is not a card, so
 * cards never sit on cards.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KPICard, KPIVariant } from './KPICard';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

export interface KPIItem {
  icon: string;
  value: string | number;
  label: string;
  variant?: KPIVariant;
  unit?: string;
  trend?: -1 | 0 | 1;
  trendValue?: string;
  /** Whether a rising value is good for this KPI (colours the trend). */
  upIsGood?: boolean;
}

interface KPIGridProps {
  /** Title for the KPI section */
  title?: string;
  /** Array of KPI items to display */
  items: KPIItem[];
  /** Whether the grid is in loading state */
  isLoading?: boolean;
  /** Whether the grid is collapsible */
  collapsible?: boolean;
  /** Initial expanded state (default: true) */
  initialExpanded?: boolean;
  /** Compact mode - smaller cards, 3 columns, no header */
  compact?: boolean;
}

/** Width from which the grid uses the tablet layout (four tiles per row). */
const TABLET_MIN_WIDTH = 600;

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      marginHorizontal: layout.marginCompact,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    containerCompact: {
      marginTop: space.md,
      marginBottom: space.xs,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: touchTarget,
      marginBottom: space.xs,
    },
    headerTitle: {
      ...typography.footnote,
      fontWeight: fontWeight.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: t.text.secondary,
      flex: 1,
    },
    headerPressed: {
      opacity: 0.6,
    },
    grid: {
      gap: space.sm,
    },
    row: {
      flexDirection: 'row',
      gap: space.sm,
    },
    emptyCell: {
      flex: 1,
    },
  });

export const KPIGrid: React.FC<KPIGridProps> = ({
  title = tr('reports.components.summary'),
  items,
  isLoading = false,
  collapsible = true,
  initialExpanded = true,
  compact = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { width } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggleExpand = () => {
    if (!collapsible || compact) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  };

  const itemsPerRow = width >= TABLET_MIN_WIDTH ? 4 : compact ? 3 : 2;
  const rows: KPIItem[][] = [];
  for (let i = 0; i < items.length; i += itemsPerRow) {
    rows.push(items.slice(i, i + itemsPerRow));
  }

  const grid = (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((item, itemIndex) => (
            <KPICard
              key={`${rowIndex}-${itemIndex}`}
              icon={item.icon}
              value={item.value}
              label={item.label}
              variant={item.variant}
              unit={item.unit}
              trend={item.trend}
              trendValue={item.trendValue}
              upIsGood={item.upIsGood}
              isLoading={isLoading}
              compact={compact}
            />
          ))}
          {/* Keep tiles the same width when the last row is short */}
          {rows.length > 1 &&
            Array.from({ length: itemsPerRow - row.length }, (_, i) => (
              <View key={`empty-${i}`} style={styles.emptyCell} />
            ))}
        </View>
      ))}
    </View>
  );

  if (compact) {
    return <View style={[styles.container, styles.containerCompact]}>{grid}</View>;
  }

  return (
    <View style={styles.container}>
      {collapsible ? (
        <Pressable
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.headerTitle} accessibilityRole="header">
            {title}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.icon.secondary}
          />
        </Pressable>
      ) : (
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {title}
          </Text>
        </View>
      )}

      {isExpanded && grid}
    </View>
  );
};

export default KPIGrid;
