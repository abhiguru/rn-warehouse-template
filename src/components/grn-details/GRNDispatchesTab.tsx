/**
 * GRNDispatchesTab Component
 *
 * Displays dispatches grouped by GRN item with collapsible accordion sections.
 * Each item section contains a data table showing dispatches for that item.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';
import { DispatchRecord } from '@/services/grn-detail-service';
import { GRNItem } from './GRNItemsTab';
import { GRNItemDispatchTable } from './GRNItemDispatchTable';

interface GRNDispatchesTabProps {
  /** GRN items array */
  items: GRNItem[];
  /** Dispatches grouped by item ID */
  dispatchesByItem: Record<string, DispatchRecord[]>;
  /** Loading state */
  loading?: boolean;
}

export const GRNDispatchesTab: React.FC<GRNDispatchesTabProps> = ({
  items,
  dispatchesByItem,
  loading = false,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.gray50 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.gray500 }]}>Loading dispatches...</Text>
      </View>
    );
  }

  // Check if there are any dispatches at all
  const hasAnyDispatches = Object.values(dispatchesByItem).some(
    (dispatches) => dispatches.length > 0
  );

  if (!hasAnyDispatches) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.gray50 }]}>
        <View style={[styles.emptyIconContainer, { backgroundColor: colors.gray100 }]}>
          <Icon name="truck-outline" size={48} color={colors.gray400} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.gray700 }]}>No Dispatches Yet</Text>
        <Text style={[styles.emptyMessage, { color: colors.gray500 }]}>
          Items from this GRN have not been dispatched yet.
        </Text>
      </View>
    );
  }

  // Find first item with dispatches to auto-expand
  const firstItemWithDispatches = items.find(
    (item) => (dispatchesByItem[item.id] || []).length > 0
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.gray50 }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => {
        const itemDispatches = dispatchesByItem[item.id] || [];
        const isFirstWithDispatches = item.id === firstItemWithDispatches?.id;

        return (
          <GRNItemDispatchTable
            key={item.id}
            item={item}
            dispatches={itemDispatches}
            defaultExpanded={isFirstWithDispatches}
          />
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default GRNDispatchesTab;
