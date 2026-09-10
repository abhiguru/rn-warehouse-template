/**
 * GRNItemDispatchTable Component
 *
 * Collapsible accordion section for one GRN item's dispatches
 * with SAP Fiori data table inside.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { DispatchRecord } from '@/services/grn-detail-service';
import { GRNItem } from './GRNItemsTab';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface GRNItemDispatchTableProps {
  item: GRNItem;
  dispatches: DispatchRecord[];
  defaultExpanded?: boolean;
}

export const GRNItemDispatchTable: React.FC<GRNItemDispatchTableProps> = ({
  item,
  dispatches,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colors = useListColors();

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const handleDispatchPress = (dispatch: DispatchRecord) => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  };

  // Calculate totals
  const totalDispatched = dispatches.reduce((sum, d) => sum + d.disp_quantity, 0);
  const totalQty = item.qty || 0;

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  // Dynamic styles for dark mode support
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: colors.cellBackground,
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.gray100,
      minHeight: 56,
    },
    itemName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.gray900,
      marginBottom: 2,
    },
    metaText: {
      fontSize: 13,
      color: colors.gray500,
    },
    dispatchCount: {
      fontSize: 11,
      color: colors.gray500,
    },
    content: {
      borderTopWidth: 1,
      borderTopColor: colors.gray200,
    },
    emptyText: {
      fontSize: 13,
      color: colors.gray400,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.gray100,
      borderBottomWidth: 1,
      borderBottomColor: colors.gray200,
      minHeight: 44,
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    headerCell: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.gray700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.gray200,
      minHeight: 44,
      alignItems: 'center',
      paddingHorizontal: 12,
      backgroundColor: colors.cellBackground,
    },
    dataCell: {
      fontSize: 15,
      color: colors.gray900,
    },
  }), [colors]);

  return (
    <View style={dynamicStyles.container}>
      {/* Accordion Header */}
      <TouchableOpacity
        style={dynamicStyles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={24}
            color={colors.gray600}
          />
          <View style={styles.itemInfo}>
            <Text style={dynamicStyles.itemName} numberOfLines={1}>
              {item.item_name}
            </Text>
            <View style={styles.itemMeta}>
              {item.package_mark && (
                <Text style={dynamicStyles.metaText}>{item.package_mark}</Text>
              )}
              {item.weight && (
                <Text style={dynamicStyles.metaText}>{item.weight} kg</Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.stockBadge}>
            <Text style={styles.stockText}>
              {totalDispatched}/{totalQty}
            </Text>
          </View>
          <Text style={dynamicStyles.dispatchCount}>
            {dispatches.length} dispatch{dispatches.length !== 1 ? 'es' : ''}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expandable Content */}
      {expanded && (
        <View style={dynamicStyles.content}>
          {dispatches.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                name="truck-outline"
                size={32}
                color={colors.gray300}
              />
              <Text style={dynamicStyles.emptyText}>No dispatches for this item</Text>
            </View>
          ) : (
            <View style={styles.table}>
              {/* Table Header */}
              <View style={dynamicStyles.tableHeader}>
                <Text style={[dynamicStyles.headerCell, styles.dispNoCell]}>
                  DISPATCH #
                </Text>
                <Text style={[dynamicStyles.headerCell, styles.dateCell]}>DATE</Text>
                <Text style={[dynamicStyles.headerCell, styles.qtyCell]}>QTY</Text>
              </View>

              {/* Table Rows */}
              {dispatches.map((dispatch) => (
                <TouchableOpacity
                  key={dispatch.id}
                  style={dynamicStyles.tableRow}
                  onPress={() => handleDispatchPress(dispatch)}
                  activeOpacity={0.6}
                >
                  <Text style={[dynamicStyles.dataCell, styles.dispNoCell]}>
                    {dispatch.disp_no}
                  </Text>
                  <Text style={[dynamicStyles.dataCell, styles.dateCell]}>
                    {formatDate(dispatch.disp_date)}
                  </Text>
                  <Text style={[dynamicStyles.dataCell, styles.qtyCell]}>
                    {dispatch.disp_quantity}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// Static styles (layout only - colors are in dynamicStyles for dark mode)
const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  headerRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  stockBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 2,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  table: {
    // Data table container
  },
  // Column widths
  dispNoCell: {
    flex: 1,
  },
  dateCell: {
    width: 90,
    textAlign: 'left',
  },
  qtyCell: {
    width: 50,
    textAlign: 'right',
  },
});

export default GRNItemDispatchTable;
